# Discord Forum → GitHub Issues Bot

Turn Discord **Forum channels** into a full bug / suggestion management system,
with **GitHub Issues as the single source of truth**.

- Community users stay in Discord — they never touch GitHub.
- Developers keep working in GitHub — they never touch Discord.
- Every forum thread maps to exactly **one** GitHub issue, kept in sync **bidirectionally**.

> Status: **early**. Issue sync works both ways (thread → issue creation with a
> persistent status embed, and GitHub → Discord embed updates), and moderators can
> drive status / priority / assignee / version from select menus on the embed.
> Comments mirror both ways, and linked PRs and releases surface on the embed
> (with auto status on merge). Voting and duplicate detection are still to come.

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

## Moderator actions (no slash commands)

The embed carries **select menus** — Status, Priority, and (when configured)
Assign and Set version. A moderator picks a value and the bot applies it on
GitHub, then the embed refreshes:

- **Status / Priority** swap the single `status:*` / `priority:*` label (any
  previous one is removed — only one may exist at a time).
- **Assign** sets the GitHub assignee; **Set version** sets the milestone.

Access is gated to `moderation.roleId` if set, otherwise to members with the
**Manage Threads** permission. Assignees and versions come from the
`moderation` block in `config.yaml`.

## Comment mirroring

Thread replies and GitHub issue comments mirror each other:

- A reply in the thread becomes a GitHub issue comment (`💬 name _(via Discord)_`).
- A GitHub comment becomes a thread message (`💬 login _(via GitHub)_`).

Echo loops are broken by author identity: the bot ignores its own Discord
messages, and skips GitHub comments created by its own App. The thread's starter
message is never mirrored (it is already the issue body). Configure via the
`comments` block — `discordToGithub` (`everyone` / `maintainers` / `disabled`)
and `githubToDiscord` (`all` / `disabled`).

## Linked PRs & releases

When a pull request closes an issue (`Fixes #184`, `Closes #184`, `Resolves
#184`), the embed gains a **Pull Request** field. On merge it shows **Merged**,
and if `workflow.mergedStatus` is set the issue's status label is swapped to it
automatically. When a release's notes reference the issue or its fixing PR, the
embed shows **Released in vX**. (Auto-locking the thread some days after a
release is not implemented yet.)

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
- [x] GitHub → Discord embed sync (issue labels / assignees / milestone / state)
- [x] Moderator select-menu actions (status, priority, assignee, version)
- [x] Comment mirroring (Discord replies ↔ GitHub comments)
- [x] Linked PRs (`Fixes #N` → PR field + auto status on merge) & release tags
- [ ] Voting · duplicate detection · GitHub Projects column sync
- [ ] Auto-lock threads N days after release

## License

MIT — see [LICENSE](LICENSE).
