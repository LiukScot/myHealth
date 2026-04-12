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

export function AnimatedEditingLabel({
  active,
  idleLabel = "Edit",
  editingLabel = "Editing",
}: {
  active: boolean;
  idleLabel?: string;
  editingLabel?: string;
}) {
  const [dotsCount, setDotsCount] = useState(1);

  useEffect(() => {
    if (!active) {
      setDotsCount(1);
      return;
    }

    setDotsCount(1);
    const timer = window.setInterval(() => {
      setDotsCount((count) => (count % 3) + 1);
    }, 500);

    return () => window.clearInterval(timer);
  }, [active]);

  if (!active) {
    return idleLabel;
  }

  return (
    <span className="animated-editing-stack">
      <span className="animated-editing-label">{editingLabel + ".".repeat(dotsCount)}</span>
      <span className="animated-editing-sizer" aria-hidden="true">{editingLabel}...</span>
    </span>
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
  const [editOptionsMode, setEditOptionsMode] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  const addSuccessTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (pendingRemovalKey) {
      confirmRemoveRef.current?.focus();
    }
  }, [pendingRemovalKey]);

  useEffect(() => {
    if (!editOptionsMode) {
      setPendingRemovalKey(null);
      setCustomValue("");
    }
  }, [editOptionsMode]);

  useEffect(() => () => {
    if (addSuccessTimerRef.current !== null) {
      window.clearTimeout(addSuccessTimerRef.current);
    }
  }, []);

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

  return (
    <div className={editOptionsMode ? "multi-select-field editing-options" : "multi-select-field"}>
      <span className="section-heading">{label}</span>
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
                tabIndex={editOptionsMode ? -1 : undefined}
                onClick={() => {
                  if (editOptionsMode) return;
                  toggleOption(option);
                }}
                onKeyDown={(e) => {
                  if (!editOptionsMode) return;
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                  }
                }}
                aria-pressed={isSelected}
              >
                <span className="multi-option-label">{option}</span>
                {editOptionsMode ? (
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
                ) : null}
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
          className={addSuccess ? "btn-check" : ""}
          onClick={() => {
            const clean = customValue.trim();
            if (!clean) return;
            const nextValues = mergeOptions(selectedValues, [clean]);
            onChange(listToCsv(nextValues));
            setAddSuccess(true);
            if (addSuccessTimerRef.current !== null) {
              window.clearTimeout(addSuccessTimerRef.current);
            }
            addSuccessTimerRef.current = window.setTimeout(() => {
              setAddSuccess(false);
              addSuccessTimerRef.current = null;
            }, 900);
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
          {addSuccess ? "\u2713" : "Add"}
        </button>
        <button
          type="button"
          className={editOptionsMode ? "multi-option-edit active is-editing" : "multi-option-edit"}
          aria-pressed={editOptionsMode}
          onClick={() => setEditOptionsMode((v) => !v)}
        >
          <AnimatedEditingLabel active={editOptionsMode} />
        </button>
      </div>
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
  const [lastRange, setLastRange] = useState(value.lastRange);

  return (
    <div className="stack">
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
      <button
        onClick={() =>
          onSave({
            model: value.model,
            chatRange: value.chatRange,
            lastRange,
            graphSelection: value.graphSelection ?? {},
          })
        }
      >
        Save prefs
      </button>
    </div>
  );
}
