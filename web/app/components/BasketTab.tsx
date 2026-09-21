"use client";

import { useState } from "react";

import type { Basket } from "@/lib/useBasket";

export function BasketTab({ basket }: { basket: Basket }) {
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    setStatus("出力中...");
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: basket.items.map(({ fileId, slideIndex }) => ({ fileId, slideIndex })),
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || `出力に失敗しました (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "script.pptx";
      a.click();
      URL.revokeObjectURL(url);
      setStatus("");
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section>
      <p className="hint">
        保持したスライドの順番がそのままエクスポートされる順番になります。
      </p>
      <div className="basketList">
        {basket.items.map((item, index) => (
          <div className="basketRow" key={`${item.fileId}-${item.slideIndex}-${index}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.thumbnailUrl ?? undefined} alt={item.playName} />
            <div className="basketRowBody">
              <strong>{item.playName}</strong>
              <span>{item.formation}</span>
            </div>
            <div className="basketRowActions">
              <button type="button" onClick={() => basket.move(index, -1)}>
                ↑
              </button>
              <button type="button" onClick={() => basket.move(index, 1)}>
                ↓
              </button>
              <button type="button" onClick={() => basket.remove(index)}>
                削除
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        className="primaryBtn"
        disabled={basket.items.length === 0 || exporting}
        onClick={handleExport}
      >
        選択したスライドをpptxで出力
      </button>
      <div className="status">{status}</div>
    </section>
  );
}
