import { and, eq } from "drizzle-orm";
import { google } from "googleapis";

import { db } from "./db";
import { accounts } from "./schema";

const REFRESH_MARGIN_SECONDS = 60;

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const GOOGLE_SLIDES_MIME = "application/vnd.google-apps.presentation";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export class NoLinkedGoogleAccountError extends Error {}

/**
 * Returns a valid Google access token for this user, refreshing it against
 * Google's token endpoint (and persisting the new token/expiry on the
 * `accounts` row) if the stored one has expired. This is what makes Drive
 * access survive past the hourly token lifetime without a re-auth prompt.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")))
    .limit(1);

  if (!account) {
    throw new NoLinkedGoogleAccountError("No linked Google account for this user");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const isExpired =
    !account.expires_at || account.expires_at - REFRESH_MARGIN_SECONDS < nowSeconds;

  if (!isExpired && account.access_token) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new NoLinkedGoogleAccountError(
      "Google access expired and no refresh token is stored - sign in again"
    );
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh Google access token: ${await response.text()}`);
  }

  const refreshed = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  await db
    .update(accounts)
    .set({
      access_token: refreshed.access_token,
      expires_at: nowSeconds + refreshed.expires_in,
    })
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")));

  return refreshed.access_token;
}

function driveClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

function slidesClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.slides({ version: "v1", auth });
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  isFolder: boolean;
};

/**
 * Lists the direct children of folderId (subfolders and pptx decks only),
 * like a normal Drive folder view - the caller drives navigation by calling
 * this again with a subfolder's id when the user clicks into it.
 */
export async function listFolderChildren(
  accessToken: string,
  folderId: string
): Promise<DriveFile[]> {
  const drive = driveClient(accessToken);
  const query =
    `trashed = false and (` +
    `mimeType = '${FOLDER_MIME}' or ` +
    `mimeType = '${PPTX_MIME}' or ` +
    `mimeType = '${GOOGLE_SLIDES_MIME}')`;

  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and ${query}`,
      pageSize: 1000,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime)",
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      orderBy: "folder, name_natural",
    });
    for (const f of res.data.files ?? []) {
      files.push({
        id: f.id!,
        name: f.name!,
        mimeType: f.mimeType!,
        modifiedTime: f.modifiedTime ?? undefined,
        isFolder: f.mimeType === FOLDER_MIME,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

export function isNativeSlides(mimeType: string | null | undefined): boolean {
  return mimeType === GOOGLE_SLIDES_MIME;
}

export async function getFileMetadata(accessToken: string, fileId: string) {
  const drive = driveClient(accessToken);
  const res = await drive.files.get({
    fileId,
    fields: "id, name, mimeType, modifiedTime",
    supportsAllDrives: true,
  });
  return res.data;
}

/**
 * Creates a temporary native-Google-Slides copy of a raw .pptx file.
 * Required because the Slides API's per-page thumbnail endpoint only works
 * on native Slides presentations, not raw uploaded .pptx files. Caller must
 * delete the returned file id when done.
 */
export async function copyAsNativeSlides(accessToken: string, fileId: string): Promise<string> {
  const drive = driveClient(accessToken);
  const res = await drive.files.copy({
    fileId,
    requestBody: { name: "_tmp_preview_conversion", mimeType: GOOGLE_SLIDES_MIME },
    supportsAllDrives: true,
  });
  return res.data.id!;
}

export async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  const drive = driveClient(accessToken);
  await drive.files.delete({ fileId, supportsAllDrives: true });
}

// Slides thumbnails count against the API's "Expensive read requests per
// minute per user" quota, which is small. Pace them with a sliding one-minute
// window, kept a little under the quota. Override via env if your project's
// quota differs (Google Cloud console > IAM & Admin > Quotas).
const THUMBNAILS_PER_MINUTE = Number(process.env.SLIDES_THUMBNAILS_PER_MINUTE) || 50;
const QUOTA_WINDOW_MS = 60_000;

/**
 * Thrown instead of waiting when a thumbnail can't be requested before the
 * caller's deadline; callers return what they have and resume later.
 */
export class ThumbnailQuotaError extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`Slides API quota reached; retry in ${Math.ceil(retryAfterMs / 1000)}s`);
  }
}

// Module state, so it's shared by every request this server process handles.
// (Separate serverless instances don't share it - a 429 from Google is still
// handled below by backing off for a full window.)
const quotaState = { requestTimes: [] as number[], blockedUntil: 0 };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireThumbnailSlot(deadline: number) {
  for (;;) {
    const now = Date.now();
    quotaState.requestTimes = quotaState.requestTimes.filter((t) => t > now - QUOTA_WINDOW_MS);

    let readyAt = quotaState.blockedUntil;
    if (quotaState.requestTimes.length >= THUMBNAILS_PER_MINUTE) {
      readyAt = Math.max(readyAt, quotaState.requestTimes[0] + QUOTA_WINDOW_MS);
    }
    if (readyAt <= now) {
      quotaState.requestTimes.push(now);
      return;
    }
    if (readyAt > deadline) throw new ThumbnailQuotaError(readyAt - now);
    await sleep(readyAt - now);
  }
}

/**
 * Renders one page of a native Slides presentation as a PNG, paced by the
 * quota limiter above. Throws ThumbnailQuotaError if the quota won't allow it
 * before `deadline`.
 */
export async function renderSlideThumbnail(
  accessToken: string,
  presentationId: string,
  pageObjectId: string,
  deadline: number
): Promise<Buffer> {
  await acquireThumbnailSlot(deadline);
  const slides = slidesClient(accessToken);

  let contentUrl: string;
  try {
    const thumbnail = await slides.presentations.pages.getThumbnail({
      presentationId,
      pageObjectId,
      "thumbnailProperties.mimeType": "PNG",
      "thumbnailProperties.thumbnailSize": "LARGE",
    });
    contentUrl = thumbnail.data.contentUrl!;
  } catch (err) {
    if ((err as { code?: unknown }).code === 429) {
      // Quota used up anyway (e.g. by another server instance): back off for
      // a whole window rather than hammering it.
      quotaState.blockedUntil = Date.now() + QUOTA_WINDOW_MS;
      throw new ThumbnailQuotaError(QUOTA_WINDOW_MS);
    }
    throw err;
  }

  const imageResponse = await fetch(contentUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download rendered thumbnail: ${imageResponse.status}`);
  }
  return Buffer.from(await imageResponse.arrayBuffer());
}

/** Page object ids of a native Slides presentation, in slide order. */
export async function getSlidePageIds(accessToken: string, presentationId: string) {
  const slides = slidesClient(accessToken);
  const presentation = await slides.presentations.get({
    presentationId,
    fields: "slides(objectId)",
  });
  return (presentation.data.slides ?? []).map((page) => page.objectId!);
}
