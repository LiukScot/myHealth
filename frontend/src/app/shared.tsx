import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch } from "../lib";
import type { InlineMessage, MoodFieldKey, PainFieldKey } from "./core";
import { csvToList, listToCsv, mergeOptions } from "./core";

export function InlineFeedback({ message, className }: { message: InlineMessage | null; className?: string }) {
  if (!message) {
    return null;
  }

  const toneClass = `is-${message.tone}`;
  const classes = ["feedback-message", toneClass, className].filter(Boolean).join(" ");
  const ariaLive = message.tone === "error" ? "assertive" : "polite";

  return (
    <p className={classes} role={message.tone === "error" ? "alert" : "status"} aria-live={ariaLive}>
      {message.text}
    </p>
  );
}

type MultiSelectDomain = "pain" | "mood";

const domainConfig: Record<MultiSelectDomain, { apiBase: string; queryKey: string }> = {
  pain: { apiBase: "/api/v1/pain/options", queryKey: "pain-options" },
  mood: { apiBase: "/api/v1/mood/options", queryKey: "mood-options" },
};

type MultiSelectFieldProps = {
  label: string;
  fieldKey: PainFieldKey | MoodFieldKey;
  value: string;
  options: string[];
  onChange: (next: string) => void;
  domain?: MultiSelectDomain;
};

