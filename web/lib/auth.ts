import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import { db } from "./db";
import { accounts, sessions, users, verificationTokens } from "./schema";

// Per-user Google OAuth, not a shared service account: each coach signs in
// with their own account and the app acts with their Drive permissions.
// access_type=offline + prompt=consent forces Google to (re)issue a
// refresh_token every sign-in, which the Drizzle adapter persists on the
// `accounts` row - see lib/google.ts for how it's used to silently refresh
// the hourly access token instead of prompting the user to reconnect.
const DRIVE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/presentations.readonly",
].join(" ");

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  providers: [
    Google({
      authorization: {
        params: {
          scope: DRIVE_SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
