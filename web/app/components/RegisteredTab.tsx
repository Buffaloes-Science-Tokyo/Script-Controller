"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useDataVersion } from "@/lib/dataVersion";
import type { AttributeDef, BasketItem, Play, PlayAttributeValue } from "@/lib/types";
import { ComboBox } from "./ComboBox";
import { EditPlayModal } from "./EditPlayModal";
import { PlayCard } from "./PlayCard";
import { StatusText } from "./Spinner";

const PAGE_SIZE = 30;

export function RegisteredTab({
  onAdd,
  onPlayDeleted,
}: {
  onAdd: (item: BasketItem) => void;
  onPlayDeleted: (playId: string) => void;
}) {
  const [attributeDefs, setAttributeDefs] = useState<AttributeDef[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const [results, setResults] = useState<Play[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [editingPlayId, setEditingPlayId] = useState<string | null>(null);
  const { playsVersion, schemaVersion, playsChanged, schemaChanged } = useDataVersion();

  useEffect(() => {
    apiFetch<{ attributes: AttributeDef[] }>("/api/attributes")
      .then((data) => setAttributeDefs(data.attributes))
      .catch(() => {});
  }, [schemaVersion]);

  function buildQuery(offset: number, limit = PAGE_SIZE) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    for (const [attributeDefId, value] of Object.entries(filters)) {
      if (value.trim()) params.set(`attr_${attributeDefId}`, value.trim());
    }
    return params.toString();
  }

  async function loadFirstPage() {
    setStatus("読み込み中...");
    try {
      const data = await apiFetch<{ results: Play[]; hasMore: boolean }>(
        `/api/plays?${buildQuery(0)}`
      );
      setResults(data.results);
      setHasMore(data.hasMore);
      setStatus(data.results.length ? "" : "登録されたプレーがありません。");
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  // Not loadFirstPage() directly: it sets loading state synchronously as its
  // first statement, which the effects lint rule flags when called straight
  // from an effect body (loadFirstPage itself stays reusable for the filter
  // form's submit handler, which isn't inside an effect).
  // Also re-runs in the background when plays change elsewhere, keeping as
  // many rows as are already loaded (the API caps a page at 100).
  useEffect(() => {
    const limit = Math.min(Math.max(PAGE_SIZE, results.length), 100);
    apiFetch<{ results: Play[]; hasMore: boolean }>(`/api/plays?${buildQuery(0, limit)}`)
      .then((data) => {
        setResults(data.results);
        setHasMore(data.hasMore);
        setStatus(data.results.length ? "" : "登録されたプレーがありません。");
      })
      .catch((err) => setStatus((err as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playsVersion]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const data = await apiFetch<{ results: Play[]; hasMore: boolean }>(
        `/api/plays?${buildQuery(results.length)}`
      );
      setResults((prev) => [...prev, ...data.results]);
      setHasMore(data.hasMore);
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

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
      {attributeDefs.length > 0 && (
        <form
          className="filterForm"
          onSubmit={(e) => {
            e.preventDefault();
            loadFirstPage();
          }}
        >
          {attributeDefs.map((attribute) => (
            <label className="filterField" key={attribute.id}>
              <span className="filterLabel">{attribute.name}</span>
              <ComboBox
                value={filters[attribute.id] ?? ""}
                options={attribute.options ?? []}
                placeholder="すべて"
                onChange={(value) => setFilters((f) => ({ ...f, [attribute.id]: value }))}
              />
            </label>
          ))}
          <button type="submit">絞り込み</button>
        </form>
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
      {hasMore && (
        <button type="button" onClick={loadMore} disabled={loadingMore}>
          もっと読み込む
        </button>
      )}
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
