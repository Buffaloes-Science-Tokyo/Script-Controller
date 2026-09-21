export type AttributeType = "text" | "select";

export type AttributeDef = {
  id: string;
  name: string;
  type: AttributeType;
  options: string[] | null;
  sortOrder: number;
};

export type PlayAttributeValue = {
  attributeDefId: string;
  name: string;
  type: AttributeType;
  value: string;
};

export type Play = {
  id: string;
  driveFileId: string;
  slideIndex: number;
  thumbnailUrl: string | null;
  thumbnailError?: string;
  attributes: PlayAttributeValue[];
};

export type BasketItem = {
  playId: string;
  fileId: string;
  slideIndex: number;
  thumbnailUrl: string | null;
  attributes: PlayAttributeValue[];
};

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  folderPath: string[];
};
