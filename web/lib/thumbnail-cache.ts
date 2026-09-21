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
  const metadata = await getFileMetadata(accessToken, fileId);
  const pathname = cachePathname(fileId, metadata.modifiedTime!, slideIndex);

  try {
    const existing = await head(pathname);
    return existing.url;
  } catch (err) {
    if (!(err instanceof BlobNotFoundError)) throw err;
  }

  const tempCopyId = await copyAsNativeSlides(accessToken, fileId);
  let pngBytes: Buffer;
  try {
    pngBytes = await renderSlideThumbnail(accessToken, tempCopyId, slideIndex);
  } finally {
    await deleteFile(accessToken, tempCopyId);
  }

  const blob = await put(pathname, pngBytes, {
    access: "public",
    contentType: "image/png",
    addRandomSuffix: false,
  });
  return blob.url;
}
