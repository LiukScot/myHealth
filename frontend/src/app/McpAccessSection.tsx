import { useState } from "react";
import { useMcpTokens, type ExpiryChoice } from "../hooks/use-mcp-tokens";
import { InlineFeedback, SectionHead } from "./shared";

type ClientTab = "generic" | "claude-desktop" | "claude-code" | "curl";

function buildGenericInstructions(baseUrl: string, plaintext: string): string {
  return `Endpoint  ${baseUrl}/mcp
Transport HTTP (streamable)
Header    Authorization: Bearer ${plaintext}

Works with any MCP-compliant client (Cline, Continue, Cursor,
custom clients, etc.). Point your client at the endpoint above and
pass the bearer token in the Authorization header.`;
}

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
 *
 * Visuals are aligned to the app's design system: SectionHead for titles,
 * btn / btn-primary / btn-danger for actions, field-line for inputs,
 * tag-tabs for the client picker, code-block for snippets.
 */
export function McpAccessSection({ enabled }: { enabled: boolean }) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const tokens = useMcpTokens(enabled);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newExpiry, setNewExpiry] = useState<ExpiryChoice>("never");
  const [activeTab, setActiveTab] = useState<ClientTab>("generic");
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
      // Best-effort copy; on failure the user can still select the snippet.
    }
  };

  const handleTest = async (id: number) => {
    if (!tokens.justCreated || tokens.justCreated.id !== id) {
      // Test only works while we still have the plaintext in memory.
      return;
    }
    const ok = await tokens.testConnection(tokens.justCreated.plaintext);
    setTestStatus((prev) => ({ ...prev, [id]: ok ? "ok" : "fail" }));
  };

  return (
    <div className="mcp-access">
      <SectionHead title="MCP access" />
      <p className="mcp-intro">
        Connect any MCP-compliant AI client (Cline, Continue, Cursor, Claude Desktop, Claude Code, or your own) to your health data over HTTP.
      </p>

      {tokens.justCreated ? (
        <div className="mcp-just-created">
          <InlineFeedback
            message={{
              tone: "warning",
              text: "Copy this token now — it will not be shown again after you dismiss this panel.",
            }}
          />
          <pre className="code-block">{tokens.justCreated.plaintext}</pre>
          <div className="row-actions mcp-just-created-actions">
            <button type="button" className="btn btn-primary" onClick={() => handleCopy(tokens.justCreated!.plaintext)}>
              Copy token
            </button>
            <button type="button" className="btn" onClick={() => handleTest(tokens.justCreated!.id)}>
              Test connection
            </button>
            {testStatus[tokens.justCreated.id] === "ok" ? (
              <span className="mcp-test-status mcp-test-status--ok">✓ connected</span>
            ) : null}
            {testStatus[tokens.justCreated.id] === "fail" ? (
              <span className="mcp-test-status mcp-test-status--fail">✗ failed</span>
            ) : null}
            <button type="button" className="btn" onClick={tokens.dismissJustCreated}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <SectionHead title="Active tokens" />
      {tokens.isLoading ? (
        <p className="mcp-empty">Loading…</p>
      ) : tokens.tokens.length === 0 ? (
        <p className="mcp-empty">No tokens yet. Create one below to connect an AI client.</p>
      ) : (
        <ul className="mcp-token-list">
          {tokens.tokens.map((t) => (
            <li key={t.id} className="mcp-token-row">
              <div className="mcp-token-meta">
                <div className="mcp-token-label">{t.label || `Token #${t.id}`}</div>
                <div className="mcp-token-sub">
                  Created {t.createdAt.slice(0, 10)} · Last used {formatRelative(t.lastUsedAt)} · {formatExpiry(t.expiresAt)}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-danger"
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
        <div className="mcp-create-form">
          <SectionHead title="New token" />
          <label className="field field-line">
            <span className="field-line-label">Label</span>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Claude Desktop MacBook"
              maxLength={100}
            />
          </label>
          <label className="field field-line">
            <span className="field-line-label">Expiry</span>
            <select value={newExpiry} onChange={(e) => setNewExpiry(e.target.value as ExpiryChoice)}>
              <option value="never">Never</option>
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
              <option value="1y">1 year</option>
            </select>
          </label>
          <div className="save-section">
            <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={tokens.createPending}>
              {tokens.createPending ? "Creating…" : "Create token"}
            </button>
            <button type="button" className="btn" onClick={() => setShowCreateForm(false)} disabled={tokens.createPending}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="save-section">
          <button type="button" className="btn" onClick={() => setShowCreateForm(true)}>
            + Create new token
          </button>
        </div>
      )}

      <InlineFeedback message={tokens.feedback} />

      <SectionHead title="How to connect" />
      <nav className="tag-tabs mcp-client-tabs" role="tablist" aria-label="MCP client instructions">
        {(["generic", "claude-desktop", "claude-code", "curl"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "generic" ? "Any client" : tab === "claude-desktop" ? "Claude Desktop" : tab === "claude-code" ? "Claude Code" : "Curl test"}
          </button>
        ))}
      </nav>

      <McpClientInstructions tab={activeTab} baseUrl={baseUrl} onCopy={handleCopy} />
    </div>
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
    case "generic":
      snippet = buildGenericInstructions(baseUrl, placeholder);
      description = "Any MCP-compliant client over HTTP: use this endpoint + bearer token. Config format varies per client.";
      break;
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
      <p className="mcp-intro">{description}</p>
      <pre className="code-block">{snippet}</pre>
      <div className="save-section">
        <button type="button" className="btn" onClick={() => onCopy(snippet)}>
          Copy
        </button>
      </div>
    </div>
  );
}
