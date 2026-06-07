/**
 * Log a raw server-side error (Supabase/Postgres details, etc.) and return
 * a safe, generic Error to throw back to the client. Prevents leaking table
 * names, constraint names, and RLS policy details to the browser.
 */
export function safeError(error: unknown, context: string): Error {
  // Server-side log keeps full detail for debugging.
  // eslint-disable-next-line no-console
  console.error(`[${context}]`, error);
  return new Error("Something went wrong. Please try again.");
}
