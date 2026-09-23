import type { AdapterAccount } from "@auth/core/adapters";
import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
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

// The play <-> slide index. All descriptive metadata (what used to be fixed
// playName/formation columns) now lives in attributeDefs/playAttributeValues
// below - a play row is just a pointer to one slide.
export const plays = pgTable("plays", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  driveFileId: text("drive_file_id").notNull(),
  slideIndex: integer("slide_index").notNull(),
  // SHA-256 of the slide's rendered thumbnail at registration time, compared
  // against the current render to flag slides edited (or shifted by inserted/
  // deleted slides) since. Null for plays registered before this existed.
  slideHash: text("slide_hash"),
  createdBy: text("created_by").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// User-defined fields (e.g. "プレー名", "体系"), added/renamed/deleted freely
// from the registration tab. Every attribute is a growable choice list
// (type = "select"): values typed when registering a play are appended to
// `options` (lib/attributeValues.ts). "text" only exists in old rows, which
// migration 0004 converts.
export const attributeDefs = pgTable("attribute_defs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  type: text("type").$type<"text" | "select">().notNull(),
  options: jsonb("options").$type<string[]>(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// EAV-style value storage: one row per (play, attribute) with a value set.
// Deleting an attributeDef cascades to delete every play's value for it -
// deliberate, and warned about in the attribute editor's delete confirmation.
export const playAttributeValues = pgTable(
  "play_attribute_values",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    playId: text("play_id")
      .notNull()
      .references(() => plays.id, { onDelete: "cascade" }),
    attributeDefId: text("attribute_def_id")
      .notNull()
      .references(() => attributeDefs.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
  },
  (t) => [uniqueIndex("play_attribute_values_play_attr_unique").on(t.playId, t.attributeDefId)]
);
