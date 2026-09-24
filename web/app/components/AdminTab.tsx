"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { useDataVersion } from "@/lib/dataVersion";
import { loadDeck, useDeck } from "@/lib/deckThumbnails";
import type { AttributeDef, DriveFile, Play } from "@/lib/types";
import { AttributeEditModal } from "./AttributeEditModal";
import { AttributeValueInput } from "./AttributeValueInput";
import { DeckProgress, Spinner, StatusText } from "./Spinner";

type BreadcrumbEntry = { id: string; name: string };

type RegisteredPlay = Pick<Play, "id" | "slideIndex" | "slideHash" | "attributes">;

type RegistrationState =
  | { kind: "unknown" } // registered before hashes were recorded
  | { kind: "checking" } // current hashes not loaded yet
  | { kind: "unchanged" }
  | { kind: "changed" }
  | { kind: "moved"; toIndex: number }; // the registered content now sits at another slide

/**
 * Compares a registered play's hash with the deck's current per-slide hashes.
 * A mismatch whose hash appears elsewhere in the deck means slides were
 * inserted/removed and the registered content shifted, not that it was edited.
 */
function registrationState(
  play: RegisteredPlay,
  deckHashes: (string | null)[] | null,
  deckComplete: boolean
): RegistrationState {
  if (!play.slideHash) return { kind: "unknown" };
  const current = deckHashes?.[play.slideIndex];
  if (current === play.slideHash) return { kind: "unchanged" };
  const toIndex = deckHashes?.indexOf(play.slideHash) ?? -1;
  if (toIndex >= 0) return { kind: "moved", toIndex };
  // Can't call it changed until every slide has been rendered and compared.
  if (!deckComplete) return { kind: "checking" };
  return { kind: "changed" };
}

function registrationLabel(state: RegistrationState): string {
  switch (state.kind) {
    case "unknown":
      return "登録済み（変更チェック不可：ハッシュ導入前の登録）";
    case "checking":
      return "登録済み（変更を確認中...）";
    case "unchanged":
      return "登録済み・登録時から変更なし";
    case "changed":
      return "登録済み・登録後にスライドが変更されています";
    case "moved":
      return `登録済み・スライドが移動しています（登録時の内容は現在${state.toIndex + 1}枚目）`;
  }
}

