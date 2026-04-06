import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiEnvelopeSchema, apiFetch, splitDateTime, toLocalDateTimeValue } from "../lib";
import {
  listToCsv,
  painFormSchema,
  painListSchema,
  painOptionsSchema,
} from "../app/core";
import type { PainEntry, PainFormValues } from "../app/core";

const EMPTY_PAIN_OPTIONS = {
  area: [] as string[],
  symptoms: [] as string[],
  activities: [] as string[],
  medicines: [] as string[],
  habits: [] as string[],
  other: [] as string[],
};

export function usePain(enabled: boolean) {
  const queryClient = useQueryClient();
  const [editingPain, setEditingPain] = useState<PainEntry | null>(null);
  const [confirmDeletePain, setConfirmDeletePain] = useState<number | null>(null);

  const painQuery = useQuery({
    queryKey: ["pain"],
    enabled,
    queryFn: async () => apiFetch("/api/v1/pain", { method: "GET" }, (raw) => painListSchema.parse(raw).data),
  });

  const painOptionsQuery = useQuery({
    queryKey: ["pain-options"],
    enabled,
    queryFn: async () => apiFetch("/api/v1/pain/options", { method: "GET" }, (raw) => painOptionsSchema.parse(raw).data),
  });

  const painFieldOptions = painOptionsQuery.data ?? EMPTY_PAIN_OPTIONS;

  const createDefaultPainFormValues = useCallback(
    () => ({
      dateTime: toLocalDateTimeValue(),
      painLevel: null,
      fatigueLevel: null,
      coffeeCount: null,
      area: "",
      symptoms: "",
      activities: "",
      medicines: listToCsv(painFieldOptions.medicines),
      habits: "",
      other: "",
      note: "",
    }),
    [painFieldOptions.medicines],
  );

  const painForm = useForm<PainFormValues>({
    defaultValues: createDefaultPainFormValues(),
  });

  const [watchedArea, watchedSymptoms, watchedActivities, watchedMedicines, watchedHabits, watchedOther] =
    painForm.watch(["area", "symptoms", "activities", "medicines", "habits", "other"]);

  useEffect(() => {
    if (editingPain || painForm.formState.isDirty) return;
    painForm.reset(createDefaultPainFormValues());
  }, [createDefaultPainFormValues, editingPain, painForm, painForm.formState.isDirty]);

  const painMutation = useMutation({
    mutationFn: async (values: z.infer<typeof painFormSchema>) => {
      const parsedValues = painFormSchema.parse(values);
      const parts = splitDateTime(parsedValues.dateTime);
      const payload = {
        entryDate: parts.entryDate,
        entryTime: parts.entryTime,
        painLevel: parsedValues.painLevel ?? null,
        fatigueLevel: parsedValues.fatigueLevel ?? null,
        coffeeCount: parsedValues.coffeeCount ?? null,
        area: parsedValues.area,
        symptoms: parsedValues.symptoms,
        activities: parsedValues.activities,
        medicines: parsedValues.medicines,
        habits: parsedValues.habits,
        other: parsedValues.other,
        note: parsedValues.note,
      };
      if (editingPain) {
        return apiFetch(`/api/v1/pain/${editingPain.id}`, { method: "PUT", body: JSON.stringify(payload) }, (raw) =>
          apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
        );
      }
      return apiFetch("/api/v1/pain", { method: "POST", body: JSON.stringify(payload) }, (raw) =>
        apiEnvelopeSchema(z.object({ id: z.number() })).parse(raw).data,
      );
    },
    onSuccess: async () => {
      setEditingPain(null);
      painForm.reset(createDefaultPainFormValues());
      await queryClient.invalidateQueries({ queryKey: ["pain"] });
      setTimeout(() => painMutation.reset(), 3000);
    },
  });

  const painDeleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch(`/api/v1/pain/${id}`, { method: "DELETE" }, (raw) =>
        apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pain"] });
    },
  });

  const resetPainForm = () => {
    setEditingPain(null);
    painForm.reset(createDefaultPainFormValues());
  };

  const startPainEdit = (entry: PainEntry) => {
    setEditingPain(entry);
    painForm.reset({
      dateTime: toLocalDateTimeValue(entry.entryDate, entry.entryTime),
      painLevel: entry.painLevel,
      fatigueLevel: entry.fatigueLevel,
      coffeeCount: entry.coffeeCount,
      area: entry.area,
      symptoms: entry.symptoms,
      activities: entry.activities,
      medicines: entry.medicines,
      habits: entry.habits,
      other: entry.other,
      note: entry.note,
    });
  };

  return {
    painEntries: painQuery.data ?? [],
    painFieldOptions,
    painForm,
    painMutation,
    editingPain,
    confirmDeletePain,
    watchedValues: {
      area: watchedArea,
      symptoms: watchedSymptoms,
      activities: watchedActivities,
      medicines: watchedMedicines,
      habits: watchedHabits,
      other: watchedOther,
    },
    resetPainForm,
    startPainEdit,
    onDeleteClick: (id: number) => {
      if (confirmDeletePain === id) {
        painDeleteMutation.mutate(id);
        setConfirmDeletePain(null);
      } else {
        setConfirmDeletePain(id);
      }
    },
    onDeleteBlur: () => setConfirmDeletePain(null),
  };
}
