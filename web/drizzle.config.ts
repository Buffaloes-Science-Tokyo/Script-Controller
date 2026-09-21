import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load .env.local first (vercel env pull's default output, and Next.js's own
// convention) so it takes priority, then .env as a fallback - dotenv never
// overrides a variable that's already set, so whichever file was loaded
// first wins. Neither call throws if its file is missing.
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  out: "./drizzle",
  schema: "./lib/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
