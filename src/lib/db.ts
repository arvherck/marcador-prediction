import { Client, type QueryResult } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL environment variable is required");

/**
 * Per-request pg Client. Cloudflare Workers don't preserve TCP sockets across
 * requests, so a module-level pg.Pool hangs on the second call. We open a fresh
 * Client per query and close it when done.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const pool = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async query(text: string, params?: unknown[]): Promise<QueryResult<any>> {
    const client = new Client({ connectionString: DATABASE_URL, ssl: true });
    await client.connect();
    try {
      return await client.query(text, params as never);
    } finally {
      await client.end().catch(() => {});
    }
  },
};
