import { useEffect, useRef, useState } from "react";
import { useAuth, useDiary, usePain, useCbt, useDbt, useDashboard, useSettings } from "./hooks";
import { LoginScreen } from "./app/LoginScreen";
import { Sidebar } from "./app/Sidebar";
import { CbtSection, DbtSection, DashboardSection, DesignSystemSection, DiarySection, PainSection, SettingsSection } from "./app/screens";
import { formatDocumentTitle, navLabels, type NavItem } from "./app/core";

function App() {
  const auth = useAuth();
  const loggedIn = !!auth.user;
  const [nav, setNav] = useState<NavItem>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // Mirror of mobileSidebarOpen for the swipe handler closure to read,
  // so the swipe useEffect can run once at mount instead of re-running
  // every time the sidebar opens or closes.
  const mobileSidebarOpenRef = useRef(mobileSidebarOpen);
  useEffect(() => { mobileSidebarOpenRef.current = mobileSidebarOpen; }, [mobileSidebarOpen]);

  // When the drawer opens, move focus to its close button (so keyboard
  // and screen-reader users land inside the drawer). When it closes, return
  // focus to the hamburger that opened it. The ref guards against auto-
  // focusing anything on initial mount.
  const drawerWasOpenRef = useRef(false);
  useEffect(() => {
    if (mobileSidebarOpen) {
      drawerWasOpenRef.current = true;
      document.querySelector<HTMLButtonElement>(".sidebar-close-btn")?.focus();
    } else if (drawerWasOpenRef.current) {
      drawerWasOpenRef.current = false;
      document.querySelector<HTMLButtonElement>(".mobile-menu-btn")?.focus();
    }
  }, [mobileSidebarOpen]);

  // While the drawer is open: Esc closes it, and Tab cycles focus only
  // among the drawer's interactive elements (focus trap).
  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileSidebarOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const sidebar = document.querySelector<HTMLElement>(".sidebar");
      if (!sidebar) return;
      const focusables = sidebar.querySelectorAll<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (active && !sidebar.contains(active)) {
        // Focus drifted outside the drawer somehow — pull it back.
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileSidebarOpen]);

  // Reset the page scroll position to the top whenever the user navigates
  // to a different screen, so the new page doesn't start mid-scroll.
  // The actual scroll container is the document element (<html>), not
  // .app-main — that one has overflow-y: auto in CSS but no constrained
  // height, so it never actually overflows.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [nav]);

  useEffect(() => {
    document.title = loggedIn ? formatDocumentTitle(navLabels[nav]) : formatDocumentTitle("Sign in");
  }, [loggedIn, nav]);

  const diary = useDiary(loggedIn);
  const pain = usePain(loggedIn);
  const cbt = useCbt(loggedIn);
  const dbt = useDbt(loggedIn);
  const dashboard = useDashboard(loggedIn);
  const settings = useSettings(loggedIn);

  // Interactive swipe gestures: the sidebar follows the finger 1:1 during
  // the drag, then snaps open or closed on release based on how far it moved.
  useEffect(() => {
    const MOBILE_MAX_WIDTH = 720;
    const ACTIVATE_DX = 8;     // min horizontal travel before we hijack the gesture
    const MAX_VERTICAL = 40;   // give up if the user is clearly scrolling vertically

    const isInsideHorizontalScroller = (el: EventTarget | null) => {
      let node = el as HTMLElement | null;
      while (node && node !== document.body) {
        if (node.scrollWidth > node.clientWidth) {
          const overflowX = getComputedStyle(node).overflowX;
          if (overflowX === "auto" || overflowX === "scroll") return true;
        }
        node = node.parentElement;
      }
      return false;
    };

    const getSidebar = () => document.querySelector<HTMLElement>(".sidebar");

    let startX = 0;
    let startY = 0;
    let width = 0;
    let tracking: "open" | "close" | null = null;
    let dragging = false;  // becomes true once we commit to a horizontal swipe
    let pendingCleanupTimer: number | null = null;
    let pendingCleanup: (() => void) | null = null;

    // Cancel any pending snap-animation cleanup from a previous gesture so it
    // can't fire mid-drag and wipe inline styles we're actively writing.
    const cancelPendingCleanup = () => {
      if (pendingCleanupTimer !== null) {
        window.clearTimeout(pendingCleanupTimer);
        pendingCleanupTimer = null;
      }
      if (pendingCleanup) {
        const el = getSidebar();
        if (el) el.removeEventListener("transitionend", pendingCleanup);
        pendingCleanup = null;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (window.innerWidth > MOBILE_MAX_WIDTH) return;
      cancelPendingCleanup();
      // Clear any leftover inline styles from a previous gesture
      const el = getSidebar();
      if (el) {
        el.style.transform = "";
        el.style.transition = "";
      }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      width = window.innerWidth;
      dragging = false;
      if (mobileSidebarOpenRef.current) {
        tracking = "close";
      } else if (!isInsideHorizontalScroller(e.target)) {
        tracking = "open";
      } else {
        tracking = null;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (!dragging) {
        // Wait for clear horizontal intent before hijacking the gesture.
        if (Math.abs(dy) > MAX_VERTICAL) { tracking = null; return; }
        if (Math.abs(dx) < ACTIVATE_DX) return;
        if (Math.abs(dy) > Math.abs(dx)) { tracking = null; return; }
        // Wrong-direction swipes are pointless: bail.
        if (tracking === "open" && dx < 0) { tracking = null; return; }
        if (tracking === "close" && dx > 0) { tracking = null; return; }
        dragging = true;
        const el = getSidebar();
        if (el) el.style.transition = "none";  // disable CSS transition during drag
      }
      const el = getSidebar();
      if (!el) return;
      // Compute the live position. Open gesture starts at -width, close at 0.
      const base = tracking === "open" ? -width : 0;
      const pos = Math.min(0, Math.max(-width, base + dx));
      el.style.transform = `translateX(${pos}px)`;
    };

    const onTouchEnd = () => {
      if (!tracking) { dragging = false; return; }
      const el = getSidebar();
      if (el && dragging) {
        // Read the live position from the inline transform we just set.
        const matrix = new DOMMatrixReadOnly(el.style.transform || "translateX(0)");
        const pos = matrix.m41;
        // Commit threshold: 1/3 of screen width.
        // Open gesture commits once the sidebar is dragged at least 1/3 in (pos > -width * 2/3).
        // Close gesture commits once it's pushed at least 1/3 out (pos < -width * 1/3).
        const shouldOpen = tracking === "open"
          ? pos > -width * (2 / 3)
          : pos > -width * (1 / 3);
        // Re-enable the transition and set inline transform to the destination.
        // Inline style overrides the CSS class, so we'll snap-animate to it,
        // and then clear the inline style after the animation finishes so the
        // CSS class takes back control.
        el.style.transition = "";
        el.style.transform = shouldOpen ? "translateX(0)" : `translateX(-${width}px)`;
        const cleanup = () => {
          el.style.transform = "";
          el.style.transition = "";
          el.removeEventListener("transitionend", cleanup);
          if (pendingCleanupTimer !== null) {
            window.clearTimeout(pendingCleanupTimer);
            pendingCleanupTimer = null;
          }
          pendingCleanup = null;
        };
        pendingCleanup = cleanup;
        el.addEventListener("transitionend", cleanup);
        // Safety: if no transition fires (e.g. inline matches CSS exactly), clean up anyway.
        pendingCleanupTimer = window.setTimeout(cleanup, 350);

        if (shouldOpen !== mobileSidebarOpenRef.current) {
          setMobileSidebarOpen(shouldOpen);
        }
      }
      tracking = null;
      dragging = false;
    };

    // All listeners can be passive: vertical-scroll blocking is handled
    // declaratively via `body { touch-action: pan-y }` in the mobile media
    // query, so we never need preventDefault().
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      cancelPendingCleanup();
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
    // Empty dep array — handlers read live state via mobileSidebarOpenRef so
    // we only need to attach the listeners once at mount.
  }, []);

  if (!auth.user) {
    return <LoginScreen loginForm={auth.loginForm} loginMutation={auth.loginMutation} />;
  }

  return (
    <div className={`shell${sidebarCollapsed ? " collapsed" : ""}${mobileSidebarOpen ? " mobile-open" : ""}`}>
      <Sidebar
        nav={nav}
        onNav={(item) => { setNav(item); setMobileSidebarOpen(false); }}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        mobileOpen={mobileSidebarOpen}
      />

      <main className="screen app-main">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="Open menu"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>

        {nav === "dashboard" && (
          <DashboardSection
            dashboardFrom={dashboard.dashboardFrom} dashboardTo={dashboard.dashboardTo}
            activeQuickRange={dashboard.activeQuickRange} isLoading={dashboard.isLoading}
            hasEntriesInRange={dashboard.hasEntriesInRange} hasEntriesOverall={dashboard.hasEntriesOverall}
            onDateChange={dashboard.handleDateChange}
            onQuickRange={dashboard.applyQuickRange}
            dashboardCards={dashboard.dashboardCards} dashboardInsights={dashboard.dashboardInsights}
            dashboardConnections={dashboard.dashboardConnections}
            wellbeingSeries={dashboard.wellbeingSeries} graphSelection={dashboard.graphSelection}
            onGraphToggle={dashboard.handleGraphToggle} wellbeingChart={dashboard.wellbeingChart}
          />
        )}

        {nav === "diary" && (
          <DiarySection
            diaryForm={diary.diaryForm} diaryMutationState={{ isSuccess: diary.diaryMutation.isSuccess }} isLoading={diary.isLoading}
            editingDiary={diary.editingDiary} moodFieldOptions={diary.moodFieldOptions}
            diaryEntries={diary.diaryEntries} confirmDeleteDiary={diary.confirmDeleteDiary}
            onSubmit={(v) => diary.diaryMutation.mutate(v)} onCancelEdit={diary.resetDiaryForm}
            onStartEdit={diary.startDiaryEdit} onDeleteClick={diary.onDeleteClick} onDeleteBlur={diary.onDeleteBlur}
          />
        )}

        {nav === "pain" && (
          <PainSection
            painForm={pain.painForm} painMutationState={{ isSuccess: pain.painMutation.isSuccess }} isLoading={pain.isLoading}
            editingPain={pain.editingPain} painFieldOptions={pain.painFieldOptions}
            watchedValues={pain.watchedValues} painEntries={pain.painEntries}
            confirmDeletePain={pain.confirmDeletePain} onSubmit={(v) => pain.painMutation.mutate(v)}
            onCancelEdit={pain.resetPainForm} onStartEdit={pain.startPainEdit}
            onDeleteClick={pain.onDeleteClick} onDeleteBlur={pain.onDeleteBlur}
          />
        )}

        {nav === "cbt" && (
          <CbtSection
            cbtForm={cbt.cbtForm} cbtMutationState={{ isSuccess: cbt.cbtMutation.isSuccess }} isLoading={cbt.isLoading}
            editingCbt={cbt.editingCbt} cbtEntries={cbt.cbtEntries}
            confirmDeleteCbt={cbt.confirmDeleteCbt} onSubmit={(v) => cbt.cbtMutation.mutate(v)}
            onCancelEdit={cbt.resetCbtForm} onStartEdit={cbt.startCbtEdit}
            onDeleteClick={cbt.onDeleteClick} onDeleteBlur={cbt.onDeleteBlur}
          />
        )}

        {nav === "dbt" && (
          <DbtSection
            dbtForm={dbt.dbtForm} dbtMutationState={{ isSuccess: dbt.dbtMutation.isSuccess }} isLoading={dbt.isLoading}
            editingDbt={dbt.editingDbt} dbtEntries={dbt.dbtEntries}
            confirmDeleteDbt={dbt.confirmDeleteDbt} onSubmit={(v) => dbt.dbtMutation.mutate(v)}
            onCancelEdit={dbt.resetDbtForm} onStartEdit={dbt.startDbtEdit}
            onDeleteClick={dbt.onDeleteClick} onDeleteBlur={dbt.onDeleteBlur}
          />
        )}

        {nav === "settings" && (
          <SettingsSection auth={auth}
            purgeConfirmArmed={settings.purgeConfirmArmed}
            purgePending={settings.purgePending} purgeError={settings.purgeError}
            onPurgeArm={settings.onPurgeArm} onPurgeConfirm={settings.onPurgeConfirm}
            onPurgeCancel={settings.onPurgeCancel} onExportJson={settings.onExportJson}
            onImportJson={settings.onImportJson} onExportXlsx={settings.onExportXlsx}
            onImportXlsx={settings.onImportXlsx} backupFeedback={settings.backupFeedback}
          />
        )}

        {nav === "design-system" && <DesignSystemSection />}
      </main>

      <button
        type="button"
        className="design-system-fab"
        aria-label="Open design system"
        onClick={() => setNav("design-system")}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </button>
    </div>
  );
}

export default App;
