# Project Guidelines

## Code Style

- **ES Modules** — All source files use `import`/`export` syntax with explicit `.js` extensions. No CommonJS.
- **Semicolons required** — Enforced by ESLint. Always terminate statements with `;`.
- **Final newline** — All files must end with a newline (enforced by ESLint `eol-last`).
- **Named exports only** — Use `export function` / `export async function`. No default exports.
- **camelCase** — Functions and variables use camelCase. Constants for limits/thresholds use UPPER_SNAKE_CASE.
- **Async/await** — Use `async`/`await` for all I/O and network operations. Avoid raw promises.

## Architecture

- **`scum-bot.js`** — Entry point. Sets up SFTP polling loop and initializes the Discord client.
- **`controllers/`** — Core logic modules:
  - `cache.js` — In-memory and JSON-file persistence for player data.
  - `discord.js` — Discord client setup, slash commands, and message dispatch.
  - `logs.js` — SFTP log file tailing, line parsing, and event routing.
  - `players.js` — Player record management and formatting.
  - `serverStatus.js` — TCP port check for server status.
  - `text.js` — Pure parsing functions for SCUM log lines (login, chat, admin, kill).
- **`config.js`** — Loads and exports environment variables from `.env`.
- **`data/players.json`** — Persistent store of known players.
- **`test/`** — Test files mirroring controllers.

## Build and Test

```bash
npm install           # Install dependencies
npm test              # Run tests (Node.js built-in test runner)
npm run lint          # Run ESLint
node scum-bot.js      # Start the bot
```

## Conventions

- **Logging** — Use `console.log`/`console.warn`/`console.error` with bracketed context prefixes (e.g., `[DISCORD]`, `[LOGIN]`, `[SFTP]`). Use emoji for visual scanning (✅, ❌, ⚠️).
- **Error handling** — Wrap async operations in try/catch. Log errors with `console.error` and return safe fallback values (e.g., offline status string, empty array).
- **In-memory state** — Use `Map`, `Set`, or plain objects for caches. Persist via `writeFileSync` in `cache.js`.
- **Discord partials** — Always use the `Partials` enum (e.g., `Partials.Channel`), not magic strings.
- **Duplicate suppression** — The `sendToDiscord()` function accepts `{ suppressDuplicates: false }` to bypass duplicate checking for critical messages (e.g., login events).
