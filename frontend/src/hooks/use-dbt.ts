import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiEnvelopeSchema, apiFetch, splitDateTime, toLocalDateTimeValue } from "../lib";
import { dbtFormSchema, dbtListSchema } from "../app/core";
import type { DbtEntry, DbtFormValues } from "../app/core";

const defaultValues: DbtFormValues = {
  dateTime: "",
  emotionName: "",
  allowAffirmation: "",
  watchEmotion: "",
  bodyLocation: "",
  bodyFeeling: "",
  presentMoment: "",
  emotionReturns: "",
};

function freshDefaults(): DbtFormValues {
  return { ...defaultValues, dateTime: toLocalDateTimeValue() };
}

export function useDbt(enabled: boolean) {
  const queryClient = useQueryClient();
  const [editingDbt, setEditingDbt] = useState<DbtEntry | null>(null);
  const [confirmDeleteDbt, setConfirmDeleteDbt] = useState<number | null>(null);

  const dbtQuery = useQuery({
    queryKey: ["dbt"],
    enabled,
    queryFn: async () => apiFetch("/api/v1/dbt", { method: "GET" }, (raw) => dbtListSchema.parse(raw).data),
  });

  const dbtForm = useForm<DbtFormValues>({
    defaultValues: freshDefaults(),
  });

  const dbtMutation = useMutation({
    mutationFn: async (values: DbtFormValues) => {
      const parsed = dbtFormSchema.parse(values);
      const parts = splitDateTime(parsed.dateTime);
      const payload = {
        entryDate: parts.entryDate,
        entryTime: parts.entryTime,
        emotionName: parsed.emotionName,
        allowAffirmation: parsed.allowAffirmation,
        watchEmotion: parsed.watchEmotion,
        bodyLocation: parsed.bodyLocation,
        bodyFeeling: parsed.bodyFeeling,
        presentMoment: parsed.presentMoment,
        emotionReturns: parsed.emotionReturns,
      };
      if (editingDbt) {
        return apiFetch(`/api/v1/dbt/${editingDbt.id}`, { method: "PUT", body: JSON.stringify(payload) }, (raw) =>
          apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
        );
      }
      return apiFetch("/api/v1/dbt", { method: "POST", body: JSON.stringify(payload) }, (raw) =>
        apiEnvelopeSchema(z.object({ id: z.number() })).parse(raw).data,
      );
    },
    onSuccess: async () => {
      setEditingDbt(null);
      dbtForm.reset(freshDefaults());
      await queryClient.invalidateQueries({ queryKey: ["dbt"] });
      setTimeout(() => dbtMutation.reset(), 3000);
    },
  });

  const dbtDeleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch(`/api/v1/dbt/${id}`, { method: "DELETE" }, (raw) =>
        apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dbt"] });
    },
  });

  const resetDbtForm = () => {
    setEditingDbt(null);
    dbtForm.reset(freshDefaults());
  };

  const startDbtEdit = (entry: DbtEntry) => {
    setEditingDbt(entry);
    dbtForm.reset({
      dateTime: toLocalDateTimeValue(entry.entryDate, entry.entryTime),
      emotionName: entry.emotionName,
      allowAffirmation: entry.allowAffirmation,
      watchEmotion: entry.watchEmotion,
      bodyLocation: entry.bodyLocation,
      bodyFeeling: entry.bodyFeeling,
      presentMoment: entry.presentMoment,
      emotionReturns: entry.emotionReturns,
    });
  };

  return {
    dbtEntries: dbtQuery.data ?? [],
    dbtForm,
    dbtMutation,
    editingDbt,
    confirmDeleteDbt,
    resetDbtForm,
    startDbtEdit,
    onDeleteClick: (id: number) => {
      if (confirmDeleteDbt === id) {
        dbtDeleteMutation.mutate(id);
        setConfirmDeleteDbt(null);
      } else {
        setConfirmDeleteDbt(id);
      }
    },
    onDeleteBlur: () => setConfirmDeleteDbt(null),
  };
}
