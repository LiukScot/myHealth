# Memorable Days Emoji Picker Design

Date: 2026-05-01
Issue: Memorable days emoji field UX follow-up

## Summary

Replace the current memorable-day emoji field with a custom emoji picker that follows the existing design system, supports the full emoji set via a third-party package, and behaves like a compact anchored dropdown rather than a separate modal or fake native-system bridge.

The picker will:

- open below the emoji chip field
- use a real emoji dataset from a package dependency
- support search by name and keywords
- expose short text category tabs
- keep session-only recent emojis
- close immediately after selection
- restore category, search text, and scroll position when reopened in the same session

This is intentionally a frontend-only UX improvement. It does not change memorable-day storage or API payload format beyond continuing to store the chosen emoji string.

## Product Decisions

### Chosen UX

- Picker type: custom dropdown
- Data source: external emoji package
- Closed trigger: square chip showing selected emoji or placeholder
- Recents: session only
- Search: yes, by name and keywords
- Categories: short text labels
- After pick: close immediately
- Reopen behavior: restore last category, search state, and scroll position from the current session

### Explicit Non-Goals

- No attempt to summon the operating system emoji picker
- No persistent recent-emoji storage in user preferences
- No backend schema or API changes for picker session state
- No separate centered emoji-picker modal

## Why This Direction

The app is a web UI inside a desktop shell. A real operating-system emoji popup is not a reliable web primitive. A custom picker is the only stable path that still gives strong UX control and design-system consistency.

Using a package instead of a hand-maintained emoji JSON avoids maintaining the entire Unicode emoji catalog ourselves. The app should still normalize package data through one local adapter so package shape changes do not leak through the codebase.

## UX Design

## Closed State

The emoji field remains in the memorable-day modal top row, always to the right of the date field. It renders as a square chip in the same height family as surrounding controls. The chip shows:

- selected emoji if present
- placeholder emoji such as `✨` if empty

The chip uses the same card/background language as the rest of the design system. It should read as “selected value that can be changed,” not as a generic text input.

## Open State

Clicking the chip opens an anchored dropdown directly below the emoji field.

Dropdown structure:

1. search input
2. category tabs row
3. scrollable emoji grid

Category labels:

- Recent
- Smileys
- People
- Nature
- Food
- Travel
- Objects
- Symbols
- Flags

The dropdown should visually match app surfaces already in use:

- same surface tone family as panels/cards
- same border radius language
- same muted text treatment for secondary UI
- same hover language as other neutral card-like controls

## Emoji Grid

Each emoji appears in a square cell. Hover uses the standard neutral gray-box hover language. Selected state uses a subtle accent treatment such as a ring or light fill. It should not become loud or toy-like.

The grid must not compress cells vertically when the list grows. The grid area should scroll instead.

## Narrow Width Behavior

The date field and emoji chip stay on the same row at the supported modal widths. The dropdown can expand below them rather than forcing the chip underneath the date field.

If the viewport becomes extremely narrow, the dropdown may widen relative to the chip so the picker remains usable. The form row itself should still preserve the date-left / emoji-right layout as long as the modal width allows it.

## State Design

Frontend draft state continues storing:

- `emoji: string`

Additional session-only picker UI state:

- `open: boolean`
- `activeCategory`
- `search`
- `recent: string[]`
- `scrollTopByCategory`

This state resets on full page reload. It is not persisted to the backend.

## Data Design

## Dependency

Add an emoji package that provides:

- emoji glyph
- canonical name
- keywords/aliases
- category/group data

## Adapter Layer

Create one adapter/helper that converts package data into app-local picker records:

- `emoji`
- `name`
- `keywords`
- `category`
- precomputed lowercase search text

The adapter may also filter out unsupported or undesirable entries if package data contains duplicates, components, or categories that do not fit the picker UX.

This keeps the rest of the UI independent from the raw package format.

## Interaction Flow

1. User opens memorable-day modal.
2. User clicks emoji chip.
3. Dropdown opens below chip with remembered session state.
4. User can:
   - browse tabs
   - search
   - pick from recents
   - scroll the grid
5. On selection:
   - form emoji value updates
   - selected emoji is added to session recents
   - session remembers current category/search/scroll state
   - dropdown closes immediately
6. Reopening restores the prior browsing context for the current session.

Close conditions:

- outside click
- `Esc`
- emoji selection

## Accessibility

- chip trigger must be keyboard focusable
- trigger announces current emoji value
- dropdown must support `Esc` close
- search input must be properly labeled
- category tabs must expose active state
- emoji choices must have accessible labels using canonical names

Keyboard support should at minimum allow:

- open picker from trigger
- tab into search/tabs/grid
- select an emoji via keyboard focus + Enter/Space

## Error Handling

If package data fails to load or normalize, the field should degrade safely:

- keep manual emoji string input available, or
- show an empty picker state with a clear fallback path

The memorable-day form must still remain usable even if picker data has an issue.

## Performance Notes

The emoji set is large. Avoid recomputing filtered results and search text on every render.

Expected optimizations:

- precompute normalized records once
- memoize filtered category/search results
- keep session state local to the picker
- scroll only the grid viewport, not the entire dropdown surface

If the package introduces too much render cost, virtualization can be considered later, but it is not part of the first version.

## Testing

Automated tests should cover:

- chip opens dropdown
- no fake legacy emoji grid remains
- selecting emoji updates chip and hidden/form value
- dropdown closes after selection
- reopen restores last category/search/scroll state
- recents update within the same session
- search filters results
- narrow widths keep date and emoji on the same row
- dropdown remains scrollable while hovering emoji items

Tests should focus on user behavior, not package internals.

## Implementation Boundaries

Likely files affected:

- memorable-day modal component/UI
- memorable-day styles
- picker adapter/helper
- tests for memorable-day modal behavior

This feature should not require:

- backend route changes
- memorable-day table changes
- preference schema changes

## Risks

### Package Shape Drift

Risk: third-party package shape changes.

Mitigation: isolate it behind one adapter file.

### Layout Regressions

Risk: picker dropdown or top-row layout breaks at medium widths.

Mitigation: add viewport-specific tests and keep the layout rule broad rather than one-off.

### Performance

Risk: full emoji dataset causes sluggish filtering.

Mitigation: memoize normalized data and filtered views.

## Acceptance Criteria

- The memorable-day emoji control no longer uses the current fake emoji picker
- The emoji chip remains to the right of the date field across supported modal widths
- The custom dropdown follows design-system surface and hover rules
- Users can search all emojis by name/keywords
- Users can browse by labeled categories
- Recent emojis exist for the current session only
- Reopening the picker restores last browsing position/state in the session
- Selecting an emoji closes the picker and updates the form immediately

