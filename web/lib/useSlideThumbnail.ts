"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "./api";

type Deck = { thumbnailUrls: string[]; slideHashes: string[] };

// Rendering a deck converts the whole file on the server, and Google rate
// limits bursts of those - so cards share one request per file, and at most
// a couple of files render at once.
const MAX_CONCURRENT_DECKS = 2;
const deckPromises = new Map<string, Promise<Deck>>();
const waiting: (() => void)[] = [];
let running = 0;

function acquireSlot(): Promise<void> {
  if (running < MAX_CONCURRENT_DECKS) {
    running++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function releaseSlot() {
  const next = waiting.shift();
  // Hand the slot straight to the next waiter so a new caller can't jump in.
  if (next) next();
  else running--;
}

function fetchDeck(fileId: string): Promise<Deck> {
  const cached = deckPromises.get(fileId);
  if (cached) return cached;

  const promise = (async () => {
    await acquireSlot();
    try {
      return await apiFetch<Deck>(`/api/preview/deck?fileId=${encodeURIComponent(fileId)}`);
    } finally {
      releaseSlot();
    }
  })();
  deckPromises.set(fileId, promise);
  // Don't keep a failure cached, so remounting the card retries.
  promise.catch(() => deckPromises.delete(fileId));
  return promise;
}

type ThumbnailResult = { key: string; url: string | null; error: string | null };

/**
 * Thumbnail for one registered slide, loaded via its deck (shared with every
 * other card from the same file for the rest of the page session).
 */
export function useSlideThumbnail(fileId: string, slideIndex: number) {
  const key = `${fileId}:${slideIndex}`;
  const [result, setResult] = useState<ThumbnailResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDeck(fileId).then(
      (deck) => {
        if (cancelled) return;
        const url = deck.thumbnailUrls[slideIndex] ?? null;
        setResult({
          key,
          url,
          error: url
            ? null
            : `スライド${slideIndex + 1}が見つかりません（現在のスライド数: ${deck.thumbnailUrls.length}）`,
        });
      },
      (err) => {
        if (!cancelled) setResult({ key, url: null, error: (err as Error).message });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [fileId, slideIndex, key]);

  const current = result?.key === key ? result : null;
  return { url: current?.url ?? null, error: current?.error ?? null, loading: !current };
}
