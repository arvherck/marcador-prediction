import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// FIFA World Cup 2026 (discovered via /leagues?search=world%20cup)
const LEAGUE_ID = 1;
const SEASON = 2026;
const API_BASE = "https://v3.football.api-sports.io";
const DAILY_LIMIT = 100;
const WARN_THRESHOLD = 90;

type CacheStatus = {
  cached: boolean;
  fetched_at: string | null;
  expires_at: string | null;
  count?: number;
  warning?: string;
};

type EnvelopeWithData<T> = CacheStatus & { data: T };

async function assertAdmin(userId: string, supabase: any) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: admin only");
}

async function getAdmin() {
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  return supabaseAdmin;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getCallsToday(): Promise<number> {
  const admin = await getAdmin();
  const { data } = await admin
    .from("api_usage")
    .select("calls_made")
    .eq("date", todayKey())
    .maybeSingle();
  return data?.calls_made ?? 0;
}

async function incrementCalls(by: number) {
  const admin = await getAdmin();
  const date = todayKey();
  const current = await getCallsToday();
  await admin
    .from("api_usage")
    .upsert(
      { date, calls_made: current + by, updated_at: new Date().toISOString() },
      { onConflict: "date" },
    );
}

async function readCache(
  key: string,
): Promise<{ data: any; fetched_at: string; expires_at: string } | null> {
  const admin = await getAdmin();
  const { data } = await admin
    .from("api_cache")
    .select("data, fetched_at, expires_at")
    .eq("cache_key", key)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  return data as any;
}

async function writeCache(key: string, payload: any, ttlSec: number) {
  const admin = await getAdmin();
  const now = new Date();
  const expires = new Date(now.getTime() + ttlSec * 1000);
  await admin.from("api_cache").upsert(
    {
      cache_key: key,
      data: payload,
      fetched_at: now.toISOString(),
      expires_at: expires.toISOString(),
    },
    { onConflict: "cache_key" },
  );
  return { fetched_at: now.toISOString(), expires_at: expires.toISOString() };
}

async function cachedFetch<T = any>(
  cacheKey: string,
  ttlSec: number,
  path: string,
): Promise<EnvelopeWithData<T>> {
  const cached = await readCache(cacheKey);
  if (cached) {
    return {
      data: cached.data as T,
      cached: true,
      fetched_at: cached.fetched_at,
      expires_at: cached.expires_at,
    };
  }
  const used = await getCallsToday();
  if (used >= DAILY_LIMIT) {
    throw new Error(
      `Daily API limit reached (${used}/${DAILY_LIMIT}). Try again tomorrow.`,
    );
  }
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new Error("API_FOOTBALL_KEY is not configured");

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "x-apisports-key": apiKey },
  });
  await incrementCalls(1);
  if (!res.ok) {
    throw new Error(`API-Football error: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const meta = await writeCache(cacheKey, json, ttlSec);
  const warning =
    used + 1 >= WARN_THRESHOLD
      ? `API usage at ${used + 1}/${DAILY_LIMIT}`
      : undefined;
  return {
    data: json as T,
    cached: false,
    fetched_at: meta.fetched_at,
    expires_at: meta.expires_at,
    warning,
  };
}

async function shouldFetchLive(): Promise<boolean> {
  const admin = await getAdmin();
  const now = new Date();
  const lower = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const upper = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("matches")
    .select("id, is_final")
    .gte("kickoff_at", lower)
    .lte("kickoff_at", upper)
    .limit(1);
  if (!data || data.length === 0) return false;
  return data.some((m: any) => !m.is_final);
}

// ============================================================
// Public server functions (admin-only)
// ============================================================

export const getApiStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId, context.supabase);
    const admin = await getAdmin();
    const used = await getCallsToday();
    const { data: cacheRows } = await admin
      .from("api_cache")
      .select("cache_key, fetched_at, expires_at")
      .in("cache_key", [
        "fixtures",
        "standings",
        "live_fixtures",
        "squads_index",
      ]);
    const byKey: Record<
      string,
      { fetched_at: string; expires_at: string } | null
    > = {
      fixtures: null,
      standings: null,
      live_fixtures: null,
      squads_index: null,
    };
    (cacheRows ?? []).forEach((r: any) => {
      byKey[r.cache_key] = {
        fetched_at: r.fetched_at,
        expires_at: r.expires_at,
      };
    });
    const live_possible = await shouldFetchLive();
    return {
      calls_made: used,
      limit: DAILY_LIMIT,
      warn_at: WARN_THRESHOLD,
      cache: byKey,
      live_possible,
    };
  });

export const syncFixturesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId, context.supabase);
    const env = await cachedFetch(
      "fixtures",
      24 * 60 * 60,
      `/fixtures?league=${LEAGUE_ID}&season=${SEASON}`,
    );
    return {
      cached: env.cached,
      fetched_at: env.fetched_at,
      expires_at: env.expires_at,
      count: (env.data as any)?.results ?? 0,
      warning: env.warning,
    };
  });

export const syncStandingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId, context.supabase);
    const env = await cachedFetch(
      "standings",
      2 * 60 * 60,
      `/standings?league=${LEAGUE_ID}&season=${SEASON}`,
    );
    return {
      cached: env.cached,
      fetched_at: env.fetched_at,
      expires_at: env.expires_at,
      count: (env.data as any)?.results ?? 0,
      warning: env.warning,
    };
  });

export const syncLiveScoresFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId, context.supabase);
    const should = await shouldFetchLive();
    if (!should) {
      return {
        cached: true,
        fetched_at: null,
        expires_at: null,
        count: 0,
        warning: "No matches live or starting within 10 minutes.",
      };
    }
    const env = await cachedFetch(
      "live_fixtures",
      3 * 60,
      `/fixtures?live=all&league=${LEAGUE_ID}`,
    );
    return {
      cached: env.cached,
      fetched_at: env.fetched_at,
      expires_at: env.expires_at,
      count: (env.data as any)?.results ?? 0,
      warning: env.warning,
    };
  });

export const syncSquadsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ confirmed: z.boolean().default(false) }).parse)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId, context.supabase);

    // Step 1: get the team list (cached 7d under squads_index).
    let teamsCached = await readCache("squads_index");
    let teamsEnv: EnvelopeWithData<any>;
    if (teamsCached) {
      teamsEnv = {
        data: teamsCached.data,
        cached: true,
        fetched_at: teamsCached.fetched_at,
        expires_at: teamsCached.expires_at,
      };
    } else {
      teamsEnv = await cachedFetch(
        "squads_index",
        7 * 24 * 60 * 60,
        `/teams?league=${LEAGUE_ID}&season=${SEASON}`,
      );
    }

    const teams: Array<{ team: { id: number; name: string } }> =
      (teamsEnv.data as any)?.response ?? [];

    // Step 2: estimate squad calls (1 per team that has no cached squad).
    const admin = await getAdmin();
    const keys = teams.map((t) => `squad:${t.team.id}`);
    const { data: existing } = await admin
      .from("api_cache")
      .select("cache_key, expires_at")
      .in("cache_key", keys);
    const validKeys = new Set(
      (existing ?? [])
        .filter((r: any) => new Date(r.expires_at).getTime() > Date.now())
        .map((r: any) => r.cache_key),
    );
    const toFetch = teams.filter(
      (t) => !validKeys.has(`squad:${t.team.id}`),
    );

    if (toFetch.length > 5 && !data.confirmed) {
      throw new Error(
        `Syncing squads will cost ${toFetch.length} API calls. Re-run with confirmation to proceed.`,
      );
    }

    const used = await getCallsToday();
    if (used + toFetch.length > DAILY_LIMIT) {
      throw new Error(
        `Would exceed daily limit (${used} used, need ${toFetch.length}, cap ${DAILY_LIMIT}).`,
      );
    }

    let made = 0;
    for (const t of toFetch) {
      await cachedFetch(
        `squad:${t.team.id}`,
        7 * 24 * 60 * 60,
        `/players/squads?team=${t.team.id}`,
      );
      made += 1;
    }
    return {
      cached: made === 0,
      fetched_at: new Date().toISOString(),
      expires_at: null,
      count: made,
      warning:
        used + made >= WARN_THRESHOLD
          ? `API usage at ${used + made}/${DAILY_LIMIT}`
          : undefined,
    };
  });
