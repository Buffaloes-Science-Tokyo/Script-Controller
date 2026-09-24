"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useDataVersion } from "@/lib/dataVersion";
import type { BasketItem, Play, PlayAttributeValue } from "@/lib/types";
import { EditPlayModal } from "./EditPlayModal";
import { PlayCard } from "./PlayCard";
import { StatusText } from "./Spinner";

export function SearchTab({
  onAdd,
  onPlayDeleted,
}: {
  onAdd: (item: BasketItem) => void;
  onPlayDeleted: (playId: string) => void;
}) {
  const [terms, setTerms] = useState<string[]>([""]);
  const [results, setResults] = useState<Play[]>([]);
  const [status, setStatus] = useState("");
  const [editingPlayId, setEditingPlayId] = useState<string | null>(null);
  // The words behind the current results (not the live inputs), re-run in
  // the background when plays change elsewhere so the results stay current.
  const [submittedTerms, setSubmittedTerms] = useState<string[] | null>(null);
  const { playsVersion, playsChanged, schemaChanged } = useDataVersion();

  function fetchResults(words: string[]) {
    const params = new URLSearchParams();
    for (const word of words) params.append("q", word);
    return apiFetch<{ results: Play[] }>(`/api/search?${params}`);
  }

  function showResults(data: { results: Play[] }) {
    setResults(data.results);
    setStatus(data.results.length ? "" : "見つかりませんでした。");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("検索中...");
    const words = terms.map((t) => t.trim()).filter(Boolean);
    setSubmittedTerms(words);
    try {
      showResults(await fetchResults(words));
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  useEffect(() => {
    if (submittedTerms === null) return;
    fetchResults(submittedTerms)
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
      <form className="searchForm" onSubmit={handleSubmit}>
        {terms.map((term, index) => (
          <span className="searchTerm" key={index}>
            <input
              type="text"
              autoFocus={index > 0 && index === terms.length - 1}
              placeholder={index === 0 ? "属性の値で検索（プレー名・体型など）" : "さらに絞り込む単語"}
              value={term}
              onChange={(e) =>
                setTerms((prev) => prev.map((t, i) => (i === index ? e.target.value : t)))
              }
            />
            {terms.length > 1 && (
              <button
                type="button"
                aria-label="この単語を削除"
                title="この単語を削除"
                onClick={() => setTerms((prev) => prev.filter((_, i) => i !== index))}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <button
          type="button"
          aria-label="検索単語を追加"
          title="検索単語を追加"
          onClick={() => setTerms((prev) => [...prev, ""])}
        >
          ＋
        </button>
        <button type="submit">検索</button>
      </form>
      {terms.length > 1 && (
        <p className="hint">入力した全ての単語に当てはまるプレーを表示します。</p>
      )}
      <StatusText text={status} />
      <div className="cardGrid">
        {results.map((play) => (
          <PlayCard
            key={play.id}
            fileId={play.driveFileId}
            slideIndex={play.slideIndex}
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
          fileId={editingPlay.driveFileId}
          slideIndex={editingPlay.slideIndex}
          thumbnailUrl={editingPlay.thumbnailUrl}
          initialAttributes={editingPlay.attributes}
          onClose={() => setEditingPlayId(null)}
          onSaved={(attributes) => handleSaved(editingPlay.id, attributes)}
          onDeleted={() => handleDeleted(editingPlay.id)}
        />
      )}
    </section>
  );
}
