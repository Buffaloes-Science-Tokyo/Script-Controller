"use client";

import { useState } from "react";

import { apiFetch } from "@/lib/api";
import type { AttributeDef } from "@/lib/types";

// `original` tracks which saved option a row started as, so editing its text
// is sent as a rename (carried over to plays) rather than delete + add.
type OptionRow = { key: number; original: string | null; value: string };

/**
 * Adds an attribute (attribute = null) or edits one: rename it, edit/add/
 * delete its options, or delete the attribute itself.
 */
export function AttributeEditModal({
  attribute,
  onClose,
  onChanged,
}: {
  attribute: AttributeDef | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(attribute?.name ?? "");
  const [rows, setRows] = useState<OptionRow[]>(() =>
    (attribute?.options ?? []).map((option, i) => ({ key: i, original: option, value: option }))
  );
  const [nextKey, setNextKey] = useState(rows.length);
  const [status, setStatus] = useState("");

  function updateRow(key: number, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { key: nextKey, original: null, value: "" }]);
    setNextKey((k) => k + 1);
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const options = rows.map((r) => r.value.trim()).filter(Boolean);
    const renames: Record<string, string> = {};
    for (const r of rows) {
      if (r.original && r.value.trim() && r.value.trim() !== r.original) {
        renames[r.original] = r.value.trim();
      }
    }

    const kept = new Set(rows.filter((r) => r.value.trim()).map((r) => r.original));
    const removed = (attribute?.options ?? []).filter((o) => !kept.has(o));
    if (
      removed.length > 0 &&
      !window.confirm(
        `選択肢「${removed.join("」「")}」を削除します。この値が設定されているプレーからは値が消えます。よろしいですか？`
      )
    ) {
      return;
    }

    setStatus("保存中...");
    try {
      if (attribute) {
        await apiFetch(`/api/attributes/${attribute.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name, options, renames }),
        });
      } else {
        await apiFetch("/api/attributes", {
          method: "POST",
          body: JSON.stringify({ name, options }),
        });
      }
      onChanged();
      onClose();
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  async function handleDeleteAttribute() {
    if (!attribute) return;
    if (
      !window.confirm(
        `属性「${attribute.name}」を削除しますか？この属性が設定されている全てのプレーから値も削除されます。`
      )
    ) {
      return;
    }
    setStatus("削除中...");
    try {
      await apiFetch(`/api/attributes/${attribute.id}`, { method: "DELETE" });
      onChanged();
      onClose();
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalBox" onClick={(e) => e.stopPropagation()}>
        <h2>{attribute ? "属性を編集" : "属性を追加"}</h2>
        <form className="adminForm" onSubmit={handleSave}>
          <label>
            属性名
            <input
              type="text"
              required
              autoFocus={!attribute}
              value={name}
              placeholder="例: プレー名、体型"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="adminField">
            選択肢
            {rows.length === 0 && (
              <span className="hint">
                空でも大丈夫です。プレー登録時に入力した値が自動で追加されます。
              </span>
            )}
            {rows.map((row) => (
              <span className="attributeValueRow" key={row.key}>
                <input
                  type="text"
                  value={row.value}
                  placeholder="選択肢"
                  onChange={(e) => updateRow(row.key, e.target.value)}
                />
                <button type="button" onClick={() => removeRow(row.key)}>
                  削除
                </button>
              </span>
            ))}
            <button type="button" className="addOptionBtn" onClick={addRow}>
              ＋ 選択肢を追加
            </button>
          </div>
          <div className="basketRowActions modalActions">
            <button type="submit" className="primaryBtn">
              保存
            </button>
            <button type="button" onClick={onClose}>
              キャンセル
            </button>
            {attribute && (
              <button type="button" className="dangerBtn" onClick={handleDeleteAttribute}>
                属性を削除
              </button>
            )}
          </div>
          <div className="status">{status}</div>
        </form>
      </div>
    </div>
  );
}
