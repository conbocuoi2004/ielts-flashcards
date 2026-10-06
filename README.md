# IELTS Flashcards

React + Express app for IELTS vocabulary and Leitner spaced repetition (1 → 3 → 7 → 14 days). The web app persists topics, custom words, IELTS targets and review progress in **PostgreSQL**. The Windows Electron app continues to store data locally and work offline.

## Docker deployment

```bash
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD to a long random password.
# For HTTPS/Cloudflare Tunnel, set COOKIE_SECURE=true.
docker compose up -d --build
curl -f http://localhost:8080/api/health
```

Open http://localhost:8080. PostgreSQL is internal to the Compose network; port 5432 is not published. Data lives in the named `postgres_data` volume. Restarting or recreating containers, and `docker compose down` without `-v`, preserve it. **Do not run `docker compose down -v` if you want to retain your data.**

Each browser has a separate learning profile identified by an HttpOnly cookie. On its first visit after this upgrade, existing `ielts-flashcards-v1` and `ielts-settings-v1` localStorage data are imported into that profile. Empty topic lists are imported too. Once a profile exists, the database is authoritative; old browser data does not overwrite it. A local backup is kept when editing, and failed saves display a retry notice. Wait for “Đã lưu vào database” before closing the page.

There is no login or cross-device sync yet. Clearing cookies or moving to another browser creates another profile; it does not delete the previous database row, but that browser no longer has its access cookie. Concurrent edits from multiple tabs are rejected with a conflict notice rather than silently overwriting progress. Use “Tải bản sao” to download unsaved data before reloading the tab. When database data replaces a different local snapshot on startup, that snapshot is retained under `ielts-flashcards-recovery-v1` in localStorage.

## Local development

```bash
cp .env.example .env
# Set POSTGRES_PASSWORD and DATABASE_URL for your local PostgreSQL instance.
# PostgreSQL must be reachable at the host/port in DATABASE_URL.
cd server
npm ci
npm run dev                  # Node >=20.6; reads ../.env
# In another terminal:
cd client
npm ci
npm run dev                  # http://localhost:5173
```

If you do not have PostgreSQL installed, run a separate development container with matching credentials:

```bash
docker run -d --name flashcards-dev-db \
  -e POSTGRES_DB=flashcards -e POSTGRES_USER=flashcards \
  -e POSTGRES_PASSWORD='YOUR_RANDOM_PASSWORD' \
  -p 127.0.0.1:5432:5432 -v flashcards_dev_data:/var/lib/postgresql/data \
  postgres:17-alpine
```

Production requires `DATABASE_URL`. Compose uses `PGUSER`/`PGPASSWORD` environment variables so special characters in its password do not need URI encoding. For a full connection URI (local development or Render), URL-encode the password. Schema creation is idempotent on startup. `/api/health` returns 503 if the database cannot be reached.

## Backup and restore

```bash
# Backup; contains vocabulary and browser-profile data. Keep it private.
docker compose exec -T db pg_dump -U flashcards -d flashcards -Fc > flashcards.dump
# Restore into an empty database (stop the app while restoring):
docker compose stop app
docker compose exec -T db pg_restore -U flashcards -d flashcards < flashcards.dump
docker compose start app
```

Do not restore over existing tables without planning their replacement. Changing `POSTGRES_PASSWORD` in `.env` does not change the password of an already initialized PostgreSQL volume; rotate it in PostgreSQL too.

## Tests

```bash
cd server
npm ci
npm test
```

Tests verify migration, restart persistence, profile isolation, conflict rejection, invalid requests and serialized client saves. Without `DATABASE_URL`, tests use PostgreSQL WASM (PGlite) in a temporary directory. With `DATABASE_URL`, tests use real PostgreSQL and random isolated profile IDs, cleaning them up afterwards. GitHub CI uses a PostgreSQL 17 service.

## CI/CD, Harbor and Render

The existing workflow builds/tests pull requests. Merging to `main` triggers image build/push and deployment on the existing self-hosted runner. On first deployment, the workflow generates a private random `POSTGRES_PASSWORD` in `~/ielts-flashcards/.env` if none is configured and no database volume exists. The file is readable only by its owner; the password is not logged. Existing passwords are retained. If a database volume exists but its password is missing, deployment stops so the original password can be restored. Back up existing browser data before the upgrade. The workflow validates the Compose configuration, copies the updated file and deploys the immutable commit image with its PostgreSQL service. For manual Harbor deployment set `APP_IMAGE` in `.env` to the image tag, then run `docker compose pull && docker compose up -d --no-build`.

For Render, supply `DATABASE_URL` for an external PostgreSQL database when creating the Blueprint; no paid database is provisioned automatically.

## Seed vocabulary and desktop

Edit `server/data/words.json` to change the seed for new profiles. Existing profiles keep their data; the ↺ action restores seed vocabulary for the current profile and resets word progress. IELTS targets are retained.

The *Build Desktop App (Windows)* workflow packages the offline Electron app. Web PostgreSQL integration does not require PostgreSQL for that desktop build.
