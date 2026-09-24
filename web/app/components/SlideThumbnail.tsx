"use client";

import { useState } from "react";

import { useSlideThumbnail } from "@/lib/deckThumbnails";
import { Spinner } from "./Spinner";

type SlideThumbnailProps = {
  fileId: string;
  slideIndex: number;
  alt: string;
  /** The play's stored thumbnail; when given, shown without loading the deck. */
  thumbnailUrl?: string | null;
};

/** A registered slide's thumbnail, with loading/waiting/error placeholders. */
export function SlideThumbnail({ thumbnailUrl, ...props }: SlideThumbnailProps) {
  // Fall back to rendering via the deck if the stored image can't be loaded.
  const [storedFailed, setStoredFailed] = useState(false);
  if (thumbnailUrl && !storedFailed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={thumbnailUrl} alt={props.alt} onError={() => setStoredFailed(true)} />;
  }
  return <DeckSlideThumbnail {...props} />;
}

function DeckSlideThumbnail({
  fileId,
  slideIndex,
  alt,
}: Omit<SlideThumbnailProps, "thumbnailUrl">) {
  const { url, error, waitingUntil } = useSlideThumbnail(fileId, slideIndex);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} />;
  }
  if (error) {
    return (
      <div className="thumbPlaceholder error" title={error}>
        サムネイルを表示できません
      </div>
    );
  }
  return (
    <div
      className="thumbPlaceholder"
      title={waitingUntil ? "Google の利用上限のため待機中です" : undefined}
    >
      <Spinner />
      <span className="thumbPlaceholderText">{waitingUntil ? "待機中..." : "読み込み中..."}</span>
    </div>
  );
}
