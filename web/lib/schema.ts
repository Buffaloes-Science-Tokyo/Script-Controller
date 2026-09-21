import type { AdapterAccount } from "@auth/core/adapters";
import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Auth.js's standard schema for a database-session adapter. The `accounts`
// row is what makes Drive access persistent: it stores Google's
// refresh_token/access_token/expires_at per user, which lib/google.ts reads
// to silently mint fresh access tokens instead of forcing a re-auth click
// whenever the hourly access token expires.
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

// The play <-> slide index. Search is a plain ILIKE over playName/formation
// (see app/api/search/route.ts) - adequate for a curated, playbook-sized
// list; revisit with a trigram index (pg_trgm) or real full-text search if
// the list grows large enough to need it.
export const plays = pgTable("plays", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  playName: text("play_name").notNull(),
  formation: text("formation").default(""),
  driveFileId: text("drive_file_id").notNull(),
  slideIndex: integer("slide_index").notNull(),
  createdBy: text("created_by").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});
