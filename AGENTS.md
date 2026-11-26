# AGENTS.md — freddy

Deployment repo for **freddy**, the household app server (Tailscale 100.106.65.55): Nextcloud, LifeOS, Uptime Kuma, managarr, Audiobookshelf, Home Assistant, PhotoPrism and more, all in one `docker-compose.yml`. Application code lives in each app's own repo; this repo describes how everything runs on the box.

## Shared context

Read the shared agent context first: `soul.md` and `memory.md` (especially §1–§3) in the [agents repo](https://github.com/nuniesmith/agents).

## Deploy rules (a merge here is a production event)

- **A merge of any non-doc file to main redeploys the WHOLE house** — every container recreated. Markdown and `docs/**` are `paths-ignore`d in `ci-cd.yml`; anything else is not. Batch changes; never merge a freddy change casually.
- For a single service's new image, use the **Service Update** workflow instead (`update-service.yml`: inputs `image`, `revision` = full commit SHA, `services` = space-separated compose services). That's how managarr and LifeOS images normally roll out.
- **Verify the service, not the workflow.** A deploy here has printed ✅ while starting zero containers, and a stale `docker login` in the shared `actions` account once emptied freddy for 17 minutes. After a deploy: check the container, its image revision label, and its health — on the box.
- Never `docker login` into the shared deploy account's default config. Pull images **before** stopping a stack. Check an image's architecture before deploying it (arm64-only tags exist).

## Traps

- Nextcloud is pinned to `32-apache`; building FROM `stable` is a trap.
- `daemon.json` sets `no-new-privileges` for every container: sudo never works inside containers. Don't design around it.
- LifeOS's compose services live here now (since 2026-10-09), with freddy CI injecting its secrets and running its migrations one-shot before `up`.
- Daily host updates run from the `actions` repo composite (09:47 UTC); major upgrades of no-rollback services are held back unless dispatched with `allow_major`.
