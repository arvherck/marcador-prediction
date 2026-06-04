import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const signUpFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(8).max(100),
    }),
  )
  .handler(async ({ data }) => {
    const { pool } = await import("./lovable/database");
    const { hashPassword, getSession } = await import("./auth.server");
    const existing = await pool.query("SELECT id FROM app_users WHERE email=$1", [
      data.email,
    ]);
    if (existing.rows.length) throw new Error("An account with that email already exists.");
    const hash = await hashPassword(data.password);
    const { rows } = await pool.query(
      "INSERT INTO app_users (email, password_hash) VALUES ($1,$2) RETURNING id",
      [data.email, hash],
    );
    const session = await getSession();
    await session.update({ userId: rows[0].id });
    return { ok: true };
  });

export const signInFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { pool } = await import("./lovable/database");
    const { verifyPassword, getSession } = await import("./auth.server");
    const { rows } = await pool.query(
      "SELECT id, password_hash FROM app_users WHERE email=$1",
      [data.email],
    );
    if (!rows.length || !rows[0].password_hash) throw new Error("Invalid credentials.");
    const ok = await verifyPassword(data.password, rows[0].password_hash);
    if (!ok) throw new Error("Invalid credentials.");
    const session = await getSession();
    await session.update({ userId: rows[0].id });
    return { ok: true };
  });

export const signOutFn = createServerFn({ method: "POST" }).handler(async () => {
  const { getSession } = await import("./auth.server");
  const session = await getSession();
  await session.clear();
  return { ok: true };
});

export const meFn = createServerFn({ method: "GET" }).handler(async () => {
  const { loadCurrentUser } = await import("./auth.server");
  return loadCurrentUser();
});

export const completeOnboardingFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      display_name: z.string().trim().min(2).max(40),
      country: z.string().trim().min(2).max(60),
      favourite_team: z.string().trim().min(2).max(60),
    }),
  )
  .handler(async ({ data }) => {
    const { pool } = await import("./lovable/database");
    const { requireUser } = await import("./auth.server");
    const me = await requireUser();
    await pool.query(
      `INSERT INTO profiles (user_id, display_name, country, favourite_team)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id) DO UPDATE
       SET display_name=EXCLUDED.display_name,
           country=EXCLUDED.country,
           favourite_team=EXCLUDED.favourite_team`,
      [me.id, data.display_name, data.country, data.favourite_team],
    );
    return { ok: true };
  });
