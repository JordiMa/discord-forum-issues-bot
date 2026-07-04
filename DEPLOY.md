# Deployment (NAS / self-hosted)

CI builds a multi-arch (`amd64` + `arm64`) image and pushes it to GHCR; the NAS
just pulls and runs it. The container runs `prisma migrate deploy` on start, so
the SQLite database is created and migrated automatically on the mounted volume.

## 1. Push to GitHub (triggers the image build)

```bash
git remote add origin git@github.com:JordiMa/discord-forum-issues-bot.git
git push -u origin main
```

`.github/workflows/docker.yml` builds and pushes `ghcr.io/jordima/discord-forum-issues-bot`
on every push to `main` (tags `latest` + short SHA) and on `v*` tags. Watch it in
the repo's **Actions** tab.

By default the GHCR package is **private**. Either make it public
(Package → Settings → Change visibility) or, on the NAS, log in first:

```bash
echo <GH_PAT_with_read:packages> | docker login ghcr.io -u JordiMa --password-stdin
```

## 2. Create the GitHub App

Settings → Developer settings → GitHub Apps → New. Then:

- **Permissions**: Issues *Read & write*, Pull requests *Read*, Contents *Read*
  (release events), Metadata *Read*.
- **Subscribe to events**: Issues, Issue comment, Pull request, Release.
- **Webhook**: URL `https://<your-domain>/github/webhook`, and a secret (→ `GITHUB_WEBHOOK_SECRET`).
- Generate a **private key** (PEM → `GITHUB_APP_PRIVATE_KEY`), note the **App ID**.
- **Install** the App on the target repositories.

## 3. Create the Discord bot

Discord Developer Portal → New Application → Bot:

- Enable the **Message Content** intent (privileged) — needed to mirror replies.
- Invite with scopes **`bot`** + **`applications.commands`** and permissions:
  View Channels, Send Messages, Send Messages in Threads, Embed Links,
  Read Message History, Use Application Commands.
- Copy the bot token (→ `DISCORD_TOKEN`), Application ID (→ `DISCORD_APP_ID`), and
  your server ID (→ `DISCORD_GUILD_ID`, optional but makes slash commands instant).

## 4. Run on the NAS

Create a folder with three files: `.env`, `config.yaml`, `docker-compose.deploy.yml`.

```bash
cp .env.example .env            # fill in the values above; set BOT_IMAGE
cp config.example.yaml config.yaml   # set forum channelIds, repo mapping, moderation
docker compose -f docker-compose.deploy.yml up -d
docker compose -f docker-compose.deploy.yml logs -f
```

The DB persists in the `bot-data` volume; `config.yaml` is mounted read-only.

## 5. Expose the webhook

GitHub must reach the container's webhook server (port `3000`, path
`/github/webhook`). Put it behind HTTPS with your NAS reverse proxy (Synology:
Login Portal → Reverse Proxy) or a Cloudflare Tunnel, then use that public URL as
the GitHub App webhook URL. Check health at `https://<your-domain>/health`.

## 6. Update

```bash
git push                                            # CI rebuilds the image
docker compose -f docker-compose.deploy.yml pull
docker compose -f docker-compose.deploy.yml up -d   # re-runs migrations on start
```
