"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export function AuthButton() {
  const { data: session, status } = useSession();

  if (status === "loading") return null;

  if (!session) {
    return (
      <button className="primaryBtn" onClick={() => signIn("google")}>
        Googleでサインイン
      </button>
    );
  }

  return (
    <div className="userInfo">
      <span>{session.user?.email}</span>
      <button onClick={() => signOut()}>サインアウト</button>
    </div>
  );
}
