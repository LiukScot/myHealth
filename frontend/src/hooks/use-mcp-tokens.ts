import { useState } from "react";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiEnvelopeSchema, apiFetch, getErrorMessage } from "../lib";
import type { InlineMessage } from "../app/core";

const tokenSummarySchema = z.object({
  id: z.number(),
  label: z.string(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
});

const tokenListSchema = apiEnvelopeSchema(z.object({ tokens: z.array(tokenSummarySchema) }));

const createdTokenSchema = apiEnvelopeSchema(
  z.object({
    id: z.number(),
    label: z.string(),
    createdAt: z.string(),
    expiresAt: z.string().nullable(),
    plaintext: z.string(),
  })
);

type CreatedToken = z.infer<typeof createdTokenSchema>["data"];

export type ExpiryChoice = "never" | "30d" | "90d" | "1y";

function expiryChoiceToIso(choice: ExpiryChoice): string | null {
  if (choice === "never") return null;
  const days = choice === "30d" ? 30 : choice === "90d" ? 90 : 365;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export function useMcpTokens(enabled: boolean) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<InlineMessage | null>(null);
  // The plaintext of a freshly-created token is held in component state only
  // long enough for the user to copy it. We never persist it.
  const [justCreated, setJustCreated] = useState<CreatedToken | null>(null);

  const tokensQuery = useQuery({
    queryKey: ["mcp-tokens"],
    enabled,
    queryFn: async () =>
      apiFetch("/api/v1/mcp/tokens", { method: "GET" }, (raw) => tokenListSchema.parse(raw).data.tokens),
  });

  const createMutation = useMutation({
    mutationFn: async (input: { label: string; expiry: ExpiryChoice }) => {
      const expiresAt = expiryChoiceToIso(input.expiry);
      return apiFetch(
        "/api/v1/mcp/tokens",
        { method: "POST", body: JSON.stringify({ label: input.label, expiresAt }) },
        (raw) => createdTokenSchema.parse(raw).data
      );
    },
    onMutate: () => setFeedback(null),
    onSuccess: async (data) => {
      setJustCreated(data);
      setFeedback({ tone: "success", text: "Token created. Copy it now — you won't see it again." });
      await queryClient.invalidateQueries({ queryKey: ["mcp-tokens"] });
    },
    onError: (error) => setFeedback({ tone: "error", text: getErrorMessage(error) }),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch(`/api/v1/mcp/tokens/${id}`, { method: "DELETE" }, (raw) =>
        apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data
      ),
    onMutate: () => setFeedback(null),
    onSuccess: async (_data, id) => {
      setFeedback({ tone: "info", text: `Token #${id} revoked.` });
      await queryClient.invalidateQueries({ queryKey: ["mcp-tokens"] });
    },
    onError: (error) => setFeedback({ tone: "error", text: getErrorMessage(error) }),
  });

  /**
   * Test connection by hitting the auth-gated /mcp/healthz endpoint with the
   * given plaintext token. Returns true on 2xx, false otherwise.
   */
  const testConnection = async (plaintext: string): Promise<boolean> => {
    try {
      const res = await fetch("/mcp/healthz", {
        headers: { Authorization: `Bearer ${plaintext}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  return {
    tokens: tokensQuery.data ?? [],
    isLoading: tokensQuery.isLoading,
    feedback,
    clearFeedback: () => setFeedback(null),
    justCreated,
    dismissJustCreated: () => setJustCreated(null),
    createPending: createMutation.isPending,
    revokePending: revokeMutation.isPending,
    onCreate: (label: string, expiry: ExpiryChoice) =>
      createMutation.mutate({ label: label.trim(), expiry }),
    onRevoke: (id: number) => revokeMutation.mutate(id),
    testConnection,
  };
}
