import { useState } from "react";
import type { InlineMessage } from "./core";
import type { useAuth } from "../hooks/use-auth";
import { getErrorMessage } from "../lib";
import { InlineFeedback, SectionHead } from "./shared";
import { McpAccessSection } from "./McpAccessSection";

export type SettingsSectionProps = {
  auth: ReturnType<typeof useAuth>;
  purgeConfirmArmed: boolean;
  purgePending: boolean;
  purgeError: InlineMessage | null;
  onPurgeArm: () => void;
  onPurgeConfirm: () => void;
  onPurgeCancel: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onExportXlsx: () => void;
  onImportXlsx: (file: File) => void;
  backupFeedback: InlineMessage | null;
};

function AccountBlock({ auth }: Pick<SettingsSectionProps, "auth">) {
  return (
    <div className="settings-account-block">
      <form
        className="stack"
        onFocus={auth.clearPasswordStatus}
        onSubmit={auth.changePasswordForm.handleSubmit((v) => auth.changePasswordMutation.mutate(v))}
      >
        <label className="field field-line">
          <span className="field-line-label">Current password</span>
          <input type="password" autoComplete="current-password" {...auth.changePasswordForm.register("currentPassword")} />
        </label>
        <label className="field field-line">
          <span className="field-line-label">New password</span>
          <input type="password" autoComplete="new-password" {...auth.changePasswordForm.register("newPassword")} />
        </label>
        <label className="field field-line">
          <span className="field-line-label">Confirm</span>
          <input type="password" autoComplete="new-password" {...auth.changePasswordForm.register("confirmPassword")} />
        </label>
        <div className="save-section">
          <button type="submit" className="btn btn-primary" disabled={auth.changePasswordMutation.isPending}>
            Change password
          </button>
        </div>
        <InlineFeedback
          message={
            auth.changePasswordMutation.error
              ? { tone: "error", text: getErrorMessage(auth.changePasswordMutation.error) }
              : auth.passwordFeedback
          }
        />
      </form>
      <div className="save-section">
        <button type="button" className="btn" onClick={() => auth.logoutMutation.mutate()} disabled={auth.logoutMutation.isPending}>
          Log out
        </button>
      </div>
    </div>
  );
}

