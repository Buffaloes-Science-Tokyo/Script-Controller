"use client";

import { useCallback, useSyncExternalStore } from "react";

import { apiFetch } from "./api";

type DeckResponse = {
  thumbnailUrls: (string | null)[];
  slideHashes: (string | null)[];
  complete: boolean;
  retryAfterMs: number;
};

/** A deck's thumbnails as loaded so far; slides not rendered yet are null. */
export type DeckState = {
  urls: (string | null)[] | null;
  hashes: (string | null)[] | null;
  complete: boolean;
  loading: boolean;
  /** Set while pausing for the Slides API quota: when loading resumes. */
  waitingUntil: number | null;
  error: string | null;
};

const INITIAL: DeckState = {
  urls: null,
  hashes: null,
  complete: false,
  loading: false,
  waitingUntil: null,
  error: null,
};

// Page-session cache shared by every view (cards, registration preview), so
// each deck is fetched once. The server renders a deck in rounds (see
// lib/thumbnail-cache.ts); a loader keeps asking until it's complete.
const states = new Map<string, DeckState>();
const listeners = new Map<string, Set<() => void>>();
const loading = new Set<string>();

// Rendering is limited by a per-user Google quota, so background loads (cards)
// run at most two decks at a time; the registration preview skips the queue.
const MAX_BACKGROUND_DECKS = 2;
const waiting: (() => void)[] = [];
let running = 0;

function acquireSlot(): Promise<void> {
  if (running < MAX_BACKGROUND_DECKS) {
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

function getState(fileId: string): DeckState {
  return states.get(fileId) ?? INITIAL;
}

function update(fileId: string, patch: Partial<DeckState>) {
  states.set(fileId, { ...getState(fileId), ...patch });
  for (const listener of listeners.get(fileId) ?? []) listener();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLoader(fileId: string, priority: boolean) {
  if (loading.has(fileId)) return;
  loading.add(fileId);
  update(fileId, { loading: true, error: null });

  if (!priority) await acquireSlot();
  try {
    for (;;) {
      const data = await apiFetch<DeckResponse>(
        `/api/preview/deck?fileId=${encodeURIComponent(fileId)}`
      );
      update(fileId, {
        urls: data.thumbnailUrls,
        hashes: data.slideHashes,
        complete: data.complete,
        waitingUntil: null,
      });
      if (data.complete) break;
      if (data.retryAfterMs > 0) {
        update(fileId, { waitingUntil: Date.now() + data.retryAfterMs });
        await sleep(data.retryAfterMs);
      }
    }
  } catch (err) {
    update(fileId, { error: (err as Error).message, waitingUntil: null });
  } finally {
    if (!priority) releaseSlot();
    loading.delete(fileId);
    update(fileId, { loading: false });
  }
}

/**
 * Starts loading a deck if it isn't complete or already loading. With
 * `refresh`, re-checks a complete deck too (cheap on the server unless the
 * file was edited, in which case its new slides are rendered).
 */
export function loadDeck(fileId: string, { priority = false, refresh = false } = {}) {
  const state = getState(fileId);
  if (state.complete && !refresh) return;
  void runLoader(fileId, priority);
}

function subscribe(fileId: string, listener: () => void) {
  let set = listeners.get(fileId);
  if (!set) listeners.set(fileId, (set = new Set()));
  set.add(listener);
  // Deferred so listeners aren't notified mid-subscribe. Runs when a view
  // mounts, which is also how a failed deck gets retried (not in a loop).
  queueMicrotask(() => {
    if (!getState(fileId).complete) loadDeck(fileId);
  });
  return () => {
    set.delete(listener);
  };
}

/** Subscribes to a deck's loading state; starts loading it (in the background queue). */
export function useDeck(fileId: string | null): DeckState {
  // Stable per file: a new function each render would resubscribe (and so
  // re-trigger loading) on every render.
  const subscribeToFile = useCallback(
    (listener: () => void) => (fileId ? subscribe(fileId, listener) : () => {}),
    [fileId]
  );
  return useSyncExternalStore(
    subscribeToFile,
    () => (fileId ? getState(fileId) : INITIAL),
    () => INITIAL
  );
}

/** One registered slide's thumbnail, via its deck. */
export function useSlideThumbnail(fileId: string, slideIndex: number) {
  const deck = useDeck(fileId);
  const url = deck.urls?.[slideIndex] ?? null;
  let error = deck.error;
  if (!error && deck.urls && slideIndex >= deck.urls.length) {
    error = `スライド${slideIndex + 1}が見つかりません（現在のスライド数: ${deck.urls.length}）`;
  }
  return { url, error: url ? null : error, waitingUntil: deck.waitingUntil };
}
