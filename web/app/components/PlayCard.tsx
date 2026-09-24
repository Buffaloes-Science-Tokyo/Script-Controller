import type { PlayAttributeValue } from "@/lib/types";
import { SlideThumbnail } from "./SlideThumbnail";

const NO_TITLE_PLACEHOLDER = "（属性未設定）";

/** First attribute (by sortOrder, already sorted server-side) is the title; the rest render as tags. */
function splitTitleAndTags(attributes: PlayAttributeValue[]) {
  const [first, ...rest] = attributes;
  return { title: first?.value || NO_TITLE_PLACEHOLDER, tags: rest };
}

type PlayCardProps = {
  fileId: string;
  slideIndex: number;
  thumbnailUrl?: string | null;
  attributes: PlayAttributeValue[];
  variant?: "card" | "row";
  actions?: React.ReactNode;
  /** Clicking the thumbnail/title area (not the action buttons) opens the edit popup. */
  onEdit?: () => void;
};

export function PlayCard({
  fileId,
  slideIndex,
  thumbnailUrl,
  attributes,
  variant = "card",
  actions,
  onEdit,
}: PlayCardProps) {
  const { title, tags } = splitTitleAndTags(attributes);
  const bodyClassName = variant === "row" ? "basketRowBody" : "cardBody";

  const content = (
    <div className={`cardClickArea${onEdit ? " clickable" : ""}`} onClick={onEdit}>
      <SlideThumbnail
        fileId={fileId}
        slideIndex={slideIndex}
        thumbnailUrl={thumbnailUrl}
        alt={title}
      />
      <div className={bodyClassName}>
        <strong>{title}</strong>
        {tags.map((tag) => (
          <span key={tag.attributeDefId}>
            {tag.name}: {tag.value}
          </span>
        ))}
      </div>
    </div>
  );

  if (variant === "row") {
    return (
      <div className="basketRow">
        {content}
        {actions && <div className="basketRowActions">{actions}</div>}
      </div>
    );
  }

  return (
    <div className="card">
      {content}
      {actions}
    </div>
  );
}
