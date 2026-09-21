"use client";

import { useEffect, useState } from "react";

import type { BasketItem } from "./types";

const STORAGE_KEY = "scriptControllerBasket";

// Held slides are ephemeral per-session state, not data that needs to be
// shared or survive across devices, so this stays client-side (localStorage)
// rather than in the DB - keeps writes limited to the actual play index.
function readStoredItems(): BasketItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useBasket() {
  const [items, setItems] = useState<BasketItem[]>(readStoredItems);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore (e.g. private browsing storage quota)
    }
  }, [items]);

  function add(item: BasketItem) {
    setItems((prev) => [...prev, item]);
  }

  function remove(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function move(index: number, delta: number) {
    setItems((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return { items, add, remove, move };
}

export type Basket = ReturnType<typeof useBasket>;
