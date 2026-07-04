# Discord Forum → GitHub Issues Bot

Turn Discord **Forum channels** into a full bug / suggestion management system,
with **GitHub Issues as the single source of truth**.

- Community users stay in Discord — they never touch GitHub.
- Developers keep working in GitHub — they never touch Discord.
- Every forum thread maps to exactly **one** GitHub issue, kept in sync **bidirectionally**.

> Status: **early**. Thread → issue creation with a persistent status embed is
> implemented; the reverse GitHub → Discord sync and moderator actions are stubbed
> (see `// TODO` markers and the roadmap).

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

## What happens when a thread is created

1. A user opens a post in a mapped forum channel.
2. `ThreadCreate` → `SyncService.onThreadCreated` resolves the forum from
   `config.yaml` (by `channelId`) and skips anything already linked.
3. The starter message becomes the issue body (`Reported from Discord`, thread
   URL, reporter, then the content).
4. A GitHub issue is created via the **GitHub App installation** for the repo,
   with `defaultLabels` + the applied Discord tag names.
5. A persistent **status embed** is posted in the thread and the
   thread ⇄ issue link is stored (`IssueLink`) for future edits.

## Tech stack

Node.js 22+ · TypeScript · discord.js v14 · Octokit (GitHub App) · Express
(webhooks) · Prisma ORM · SQLite (Postgres optional) · Pino · Zod · Docker.

## Project layout

```
src/
├── index.ts                 # bootstrap: db + webhook server + discord login
├── config/                  # env (Zod) + config.yaml loader
├── logger.ts                # Pino
├── db/                      # Prisma client
├── discord/
│   ├── index.ts             # discord.js client + event wiring
│   ├── forum-thread.ts      # forum guards, starter message, tag → label
│   └── embeds/issue-embed.ts# persistent status embed
├── github/
│   ├── index.ts             # GitHub App + per-repo installation client
│   ├── issues.service.ts    # create issue
│   └── issue-body.ts        # issue body formatting
├── sync/
│   ├── sync.service.ts      # thread → issue orchestration
│   └── status.ts            # workflow label ↔ status resolution
└── webhooks/                # Express server for GitHub webhooks
prisma/schema.prisma         # Guild / Repository / Forum / IssueLink
config.example.yaml          # forum → repo mapping + status workflow
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
  (see `config.example.yaml`). Each forum needs the Discord **`channelId`** of
  its forum channel (enable Developer Mode → right-click the channel → Copy
  Channel ID). `config.yaml` is git-ignored.

You need a **GitHub App** (not a Personal Access Token) installed on the target
repositories with **Issues: read & write** permission, plus a Discord bot with
the **Message Content** intent (to read the starter message).

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

- [x] Thread → GitHub issue creation
- [x] Persistent status embed in the thread
- [x] Default labels + Discord tag → label mapping
- [ ] GitHub → Discord sync (webhook server currently logs only)
- [ ] Button / select-menu actions (status, assignee, priority, version)
- [ ] Comment mirroring · linked PRs & releases
- [ ] Voting · duplicate detection · GitHub Projects column sync

## License

MIT — see [LICENSE](LICENSE).