function playSummary(play: RegisteredPlay): string {
  return play.attributes.map((a) => `${a.name}: ${a.value}`).join(" / ");
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export function AdminTab() {
  const [path, setPath] = useState<BreadcrumbEntry[]>([]);
  const [entries, setEntries] = useState<DriveFile[]>([]);
  const [fileStatus, setFileStatus] = useState("");

  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [slideNumber, setSlideNumber] = useState(1);
  // Every slide's thumbnail for selectedFile, loaded progressively (and kept
  // for the page session) by the shared deck store, so changing the slide
  // is instant once it's there.
  const deck = useDeck(selectedFile?.id ?? null);
  const deckUrls = deck.urls;
  const deckHashes = deck.hashes;
  const [filePlays, setFilePlays] = useState<RegisteredPlay[]>([]);
  const activeFileId = useRef<string | null>(null);
  // 1 = fit to the preview panel's width
  const [zoom, setZoom] = useState(1);

  const [attributeDefs, setAttributeDefs] = useState<AttributeDef[]>([]);
  const [attributeValues, setAttributeValues] = useState<Record<string, string>>({});
  // Bumped after saving to remount the value inputs back to dropdown mode.
  const [formResetCount, setFormResetCount] = useState(0);
  const [editingAttribute, setEditingAttribute] = useState<AttributeDef | "new" | null>(null);
  const [saveStatus, setSaveStatus] = useState("");
  const { playsVersion, schemaVersion, schemaChanged } = useDataVersion();

  useEffect(() => {
    apiFetch<{ attributes: AttributeDef[] }>("/api/attributes")
      .then((data) => setAttributeDefs(data.attributes))
      .catch((err) => setSaveStatus((err as Error).message));
  }, [schemaVersion]);

  async function loadFolder(folderId: string | undefined, newPath: BreadcrumbEntry[]) {
    setFileStatus("読み込み中...");
    try {
      const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
      const data = await apiFetch<{ folderId: string; files: DriveFile[] }>(
        `/api/drive/files${query}`
      );
      setEntries(data.files);
      setPath(newPath.length ? newPath : [{ id: data.folderId, name: "ルート" }]);
      setFileStatus(data.files.length ? "" : "このフォルダは空です。");
    } catch (err) {
      setFileStatus((err as Error).message);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadFolder(undefined, []));
  }, []);

  function handleOpenFolder(folder: DriveFile) {
    loadFolder(folder.id, [...path, { id: folder.id, name: folder.name }]);
  }

  function handleBreadcrumbClick(index: number) {
    if (index === path.length - 1) return;
    const target = path[index];
    loadFolder(target.id, path.slice(0, index + 1));
  }

  async function loadFilePlays(fileId: string) {
    try {
      const data = await apiFetch<{ results: RegisteredPlay[] }>(
        `/api/plays?driveFileId=${encodeURIComponent(fileId)}&limit=100`
      );
      if (activeFileId.current === fileId) setFilePlays(data.results);
    } catch (err) {
      if (activeFileId.current === fileId) setSaveStatus((err as Error).message);
    }
  }

  // Plays registered/edited/deleted (here or in another tab): refresh this
  // file's registration status.
  useEffect(() => {
    if (activeFileId.current) loadFilePlays(activeFileId.current);
  }, [playsVersion]);

  function handleSelectFile(file: DriveFile) {
    activeFileId.current = file.id;
    setSelectedFile(file);
    setSlideNumber(1);
    setFilePlays([]);
    // Ahead of any card thumbnails, and re-checked in case the deck was
    // edited in Drive since it was last loaded.
    loadDeck(file.id, { priority: true, refresh: true });
    loadFilePlays(file.id);
  }

  const slideCount = deckUrls?.length ?? null;

  function changeSlide(value: number) {
    if (!Number.isFinite(value)) return;
    const max = slideCount ?? Infinity;
    setSlideNumber(Math.min(Math.max(1, Math.round(value)), max));
  }

  const previewUrl = deckUrls?.[slideNumber - 1] ?? null;
  const renderedCount = deckUrls?.filter((u) => u !== null).length ?? 0;

  const currentSlidePlays = filePlays.filter((p) => p.slideIndex === slideNumber - 1);
  const registeredSlides = [...new Set(filePlays.map((p) => p.slideIndex))].sort((a, b) => a - b);

  function slideHasProblem(slideIndex: number) {
    return filePlays.some((p) => {
      if (p.slideIndex !== slideIndex) return false;
      const kind = registrationState(p, deckHashes, deck.complete).kind;
      return kind === "changed" || kind === "moved";
    });
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      setSaveStatus("先にDriveファイルを選択してください。");
      return;
    }
    const overwriteMessage = "このスライドは既に登録されています。上書きしますか？";
    let overwrite = currentSlidePlays.length > 0;
    if (overwrite && !window.confirm(overwriteMessage)) return;
    const save = () =>
      apiFetch<{ overwritten: boolean }>("/api/plays", {
        method: "POST",
        body: JSON.stringify({
          driveFileId: selectedFile.id,
          slideIndex: slideNumber - 1,
          // Only current attributes: one may have been deleted since it was filled in.
          attributes: Object.fromEntries(
            attributeDefs.map((a) => [a.id, attributeValues[a.id] ?? ""])
          ),
          overwrite,
        }),
      });
    setSaveStatus("保存中...");
    try {
      let result: { overwritten: boolean };
      try {
        result = await save();
      } catch (err) {
        // Registered elsewhere since this file's plays were loaded.
        if (!(err instanceof ApiError && err.status === 409) || overwrite) throw err;
        if (!window.confirm(overwriteMessage)) {
          setSaveStatus("");
          return;
        }
        overwrite = true;
        result = await save();
      }
      setSaveStatus(result.overwritten ? "上書き保存しました。" : "保存しました。");
      setAttributeValues({});
      setFormResetCount((n) => n + 1);
      // New values become options, so the schema changed too (this also
      // counts as a plays change).
      schemaChanged();
    } catch (err) {
      setSaveStatus((err as Error).message);
    }
  }

  return (
    <section>
      <h2>Driveフォルダから探す</h2>
      <p className="hint">フォルダをクリックして移動し、pptxファイルをクリックして選択してください。</p>
      <div className="breadcrumb">
        {path.map((entry, i) => (
          <span key={entry.id}>
            {i > 0 && <span className="breadcrumbSep"> / </span>}
            <button
              type="button"
              className="breadcrumbButton"
              disabled={i === path.length - 1}
              onClick={() => handleBreadcrumbClick(i)}
            >
              {entry.name}
            </button>
          </span>
        ))}
      </div>
      <StatusText text={fileStatus} />
      <div className="fileList">
        {entries.map((entry) => (
          <div
            className={`fileRow${!entry.isFolder && selectedFile?.id === entry.id ? " selected" : ""}`}
            key={entry.id}
          >
            <button
              type="button"
              className="fileEntryButton"
              onClick={() => (entry.isFolder ? handleOpenFolder(entry) : handleSelectFile(entry))}
            >
              <span aria-hidden>{entry.isFolder ? "📁" : "📄"}</span>
              {entry.name}
            </button>
          </div>
        ))}
      </div>

      <h2>プレーを登録</h2>
      <div className="registerLayout">
        <form className="adminForm" onSubmit={handleRegister}>
          <label>
            選択中のファイル
            <input
              type="text"
              readOnly
              value={selectedFile?.name ?? ""}
              placeholder="上の一覧からファイルを選択してください"
            />
          </label>
          <div className="adminField">
            スライド番号（1始まり）
            <div className="slideNav">
              <button
                type="button"
                onClick={() => changeSlide(slideNumber - 1)}
                disabled={!selectedFile || slideNumber <= 1}
                aria-label="前のスライド"
              >
                ◀
              </button>
              <input
                type="number"
                min={1}
                max={slideCount ?? undefined}
                step={1}
                value={slideNumber}
                onChange={(e) => changeSlide(Number(e.target.value))}
              />
              <span className="slideCount">/ {slideCount ?? "-"}</span>
              <button
                type="button"
                onClick={() => changeSlide(slideNumber + 1)}
                disabled={!selectedFile || (slideCount !== null && slideNumber >= slideCount)}
                aria-label="次のスライド"
              >
                ▶
              </button>
            </div>
            <input
              type="range"
              className="slideRange"
              min={1}
              max={slideCount ?? 1}
              step={1}
              value={slideNumber}
              onChange={(e) => changeSlide(Number(e.target.value))}
              disabled={!slideCount || slideCount <= 1}
            />
            {registeredSlides.length > 0 && (
              <div className="registeredSlides">
                登録済み:
                {registeredSlides.map((index) => (
                  <button
                    type="button"
                    key={index}
                    className={`registeredChip${slideHasProblem(index) ? " warn" : ""}${
                      index === slideNumber - 1 ? " current" : ""
                    }`}
                    onClick={() => changeSlide(index + 1)}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="attributeHeader">
            <span>属性</span>
            <button type="button" onClick={() => setEditingAttribute("new")}>
              ＋ 属性を追加
            </button>
          </div>
          {attributeDefs.map((attribute) => (
            <div className="adminField" key={attribute.id}>
              <span className="attributeLabel">
                {attribute.name}
                <button
                  type="button"
                  className="smallBtn"
                  onClick={() => setEditingAttribute(attribute)}
                >
                  編集
                </button>
              </span>
              <AttributeValueInput
                key={`${attribute.id}-${formResetCount}`}
                attribute={attribute}
                value={attributeValues[attribute.id] ?? ""}
                onChange={(value) => setAttributeValues((v) => ({ ...v, [attribute.id]: value }))}
              />
            </div>
          ))}
          {attributeDefs.length === 0 && (
            <p className="hint">
              属性がまだありません。「＋ 属性を追加」から追加してください（例: プレー名、体型）。
            </p>
          )}

          <button type="submit">保存</button>
          <StatusText text={saveStatus} />
        </form>

        <div className="previewPanel">
          {selectedFile && (
            <div className="registrationBadges">
              {currentSlidePlays.length === 0 ? (
                <span className="registrationBadge none">未登録</span>
              ) : (
                currentSlidePlays.map((play) => {
                  const state = registrationState(play, deckHashes, deck.complete);
                  const summary = playSummary(play);
                  return (
                    <span key={play.id} className={`registrationBadge ${state.kind}`}>
                      {registrationLabel(state)}
                      {summary && <span className="registrationSummary">{summary}</span>}
                    </span>
                  );
                })
              )}
            </div>
          )}
          <div className="zoomControls">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
              disabled={zoom <= MIN_ZOOM}
              aria-label="縮小"
            >
              −
            </button>
            <span className="zoomLabel">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
              disabled={zoom >= MAX_ZOOM}
              aria-label="拡大"
            >
              ＋
            </button>
            <button type="button" onClick={() => setZoom(1)} disabled={zoom === 1}>
              幅に合わせる
            </button>
          </div>
          {selectedFile && !deck.complete && !deck.error && (
            <DeckProgress
              done={renderedCount}
              total={deckUrls?.length ?? null}
              waitingUntil={deck.waitingUntil}
            />
          )}
          <div className="previewBox">
            {!selectedFile && (
              <span className="hint">ファイルを選択するとここにスライドが表示されます。</span>
            )}
            {selectedFile && !previewUrl && deck.error && (
              <span className="status error">{deck.error}</span>
            )}
            {selectedFile && !previewUrl && !deck.error && (
              <span className="previewLoading">
                <Spinner size="large" />
                このスライドを生成中...
              </span>
            )}
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="preview" style={{ width: `${zoom * 100}%` }} />
            )}
          </div>
        </div>
      </div>
      {editingAttribute !== null && (
        <AttributeEditModal
          attribute={editingAttribute === "new" ? null : editingAttribute}
          onClose={() => setEditingAttribute(null)}
          onChanged={schemaChanged}
        />
      )}
    </section>
  );
}
