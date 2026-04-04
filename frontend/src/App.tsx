import { useState } from "react";
import { useAuth, useDiary, usePain, useDashboard, useSettings, useChat } from "./hooks";
import { LoginScreen } from "./app/LoginScreen";
import { Sidebar } from "./app/Sidebar";
import { ChatSection, DashboardSection, DiarySection, PainSection, SettingsSection } from "./app/screens";
import type { NavItem } from "./app/core";

function App() {
  const auth = useAuth();
  const [nav, setNav] = useState<NavItem>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const loggedIn = !!auth.user;

  const diary = useDiary(loggedIn);
  const pain = usePain(loggedIn);
  const dashboard = useDashboard(loggedIn);
  const settings = useSettings(loggedIn);
  const chat = useChat(loggedIn);

  if (!auth.user) {
    return <LoginScreen loginForm={auth.loginForm} loginMutation={auth.loginMutation} />;
  }

  return (
    <div className={`shell${sidebarCollapsed ? " collapsed" : ""}`}>
      <Sidebar nav={nav} onNav={setNav} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((c) => !c)} />

      <main className="screen app-main">

        {nav === "dashboard" && (
          <DashboardSection
            dashboardFrom={dashboard.dashboardFrom} dashboardTo={dashboard.dashboardTo}
            activeQuickRange={dashboard.activeQuickRange} onDateChange={dashboard.handleDateChange}
            onQuickRange={dashboard.applyQuickRange} dashboardCards={dashboard.dashboardCards}
            wellbeingSeries={dashboard.wellbeingSeries} graphSelection={dashboard.graphSelection}
            onGraphToggle={dashboard.handleGraphToggle} wellbeingChart={dashboard.wellbeingChart}
          />
        )}

        {nav === "diary" && (
          <DiarySection
            diaryForm={diary.diaryForm} diaryMutationState={{ isSuccess: diary.diaryMutation.isSuccess }}
            editingDiary={diary.editingDiary} moodFieldOptions={diary.moodFieldOptions}
            diaryEntries={diary.diaryEntries} confirmDeleteDiary={diary.confirmDeleteDiary}
            onSubmit={(v) => diary.diaryMutation.mutate(v)} onCancelEdit={diary.resetDiaryForm}
            onStartEdit={diary.startDiaryEdit} onDeleteClick={diary.onDeleteClick} onDeleteBlur={diary.onDeleteBlur}
          />
        )}

        {nav === "pain" && (
          <PainSection
            painForm={pain.painForm} painMutationState={{ isSuccess: pain.painMutation.isSuccess }}
            editingPain={pain.editingPain} painFieldOptions={pain.painFieldOptions}
            watchedValues={pain.watchedValues} painEntries={pain.painEntries}
            confirmDeletePain={pain.confirmDeletePain} onSubmit={(v) => pain.painMutation.mutate(v)}
            onCancelEdit={pain.resetPainForm} onStartEdit={pain.startPainEdit}
            onDeleteClick={pain.onDeleteClick} onDeleteBlur={pain.onDeleteBlur}
          />
        )}

        {nav === "cbt" && (
          <section className="panel"><h1 className="panel-title">CBT Thought Response</h1><p className="hint">Coming soon — this entry form is not yet implemented.</p></section>
        )}

        {nav === "dbt" && (
          <section className="panel"><h1 className="panel-title">DBT Distress Tolerance</h1><p className="hint">Coming soon — this entry form is not yet implemented.</p></section>
        )}

        {nav === "chat" && <ChatSection {...chat} />}

        {nav === "settings" && (
          <SettingsSection auth={auth}
            aiKeyHasKey={settings.aiKeyHasKey} aiKeyFeedback={settings.aiKeyFeedback}
            aiKeySaving={settings.aiKeySaving} aiKeyClearing={settings.aiKeyClearing}
            onAiKeyFeedbackClear={settings.clearAiKeyStatus} onAiKeySave={settings.onAiKeySave}
            onAiKeyClear={settings.onAiKeyClear} purgeConfirmArmed={settings.purgeConfirmArmed}
            purgePending={settings.purgePending} purgeError={settings.purgeError}
            onPurgeArm={settings.onPurgeArm} onPurgeConfirm={settings.onPurgeConfirm}
            onPurgeCancel={settings.onPurgeCancel} prefsValue={settings.prefsValue}
            onSavePrefs={settings.onSavePrefs} onExportJson={settings.onExportJson}
            onImportJson={settings.onImportJson} onExportXlsx={settings.onExportXlsx}
            onImportXlsx={settings.onImportXlsx} backupFeedback={settings.backupFeedback}
          />
        )}
      </main>
    </div>
  );
}

export default App;
