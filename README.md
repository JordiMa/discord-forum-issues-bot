# Discord Forum → GitHub Issues Bot

Turn Discord **Forum channels** into a full bug / suggestion management system,
with **GitHub Issues as the single source of truth**.

- Community users stay in Discord — they never touch GitHub.
- Developers keep working in GitHub — they never touch Discord.
- Every forum thread maps to exactly **one** GitHub issue, kept in sync **bidirectionally**.

> Status: **early scaffold**. The architecture, database schema, config, and module
> skeletons are in place; the sync logic is stubbed (see `// TODO` markers).

## Architecture

```
Discord Forum
      │
      ▼
  Discord Bot ── Discord module
              ── GitHub module
              ── Sync service
              ── Database (Prisma)
              ── GitHub webhook server
                        │
                        ▼
                   GitHub App ──► Issues + Projects
```

Each forum thread ⇄ one GitHub issue. Status is driven by a single `status:*`
label at a time; changing it in Discord updates GitHub and vice-versa.

## Tech stack

Node.js 22+ · TypeScript · discord.js v14 · Octokit (GitHub App) · Express
(webhooks) · Prisma ORM · SQLite (Postgres optional) · Pino · Zod · Docker.

## Project layout

```
src/
├── index.ts              # bootstrap: db + webhook server + discord login
├── config/               # env (Zod) + config.yaml loader
├── logger.ts             # Pino
├── db/                   # Prisma client
├── discord/              # discord.js client + event wiring
├── github/               # Octokit GitHub App wrapper
├── webhooks/             # Express server for GitHub webhooks
└── sync/                 # bidirectional reconciliation (stub)
prisma/schema.prisma      # Guild / Repository / Forum / IssueLink
config.example.yaml       # forum → repo mapping + status workflow
```

## Getting started

```bash
cp .env.example .env            # fill in Discord + GitHub App credentials
cp config.example.yaml config.yaml
npm install
npm run prisma:migrate          # create the SQLite database
npm run dev                     # start with hot reload (tsx)
```

Production:

```bash
npm run build && npm start
# or
docker compose up --build
```

## Configuration

- **`.env`** — secrets and runtime settings (see `.env.example`).
- **`config.yaml`** — forum-to-repository mapping and the status workflow
  (see `config.example.yaml`).

You need a **GitHub App** (not a Personal Access Token) with permissions on
Issues, Projects, Pull Requests, and webhook events, plus a Discord bot token
with the Message Content intent.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start with hot reload (tsx) |
| `npm run build` | `prisma generate` + `tsc` → `dist/` |
| `npm start` | Run the compiled build |
| `npm run typecheck` | Type-check without emitting |
| `npm run format` | Prettier |
| `npm run prisma:migrate` | Create/apply a dev migration |
| `npm run prisma:studio` | Open Prisma Studio |

## Roadmap

Thread → issue creation · persistent status embed · button/select-menu actions
(status, assignee, priority, version) · label ⇄ Discord-tag sync · comment
mirroring · linked PRs & releases · voting · duplicate detection · GitHub
Projects column sync.

## License

MIT — see [LICENSE](LICENSE).
