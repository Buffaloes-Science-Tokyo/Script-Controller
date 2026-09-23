"use client";

import { useEffect, useState } from "react";

import type { BasketItem, PlayAttributeValue } from "./types";

const STORAGE_KEY = "scriptControllerBasket";

// Held slides are ephemeral per-session state, not data that needs to be
// shared or survive across devices, so this stays client-side (localStorage)
// rather than in the DB - keeps writes limited to the actual play index.
function isValidBasketItem(item: unknown): item is BasketItem {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.playId === "string" &&
    typeof candidate.fileId === "string" &&
    typeof candidate.slideIndex === "number" &&
    Array.isArray(candidate.attributes)
  );
}

// The stored shape has changed a few times as the app evolved (fixed
// playName/formation -> attributes array -> playId). A browser holding data
// from an older shape would otherwise crash the basket tab on render -
// silently drop anything that doesn't match the current BasketItem shape
// instead, rather than requiring people to manually clear localStorage.
function readStoredItems(): BasketItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidBasketItem);
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

  // Updates every basket item pointing at this play (normally just one, but
  // the same play could have been added to the basket more than once).
  function updatePlayAttributes(playId: string, attributes: PlayAttributeValue[]) {
    setItems((prev) => prev.map((item) => (item.playId === playId ? { ...item, attributes } : item)));
  }

  // Drops every basket item pointing at a play that was deleted, so export
  // doesn't reference a play that no longer exists.
  function removePlay(playId: string) {
    setItems((prev) => prev.filter((item) => item.playId !== playId));
  }

  return { items, add, remove, move, updatePlayAttributes, removePlay };
}

export type Basket = ReturnType<typeof useBasket>;
