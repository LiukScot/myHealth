# Issue 44 Design: Memorable Days

## Goal

Add a new "Giorni memorabili" feature for tracking birthdays, anniversaries, and special events.

The feature must:

- follow the existing design system
- provide a desktop monthly calendar plus a stacked list
- provide a mobile list-only view with a floating add button
- support `one-time`, `monthly`, and `yearly` recurrence per item
- surface matching anniversaries on the dashboard
- expose a birthday field in Settings that creates a locked derived memorable day

## Product Decisions

### Recurrence model

Each memorable day stores its own recurrence mode:

- `one-time`
- `monthly`
- `yearly`

This is required because the issue explicitly needs both classic yearly dates (such as birthdays) and monthly anniversary behavior (such as "22 months since marriage").

### Birthday source of truth

Birthday is entered in Settings and is the only editable source of truth for the user's birthday.

The memorable-days feature must not create a second editable birthday record. Instead, the backend derives a locked memorable-day item from the birthday field and returns it alongside saved memorable-day rows.

### Create/edit scope

Version 1 includes:

- create memorable day
- edit memorable day
- delete memorable day

Birthday remains locked inside the memorable-days UI and is only editable from Settings.

## UX Design

### Desktop layout

The screen uses two columns:

- left column, larger: monthly calendar
- right column, smaller: stacked scrollable list of all memorable days

Calendar behavior:

- previous-month and next-month controls
- day cells can display memorable-day markers
- each day cell includes a small add button
- clicking the add button opens the create/edit popup with that date prefilled
- clicking an existing marker or relevant day opens the popup in edit/read mode

List behavior:

- items appear in a vertically stacked scrollable area
- clicking an item moves the calendar to the relevant month and highlights the selected date

### Mobile layout

On mobile, the calendar disappears completely.

Only the stacked memorable-days list remains visible. A floating add button is shown in the lower-right corner. That floating button opens the same popup used on desktop.

Mobile create behavior:

- floating add button prefills today's date by default
- tapping an existing list item opens edit mode

### Modal / popup

One popup handles both create and edit flows.

Fields:

- date
- title
- emoji
- description
- recurrence mode

Actions:

- save
- delete (only for saved non-birthday items)
- cancel

Birthday item behavior:

- visible in calendar/list if a birthday exists
- visually consistent with the design system
- may include a subtle locked hint
- cannot be edited or deleted from this popup

### Dashboard

Matching memorable-day anniversaries appear at the top of Dashboard, above `Averages`.

These cards must reuse the same visual language and general format as the existing averages cards rather than introducing a new card system.

Example outputs:

- `22 months since wedding`
- `31 years since birth`

## Design-System Constraint

All new UI must follow the existing design system.

Implementation rules:

- reuse existing spacing rhythm, panel shells, field styles, and button language
- prefer broad reusable CSS rules instead of tightly targeted one-off selectors
- reuse existing dashboard card patterns for anniversary cards
- avoid introducing a visually separate mini-product inside the app

## Data Model

### New memorable-days table

Add a new `memorable_days` table with:

- `id`
- `userId`
- `date` (anchor date in `YYYY-MM-DD` format)
- `title`
- `emoji`
- `description`
- `repeatMode` (`one-time | monthly | yearly`)
- `createdAt`
- `updatedAt`

Notes:

- `date` is the original anchor date used to compute recurrence and elapsed months/years
- `repeatMode` drives both calendar matching and dashboard anniversary visibility

### Birthday storage

Add a birthday field to the existing user settings/profile data model.

This can live in the preferences/profile storage already used by Settings, but it must remain a single authoritative value rather than a duplicated memorable-day row.

## Backend Design

### API endpoints

Add memorable-days REST endpoints:

- `GET /api/v1/memorable-days`
- `POST /api/v1/memorable-days`
- `PUT /api/v1/memorable-days/:id`
- `DELETE /api/v1/memorable-days/:id`

### GET response behavior

The GET route returns:

- all saved memorable-day rows for the authenticated user
- one derived locked birthday item if the user has a birthday configured

The frontend should not need separate birthday-fetch logic for this feature.

### Derived birthday item

Derived birthday item rules:

- generated from Settings birthday value
- included in list/calendar/dashboard calculations
- marked as locked/derived so UI can disable edit/delete
- never persisted as a second memorable-day row

### Recurrence helpers

Create helper functions for:

- determining whether an item matches a specific calendar month/day
- determining whether an item matches today for dashboard display
- formatting elapsed time text for monthly/yearly anniversaries

Rules:

- `one-time`: matches exact date only
- `monthly`: matches same day number each month after anchor date
- `yearly`: matches same month/day each year after anchor date

Elapsed-time display:

- monthly recurring items display elapsed whole months from anchor date
- yearly recurring items display elapsed whole years from anchor date
- one-time items do not require monthly/yearly elapsed text unless product later adds it

## Frontend Architecture

### Hook

Add a dedicated memorable-days hook responsible for:

- fetching memorable days
- create/update/delete mutations
- cache invalidation
- exposing UI-friendly derived data for calendar/list/dashboard

Settings birthday save must also invalidate the memorable-days query because the derived birthday item depends on it.

### Data shaping

Frontend should derive:

- month-visible items and day markers for desktop calendar
- globally sorted list items for desktop/mobile pile
- today's anniversary cards for dashboard

### Screen integration

Add a new screen section for memorable days and a new Settings subsection for birthday.

The new screen must integrate with existing panel/shell patterns already used in the app.

## Error Handling

### Validation

Backend validation rejects:

- invalid date
- invalid recurrence mode
- empty title

Frontend validation should block obviously invalid submission before request when practical.

### Locked birthday behavior

Birthday item must not allow accidental destructive actions.

UI options:

- hide delete/edit controls for birthday inside popup
- or show disabled controls with a short hint

### Empty states

If no memorable days exist:

- desktop still shows calendar shell with no markers
- desktop/mobile list shows empty state
- mobile still shows floating add button

## Testing Strategy

### Backend tests

Add tests for:

- create memorable day
- update memorable day
- delete memorable day
- derived birthday item appears when birthday exists
- recurrence matching for `one-time`
- recurrence matching for `monthly`
- recurrence matching for `yearly`
- dashboard anniversary formatting for elapsed months/years

### Frontend / end-to-end tests

Add tests for:

- desktop shows calendar and list together
- mobile hides calendar and shows floating add button
- desktop day add button prefills clicked date
- clicking list item moves desktop calendar to correct month/day
- create flow works
- edit flow works
- delete flow works
- dashboard shows anniversary card on matching day
- birthday item is editable only through Settings

### Regression tests

Verify existing behavior still works:

- Settings save continues to work for existing preferences
- Dashboard averages remain unchanged when no memorable days are present

## Risks

Primary risks:

- recurrence date math edge cases
- duplicate birthday rendering if derived and persisted paths mix
- mobile/desktop divergence if both use separate popup logic
- visual drift from the existing design system

Mitigations:

- centralize recurrence helpers
- keep birthday derived-only
- use one shared popup component
- style by extending existing system classes and patterns

## Recommended Implementation Order

1. Add schemas, DB migration, and backend helpers for memorable days and birthday.
2. Add backend routes and tests.
3. Add frontend hook and query invalidation behavior.
4. Add Settings birthday field.
5. Add memorable-days screen with desktop layout.
6. Add mobile list-only behavior and floating add button.
7. Add dashboard anniversary cards.
8. Run regression and responsive verification.
