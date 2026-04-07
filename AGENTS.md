## Learned User Preferences

- When styling is tweaked in Cursor’s browser preview, persist those changes in the real source (typically `frontend/src/styles.css` or component styles), not only in the preview.

## Learned Workspace Facts

- Default `docker compose up -d --build` starts the `health` service; the app listens on port 5555 with host networking, and SQLite lives under `./data` mounted into the container. The Compose `frontend` service is behind the `dev` profile (`docker compose --profile dev up -d`).
- The backend Docker image runs `bun install` from `backend/package.json` only. Runtime dependencies such as `@modelcontextprotocol/sdk` must be declared in `backend/package.json` (and lockfile updated); listing them only at the repo root can leave the container crash-looping before the server binds to 5555.
- For GitHub API or issue workflows tied to this checkout, resolve `owner` and `repo` from `git remote get-url origin` instead of assuming names.
