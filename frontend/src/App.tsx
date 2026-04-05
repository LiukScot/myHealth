import { useState } from "react";
import { useAuth, useDiary, usePain, useCbt, useDbt, useDashboard, useSettings, useChat } from "./hooks";
import { LoginScreen } from "./app/LoginScreen";
import { Sidebar } from "./app/Sidebar";
import { ChatSection, CbtSection, DbtSection, DashboardSection, DiarySection, PainSection, SettingsSection } from "./app/screens";
import type { NavItem } from "./app/core";

function App() {
  const auth = useAuth();
  const [nav, setNav] = useState<NavItem>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const loggedIn = !!auth.user;

  const diary = useDiary(loggedIn);
  const pain = usePain(loggedIn);
  const cbt = useCbt(loggedIn);
  const dbt = useDbt(loggedIn);
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
          <CbtSection
            cbtForm={cbt.cbtForm} cbtMutationState={{ isSuccess: cbt.cbtMutation.isSuccess }}
            editingCbt={cbt.editingCbt} cbtEntries={cbt.cbtEntries}
            confirmDeleteCbt={cbt.confirmDeleteCbt} onSubmit={(v) => cbt.cbtMutation.mutate(v)}
            onCancelEdit={cbt.resetCbtForm} onStartEdit={cbt.startCbtEdit}
            onDeleteClick={cbt.onDeleteClick} onDeleteBlur={cbt.onDeleteBlur}
          />
        )}

        {nav === "dbt" && (
          <DbtSection
            dbtForm={dbt.dbtForm} dbtMutationState={{ isSuccess: dbt.dbtMutation.isSuccess }}
            editingDbt={dbt.editingDbt} dbtEntries={dbt.dbtEntries}
            confirmDeleteDbt={dbt.confirmDeleteDbt} onSubmit={(v) => dbt.dbtMutation.mutate(v)}
            onCancelEdit={dbt.resetDbtForm} onStartEdit={dbt.startDbtEdit}
            onDeleteClick={dbt.onDeleteClick} onDeleteBlur={dbt.onDeleteBlur}
          />
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