export function MultiSelectField({ label, fieldKey, value, options, onChange, domain = "pain" }: MultiSelectFieldProps) {
  const { apiBase, queryKey: queryKeyName } = domainConfig[domain];
  const queryClient = useQueryClient();
  const selectedValues = useMemo(() => csvToList(value), [value]);
  const [hiddenSet, setHiddenSet] = useState<Set<string>>(() => new Set());
  const [pendingRemovalKey, setPendingRemovalKey] = useState<string | null>(null);
  const confirmRemoveRef = useRef<HTMLButtonElement | null>(null);
  const selectedSet = useMemo(() => new Set(selectedValues.map((entry) => entry.toLowerCase())), [selectedValues]);
  const allOptions = useMemo(() => {
    const merged = mergeOptions(options, selectedValues);
    if (!hiddenSet.size) return merged;
    return merged.filter((option) => {
      const key = option.toLowerCase();
      if (selectedSet.has(key)) return true;
      return !hiddenSet.has(key);
    });
  }, [options, selectedValues, hiddenSet, selectedSet]);
  const [customValue, setCustomValue] = useState("");

  useEffect(() => {
    if (pendingRemovalKey) {
      confirmRemoveRef.current?.focus();
    }
  }, [pendingRemovalKey]);

  const toggleOption = (option: string) => {
    const key = option.trim().toLowerCase();
    if (!key) return;

    const isSelected = selectedValues.some((entry) => entry.trim().toLowerCase() === key);
    const nextValues = isSelected
      ? selectedValues.filter((entry) => entry.trim().toLowerCase() !== key)
      : [...selectedValues, option];

    onChange(listToCsv(nextValues));
  };

  const permanentlyRemoveOption = async (option: string) => {
    const key = option.trim().toLowerCase();
    if (!key) return;

    setPendingRemovalKey(null);
    setHiddenSet((current) => {
      const next = new Set(current);
      next.add(key);
      return next;
    });

    const nextValues = selectedValues.filter((entry) => entry.trim().toLowerCase() !== key);
    onChange(listToCsv(nextValues));

    try {
      await apiFetch(
        `${apiBase}/remove`,
        {
          method: "POST",
          body: JSON.stringify({ field: fieldKey, value: option }),
        },
        (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
      );
      await queryClient.invalidateQueries({ queryKey: [queryKeyName] });
    } catch {
      // ignore failure: option stays hidden locally for this session
    }
  };

  const clearSelections = () => {
    setPendingRemovalKey(null);
    setCustomValue("");
    onChange("");
  };

  return (
    <div className="multi-select-field">
      <span>{label}</span>
      <div className="multi-option-list" role="group" aria-label={label}>
        {allOptions.map((option) => {
          const optionKey = option.toLowerCase();
          const isSelected = selectedSet.has(optionKey);
          const isConfirmingRemoval = pendingRemovalKey === optionKey;

          if (isConfirmingRemoval) {
            return (
              <div key={option} className="multi-option-confirmation" role="group" aria-label={`Confirm removal of ${option}`}>
                <span className="multi-option-confirm-label">Remove {option}?</span>
                <div className="multi-option-confirm-actions">
                  <button
                    type="button"
                    ref={confirmRemoveRef}
                    className="danger multi-option-confirm-button"
                    onClick={() => {
                      void permanentlyRemoveOption(option);
                    }}
                  >
                    Remove
                  </button>
                  <button type="button" className="multi-option-cancel" onClick={() => setPendingRemovalKey(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div key={option} className="multi-option-item">
              <button
                type="button"
                className={isSelected ? "multi-option-chip active" : "multi-option-chip"}
                onClick={() => toggleOption(option)}
                aria-pressed={isSelected}
              >
                <span className="multi-option-label">{option}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="multi-option-remove"
                  aria-label={`Remove ${option} from suggestions`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingRemovalKey(optionKey);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      setPendingRemovalKey(optionKey);
                    }
                  }}
                >
                  ×
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="row-actions multi-option-actions">
        <input
          type="text"
          placeholder={`Add ${label.toLowerCase()} option`}
          value={customValue}
          onChange={(event) => setCustomValue(event.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            const clean = customValue.trim();
            if (!clean) return;
            const nextValues = mergeOptions(selectedValues, [clean]);
            onChange(listToCsv(nextValues));
            setCustomValue("");
            setHiddenSet((current) => {
              const key = clean.toLowerCase();
              if (!current.has(key)) return current;
              const next = new Set(current);
              next.delete(key);
              return next;
            });
            setPendingRemovalKey((current) => (current === clean.toLowerCase() ? null : current));
            void (async () => {
              try {
                await apiFetch(
                  `${apiBase}/restore`,
                  {
                    method: "POST",
                    body: JSON.stringify({ field: fieldKey, value: clean }),
                  },
                  (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
                );
                await queryClient.invalidateQueries({ queryKey: [queryKeyName] });
              } catch {
                // ignore failure: option already restored locally
              }
            })();
          }}
        >
          Add
        </button>
        <button type="button" onClick={clearSelections} disabled={!selectedValues.length}>
          Clear
        </button>
      </div>
    </div>
  );
}

type AiKeyEditorProps = {
  hasKey: boolean;
  feedback: InlineMessage | null;
  isSaving: boolean;
  isClearing: boolean;
  onFeedbackClear: () => void;
  onSave: (key: string) => boolean;
  onClear: () => void;
};

export function AiKeyEditor({ hasKey, feedback, isSaving, isClearing, onFeedbackClear, onSave, onClear }: AiKeyEditorProps) {
  const [value, setValue] = useState("");
  return (
    <div className="stack">
      <input
        type="password"
        autoComplete="off"
        placeholder={hasKey ? "Stored key exists" : "Paste key"}
        value={value}
        onChange={(e) => {
          if (feedback) {
            onFeedbackClear();
          }
          setValue(e.target.value);
        }}
      />
      <div className="row-actions">
        <button
          type="button"
          disabled={isSaving || isClearing}
          onClick={() => {
            const submitted = onSave(value);
            if (submitted) {
              setValue("");
            }
          }}
        >
          {isSaving ? "Saving..." : "Save key"}
        </button>
        <button type="button" onClick={onClear} disabled={isSaving || isClearing || !hasKey}>
          {isClearing ? "Clearing..." : "Clear key"}
        </button>
      </div>
      <InlineFeedback message={feedback} />
    </div>
  );
}

type PreferencesValue = {
  model: string;
  chatRange: string;
  lastRange: string;
  graphSelection: Record<string, unknown>;
};

type PreferencesEditorProps = {
  value: PreferencesValue;
  onSave: (value: PreferencesValue) => void;
};

export function PreferencesEditor({ value, onSave }: PreferencesEditorProps) {
  const [model, setModel] = useState(value.model);
  const [chatRange, setChatRange] = useState(value.chatRange);
  const [lastRange, setLastRange] = useState(value.lastRange);

  return (
    <div className="stack">
      <label>
        Model
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="mistral-small-latest">mistral-small-latest</option>
          <option value="mistral-medium-latest">mistral-medium-latest</option>
          <option value="mistral-large-latest">mistral-large-latest</option>
        </select>
      </label>
      <label>
        Chat range
        <select value={chatRange} onChange={(e) => setChatRange(e.target.value)}>
          <option value="all">all</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="365">365 days</option>
        </select>
      </label>
      <label>
        Last dashboard range
        <select value={lastRange} onChange={(e) => setLastRange(e.target.value)}>
          <option value="all">all</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="180">180 days</option>
          <option value="365">365 days</option>
          <option value="1095">1095 days</option>
        </select>
      </label>
      <button onClick={() => onSave({ model, chatRange, lastRange, graphSelection: value.graphSelection ?? {} })}>Save prefs</button>
    </div>
  );
}

type ChatComposerProps = {
  defaultModel: string;
  defaultRange: string;
  onSend: (message: string, model: string, range: string) => Promise<void>;
};

export function ChatComposer({ defaultModel, defaultRange, onSend }: ChatComposerProps) {
  const [message, setMessage] = useState("");
  const [model, setModel] = useState(defaultModel);
  const [range, setRange] = useState(defaultRange);
  const [loading, setLoading] = useState(false);

  return (
    <div className="stack stack-compact">
      <label>
        Model
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="mistral-small-latest">mistral-small-latest</option>
          <option value="mistral-medium-latest">mistral-medium-latest</option>
          <option value="mistral-large-latest">mistral-large-latest</option>
        </select>
      </label>
      <label>
        Range
        <select value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="all">all</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="365">365 days</option>
        </select>
      </label>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Ask about your trends..." />
      <button
        disabled={loading || !message.trim()}
        onClick={async () => {
          setLoading(true);
          try {
            await onSend(message.trim(), model, range);
            setMessage("");
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? "Sending..." : "Send"}
      </button>
    </div>
  );
}
