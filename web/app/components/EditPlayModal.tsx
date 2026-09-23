"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { AttributeDef, PlayAttributeValue } from "@/lib/types";
import { AttributeValueInput } from "./AttributeValueInput";

export function EditPlayModal({
  playId,
  initialAttributes,
  onClose,
  onSaved,
  onDeleted,
}: {
  playId: string;
  initialAttributes: PlayAttributeValue[];
  onClose: () => void;
  onSaved: (attributes: PlayAttributeValue[]) => void;
  /** When given, a delete button is shown; called after the play is deleted. */
  onDeleted?: () => void;
}) {
  const [attributeDefs, setAttributeDefs] = useState<AttributeDef[]>([]);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const attr of initialAttributes) initial[attr.attributeDefId] = attr.value;
    return initial;
  });
  const [status, setStatus] = useState("読み込み中...");

  useEffect(() => {
    apiFetch<{ attributes: AttributeDef[] }>("/api/attributes")
      .then((data) => {
        setAttributeDefs(data.attributes);
        setStatus("");
      })
      .catch((err) => setStatus((err as Error).message));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("保存中...");
    try {
      const data = await apiFetch<{ play: { attributes: PlayAttributeValue[] } }>(
        `/api/plays/${playId}`,
        { method: "PATCH", body: JSON.stringify({ attributes: values }) }
      );
      onSaved(data.play.attributes);
      onClose();
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  async function handleDelete() {
    if (!window.confirm("このプレーの登録を削除しますか？（元のスライドファイルは削除されません）")) {
      return;
    }
    setStatus("削除中...");
    try {
      await apiFetch(`/api/plays/${playId}`, { method: "DELETE" });
      onDeleted?.();
      onClose();
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalBox" onClick={(e) => e.stopPropagation()}>
        <h2>プレーを編集</h2>
        <form className="adminForm" onSubmit={handleSubmit}>
          {attributeDefs.map((attribute) => (
            <div className="adminField" key={attribute.id}>
              {attribute.name}
              <AttributeValueInput
                attribute={attribute}
                value={values[attribute.id] ?? ""}
                onChange={(value) => setValues((v) => ({ ...v, [attribute.id]: value }))}
              />
            </div>
          ))}
          <div className="basketRowActions">
            <button type="submit">保存</button>
            <button type="button" onClick={onClose}>
              キャンセル
            </button>
            {onDeleted && (
              <button type="button" className="dangerBtn" onClick={handleDelete}>
                削除
              </button>
            )}
          </div>
          <div className="status">{status}</div>
        </form>
      </div>
    </div>
  );
}
