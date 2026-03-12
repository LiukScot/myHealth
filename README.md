# myHealth

A personal health tracking app for logging daily mood, pain, and habits — with an AI assistant powered by Mistral.

**Features:**

- Mood diary (mood, depression, anxiety levels + free text)
- Pain journal (pain area, symptoms, activities, medicines, habits, and more)
- Graphs and history over time
- AI chat that reads your health data and answers questions about it
- Backup and restore your data

---

## Running with Docker (recommended)

The easiest way to run myHealth is with Docker.

**Prerequisites:** [Docker](https://docs.docker.com/get-docker/) and a running Redis instance.

1. Copy the example env file and fill in your values:

   ```bash
   cp .env.example .env
   ```

   The only required value is `REDIS_URL` (e.g. `redis://127.0.0.1:6379`).

2. Start the app:

   ```bash
   docker compose up --build -d
   ```

3. Create your user account:

   ```bash
   docker exec myhealth bun --cwd backend src/user-cli.ts create \
     --email=you@example.com \
     --password=YourPassword \
     --name=YourName
   ```

4. Open [http://localhost:5555](http://localhost:5555) and log in.

---

## Data & backup

Your data is stored in `data/myhealth.sqlite`. The app runs migrations automatically on startup — no manual steps needed.

To back up or restore your data:

```bash
npm run backup          # creates a backup of the DB
npm run restore         # restores from a backup file
```

You can also export and import data as JSON or Excel from within the app itself (Settings → Backup).

---

## AI assistant

The AI chat uses the [Mistral API](https://mistral.ai). To enable it, add your Mistral API key in the app under **Settings → AI**.
