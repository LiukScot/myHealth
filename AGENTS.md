# Agent instructions

## Layout spacing (`--layout-*`)

- **Source of truth:** spacing tokens live in `frontend/src/styles.css` under `:root` as `--layout-tight`, `--layout-inline`, `--layout-stack`, etc. The in-app **Design System** page documents them with the same names (see `frontend/src/app/screens.tsx`, spacing list).
- **Always use these tokens** for margin, padding, gap, and related rhythm in app CSS — not ad-hoc `px`/`rem` values, not Tailwind spacing utilities, unless you are mirroring tokens already defined for utilities or the user explicitly asks otherwise.
- **Prefer an existing `--layout-*` token** that fits the rhythm. — do not scatter one-off magic numbers.
- **`calc()`:** do **not** introduce `calc(...)` for spacing (including `calc(var(--layout-*) ± …)`) or new tokens unless the **user explicitly asks** for that. 

## Scope

These rules apply to layout and spacing work in this repo’s frontend (and any shared CSS). They do not override security, accessibility, or type-safety requirements elsewhere in the project.
