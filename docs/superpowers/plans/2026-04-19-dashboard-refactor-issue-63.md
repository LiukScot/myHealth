# Dashboard Refactor Issue 63 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the dashboard into a wide-screen two-column layout with a summary hero, overview metrics, and deterministic connections/coincidences insights.

**Architecture:** Keep the existing dashboard route and hook, but expand the dashboard view-model so the screen can render a primary overview column and a secondary patterns column. Reuse the app's existing split-layout language instead of inventing a dashboard-only page shell.

**Tech Stack:** React, TypeScript, existing hook/view pattern, CSS in `frontend/src/styles.css`, Playwright end-to-end tests.

---

### Task 1: Lock behavior with failing dashboard tests

**Files:**
- Modify: `tests/dashboard.spec.ts`
- Test: `tests/dashboard.spec.ts`

- [ ] Step 1: Add assertions for the new two-column dashboard structure on wide screens.
- [ ] Step 2: Add assertions for the summary/pattern blocks and connections cards.
- [ ] Step 3: Run the dashboard Playwright test and verify the new assertions fail for the right reason.

### Task 2: Expand dashboard view-model

**Files:**
- Modify: `frontend/src/hooks/use-dashboard.ts`
- Modify: `frontend/src/app/core.ts`

- [ ] Step 1: Add focused types for dashboard summary, insight rail items, and connections cards.
- [ ] Step 2: Compute deterministic dashboard insights from existing diary/pain data only.
- [ ] Step 3: Return the new view-model fields from `useDashboard`.

### Task 3: Render the new dashboard layout

**Files:**
- Modify: `frontend/src/app/screens.tsx`

- [ ] Step 1: Update `DashboardSection` props to accept the expanded view-model.
- [ ] Step 2: Replace the full-width stacked layout with the existing app split-layout pattern.
- [ ] Step 3: Render summary hero, overview column, insight rail, and connections cards with clear empty states.

### Task 4: Style the dashboard to match app language

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] Step 1: Add dashboard-specific split-layout classes that follow current token usage.
- [ ] Step 2: Style the hero and insight blocks using current surface/border/typography rules.
- [ ] Step 3: Verify mobile still collapses to one column cleanly.

### Task 5: Verify

**Files:**
- Test: `tests/dashboard.spec.ts`

- [ ] Step 1: Run focused dashboard Playwright coverage.
- [ ] Step 2: Run broader relevant frontend tests if available for regression confidence.
- [ ] Step 3: Check the changed files and confirm behavior matches the approved layout.
