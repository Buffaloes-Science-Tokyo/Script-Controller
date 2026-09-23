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
};
const memoryIndex = (globalForCache.deckIndex ??= new Map<string, DeckEntry>());
// Render rounds in progress, so concurrent requests for one deck share a round.
const inFlightRounds = (globalForCache.deckRounds ??= new Map<string, Promise<DeckThumbnails>>());

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
  if (cached || !hasBlobCredentials()) return cached ?? null;

  // Another server instance may have rendered (part of) this deck.
  try {
    const existing = await head(`${key}/manifest.json`);
    const res = await fetch(existing.url);
    if (!res.ok) return null;
    const manifest = (await res.json()) as Partial<DeckEntry>;
    if (!Array.isArray(manifest.urls) || !Array.isArray(manifest.hashes)) return null;
    const entry = { urls: manifest.urls, hashes: manifest.hashes };
    remember(key, entry);
    return entry;
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
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
        } catch (err) {
          if (!(err instanceof ThumbnailQuotaError)) throw err;
          stop = true;
          retryAfterMs = Math.max(retryAfterMs, err.retryAfterMs);
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
