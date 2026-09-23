"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useDataVersion } from "@/lib/dataVersion";
import type { BasketItem, Play, PlayAttributeValue } from "@/lib/types";
import { EditPlayModal } from "./EditPlayModal";
import { PlayCard } from "./PlayCard";

export function SearchTab({
  onAdd,
  onPlayDeleted,
}: {
  onAdd: (item: BasketItem) => void;
  onPlayDeleted: (playId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Play[]>([]);
  const [status, setStatus] = useState("");
  const [editingPlayId, setEditingPlayId] = useState<string | null>(null);
  // The query behind the current results (not the live input), re-run in the
  // background when plays change elsewhere so the results stay current.
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const { playsVersion, playsChanged, schemaChanged } = useDataVersion();

  function fetchResults(q: string) {
    return apiFetch<{ results: Play[] }>(`/api/search?q=${encodeURIComponent(q)}`);
  }

  function showResults(data: { results: Play[] }) {
    setResults(data.results);
    setStatus(data.results.length ? "" : "見つかりませんでした。");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("検索中...");
    setSubmittedQuery(query);
    try {
      showResults(await fetchResults(query));
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  useEffect(() => {
    if (submittedQuery === null) return;
    fetchResults(submittedQuery)
      .then(showResults)
      .catch((err) => setStatus((err as Error).message));
    // Only on plays changes; a new submit runs its own search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playsVersion]);

  function handleSaved(playId: string, attributes: PlayAttributeValue[]) {
    setResults((prev) => prev.map((p) => (p.id === playId ? { ...p, attributes } : p)));
    schemaChanged();
  }

  function handleDeleted(playId: string) {
    setResults((prev) => prev.filter((p) => p.id !== playId));
    onPlayDeleted(playId);
    playsChanged();
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
            fileId={play.driveFileId}
            slideIndex={play.slideIndex}
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
          onDeleted={() => handleDeleted(editingPlay.id)}
        />
      )}
    </section>
  );
}
