"use client";

import { useState } from "react";

import { apiFetch } from "@/lib/api";
import type { BasketItem, Play, PlayAttributeValue } from "@/lib/types";
import { EditPlayModal } from "./EditPlayModal";
import { PlayCard } from "./PlayCard";

export function SearchTab({ onAdd }: { onAdd: (item: BasketItem) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Play[]>([]);
  const [status, setStatus] = useState("");
  const [editingPlayId, setEditingPlayId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("検索中...");
    try {
      const data = await apiFetch<{ results: Play[] }>(
        `/api/search?q=${encodeURIComponent(query)}`
      );
      setResults(data.results);
      setStatus(data.results.length ? "" : "見つかりませんでした。");
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  function handleSaved(playId: string, attributes: PlayAttributeValue[]) {
    setResults((prev) => prev.map((p) => (p.id === playId ? { ...p, attributes } : p)));
  }

  const editingPlay = results.find((p) => p.id === editingPlayId) ?? null;

  return (
    <section>
      <form onSubmit={handleSubmit}>
        <input
          className="growInput"
          type="text"
          placeholder="属性の値で検索（プレー名・体系など）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit">検索</button>
      </form>
      <div className="status">{status}</div>
      <div className="cardGrid">
        {results.map((play) => (
          <PlayCard
            key={play.id}
            thumbnailUrl={play.thumbnailUrl}
            attributes={play.attributes}
            onEdit={() => setEditingPlayId(play.id)}
            actions={
              <button
                type="button"
                onClick={() =>
                  onAdd({
                    playId: play.id,
                    fileId: play.driveFileId,
                    slideIndex: play.slideIndex,
                    thumbnailUrl: play.thumbnailUrl,
                    attributes: play.attributes,
                  })
                }
              >
                保持に追加
              </button>
            }
          />
        ))}
      </div>
      {editingPlay && (
        <EditPlayModal
          playId={editingPlay.id}
          initialAttributes={editingPlay.attributes}
          onClose={() => setEditingPlayId(null)}
          onSaved={(attributes) => handleSaved(editingPlay.id, attributes)}
        />
      )}
    </section>
  );
}
