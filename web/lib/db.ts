import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

// neon-http: one HTTP request per query, no persistent connection - the
// correct driver for Vercel's serverless/edge functions (vs. neon-serverless's
// WebSocket pool, meant for long-lived Node processes).
export const db = drizzle(process.env.DATABASE_URL!, { schema });
