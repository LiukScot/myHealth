import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
    if (!active) return;
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
  /** When true, the visible heading is omitted (e.g. tabbed layout provides the label). */
  hideLabel?: boolean;
};

export function MultiSelectField({ label, fieldKey, value, options, onChange, domain = "pain", hideLabel = false }: MultiSelectFieldProps) {
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
  const [addingOption, setAddingOption] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  const addSuccessTimerRef = useRef<number | null>(null);
  const addInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (pendingRemovalKey) {
      confirmRemoveRef.current?.focus();
    }
  }, [pendingRemovalKey]);

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

  const commitCustomValue = () => {
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
    addInputRef.current?.focus();
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

  const setEditMode = (next: boolean) => {
    setEditOptionsMode(next);
    if (next) {
      setAddingOption(false);
      return;
    }
    setPendingRemovalKey(null);
    setCustomValue("");
  };

  return (
    <div className={editOptionsMode ? "multi-select-field editing-options" : "multi-select-field"}>
      {hideLabel ? null : <span className="section-heading">{label}</span>}
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
      <div className="multi-option-actions">
        {addingOption ? (
          <div className="multi-option-adder">
            <input
              ref={addInputRef}
              autoFocus
              type="text"
              placeholder={`New ${label.toLowerCase()}`}
              value={customValue}
              onChange={(event) => setCustomValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitCustomValue();
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setAddingOption(false);
                  setCustomValue("");
                }
              }}
            />
            <button
              type="button"
              className={`multi-option-adder-confirm${addSuccess ? " is-success" : ""}`}
              aria-label="Save option"
              onClick={commitCustomValue}
            >
              {addSuccess ? "\u2713" : "Add"}
            </button>
            <button
              type="button"
              className="multi-option-adder-cancel"
              aria-label="Cancel"
              onClick={() => {
                setAddingOption(false);
                setCustomValue("");
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="multi-option-chip multi-option-chip-add"
              onClick={() => setAddingOption(true)}
              disabled={editOptionsMode}
            >
              + add option
            </button>
            <button
              type="button"
              className={`multi-option-edit-link${editOptionsMode ? " active is-editing" : ""}`}
              aria-pressed={editOptionsMode}
              onClick={() => setEditMode(!editOptionsMode)}
            >
              {editOptionsMode ? "done" : "edit"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Small titled divider used to group sub-sections across pages. */
export function SectionHead({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="section-head">
      <span className="section-title">{title}</span>
      {aside != null ? <span className="section-aside">{aside}</span> : null}
    </div>
  );
}

/**
 * Caps the "past entries" column to the height of the form column and
 * reports overflow, driving the "Show more" button used on Diary / Pain.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useDiaryColumnCap<T>(entries: T[], isLoading: boolean) {
  const pastEntriesBodyRef = useRef<HTMLDivElement>(null);
  const pastColRef = useRef<HTMLDivElement>(null);
  const leftColRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  const syncAndMeasure = useCallback(() => {
    const col = pastColRef.current;
    const left = leftColRef.current;
    if (col && left) {
      const h = Math.round(left.getBoundingClientRect().height);
      if (h > 0) {
        col.style.setProperty("--diary-past-col-max-h", `${h}px`);
      }
    }
    const body = pastEntriesBodyRef.current;
    if (!body || entries.length === 0) {
      setOverflow(false);
      return;
    }
    setOverflow(body.scrollHeight > body.clientHeight + 1);
  }, [entries.length]);

  useLayoutEffect(() => {
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        syncAndMeasure();
      });
    };
    schedule();

    const body = pastEntriesBodyRef.current;
    const left = leftColRef.current;
    const hasRO = typeof ResizeObserver !== "undefined";
    const ro = hasRO ? new ResizeObserver(schedule) : null;
    if (ro) {
      if (body) ro.observe(body);
      if (left) ro.observe(left);
    }
    const onToggle = () => schedule();
    body?.addEventListener("toggle", onToggle, true);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      body?.removeEventListener("toggle", onToggle, true);
      window.removeEventListener("resize", schedule);
    };
  }, [syncAndMeasure, entries, isLoading]);

  return { leftColRef, pastColRef, pastEntriesBodyRef, overflow };
}
