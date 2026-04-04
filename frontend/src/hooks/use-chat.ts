import { useState } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { apiEnvelopeSchema, apiFetch } from "../lib";
import { prefsSchema } from "../app/core";

export function useChat(enabled: boolean) {
  const [chatReply, setChatReply] = useState("");
  const [chatStatus, setChatStatus] = useState("");

  const prefsQuery = useQuery({
    queryKey: ["prefs"],
    enabled,
    queryFn: async () => apiFetch("/api/v1/preferences", { method: "GET" }, (raw) => prefsSchema.parse(raw).data),
  });

  const onSend = async (message: string, model: string, range: string) => {
    setChatStatus("Sending...");
    const data = await apiFetch(
      "/api/v1/ai/chat",
      { method: "POST", body: JSON.stringify({ message, model, range }) },
      (raw) => apiEnvelopeSchema(z.object({ reply: z.string(), fallback: z.boolean().optional() })).parse(raw).data,
    );
    setChatReply(data.reply);
    setChatStatus(data.fallback ? "AI fallback response" : "AI response received");
  };

  return {
    defaultModel: prefsQuery.data?.model ?? "mistral-small-latest",
    defaultRange: prefsQuery.data?.chatRange ?? "all",
    chatStatus,
    chatReply,
    onSend,
  };
}
