<p align="center">
  <img src="./public/images/ogimage.jpg" alt="Tube Reply Banner" width="100%">
</p>

# Tube Reply

AI-powered YouTube comment management tool. Syncs comments from your channel, generates AI reply suggestions via Google Gemini, and publishes responses back to YouTube — all from a single private dashboard.

---

## Features

- **Comment sync** — pulls top-level comments from all channel videos via YouTube Data API v3
- **AI reply suggestions** — generated via Google Gemini or OpenAI, informed by your Knowledge Base
- **Language detection** — auto-detects comment language (20+ languages via `franc-min`), replies match
- **Video summaries** — AI-generated per-video summaries used as context for reply generation
- **Knowledge Base** — train the AI with channel style guides, FAQs, personas, topics, and custom rules
- **One-click publish** — approve and post replies directly to YouTube without leaving the app
- **Dismiss / skip** — clean up noise without publishing
- **Quota management** — tracks daily YouTube API quota, configurable cap
- **Rate limiting** — per-IP limits on login, suggestion, and publish endpoints
- **CSRF protection** — double-submit cookie pattern on all state-changing requests
- **PWA support** — installable web app with offline capabilities and custom icons

---

## Tech Stack

| Layer      | Tech                                  |
| ---------- | ------------------------------------- |
| Framework  | Nuxt 3                                |
| UI         | Vue 3 + @nuxt/ui + Tailwind CSS       |
| Database   | **SQLite** (better-sqlite3) + Drizzle |
| AI         | Google Gemini & OpenAI                |
| YouTube    | Google APIs OAuth2 (`googleapis`)     |
| Auth       | Session cookie + bcrypt password hash |
| Encryption | AES-256-GCM (token storage)           |
| PWA        | @vite-pwa/nuxt                        |

---

## Database Management

Tube Reply uses **SQLite** for its simplicity and portability. One of the core features is its **Auto-Migration System**:

- **No Manual Setup Required**: The app automatically detects if the database file exists.
- **Auto-Provisioning**: On the first run, it creates the database file and all necessary tables.
- **Zero-Config Migrations**: Every time the app starts, it checks for pending schema updates and applies them automatically. You don't need to run `npm run db:migrate` manually (although it's available for advanced use).

---

## Requirements

- Node.js 20+
- Google Cloud project with:
  - YouTube Data API v3 enabled
  - OAuth 2.0 credentials (Web application type)
- Google AI Studio API key (Gemini) or OpenAI API key

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

| Variable                          | Description                                              |
| --------------------------------- | -------------------------------------------------------- |
| `ADMIN_PASSWORD_HASH`             | bcrypt hash — generate with `npm run hash-password`      |
| `SESSION_DURATION_HOURS`          | Session TTL (default: `24`)                              |
| `DATABASE_URL`                    | SQLite file path (default: `./data/youtube.db`)          |
| `YOUTUBE_CLIENT_ID`               | OAuth2 client ID from Google Cloud Console               |
| `YOUTUBE_CLIENT_SECRET`           | OAuth2 client secret                                     |
| `YOUTUBE_REDIRECT_URI`            | Must match authorized redirect in Google Cloud Console   |
| `GEMINI_API_KEY`                  | Google AI Studio API key                                 |
| `GEMINI_MODEL`                    | Gemini model ID (e.g. `gemini-2.0-flash`)                |
| `OPENAI_API_KEY`                  | OpenAI API key                                           |
| `OPENAI_MODEL`                    | OpenAI model ID (e.g. `gpt-4o-mini`)                     |
| `AI_PROVIDER`                     | Default provider: `gemini` or `openai`                   |
| `TOKEN_ENCRYPTION_KEY`            | 64 hex chars (32 bytes) for AES-256-GCM token encryption |
| `SYNC_INTERVAL_MINUTES`           | Auto-sync interval (default: `60`)                       |
| `MAX_QUOTA_PER_DAY`               | YouTube API quota ceiling (default: `8500`)              |
| `RATE_LIMIT_LOGIN_MAX`            | Max login attempts per window (default: `5`)             |
| `RATE_LIMIT_LOGIN_WINDOW_MINUTES` | Login rate-limit window (default: `15`)                  |
| `LOCKOUT_DURATION_MINUTES`        | Lockout duration after failed logins (default: `30`)     |

**Generate secrets:**

```bash

# ADMIN_PASSWORD_HASH
npm run hash-password
```

### 3. Start development server

```bash
npm run dev
```

The database will be initialized and migrated automatically on start.
App runs at `http://localhost:3000`.

---

## Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project (or use existing)
3. Enable **YouTube Data API v3**
4. Create **OAuth 2.0 Client ID** → Web application
5. Add authorized redirect URI: `http://localhost:3000/api/youtube/callback` (or your production URL)
6. Copy Client ID and Client Secret to `.env`

---

## YouTube OAuth Scopes

The app requests:

- `https://www.googleapis.com/auth/youtube.readonly` — read videos and comments
- `https://www.googleapis.com/auth/youtube.force-ssl` — post comment replies

---

## Scripts

| Command                 | Description                                |
| ----------------------- | ------------------------------------------ |
| `npm run dev`           | Start dev server                           |
| `npm run build`         | Build for production                       |
| `npm run preview`       | Preview production build                   |
| `npm run db:migrate`    | Run pending DB migrations                  |
| `npm run db:generate`   | Generate new migration from schema changes |
| `npm run db:push`       | Push schema directly (dev only)            |
| `npm run hash-password` | Generate bcrypt hash for admin password    |

---

## Knowledge Base Types

| Type            | Purpose                                    |
| --------------- | ------------------------------------------ |
| `channel_style` | Tone, voice, and writing style guidelines  |
| `faq`           | Common questions and approved answers      |
| `topic`         | Subject matter context about your content  |
| `persona`       | The character/identity the AI should adopt |
| `rule`          | Hard rules (things to always/never say)    |
| `custom`        | Anything else                              |

Active entries are injected as context into every AI prompt.

---

## Security Notes

- Admin access is single-user via bcrypt-hashed password in `.env`
- YouTube OAuth tokens stored encrypted (AES-256-GCM) in SQLite
- All state-changing API routes protected by CSRF middleware
- Login endpoint has rate limiting + IP-based lockout
- Sessions are HTTP-only signed cookies

---

## Production Deployment

```bash
npm run build
node .output/server/index.mjs
```

Update `YOUTUBE_REDIRECT_URI` and all secrets in your production environment. Never commit `.env` to version control.
