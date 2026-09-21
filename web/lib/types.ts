export type Play = {
  id: string;
  playName: string;
  formation: string | null;
  driveFileId: string;
  slideIndex: number;
  thumbnailUrl: string | null;
  thumbnailError?: string;
};

export type BasketItem = {
  fileId: string;
  slideIndex: number;
  playName: string;
  formation: string | null;
  thumbnailUrl: string | null;
};

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
};
