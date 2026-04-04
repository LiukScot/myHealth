import { useCallback, useState } from "react";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiEnvelopeSchema, apiFetch, getErrorMessage } from "../lib";
import {
  aiKeyStatusSchema,
  BACKUP_JSON_EXPORT_OK,
  BACKUP_JSON_IMPORT_OK,
  BACKUP_XLSX_EXPORT_OK,
  BACKUP_XLSX_IMPORT_OK,
  defaultPrefsValue,
  prefsSchema,
} from "../app/core";
import type { InlineMessage } from "../app/core";

export function usePrefs(enabled: boolean) {
  const queryClient = useQueryClient();

  const prefsQuery = useQuery({
    queryKey: ["prefs"],
    enabled,
    queryFn: async () => apiFetch("/api/v1/preferences", { method: "GET" }, (raw) => prefsSchema.parse(raw).data),
  });

  const prefsMutation = useMutation({
    mutationFn: async (values: { model: string; chatRange: string; lastRange: string; graphSelection: Record<string, unknown> }) =>
      apiFetch("/api/v1/preferences", { method: "PUT", body: JSON.stringify(values) }, (raw) =>
        apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["prefs"] });
    },
  });

  const savePrefsPatch = (
    patch: Partial<{ model: string; chatRange: string; lastRange: string; graphSelection: Record<string, unknown> }>,
  ) => {
    const base = prefsQuery.data ?? defaultPrefsValue;
    prefsMutation.mutate({
      model: patch.model ?? base.model,
      chatRange: patch.chatRange ?? base.chatRange,
      lastRange: patch.lastRange ?? base.lastRange,
      graphSelection: patch.graphSelection ?? base.graphSelection,
    });
  };

  return { prefsQuery, prefsMutation, savePrefsPatch };
}

export function useSettings(enabled: boolean) {
  const queryClient = useQueryClient();
  const { prefsQuery, prefsMutation } = usePrefs(enabled);
  const [aiKeyFeedback, setAiKeyFeedback] = useState<InlineMessage | null>(null);
  const [backupFeedback, setBackupFeedback] = useState<InlineMessage | null>(null);
  const [purgeConfirmArmed, setPurgeConfirmArmed] = useState(false);

  const aiKeyQuery = useQuery({
    queryKey: ["ai-key"],
    enabled,
    queryFn: async () => apiFetch("/api/v1/ai/key", { method: "GET" }, (raw) => aiKeyStatusSchema.parse(raw).data),
  });

  const aiKeyMutation = useMutation({
    mutationFn: async (key: string) =>
      apiFetch("/api/v1/ai/key", { method: "PUT", body: JSON.stringify({ key }) }, (raw) =>
        apiEnvelopeSchema(z.object({ hasKey: z.boolean() })).parse(raw).data,
      ),
    onMutate: () => setAiKeyFeedback(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-key"] });
      setAiKeyFeedback({ tone: "success", text: "AI key saved." });
    },
    onError: (error) => setAiKeyFeedback({ tone: "error", text: getErrorMessage(error) }),
  });

  const clearAiKeyMutation = useMutation({
    mutationFn: async () =>
      apiFetch("/api/v1/ai/key", { method: "DELETE" }, (raw) =>
        apiEnvelopeSchema(z.object({ hasKey: z.boolean() })).parse(raw).data,
      ),
    onMutate: () => setAiKeyFeedback(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-key"] });
      setAiKeyFeedback({ tone: "info", text: "Stored AI key cleared." });
    },
    onError: (error) => setAiKeyFeedback({ tone: "error", text: getErrorMessage(error) }),
  });

  const clearAiKeyStatus = useCallback(() => {
    if (aiKeyFeedback) setAiKeyFeedback(null);
  }, [aiKeyFeedback]);

  const purgeMutation = useMutation({
    mutationFn: async () =>
      apiFetch("/api/v1/data/purge", { method: "POST" }, (raw) =>
        apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["diary"] }),
        queryClient.invalidateQueries({ queryKey: ["pain"] }),
        queryClient.invalidateQueries({ queryKey: ["prefs"] }),
      ]);
      setPurgeConfirmArmed(false);
    },
  });

  const runBackupAction = async (action: () => Promise<void>, successMessage: InlineMessage) => {
    setBackupFeedback(null);
    try {
      await action();
      setBackupFeedback(successMessage);
    } catch (error) {
      setBackupFeedback({ tone: "error", text: getErrorMessage(error) });
    }
  };

  const doExportJson = async () => {
    const payload = await apiFetch("/api/v1/backup/json", { method: "GET" }, (raw) => apiEnvelopeSchema(z.any()).parse(raw).data);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `health-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  const doImportJson = async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text);
    await apiFetch("/api/v1/backup/json/import", { method: "POST", body: JSON.stringify(parsed) }, (raw) =>
      apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
    );
    await queryClient.invalidateQueries();
  };

  const doExportXlsx = async () => {
    const response = await fetch("/api/v1/backup/xlsx", { credentials: "include" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Spreadsheet export failed");
    }
    const blob = await response.blob();
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `health-backup-${new Date().toISOString().slice(0, 10)}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  const doImportXlsx = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/v1/backup/xlsx/import", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Spreadsheet import failed");
    }
    await queryClient.invalidateQueries();
  };

  return {
    prefsValue: prefsQuery.data ?? defaultPrefsValue,
    onSavePrefs: (value: { model: string; chatRange: string; lastRange: string; graphSelection: Record<string, unknown> }) =>
      prefsMutation.mutate(value),
    aiKeyHasKey: Boolean(aiKeyQuery.data?.hasKey),
    aiKeyFeedback,
    aiKeySaving: aiKeyMutation.isPending,
    aiKeyClearing: clearAiKeyMutation.isPending,
    clearAiKeyStatus,
    onAiKeySave: (key: string) => {
      const clean = key.trim();
      if (!clean) {
        setAiKeyFeedback({ tone: "error", text: "Enter a key before saving." });
        return false;
      }
      aiKeyMutation.mutate(clean);
      return true;
    },
    onAiKeyClear: () => {
      clearAiKeyStatus();
      clearAiKeyMutation.mutate();
    },
    purgeConfirmArmed,
    purgePending: purgeMutation.isPending,
    purgeError: purgeMutation.error ? { tone: "error" as const, text: getErrorMessage(purgeMutation.error) } : null,
    onPurgeArm: () => {
      purgeMutation.reset();
      setPurgeConfirmArmed(true);
    },
    onPurgeConfirm: () => purgeMutation.mutate(),
    onPurgeCancel: () => {
      purgeMutation.reset();
      setPurgeConfirmArmed(false);
    },
    backupFeedback,
    onExportJson: () => void runBackupAction(doExportJson, BACKUP_JSON_EXPORT_OK),
    onImportJson: (file: File) => void runBackupAction(() => doImportJson(file), BACKUP_JSON_IMPORT_OK),
    onExportXlsx: () => void runBackupAction(doExportXlsx, BACKUP_XLSX_EXPORT_OK),
    onImportXlsx: (file: File) => void runBackupAction(() => doImportXlsx(file), BACKUP_XLSX_IMPORT_OK),
  };
}
