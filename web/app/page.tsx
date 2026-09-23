"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";

import { AdminTab } from "./components/AdminTab";
import { AuthButton } from "./components/AuthButton";
import { BasketTab } from "./components/BasketTab";
import { RegisteredTab } from "./components/RegisteredTab";
import { SearchTab } from "./components/SearchTab";
import { DataVersionProvider } from "@/lib/dataVersion";
import { useBasket } from "@/lib/useBasket";

type TabKey = "search" | "basket" | "admin" | "registered";

export default function Home() {
  const { status } = useSession();
  const [tab, setTab] = useState<TabKey>("search");
  // Tabs mount on first visit and then stay mounted (just hidden), so their
  // loaded data, inputs and scroll position survive switching tabs.
  const [visited, setVisited] = useState<Set<TabKey>>(() => new Set(["search"]));
  const basket = useBasket();

  function openTab(key: TabKey) {
    setTab(key);
    setVisited((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }

  function tabPanel(key: TabKey, content: React.ReactNode) {
    if (!visited.has(key)) return null;
    return <div hidden={tab !== key}>{content}</div>;
  }

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
              onClick={() => openTab("search")}
            >
              検索
            </button>
            <button
              className={`tabBtn ${tab === "registered" ? "active" : ""}`}
              onClick={() => openTab("registered")}
            >
              登録済み
            </button>
            <button
              className={`tabBtn ${tab === "basket" ? "active" : ""}`}
              onClick={() => openTab("basket")}
            >
              保持中 ({basket.items.length})
            </button>
            <button
              className={`tabBtn ${tab === "admin" ? "active" : ""}`}
              onClick={() => openTab("admin")}
            >
              プレー登録
            </button>
          </nav>
          <DataVersionProvider>
            <main>
              {tabPanel(
                "search",
                <SearchTab onAdd={basket.add} onPlayDeleted={basket.removePlay} />
              )}
              {tabPanel(
                "registered",
                <RegisteredTab onAdd={basket.add} onPlayDeleted={basket.removePlay} />
              )}
              {tabPanel("basket", <BasketTab basket={basket} />)}
              {tabPanel("admin", <AdminTab />)}
            </main>
          </DataVersionProvider>
        </>
      )}
    </>
  );
}
