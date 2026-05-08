# Self-Hosted App

Multi-provider calendar sync for users who prefer to run their own instance.

## Planned stack

| Layer | Technology |
|---|---|
| Frontend + API | Next.js (TypeScript) |
| Database | PostgreSQL (prod) / SQLite (dev) via Prisma |
| Auth | OAuth2 per provider (Google, Microsoft, CalDAV) |
| Scheduling | node-cron or BullMQ |
| Deployment | Docker + docker-compose |

## Supported calendar providers (planned)

| Provider | Package |
|---|---|
| Google Calendar | `googleapis` |
| Microsoft Outlook | `@microsoft/microsoft-graph-client` |
| Apple Calendar / CalDAV | `tsdav` |

## TODO
- [ ] Set up Next.js project with TypeScript
- [ ] Prisma schema — users, calendars, sync configs, run history
- [ ] OAuth2 flows per provider
- [ ] Port setup UI from Sidebar.html
- [ ] Implement sync engine using packages/core
- [ ] Docker + docker-compose configuration
- [ ] Self-hosted deployment guide
