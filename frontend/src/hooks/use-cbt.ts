import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiEnvelopeSchema, apiFetch, splitDateTime, toLocalDateTimeValue } from "../lib";
import { cbtFormSchema, cbtListSchema } from "../app/core";
import type { CbtEntry, CbtFormValues } from "../app/core";

const defaultValues: CbtFormValues = {
  dateTime: "",
  situation: "",
  thoughts: "",
  helpfulReasoning: "",
  mainUnhelpfulThought: "",
  effectOfBelieving: "",
  evidenceForAgainst: "",
  alternativeExplanation: "",
  worstBestScenario: "",
  friendAdvice: "",
  productiveResponse: "",
};

function freshDefaults(): CbtFormValues {
  return { ...defaultValues, dateTime: toLocalDateTimeValue() };
}

export function useCbt(enabled: boolean) {
  const queryClient = useQueryClient();
  const [editingCbt, setEditingCbt] = useState<CbtEntry | null>(null);
  const [confirmDeleteCbt, setConfirmDeleteCbt] = useState<number | null>(null);

  const cbtQuery = useQuery({
    queryKey: ["cbt"],
    enabled,
    queryFn: async () => apiFetch("/api/v1/cbt", { method: "GET" }, (raw) => cbtListSchema.parse(raw).data),
  });

  const cbtForm = useForm<CbtFormValues>({
    defaultValues: freshDefaults(),
  });

  const cbtMutation = useMutation({
    mutationFn: async (values: CbtFormValues) => {
      const parsed = cbtFormSchema.parse(values);
      const parts = splitDateTime(parsed.dateTime);
      const payload = {
        entryDate: parts.entryDate,
        entryTime: parts.entryTime,
        situation: parsed.situation,
        thoughts: parsed.thoughts,
        helpfulReasoning: parsed.helpfulReasoning,
        mainUnhelpfulThought: parsed.mainUnhelpfulThought,
        effectOfBelieving: parsed.effectOfBelieving,
        evidenceForAgainst: parsed.evidenceForAgainst,
        alternativeExplanation: parsed.alternativeExplanation,
        worstBestScenario: parsed.worstBestScenario,
        friendAdvice: parsed.friendAdvice,
        productiveResponse: parsed.productiveResponse,
      };
      if (editingCbt) {
        return apiFetch(`/api/v1/cbt/${editingCbt.id}`, { method: "PUT", body: JSON.stringify(payload) }, (raw) =>
          apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
        );
      }
      return apiFetch("/api/v1/cbt", { method: "POST", body: JSON.stringify(payload) }, (raw) =>
        apiEnvelopeSchema(z.object({ id: z.number() })).parse(raw).data,
      );
    },
    onSuccess: async () => {
      setEditingCbt(null);
      cbtForm.reset(freshDefaults());
      await queryClient.invalidateQueries({ queryKey: ["cbt"] });
      setTimeout(() => cbtMutation.reset(), 3000);
    },
  });

  const cbtDeleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch(`/api/v1/cbt/${id}`, { method: "DELETE" }, (raw) =>
        apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cbt"] });
    },
  });

  const resetCbtForm = () => {
    setEditingCbt(null);
    cbtForm.reset(freshDefaults());
  };

  const startCbtEdit = (entry: CbtEntry) => {
    setEditingCbt(entry);
    cbtForm.reset({
      dateTime: toLocalDateTimeValue(entry.entryDate, entry.entryTime),
      situation: entry.situation,
      thoughts: entry.thoughts,
      helpfulReasoning: entry.helpfulReasoning,
      mainUnhelpfulThought: entry.mainUnhelpfulThought,
      effectOfBelieving: entry.effectOfBelieving,
      evidenceForAgainst: entry.evidenceForAgainst,
      alternativeExplanation: entry.alternativeExplanation,
      worstBestScenario: entry.worstBestScenario,
      friendAdvice: entry.friendAdvice,
      productiveResponse: entry.productiveResponse,
    });
  };

  return {
    cbtEntries: cbtQuery.data ?? [],
    cbtForm,
    cbtMutation,
    editingCbt,
    confirmDeleteCbt,
    resetCbtForm,
    startCbtEdit,
    onDeleteClick: (id: number) => {
      if (confirmDeleteCbt === id) {
        cbtDeleteMutation.mutate(id);
        setConfirmDeleteCbt(null);
      } else {
        setConfirmDeleteCbt(id);
      }
    },
    onDeleteBlur: () => setConfirmDeleteCbt(null),
  };
}
