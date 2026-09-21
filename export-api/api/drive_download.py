"""The one piece of Drive access this service needs: downloading raw file
bytes for a source .pptx, read-only, in-memory, never re-uploaded.

Everything else (folder browsing, thumbnail generation) lives in the Next.js
app (web/lib/google.ts) - this service only ever assembles exports.
"""
import io

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload


def download_file_bytes(access_token, file_id):
    creds = Credentials(token=access_token)
    service = build("drive", "v3", credentials=creds, cache_discovery=False)

    request = service.files().get_media(fileId=file_id, supportsAllDrives=True)
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    buffer.seek(0)
    return buffer.read()
