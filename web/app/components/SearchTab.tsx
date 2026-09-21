"use client";

import { useState } from "react";

import { apiFetch } from "@/lib/api";
import type { BasketItem, Play } from "@/lib/types";

export function SearchTab({ onAdd }: { onAdd: (item: BasketItem) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Play[]>([]);
  const [status, setStatus] = useState("");

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

  return (
    <section>
      <form onSubmit={handleSubmit}>
        <input
          className="growInput"
          type="text"
          placeholder="プレー名・体型で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit">検索</button>
      </form>
      <div className="status">{status}</div>
      <div className="cardGrid">
        {results.map((play) => (
          <div className="card" key={play.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={play.thumbnailUrl ?? undefined} alt={play.playName} />
            <div className="cardBody">
              <strong>{play.playName}</strong>
              <span>{play.formation}</span>
            </div>
            <button
              type="button"
              onClick={() =>
                onAdd({
                  fileId: play.driveFileId,
                  slideIndex: play.slideIndex,
                  playName: play.playName,
                  formation: play.formation,
                  thumbnailUrl: play.thumbnailUrl,
                })
              }
            >
              保持に追加
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
