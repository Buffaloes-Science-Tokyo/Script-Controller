import { createHash } from "node:crypto";

import { BlobNotFoundError, head, put } from "@vercel/blob";

import {
  copyAsNativeSlides,
  deleteFile,
  getFileMetadata,
  getSlidePageIds,
  isNativeSlides,
  renderSlideThumbnail,
  ThumbnailQuotaError,
  ThumbnailTransientError,
} from "./google";

const CACHE_PREFIX = "slide-thumbnails";

/**
 * Per-slide thumbnail URLs and content hashes, in slide order. Slides not
 * rendered yet are null; `complete` is false until every slide is present.
 */
export type DeckThumbnails = {
  urls: (string | null)[];
  hashes: (string | null)[];
  complete: boolean;
  /** When incomplete: how long the caller should wait before asking again. */
  retryAfterMs: number;
};

type DeckEntry = { urls: (string | null)[]; hashes: (string | null)[] };

// How long one request spends rendering before returning partial results.
// Keeps each request well under the function time limit (maxDuration on the
// routes); the client asks again to continue where it left off.
const RENDER_BUDGET_MS = 20_000;
const RENDER_CONCURRENCY = 4;
// A slide that keeps failing with temporary Google errors is retried in
// later rounds, but gives up after this many failed rounds.
const MAX_TRANSIENT_FAILURES = 3;
const TRANSIENT_RETRY_MS = 3_000;

function hashPng(pngBytes: Buffer) {
  return createHash("sha256").update(pngBytes).digest("hex");
}

function deckCacheKey(fileId: string, modifiedTime: string) {
  const safeModifiedTime = modifiedTime.replace(/[:.]/g, "-");
  return `${CACHE_PREFIX}/${fileId}/${safeModifiedTime}`;
}

// Vercel injects Blob credentials (BLOB_READ_WRITE_TOKEN, or the OIDC pair
// BLOB_STORE_ID/VERCEL_OIDC_TOKEN) automatically in deployed environments.
// Locally, they're only present after `vercel env pull` - rather than make
// that a hard requirement just to see a thumbnail, fall back to keeping
// thumbnails in server memory when they're absent.
function hasBlobCredentials(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)
  );
}

// In-process index of decks, keyed like the Blob paths (so editing the source
// deck naturally starts a new entry since modifiedTime changes). Without
// Blob it holds the images themselves as data URLs, hence the small cap.
// Stored on globalThis so dev-server hot reloads don't drop it.
const MEMORY_DECKS_WITH_IMAGES = 5;
const MEMORY_DECKS_WITH_BLOB_URLS = 50;
const globalForCache = globalThis as unknown as {
  deckIndex?: Map<string, DeckEntry>;
  deckRounds?: Map<string, Promise<DeckThumbnails>>;
  slideFailures?: Map<string, number>;
};
const memoryIndex = (globalForCache.deckIndex ??= new Map<string, DeckEntry>());
// Render rounds in progress, so concurrent requests for one deck share a round.
const inFlightRounds = (globalForCache.deckRounds ??= new Map<string, Promise<DeckThumbnails>>());
// Temporary failures per slide ("<deck key>/<index>"), across rounds.
const slideFailures = (globalForCache.slideFailures ??= new Map<string, number>());

function remember(key: string, entry: DeckEntry) {
  memoryIndex.delete(key);
  memoryIndex.set(key, entry);
  const cap = hasBlobCredentials() ? MEMORY_DECKS_WITH_BLOB_URLS : MEMORY_DECKS_WITH_IMAGES;
  while (memoryIndex.size > cap) {
    memoryIndex.delete(memoryIndex.keys().next().value!);
  }
}

async function loadEntry(key: string): Promise<DeckEntry | null> {
  const cached = memoryIndex.get(key);
  if (!hasBlobCredentials() || (cached && isComplete(cached))) return cached ?? null;

  // Another server instance may have rendered (part of) this deck - possibly
  // since this instance last looked, so an incomplete entry is re-read too.
  // Otherwise e.g. /api/plays, which never renders, would keep answering
  // "still rendering" for slides another instance has finished.
  let manifest: Partial<DeckEntry>;
  try {
    const existing = await head(`${key}/manifest.json`);
    // Versioned by upload time so a CDN-cached older manifest isn't served.
    const res = await fetch(`${existing.url}?v=${existing.uploadedAt.getTime()}`, {
      cache: "no-store",
    });
    if (!res.ok) return cached ?? null;
    manifest = (await res.json()) as Partial<DeckEntry>;
  } catch (err) {
    if (err instanceof BlobNotFoundError) return cached ?? null;
    throw err;
  }
  if (!Array.isArray(manifest.urls) || !Array.isArray(manifest.hashes)) return cached ?? null;

  if (cached && cached.urls.length === manifest.urls.length) {
    // Fill in place: a render round on this instance may be mutating `cached`.
    manifest.urls.forEach((url, i) => {
      if (cached.urls[i] === null && url) {
        cached.urls[i] = url;
        cached.hashes[i] = manifest.hashes![i] ?? null;
      }
    });
    return cached;
  }
  const entry = { urls: manifest.urls, hashes: manifest.hashes };
  remember(key, entry);
  return entry;
}

