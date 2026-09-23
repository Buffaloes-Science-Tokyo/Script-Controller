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
  /** Hash of the slide's render at registration; null for older plays. */
  slideHash?: string | null;
  attributes: PlayAttributeValue[];
};

export type BasketItem = {
  playId: string;
  fileId: string;
  slideIndex: number;
  attributes: PlayAttributeValue[];
};

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  isFolder: boolean;
};
