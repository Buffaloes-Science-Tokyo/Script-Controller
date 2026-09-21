"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { AttributeDef, AttributeType } from "@/lib/types";

type FormState = {
  name: string;
  type: AttributeType;
  options: string[];
};

const EMPTY_FORM: FormState = { name: "", type: "text", options: [] };

function AttributeForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FormState;
  submitLabel: string;
  onSubmit: (form: FormState) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [status, setStatus] = useState("");

  function updateOption(index: number, value: string) {
    setForm((f) => ({ ...f, options: f.options.map((o, i) => (i === index ? value : o)) }));
  }
  function addOption() {
    setForm((f) => ({ ...f, options: [...f.options, ""] }));
  }
  function removeOption(index: number) {
    setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("保存中...");
    try {
      await onSubmit(form);
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  return (
    <form className="adminForm schemaEditRow" onSubmit={handleSubmit}>
      <label>
        属性名
        <input
          type="text"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </label>
      <label>
        入力タイプ
        <select
          value={form.type}
          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AttributeType }))}
        >
          <option value="text">自由入力</option>
          <option value="select">プルダウン</option>
        </select>
      </label>
      {form.type === "select" && (
        <div>
          <p className="hint">選択肢</p>
          {form.options.map((option, index) => (
            <div className="fileRow" key={index}>
              <input
                type="text"
                value={option}
                placeholder={`選択肢 ${index + 1}`}
                onChange={(e) => updateOption(index, e.target.value)}
              />
              <button type="button" onClick={() => removeOption(index)}>
                削除
              </button>
            </div>
          ))}
          <button type="button" onClick={addOption}>
            選択肢を追加
          </button>
        </div>
      )}
      <div className="basketRowActions">
        <button type="submit">{submitLabel}</button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            キャンセル
          </button>
        )}
      </div>
      <div className="status">{status}</div>
    </form>
  );
}

export function SchemaTab() {
  const [attributes, setAttributes] = useState<AttributeDef[]>([]);
  const [status, setStatus] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function loadAttributes() {
    setStatus("読み込み中...");
    try {
      const data = await apiFetch<{ attributes: AttributeDef[] }>("/api/attributes");
      setAttributes(data.attributes);
      setStatus("");
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  // Not loadAttributes() directly: that sets loading state synchronously as
  // its first statement, which React's exhaustive-deps lint flags when
  // called straight from an effect body. Inlining the initial fetch keeps
  // the (reused-elsewhere) loadAttributes() function itself simple.
  useEffect(() => {
    apiFetch<{ attributes: AttributeDef[] }>("/api/attributes")
      .then((data) => setAttributes(data.attributes))
      .catch((err) => setStatus((err as Error).message));
  }, []);

  async function handleCreate(form: FormState) {
    await apiFetch("/api/attributes", {
      method: "POST",
      body: JSON.stringify({
        name: form.name,
        type: form.type,
        options: form.type === "select" ? form.options.filter((o) => o.trim()) : undefined,
      }),
    });
    setAdding(false);
    await loadAttributes();
  }

  async function handleUpdate(id: string, form: FormState) {
    await apiFetch(`/api/attributes/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: form.name,
        type: form.type,
        options: form.type === "select" ? form.options.filter((o) => o.trim()) : undefined,
      }),
    });
    setEditingId(null);
    await loadAttributes();
  }

  async function handleDelete(attribute: AttributeDef) {
    const confirmed = window.confirm(
      `「${attribute.name}」を削除しますか？この属性が設定されている全てのプレーから値も削除されます。`
    );
    if (!confirmed) return;
    await apiFetch(`/api/attributes/${attribute.id}`, { method: "DELETE" });
    await loadAttributes();
  }

  return (
    <section>
      <h2>属性一覧</h2>
      <div className="status">{status}</div>
      <div className="basketList">
        {attributes.map((attribute) =>
          editingId === attribute.id ? (
            <AttributeForm
              key={attribute.id}
              initial={{ name: attribute.name, type: attribute.type, options: attribute.options ?? [] }}
              submitLabel="更新"
              onSubmit={(form) => handleUpdate(attribute.id, form)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div className="basketRow" key={attribute.id}>
              <div className="basketRowBody">
                <strong>{attribute.name}</strong>
                <span>
                  {attribute.type === "select"
                    ? `プルダウン: ${(attribute.options ?? []).join(", ")}`
                    : "自由入力"}
                </span>
              </div>
              <div className="basketRowActions">
                <button type="button" onClick={() => setEditingId(attribute.id)}>
                  編集
                </button>
                <button type="button" onClick={() => handleDelete(attribute)}>
                  削除
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {adding ? (
        <AttributeForm initial={EMPTY_FORM} submitLabel="追加" onSubmit={handleCreate} onCancel={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)}>
          属性を追加
        </button>
      )}
    </section>
  );
}