async function saveEntry(key: string, entry: DeckEntry) {
  remember(key, entry);
  if (!hasBlobCredentials()) return;
  await put(`${key}/manifest.json`, JSON.stringify(entry), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/** Stores one rendered slide and records it in the entry. */
async function storeSlide(key: string, entry: DeckEntry, slideIndex: number, pngBytes: Buffer) {
  let url: string;
  if (hasBlobCredentials()) {
    // Blobs are public (unguessable path, no expiry), which is an adequate
    // tradeoff for a low-sensitivity internal thumbnail cache.
    const blob = await put(`${key}/${slideIndex}.png`, pngBytes, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    url = blob.url;
  } else {
    url = `data:image/png;base64,${pngBytes.toString("base64")}`;
  }
  entry.urls[slideIndex] = url;
  entry.hashes[slideIndex] = hashPng(pngBytes);
}

/**
 * Runs fn against a native-Slides version of the file. Slides thumbnails only
 * work on native Slides files, so a raw .pptx gets a temporary converted copy
 * that is deleted afterwards.
 */
async function withNativeSlides<T>(
  accessToken: string,
  fileId: string,
  mimeType: string | null | undefined,
  fn: (presentationId: string) => Promise<T>
): Promise<T> {
  if (isNativeSlides(mimeType)) return fn(fileId);

  const tempCopyId = await copyAsNativeSlides(accessToken, fileId);
  try {
    return await fn(tempCopyId);
  } finally {
    await deleteFile(accessToken, tempCopyId);
  }
}

function isComplete(entry: DeckEntry) {
  return entry.urls.length > 0 && entry.urls.every((u) => u !== null);
}

function emptyEntry(slideCount: number): DeckEntry {
  return { urls: new Array(slideCount).fill(null), hashes: new Array(slideCount).fill(null) };
}

/** One render round: fill in as many missing slides as the budget allows. */
async function renderRound(
  accessToken: string,
  fileId: string,
  mimeType: string | null | undefined,
  key: string,
  cached: DeckEntry | null
): Promise<DeckThumbnails> {
  const deadline = Date.now() + RENDER_BUDGET_MS;
  let retryAfterMs = 0;

  const entry = await withNativeSlides(accessToken, fileId, mimeType, async (presentationId) => {
    const pageIds = await getSlidePageIds(accessToken, presentationId);
    const entry =
      cached && cached.urls.length === pageIds.length ? cached : emptyEntry(pageIds.length);

    const missing = pageIds.map((_, i) => i).filter((i) => entry.urls[i] === null);
    let stop = false;
    async function worker() {
      while (!stop && missing.length > 0 && Date.now() < deadline) {
        const slideIndex = missing.shift()!;
        try {
          const png = await renderSlideThumbnail(
            accessToken,
            presentationId,
            pageIds[slideIndex],
            deadline
          );
          await storeSlide(key, entry, slideIndex, png);
          slideFailures.delete(`${key}/${slideIndex}`);
        } catch (err) {
          if (err instanceof ThumbnailQuotaError) {
            stop = true;
            retryAfterMs = Math.max(retryAfterMs, err.retryAfterMs);
          } else if (err instanceof ThumbnailTransientError) {
            // Leave this slide for a later round; keep rendering the others.
            const failureKey = `${key}/${slideIndex}`;
            const failures = (slideFailures.get(failureKey) ?? 0) + 1;
            slideFailures.set(failureKey, failures);
            if (failures >= MAX_TRANSIENT_FAILURES) {
              throw new Error(
                `スライド${slideIndex + 1}の画像を Google から取得できませんでした（${err.message}）`
              );
            }
            retryAfterMs = Math.max(retryAfterMs, TRANSIENT_RETRY_MS);
          } else {
            throw err;
          }
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: RENDER_CONCURRENCY }, worker));
    } finally {
      // Keep whatever finished, even if a slide failed.
      await saveEntry(key, entry);
    }
    return entry;
  });

  const complete = isComplete(entry);
  return { ...entry, complete, retryAfterMs: complete ? 0 : retryAfterMs };
}

/**
 * A URL that stays valid on its own (a Blob URL), worth persisting outside
 * this cache; null for the in-memory data URLs used without Blob.
 */
export function persistentThumbnailUrl(url: string | null | undefined): string | null {
  return url && !url.startsWith("data:") ? url : null;
}

/**
 * One slide's stored content hash and thumbnail URL, from the cache only -
 * never renders. Null when that slide hasn't been rendered (yet); throws
 * RangeError when the deck is known to have fewer slides.
 */
export async function getCachedSlide(
  accessToken: string,
  fileId: string,
  slideIndex: number
): Promise<{ hash: string; url: string } | null> {
  const metadata = await getFileMetadata(accessToken, fileId);
  const entry = await loadEntry(deckCacheKey(fileId, metadata.modifiedTime!));
  if (!entry) return null;
  if (slideIndex >= entry.hashes.length) {
    throw new RangeError(
      `slideIndex ${slideIndex} out of range (deck has ${entry.hashes.length} slides)`
    );
  }
  const hash = entry.hashes[slideIndex];
  const url = entry.urls[slideIndex];
  return hash && url ? { hash, url } : null;
}

/**
 * Returns thumbnail URLs and content hashes for a deck's slides. Missing
 * slides are rendered for up to RENDER_BUDGET_MS, paced by the Slides API
 * quota; if the deck isn't finished by then (or the quota is used up) the
 * partial result comes back with complete = false and the caller asks again
 * after retryAfterMs. Finished slides are kept, so no work is repeated.
 */
export async function getDeckThumbnails(
  accessToken: string,
  fileId: string
): Promise<DeckThumbnails> {
  const metadata = await getFileMetadata(accessToken, fileId);
  const key = deckCacheKey(fileId, metadata.modifiedTime!);

  const cached = await loadEntry(key);
  if (cached && isComplete(cached)) return { ...cached, complete: true, retryAfterMs: 0 };

  const running = inFlightRounds.get(key);
  if (running) return running;

  const round = renderRound(accessToken, fileId, metadata.mimeType, key, cached).finally(() =>
    inFlightRounds.delete(key)
  );
  inFlightRounds.set(key, round);
  return round;
}
