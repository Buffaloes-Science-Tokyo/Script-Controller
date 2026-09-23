import { createHash } from "node:crypto";

import { BlobNotFoundError, head, put } from "@vercel/blob";

import {
  copyAsNativeSlides,
  deleteFile,
  getFileMetadata,
  isNativeSlides,
  renderAllSlideThumbnails,
  renderSlideThumbnail,
} from "./google";

const CACHE_PREFIX = "slide-thumbnails";

/** Per-slide thumbnail URLs and content hashes, both in slide order. */
export type DeckThumbnails = { urls: string[]; hashes: string[] };

function hashPng(pngBytes: Buffer) {
  return createHash("sha256").update(pngBytes).digest("hex");
}

function deckCacheKey(fileId: string, modifiedTime: string) {
  const safeModifiedTime = modifiedTime.replace(/[:.]/g, "-");
  return `${CACHE_PREFIX}/${fileId}/${safeModifiedTime}`;
}

function cachePathname(fileId: string, modifiedTime: string, slideIndex: number) {
  return `${deckCacheKey(fileId, modifiedTime)}/${slideIndex}.png`;
}

function manifestPathname(fileId: string, modifiedTime: string) {
  return `${deckCacheKey(fileId, modifiedTime)}/manifest.json`;
}

// Vercel injects Blob credentials (BLOB_READ_WRITE_TOKEN, or the OIDC pair
// BLOB_STORE_ID/VERCEL_OIDC_TOKEN) automatically in deployed environments.
// Locally, they're only present after `vercel env pull` - rather than make
// that a hard requirement just to see a thumbnail, fall back to an in-memory
// cache when they're absent.
function hasBlobCredentials(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)
  );
}

// Fallback cache for when Blob isn't configured: whole decks as data URLs,
// keyed like the Blob paths. Stored on globalThis so dev-server hot reloads
// don't drop it; capped because each deck can be several MB.
const MEMORY_CACHE_MAX_DECKS = 5;
const globalForCache = globalThis as unknown as {
  deckThumbnailCache?: Map<string, DeckThumbnails>;
};
const memoryCache = (globalForCache.deckThumbnailCache ??= new Map<string, DeckThumbnails>());

function rememberDeck(key: string, deck: DeckThumbnails) {
  memoryCache.delete(key);
  memoryCache.set(key, deck);
  while (memoryCache.size > MEMORY_CACHE_MAX_DECKS) {
    memoryCache.delete(memoryCache.keys().next().value!);
  }
}

function toDataUrl(pngBytes: Buffer) {
  return `data:image/png;base64,${pngBytes.toString("base64")}`;
}

/**
 * Runs fn against a native-Slides version of the file. Slides thumbnails only
 * work on native Slides files, so a raw .pptx gets a temporary converted copy
 * (the expensive step) that is deleted afterwards.
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

async function readBlobManifest(pathname: string): Promise<DeckThumbnails | null> {
  try {
    const existing = await head(pathname);
    const res = await fetch(existing.url);
    if (!res.ok) return null;
    const manifest = (await res.json()) as Partial<DeckThumbnails>;
    if (!Array.isArray(manifest.urls) || !Array.isArray(manifest.hashes)) return null;
    return manifest as DeckThumbnails;
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
}

/**
 * Returns thumbnail URLs and content hashes for every slide of a deck,
 * rendering the whole deck from a single converted copy on a cache miss. Rendering all pages at once
 * costs about the same as one conversion, so the admin UI fetches this once
 * per file and then flips between slides without further round trips.
 *
 * Cache key is (fileId, modifiedTime): editing the source deck naturally
 * invalidates old thumbnails since modifiedTime changes. Blobs are public
 * (unguessable path, no expiry), which is an adequate tradeoff for a
 * low-sensitivity internal thumbnail cache.
 */
export async function getDeckThumbnails(
  accessToken: string,
  fileId: string
): Promise<DeckThumbnails> {
  const metadata = await getFileMetadata(accessToken, fileId);
  const modifiedTime = metadata.modifiedTime!;
  const cachingEnabled = hasBlobCredentials();

  if (!cachingEnabled) {
    const cached = memoryCache.get(deckCacheKey(fileId, modifiedTime));
    if (cached) return cached;
  } else {
    const cached = await readBlobManifest(manifestPathname(fileId, modifiedTime));
    if (cached) return cached;
  }

  const pngs = await withNativeSlides(accessToken, fileId, metadata.mimeType, (presentationId) =>
    renderAllSlideThumbnails(accessToken, presentationId)
  );

  const hashes = pngs.map(hashPng);

  if (!cachingEnabled) {
    const deck = { urls: pngs.map(toDataUrl), hashes };
    rememberDeck(deckCacheKey(fileId, modifiedTime), deck);
    return deck;
  }

  const urls = await Promise.all(
    pngs.map(async (pngBytes, slideIndex) => {
      const blob = await put(cachePathname(fileId, modifiedTime, slideIndex), pngBytes, {
        access: "public",
        contentType: "image/png",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return blob.url;
    })
  );
  const deck = { urls, hashes };
  await put(manifestPathname(fileId, modifiedTime), JSON.stringify(deck), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return deck;
}

/**
 * Returns a cached slide thumbnail URL, generating (and caching) it on first
 * request. Shares cache entries with getDeckThumbnails, so a deck already
 * browsed in the admin UI is served without rendering.
 */
export async function getSlideThumbnailUrl(
  accessToken: string,
  fileId: string,
  slideIndex: number
): Promise<string> {
  const cachingEnabled = hasBlobCredentials();
  const metadata = await getFileMetadata(accessToken, fileId);
  const modifiedTime = metadata.modifiedTime!;
  const pathname = cachePathname(fileId, modifiedTime, slideIndex);

  if (cachingEnabled) {
    try {
      const existing = await head(pathname);
      return existing.url;
    } catch (err) {
      if (!(err instanceof BlobNotFoundError)) throw err;
    }
  } else {
    const cachedDeck = memoryCache.get(deckCacheKey(fileId, modifiedTime));
    if (cachedDeck) {
      if (slideIndex < 0 || slideIndex >= cachedDeck.urls.length) {
        throw new RangeError(
          `slideIndex ${slideIndex} out of range (deck has ${cachedDeck.urls.length} slides)`
        );
      }
      return cachedDeck.urls[slideIndex];
    }
  }

  const pngBytes = await withNativeSlides(accessToken, fileId, metadata.mimeType, (presentationId) =>
    renderSlideThumbnail(accessToken, presentationId, slideIndex)
  );

  if (!cachingEnabled) return toDataUrl(pngBytes);

  const blob = await put(pathname, pngBytes, {
    access: "public",
    contentType: "image/png",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return blob.url;
}
