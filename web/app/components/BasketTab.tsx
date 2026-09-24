"use client";

import { useState } from "react";

import type { Basket } from "@/lib/useBasket";
import { useDataVersion } from "@/lib/dataVersion";
import { EditPlayModal } from "./EditPlayModal";
import { PlayCard } from "./PlayCard";
import { StatusText } from "./Spinner";

export function BasketTab({ basket }: { basket: Basket }) {
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);
  const [editingPlayId, setEditingPlayId] = useState<string | null>(null);
  const { schemaChanged } = useDataVersion();

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

  const editingItem = basket.items.find((item) => item.playId === editingPlayId) ?? null;

  return (
    <section>
      <p className="hint">
        保持したスライドの順番がそのままエクスポートされる順番になります。
      </p>
      <div className="basketList">
        {basket.items.map((item, index) => (
          <PlayCard
            key={`${item.fileId}-${item.slideIndex}-${index}`}
            variant="row"
            fileId={item.fileId}
            slideIndex={item.slideIndex}
            thumbnailUrl={item.thumbnailUrl}
            attributes={item.attributes}
            onEdit={() => setEditingPlayId(item.playId)}
            actions={
              <>
                <button type="button" onClick={() => basket.move(index, -1)}>
                  ↑
                </button>
                <button type="button" onClick={() => basket.move(index, 1)}>
                  ↓
                </button>
                <button type="button" onClick={() => basket.remove(index)}>
                  削除
                </button>
              </>
            }
          />
        ))}
      </div>
      <button
        className="primaryBtn"
        disabled={basket.items.length === 0 || exporting}
        onClick={handleExport}
      >
        選択したスライドをpptxで出力
      </button>
      <StatusText text={status} />
      {editingItem && (
        <EditPlayModal
          playId={editingItem.playId}
          fileId={editingItem.fileId}
          slideIndex={editingItem.slideIndex}
          thumbnailUrl={editingItem.thumbnailUrl}
          initialAttributes={editingItem.attributes}
          onClose={() => setEditingPlayId(null)}
          onSaved={(attributes) => {
            basket.updatePlayAttributes(editingItem.playId, attributes);
            schemaChanged();
          }}
        />
      )}
    </section>
  );
}
