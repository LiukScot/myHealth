# myHealth (Bun + React)

Standalone myHealth project running on port `8000`.

## Stack

- Backend: Bun + TypeScript + SQLite + Redis sessions
- Frontend: React + TypeScript + Vite
- Auth: cookie sessions (`MYHEALTH_SESSID`) with Redis key prefix `myhealth:sess:`

## Quick start

1. Install deps:
   - `npm install`
   - `npm --prefix backend install`
   - `npm --prefix frontend install`
2. Set env (minimum):
   - `REDIS_URL=redis://127.0.0.1:6379`
3. Run migrations:
   - `npm run migrate`
4. Create first user:
   - `npm run user -- create --email=you@example.com --password='StrongPass123' --name='You'`
5. Run backend and frontend (separate terminals):
   - `npm run dev:backend`
   - `npm run dev:frontend`

## Legacy migration from old myTools DB

- Source DB default: `./data/mytools.sqlite`
- Target DB default: `./data/myhealth.sqlite`

Run:

```bash
MIGRATION_PRIMARY_EMAIL=you@example.com npm run migrate:legacy -- --fresh
```

This writes a migration report to `data/myhealth-migration-report.json`.

## Data operations

- Backup DB: `npm run backup`
- Restore DB: `npm run restore -- --file=/absolute/path/to/backup.sqlite`

## Docker

- Build/run:
  - `docker compose up --build -d`
- Required env:
  - `REDIS_URL` (external Redis)

## Rollback helpers

- `rollback/legacy-runtime.tar.gz` stores pre-migration runtime snapshot.
- `scripts/rollback-runtime.sh` restores legacy files from that archive.
