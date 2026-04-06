import { useState } from "react";
import { useMcpTokens, type ExpiryChoice } from "../hooks/use-mcp-tokens";
import { InlineFeedback } from "./shared";

type ClientTab = "claude-desktop" | "claude-code" | "curl";

function buildClaudeDesktopConfig(baseUrl: string, plaintext: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        health: {
          url: `${baseUrl}/mcp`,
          headers: { Authorization: `Bearer ${plaintext}` },
        },
      },
    },
    null,
    2
  );
}

function buildClaudeCodeCommand(baseUrl: string, plaintext: string): string {
  return `claude mcp add --transport http health ${baseUrl}/mcp --header "Authorization: Bearer ${plaintext}"`;
}

function buildCurlCommand(baseUrl: string, plaintext: string): string {
  return `curl -H "Authorization: Bearer ${plaintext}" ${baseUrl}/mcp/healthz`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  return iso.slice(0, 10);
}

function formatExpiry(iso: string | null): string {
  if (!iso) return "never expires";
  return `expires ${iso.slice(0, 10)}`;
}

/**
 * MCP Access settings section. Self-contained — uses the useMcpTokens hook
 * directly so the parent SettingsSection doesn't need to thread props.
 */
export function McpAccessSection({ enabled }: { enabled: boolean }) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const tokens = useMcpTokens(enabled);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newExpiry, setNewExpiry] = useState<ExpiryChoice>("never");
  const [activeTab, setActiveTab] = useState<ClientTab>("claude-desktop");
  const [testStatus, setTestStatus] = useState<Record<number, "idle" | "ok" | "fail">>({});

  const handleCreate = () => {
    tokens.onCreate(newLabel, newExpiry);
    setNewLabel("");
    setNewExpiry("never");
    setShowCreateForm(false);
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback: select text in a temporary textarea (rare modern-browser failure)
    }
  };

  const handleTest = async (id: number) => {
    if (!tokens.justCreated || tokens.justCreated.id !== id) {
      // Test only works while we still have the plaintext in memory
      // (i.e. only the just-created token).
      return;
    }
    const ok = await tokens.testConnection(tokens.justCreated.plaintext);
    setTestStatus((prev) => ({ ...prev, [id]: ok ? "ok" : "fail" }));
  };

  return (
    <article>
      <h3>MCP Access</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Connect an AI client (Claude Desktop, Claude Code, etc.) to your health data over MCP.
      </p>

      {tokens.justCreated && (
        <div className="mcp-just-created" style={{ marginBottom: 12 }}>
          <InlineFeedback
            message={{
              tone: "warning",
              text: "Copy this token now — it will not be shown again after you dismiss this panel.",
            }}
          />
          <pre
            style={{
              background: "var(--color-card)",
              padding: 10,
              borderRadius: 8,
              overflow: "auto",
              marginTop: 8,
            }}
          >
            {tokens.justCreated.plaintext}
          </pre>
          <div className="row-actions" style={{ marginTop: 8 }}>
            <button type="button" onClick={() => handleCopy(tokens.justCreated!.plaintext)}>
              Copy token
            </button>
            <button type="button" onClick={() => handleTest(tokens.justCreated!.id)}>
              Test connection
            </button>
            {testStatus[tokens.justCreated.id] === "ok" && <span style={{ color: "var(--color-success)" }}>✓ connected</span>}
            {testStatus[tokens.justCreated.id] === "fail" && <span style={{ color: "var(--color-danger)" }}>✗ failed</span>}
            <button type="button" onClick={tokens.dismissJustCreated}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <h4 style={{ marginBottom: 6 }}>Active tokens</h4>
      {tokens.isLoading ? (
        <p className="muted">Loading…</p>
      ) : tokens.tokens.length === 0 ? (
        <p className="muted">No tokens yet. Create one below to connect an AI client.</p>
      ) : (
        <ul className="mcp-token-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {tokens.tokens.map((t) => (
            <li
              key={t.id}
              style={{
                padding: "8px 0",
                borderBottom: "1px solid var(--color-border, #2a2a2e)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{t.label || `Token #${t.id}`}</div>
                <div className="muted" style={{ fontSize: "0.85em" }}>
                  Created {t.createdAt.slice(0, 10)} · Last used {formatRelative(t.lastUsedAt)} · {formatExpiry(t.expiresAt)}
                </div>
              </div>
              <button
                type="button"
                className="danger"
                onClick={() => tokens.onRevoke(t.id)}
                disabled={tokens.revokePending}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      {showCreateForm ? (
        <div className="mcp-create-form" style={{ marginTop: 12 }}>
          <label>
            Label
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Claude Desktop MacBook"
              maxLength={100}
            />
          </label>
          <label>
            Expiry
            <select value={newExpiry} onChange={(e) => setNewExpiry(e.target.value as ExpiryChoice)}>
              <option value="never">Never</option>
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
              <option value="1y">1 year</option>
            </select>
          </label>
          <div className="row-actions" style={{ marginTop: 8 }}>
            <button type="button" onClick={handleCreate} disabled={tokens.createPending}>
              {tokens.createPending ? "Creating…" : "Create token"}
            </button>
            <button type="button" onClick={() => setShowCreateForm(false)} disabled={tokens.createPending}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowCreateForm(true)} style={{ marginTop: 12 }}>
          + Create new token
        </button>
      )}

      <InlineFeedback message={tokens.feedback} />

      <h4 style={{ marginTop: 18, marginBottom: 6 }}>How to connect</h4>
      <div className="mcp-tabs" role="tablist" style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {(["claude-desktop", "claude-code", "curl"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            style={{
              fontWeight: activeTab === tab ? 600 : 400,
              opacity: activeTab === tab ? 1 : 0.7,
            }}
          >
            {tab === "claude-desktop" ? "Claude Desktop" : tab === "claude-code" ? "Claude Code" : "Curl test"}
          </button>
        ))}
      </div>

      <McpClientInstructions tab={activeTab} baseUrl={baseUrl} onCopy={handleCopy} />
    </article>
  );
}

function McpClientInstructions({
  tab,
  baseUrl,
  onCopy,
}: {
  tab: ClientTab;
  baseUrl: string;
  onCopy: (text: string) => void;
}) {
  // We only have the plaintext token at creation time. After that, instructions
  // show a placeholder that the user must replace with their stored token.
  const placeholder = "<your token here>";

  let snippet: string;
  let description: string;
  switch (tab) {
    case "claude-desktop":
      snippet = buildClaudeDesktopConfig(baseUrl, placeholder);
      description = "Add this block to your claude_desktop_config.json under the existing mcpServers entry.";
      break;
    case "claude-code":
      snippet = buildClaudeCodeCommand(baseUrl, placeholder);
      description = "Run this command from any terminal where Claude Code is installed.";
      break;
    case "curl":
      snippet = buildCurlCommand(baseUrl, placeholder);
      description = "Quick health check — should return JSON with ok=true.";
      break;
  }

  return (
    <div className="mcp-instructions">
      <p className="muted" style={{ marginTop: 0, marginBottom: 6 }}>
        {description}
      </p>
      <pre
        style={{
          background: "var(--color-card)",
          padding: 10,
          borderRadius: 8,
          overflow: "auto",
        }}
      >
        {snippet}
      </pre>
      <button type="button" onClick={() => onCopy(snippet)} style={{ marginTop: 6 }}>
        Copy
      </button>
    </div>
  );
}
