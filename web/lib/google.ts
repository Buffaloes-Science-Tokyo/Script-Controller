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
  /** Folder names from the given root down to this file's parent (empty for a direct child). */
  folderPath: string[];
};

const MAX_FOLDERS_TO_VISIT = 300;

/**
 * Lists every pptx deck anywhere under folderId, walking all subfolders
 * (not just direct children) so a coach only has to point at a root folder
 * once. Capped at MAX_FOLDERS_TO_VISIT so an accidentally-huge root (e.g.
 * all of "My Drive") can't run away on API quota.
 */
export async function listFolder(accessToken: string, folderId: string): Promise<DriveFile[]> {
  const drive = driveClient(accessToken);
  const query =
    `trashed = false and (` +
    `mimeType = '${FOLDER_MIME}' or ` +
    `mimeType = '${PPTX_MIME}' or ` +
    `mimeType = '${GOOGLE_SLIDES_MIME}')`;

  const files: DriveFile[] = [];
  const queue: { id: string; path: string[] }[] = [{ id: folderId, path: [] }];
  let visitedFolders = 0;

  while (queue.length > 0 && visitedFolders < MAX_FOLDERS_TO_VISIT) {
    const current = queue.shift()!;
    visitedFolders += 1;

    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q: `'${current.id}' in parents and ${query}`,
        pageSize: 1000,
        fields: "nextPageToken, files(id, name, mimeType, modifiedTime)",
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const f of res.data.files ?? []) {
        if (f.mimeType === FOLDER_MIME) {
          queue.push({ id: f.id!, path: [...current.path, f.name!] });
        } else {
          files.push({
            id: f.id!,
            name: f.name!,
            mimeType: f.mimeType!,
            modifiedTime: f.modifiedTime ?? undefined,
            folderPath: current.path,
          });
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  return files;
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

/** Renders one page of a native Slides presentation as a PNG and returns its bytes. */
export async function renderSlideThumbnail(
  accessToken: string,
  presentationId: string,
  slideIndex: number
): Promise<Buffer> {
  const slides = slidesClient(accessToken);

  const presentation = await slides.presentations.get({ presentationId });
  const pages = presentation.data.slides ?? [];
  if (slideIndex < 0 || slideIndex >= pages.length) {
    throw new RangeError(
      `slideIndex ${slideIndex} out of range (deck has ${pages.length} slides)`
    );
  }
  const pageObjectId = pages[slideIndex].objectId!;

  const thumbnail = await slides.presentations.pages.getThumbnail({
    presentationId,
    pageObjectId,
    "thumbnailProperties.mimeType": "PNG",
    "thumbnailProperties.thumbnailSize": "LARGE",
  });

  const imageResponse = await fetch(thumbnail.data.contentUrl!);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download rendered thumbnail: ${imageResponse.status}`);
  }
  return Buffer.from(await imageResponse.arrayBuffer());
}
