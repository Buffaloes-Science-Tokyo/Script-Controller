"use client";

import { useId, useState } from "react";

/**
 * Text input with a suggestion list: focusing shows every option, typing
 * narrows it to options containing the text. Free text is allowed too.
 */
export function ComboBox({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const query = value.trim().toLowerCase();
  const matches = query ? options.filter((o) => o.toLowerCase().includes(query)) : options;
  const showList = open && matches.length > 0;

  function choose(option: string) {
    onChange(option);
    setOpen(false);
    setHighlight(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && showList && highlight >= 0) {
      // Pick the highlighted option instead of submitting the form.
      e.preventDefault();
      choose(matches[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <span className="comboBox">
      <input
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && highlight >= 0 ? `${listId}-${highlight}` : undefined}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
      />
      {value && (
        <button
          type="button"
          className="comboClear"
          aria-label="クリア"
          title="クリア"
          // mousedown, so the input doesn't lose focus (and close the list) first
          onMouseDown={(e) => {
            e.preventDefault();
            onChange("");
          }}
        >
          ×
        </button>
      )}
      {showList && (
        <ul className="comboList" id={listId} role="listbox">
          {matches.map((option, index) => (
            <li
              key={option}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === highlight}
              className={index === highlight ? "highlighted" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(option);
              }}
              onMouseEnter={() => setHighlight(index)}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
