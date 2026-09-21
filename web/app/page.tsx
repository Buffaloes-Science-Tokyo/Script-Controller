"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";

import { AdminTab } from "./components/AdminTab";
import { AuthButton } from "./components/AuthButton";
import { BasketTab } from "./components/BasketTab";
import { SearchTab } from "./components/SearchTab";
import { useBasket } from "@/lib/useBasket";

type TabKey = "search" | "basket" | "admin";

export default function Home() {
  const { status } = useSession();
  const [tab, setTab] = useState<TabKey>("search");
  const basket = useBasket();

  return (
    <>
      <header className="topbar">
        <h1>Script Controller</h1>
        <AuthButton />
      </header>

      {status === "authenticated" && (
        <>
          <nav className="tabs">
            <button
              className={`tabBtn ${tab === "search" ? "active" : ""}`}
              onClick={() => setTab("search")}
            >
              検索
            </button>
            <button
              className={`tabBtn ${tab === "basket" ? "active" : ""}`}
              onClick={() => setTab("basket")}
            >
              保持中 ({basket.items.length})
            </button>
            <button
              className={`tabBtn ${tab === "admin" ? "active" : ""}`}
              onClick={() => setTab("admin")}
            >
              プレー登録
            </button>
          </nav>
          <main>
            {tab === "search" && <SearchTab onAdd={basket.add} />}
            {tab === "basket" && <BasketTab basket={basket} />}
            {tab === "admin" && <AdminTab />}
          </main>
        </>
      )}
    </>
  );
}
