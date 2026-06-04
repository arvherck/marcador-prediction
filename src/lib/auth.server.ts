import bcrypt from "bcryptjs";
import { useSession } from "@tanstack/react-start/server";
import { pool } from "./lovable/database";

export type SessionData = { userId?: string };

const SESSION_PASSWORD =
  process.env.SESSION_SECRET ??
  "marcador-dev-session-secret-please-set-SESSION_SECRET-in-prod-32chars";

export function getSession() {
  return useSession<SessionData>({
    password: SESSION_PASSWORD,
    name: "marcador_session",
    maxAge: 60 * 60 * 24 * 30,
    cookie: { httpOnly: true, sameSite: "none", secure: true, path: "/" },
  });
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export type CurrentUser = {
  id: string;
  email: string;
  is_admin: boolean;
  profile: {
    display_name: string;
    country: string;
    favourite_team: string;
  } | null;
};

export async function loadCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  const userId = session.data.userId;
  if (!userId) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.is_admin,
            p.display_name, p.country, p.favourite_team
     FROM app_users u
     LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.id = $1`,
    [userId],
  );
  if (!rows.length) return null;
  const r = rows[0];
  const { isAdminEmail } = await import("./admin");
  return {
    id: r.id,
    email: r.email,
    is_admin: r.is_admin || isAdminEmail(r.email),
    profile: r.display_name
      ? {
          display_name: r.display_name,
          country: r.country,
          favourite_team: r.favourite_team,
        }
      : null,
  };
}


export async function requireUser(): Promise<CurrentUser> {
  const u = await loadCurrentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}