function BackupBlock({
  onExportJson,
  onImportJson,
  onExportXlsx,
  onImportXlsx,
  backupFeedback,
}: Pick<SettingsSectionProps, "onExportJson" | "onImportJson" | "onExportXlsx" | "onImportXlsx" | "backupFeedback">) {
  return (
    <div className="settings-backup">
      <div className="backup-row">
        <div className="backup-row-head">
          <span className="backup-row-title">JSON</span>
          <span className="backup-row-meta">Full database</span>
        </div>
        <div className="backup-row-actions">
          <button type="button" className="btn" onClick={onExportJson}>Export</button>
          <label className="btn file-input-btn">
            Import
            <input
              type="file"
              accept=".json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImportJson(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
      <div className="backup-row">
        <div className="backup-row-head">
          <span className="backup-row-title">XLSX</span>
          <span className="backup-row-meta">Spreadsheet</span>
        </div>
        <div className="backup-row-actions">
          <button type="button" className="btn" onClick={onExportXlsx}>Export</button>
          <label className="btn file-input-btn">
            Import
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImportXlsx(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
      <InlineFeedback message={backupFeedback} />
    </div>
  );
}

function DangerBlock({
  purgeConfirmArmed,
  purgePending,
  purgeError,
  onPurgeArm,
  onPurgeConfirm,
  onPurgeCancel,
}: Pick<SettingsSectionProps, "purgeConfirmArmed" | "purgePending" | "purgeError" | "onPurgeArm" | "onPurgeConfirm" | "onPurgeCancel">) {
  return (
    <div className="settings-danger-block">
      <p className="settings-danger-description">
        Permanently deletes all diary entries, pain logs, CBT/DBT records, and stored preferences for this account. This cannot be undone.
      </p>
      {purgeConfirmArmed ? (
        <div className="inline-confirmation" role="group" aria-label="Confirm purge all data">
          <InlineFeedback
            className="confirmation-copy"
            message={{
              tone: "warning",
              text: "This permanently deletes all diary, pain, and preference data for this account.",
            }}
          />
          <div className="row-actions confirmation-actions">
            <button type="button" className="btn btn-danger" onClick={onPurgeConfirm} disabled={purgePending}>
              {purgePending ? "Purging..." : "Confirm purge all data"}
            </button>
            <button type="button" className="btn" onClick={onPurgeCancel} disabled={purgePending}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="save-section">
          <button type="button" className="btn btn-danger" onClick={onPurgeArm}>
            Purge all data
          </button>
        </div>
      )}
      <InlineFeedback message={purgeError} />
    </div>
  );
}

function AccountIdentity({ auth }: Pick<SettingsSectionProps, "auth">) {
  const email = auth.user?.email ?? "—";
  const name = auth.user?.name?.trim();
  return (
    <div className="settings-identity">
      <div className="settings-identity-avatar" aria-hidden="true">
        {(name || email).slice(0, 1).toUpperCase()}
      </div>
      <div className="settings-identity-meta">
        <div className="settings-identity-name">{name || email.split("@")[0]}</div>
        <div className="settings-identity-email">{email}</div>
      </div>
    </div>
  );
}

/* ── Variant A — Single-column list ── */
export function SettingsVariantA(props: SettingsSectionProps) {
  return (
    <div className="settings-mock settings-mock-a">
      <AccountIdentity auth={props.auth} />
      <section className="settings-mock-section">
        <SectionHead title="Account" />
        <AccountBlock auth={props.auth} />
      </section>
      <section className="settings-mock-section">
        <SectionHead title="Backup" />
        <BackupBlock
          onExportJson={props.onExportJson}
          onImportJson={props.onImportJson}
          onExportXlsx={props.onExportXlsx}
          onImportXlsx={props.onImportXlsx}
          backupFeedback={props.backupFeedback}
        />
      </section>
      <section className="settings-mock-section">
        <McpAccessSection enabled />
      </section>
      <section className="settings-mock-section settings-mock-section--danger">
        <SectionHead title="Danger zone" />
        <DangerBlock
          purgeConfirmArmed={props.purgeConfirmArmed}
          purgePending={props.purgePending}
          purgeError={props.purgeError}
          onPurgeArm={props.onPurgeArm}
          onPurgeConfirm={props.onPurgeConfirm}
          onPurgeCancel={props.onPurgeCancel}
        />
      </section>
    </div>
  );
}

/* ── Variant B — Sub-tabs ── */
type SettingsTab = "account" | "backup" | "mcp" | "danger";
const settingsTabs: { id: SettingsTab; label: string; danger?: boolean }[] = [
  { id: "account", label: "Account" },
  { id: "backup", label: "Backup" },
  { id: "mcp", label: "MCP access" },
  { id: "danger", label: "Danger zone", danger: true },
];

export function SettingsVariantB(props: SettingsSectionProps) {
  const [tab, setTab] = useState<SettingsTab>("account");
  return (
    <div className="settings-mock settings-mock-b">
      <AccountIdentity auth={props.auth} />
      <nav className="tag-tabs settings-mock-tabs" aria-label="Settings sections">
        {settingsTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${tab === t.id ? "active" : ""}${t.danger ? " settings-mock-tab--danger" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="settings-mock-panel">
        {tab === "account" ? <AccountBlock auth={props.auth} /> : null}
        {tab === "backup" ? (
          <BackupBlock
            onExportJson={props.onExportJson}
            onImportJson={props.onImportJson}
            onExportXlsx={props.onExportXlsx}
            onImportXlsx={props.onImportXlsx}
            backupFeedback={props.backupFeedback}
          />
        ) : null}
        {tab === "mcp" ? <McpAccessSection enabled /> : null}
        {tab === "danger" ? (
          <DangerBlock
            purgeConfirmArmed={props.purgeConfirmArmed}
            purgePending={props.purgePending}
            purgeError={props.purgeError}
            onPurgeArm={props.onPurgeArm}
            onPurgeConfirm={props.onPurgeConfirm}
            onPurgeCancel={props.onPurgeCancel}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ── Variant C — Diary-style split ── */
export function SettingsVariantC(props: SettingsSectionProps) {
  return (
    <div className="panel-split panel-split--diary settings-mock settings-mock-c">
      <div className="panel-col settings-mock-c-left">
        <section>
          <SectionHead title="Account" />
          <AccountBlock auth={props.auth} />
        </section>
        <section>
          <SectionHead title="Backup" />
          <BackupBlock
            onExportJson={props.onExportJson}
            onImportJson={props.onImportJson}
            onExportXlsx={props.onExportXlsx}
            onImportXlsx={props.onImportXlsx}
            backupFeedback={props.backupFeedback}
          />
        </section>
        <section className="settings-mock-section--danger">
          <SectionHead title="Danger zone" />
          <DangerBlock
            purgeConfirmArmed={props.purgeConfirmArmed}
            purgePending={props.purgePending}
            purgeError={props.purgeError}
            onPurgeArm={props.onPurgeArm}
            onPurgeConfirm={props.onPurgeConfirm}
            onPurgeCancel={props.onPurgeCancel}
          />
        </section>
      </div>
      <div className="panel-col settings-mock-c-right">
        <SectionHead title="Status" />
        <AccountIdentity auth={props.auth} />
        <section className="settings-mock-receipts">
          <SectionHead title="Recent activity" />
          {props.backupFeedback ? (
            <InlineFeedback message={props.backupFeedback} />
          ) : (
            <p className="settings-mock-empty">Export and import receipts will appear here.</p>
          )}
        </section>
        <section className="settings-mock-mcp-aside">
          <McpAccessSection enabled />
        </section>
      </div>
    </div>
  );
}
