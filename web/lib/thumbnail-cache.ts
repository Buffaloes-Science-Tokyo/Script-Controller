import { BlobNotFoundError, head, put } from "@vercel/blob";

import {
  copyAsNativeSlides,
  deleteFile,
  getFileMetadata,
  renderSlideThumbnail,
} from "./google";

const CACHE_PREFIX = "slide-thumbnails";

function cachePathname(fileId: string, modifiedTime: string, slideIndex: number) {
  const safeModifiedTime = modifiedTime.replace(/[:.]/g, "-");
  return `${CACHE_PREFIX}/${fileId}/${safeModifiedTime}/${slideIndex}.png`;
}

// Vercel injects Blob credentials (BLOB_READ_WRITE_TOKEN, or the OIDC pair
// BLOB_STORE_ID/VERCEL_OIDC_TOKEN) automatically in deployed environments.
// Locally, they're only present after `vercel env pull` - rather than make
// that a hard requirement just to see a thumbnail, fall back to generating
// (uncached) when they're absent.
function hasBlobCredentials(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)
  );
}

/**
 * Returns a cached slide thumbnail URL, generating (and caching) it on first
 * request. Cache key is (fileId, modifiedTime, slideIndex): editing the
 * source deck naturally invalidates old thumbnails since modifiedTime changes.
 *
 * Generation is the expensive path: it makes a temporary native-Slides copy
 * of the source .pptx (Slides thumbnails only work on native Slides files),
 * renders the one requested page, then deletes the temp copy - see
 * lib/google.ts. Blobs are public (unguessable path, no expiry), which is an
 * adequate tradeoff for a low-sensitivity internal thumbnail cache.
 */
export async function getSlideThumbnailUrl(
  accessToken: string,
  fileId: string,
  slideIndex: number
): Promise<string> {
  const cachingEnabled = hasBlobCredentials();
  const metadata = await getFileMetadata(accessToken, fileId);
  const pathname = cachePathname(fileId, metadata.modifiedTime!, slideIndex);

  if (cachingEnabled) {
    try {
      const existing = await head(pathname);
      return existing.url;
    } catch (err) {
      if (!(err instanceof BlobNotFoundError)) throw err;
    }
  }

  const tempCopyId = await copyAsNativeSlides(accessToken, fileId);
  let pngBytes: Buffer;
  try {
    pngBytes = await renderSlideThumbnail(accessToken, tempCopyId, slideIndex);
  } finally {
    await deleteFile(accessToken, tempCopyId);
  }

  if (!cachingEnabled) {
    return `data:image/png;base64,${pngBytes.toString("base64")}`;
  }

  const blob = await put(pathname, pngBytes, {
    access: "public",
    contentType: "image/png",
    addRandomSuffix: false,
  });
  return blob.url;
}
