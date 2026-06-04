// Hardcoded admin allowlist. Add additional emails here.
export const ADMIN_EMAILS = ["gandalftheswole76@gmail.com"];

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email.toLowerCase());
}
