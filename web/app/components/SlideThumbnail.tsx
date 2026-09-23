"use client";

import { useSlideThumbnail } from "@/lib/deckThumbnails";
import { Spinner } from "./Spinner";

/** A registered slide's thumbnail, with loading/waiting/error placeholders. */
export function SlideThumbnail({
  fileId,
  slideIndex,
  alt,
}: {
  fileId: string;
  slideIndex: number;
  alt: string;
}) {
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
