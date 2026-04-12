# Health

A personal health tracking app for logging daily mood, pain, and habits — with optional AI assistance via the Model Context Protocol (MCP).

**Features:**

- Mood diary (mood, depression, anxiety levels + free text)
- Pain journal (pain area, symptoms, activities, medicines, habits, and more)
- CBT thought records and DBT distress tolerance entries
- Graphs and history over time
- Built-in MCP server: connect any MCP-compatible AI client (Claude Desktop, Claude Code, …) and let it read your health data with full-text search and aggregate statistics
- Backup and restore your data

---

## Development

Use Bun as the package manager for local development.

Install dependencies once:

```bash
bun run setup
```

For day-to-day development, use the root dev command:

```bash
bun run dev
```

This starts the backend in Docker using the dev override and runs the frontend with Vite locally for fast hot reload. Open [http://localhost:5555](http://localhost:5555) and keep using that URL while you edit both backend and frontend files.

The frontend dev server still binds locally on port `5173` for Vite's internal HMR connection, but you do not need to browse to that port during normal development.

To stop the backend container after a dev session:

```bash
bun run dev:stop
```

---

## Running with Docker (recommended)

For a production-style local run, use Docker directly.

**Prerequisites:** [Docker](https://docs.docker.com/get-docker/).

1. Copy the example env file and fill in your values:

   ```bash
   cp .env.example .env
   ```

2. Start the app:

   ```bash
   docker compose up --build -d
   ```

3. Create your user account:

   ```bash
   docker exec health bun --cwd backend src/user-cli.ts create \
     --email=you@example.com \
     --password=YourPassword \
     --name=YourName
   ```

4. Open [http://localhost:5555](http://localhost:5555) and log in.

---

## Data & backup

Your data is stored in `data/health.sqlite`. The app runs migrations automatically on startup — no manual steps needed.

To back up or restore your data:

```bash
bun run backup          # creates a backup of the DB
bun run restore         # restores from a backup file
```

You can also export and import data as JSON or Excel from within the app itself (Settings → Backup).

---

## MCP server (AI assistant)

Health exposes a built-in MCP server on `/mcp` that lets any MCP-compatible AI client read your health data over an authenticated HTTPS connection. Tools are read-only — the AI can search, list, and aggregate but cannot create or modify entries.

### What the AI can do

- **Diary**: list entries, full-text search, aggregate stats (avg mood / depression / anxiety per period)
- **Pain**: list entries, full-text search, aggregate stats, configured body areas
- **CBT thought records**: list entries, full-text search across all reflective fields
- **DBT distress tolerance**: list entries, full-text search
- **Cross-cutting**: high-level overview snapshot, Pearson correlations between any two daily-aggregated signals (e.g. *does coffee correlate with anxiety?*)
- **Schema doc**: a `health://schema` resource explaining each table, scale direction, and value semantics so the AI can interpret numbers correctly

Search uses SQLite FTS5 with Unicode and accent-insensitive matching — search for `ansia` and you'll find `ansìa` too.

### Setup

1. Open the app, go to **Settings → MCP Access**, and click **Create new token**.
2. Choose a label and an expiry (`Never` / `30 days` / `90 days` / `1 year`), then click **Create token**.
3. Copy the token immediately — it is shown **only once** and not stored in cleartext anywhere.
4. Add the server to your MCP client configuration. For Claude Desktop, edit `claude_desktop_config.json`:

   ```json
   {
     "mcpServers": {
       "health": {
         "url": "https://your-host/mcp",
         "headers": { "Authorization": "Bearer <your token>" }
       }
     }
   }
   ```

   For Claude Code:

   ```bash
   claude mcp add --transport http health https://your-host/mcp \
     --header "Authorization: Bearer <your token>"
   ```

5. Restart the client. Try a prompt like *"How many diary entries did I have last week with mood below 5?"*

The Settings UI also offers ready-to-copy snippets for Claude Desktop, Claude Code, and a curl health-check command.

### Token management

- Tokens are stored as SHA-256 hashes — the cleartext is never persisted server-side.
- Each token has an optional expiry (`expires_at`) and tracks `last_used_at` for observability.
- Revoke a token at any time from **Settings → MCP Access**.
- Authentication failures (missing token, invalid token, expired token) all return `401 Unauthorized`.
