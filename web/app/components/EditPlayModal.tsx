"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { AttributeDef, PlayAttributeValue } from "@/lib/types";

export function EditPlayModal({
  playId,
  initialAttributes,
  onClose,
  onSaved,
}: {
  playId: string;
  initialAttributes: PlayAttributeValue[];
  onClose: () => void;
  onSaved: (attributes: PlayAttributeValue[]) => void;
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

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalBox" onClick={(e) => e.stopPropagation()}>
        <h2>プレーを編集</h2>
        <form className="adminForm" onSubmit={handleSubmit}>
          {attributeDefs.map((attribute) => (
            <label key={attribute.id}>
              {attribute.name}
              {attribute.type === "select" ? (
                <select
                  value={values[attribute.id] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [attribute.id]: e.target.value }))}
                >
                  <option value="">（未選択）</option>
                  {(attribute.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={values[attribute.id] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [attribute.id]: e.target.value }))}
                />
              )}
            </label>
          ))}
          <div className="basketRowActions">
            <button type="submit">保存</button>
            <button type="button" onClick={onClose}>
              キャンセル
            </button>
          </div>
          <div className="status">{status}</div>
        </form>
      </div>
    </div>
  );
}
