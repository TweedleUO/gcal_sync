# Google Workspace Marketplace App

Hosted calendar sync app — users install from the Marketplace, no code setup required.

## Planned stack

| Layer | Technology |
|---|---|
| Frontend + API | Next.js (TypeScript) on Cloud Run |
| Database | Firestore |
| Auth | Firebase Auth (Google + Microsoft OAuth2) |
| Scheduling | Cloud Scheduler |
| Calendar webhooks | Cloud Pub/Sub |
| Secrets | Secret Manager |

## TODO
- [ ] Set up Next.js project
- [ ] Configure Firebase Auth with Google and Microsoft providers
- [ ] Define Firestore data model (users, configs, sync state, run history)
- [ ] Port Sidebar.html setup UI to Next.js
- [ ] Implement sync engine using packages/core
- [ ] Set up Cloud Scheduler for per-user sync jobs
- [ ] Set up Google Calendar push notification webhooks via Pub/Sub
- [ ] Deploy to Cloud Run
- [ ] Register and submit to Google Workspace Marketplace
