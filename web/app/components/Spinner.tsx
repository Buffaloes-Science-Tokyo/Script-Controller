"use client";

import { useEffect, useState } from "react";

export function Spinner({ size = "small" }: { size?: "small" | "large" }) {
  return <span className={`spinner ${size}`} aria-hidden />;
}

/**
 * Status line; in-progress messages (all of which end in "中...", e.g.
 * 読み込み中... / 保存中...) get a spinner.
 */
export function StatusText({ text }: { text: string }) {
  return (
    <div className="status">
      {text.endsWith("中...") && <Spinner />}
      {text}
    </div>
  );
}

/** Seconds left until `until`, updating every second. */
export function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

/** Progress of a deck's thumbnails being generated. */
export function DeckProgress({
  done,
  total,
  waitingUntil,
}: {
  done: number;
  total: number | null;
  waitingUntil: number | null;
}) {
  const secondsLeft = useCountdown(waitingUntil);
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="deckProgress" role="status">
      <div className="deckProgressLabel">
        <Spinner />
        {total ? `スライド画像を生成中… ${done} / ${total}枚` : "スライドを読み込み中..."}
      </div>
      <div className="progressTrack">
        <div
          className={`progressBar${total ? "" : " indeterminate"}`}
          style={total ? { width: `${percent}%` } : undefined}
        />
      </div>
      {waitingUntil !== null && secondsLeft > 0 && (
        <div className="hint">
          Google の利用上限（1分あたりの回数）に達したため待機中です。あと約{secondsLeft}秒で再開します。
        </div>
      )}
    </div>
  );
}
