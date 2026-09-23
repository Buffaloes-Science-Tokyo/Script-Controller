"use client";

import { useState } from "react";

import type { AttributeDef } from "@/lib/types";

const NEW_VALUE = "__new__";

/**
 * Pick one of the attribute's options, or type a new value. A new value is
 * added to the attribute's options by the server when the play is saved, so
 * it becomes selectable next time.
 */
export function AttributeValueInput({
  attribute,
  value,
  onChange,
}: {
  attribute: AttributeDef;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = attribute.options ?? [];
  // Stays in text mode while typing (even if the text briefly matches an
  // existing option); callers remount this via `key` to reset it.
  const [typing, setTyping] = useState(() => value !== "" && !options.includes(value));

  if (typing) {
    const isNew = value.trim() !== "" && !options.includes(value.trim());
    return (
      <span className="attributeValueInput">
        <span className="attributeValueRow">
          <input
            type="text"
            autoFocus
            value={value}
            placeholder="新しい値を入力"
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              setTyping(false);
              onChange("");
            }}
            aria-label="選択肢から選ぶ"
            title="選択肢から選ぶ"
          >
            ×
          </button>
        </span>
        {isNew && <span className="hint">保存すると新しい選択肢として追加されます</span>}
      </span>
    );
  }

  return (
    <select
      value={options.includes(value) ? value : ""}
      onChange={(e) => {
        if (e.target.value === NEW_VALUE) {
          setTyping(true);
          onChange("");
        } else {
          onChange(e.target.value);
        }
      }}
    >
      <option value="">（未選択）</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
      <option value={NEW_VALUE}>＋ 新しい値を入力…</option>
    </select>
  );
}
