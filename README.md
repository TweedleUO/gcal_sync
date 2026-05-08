# Calendar Sync

Automatically blocks busy time across your calendars — without copying private event details.

Connect Google Calendar, Outlook, Apple Calendar, and more. Keep your availability accurate everywhere, across as many calendars as you need.

---

## Deployment targets

| Target | Status | Description |
|---|---|---|
| [Apps Script](apps-script/) | Active | Self-deployed via Google Apps Script |
| [Marketplace app](marketplace/) | Planned | Install from Google Workspace Marketplace |
| [Self-hosted](self-hosted/) | Planned | Run your own instance, multi-provider support |

---

## Apps Script (current)

### Quick start (no coding tools required)

1. Open [script.google.com](https://script.google.com) and click **New project**
2. In the editor, click the `Code.gs` file and **replace all its contents** with the code from [`dist/Code.gs`](dist/Code.gs)
3. Click **+** next to Files → **HTML** → name it `Sidebar` (exactly) → **replace all its contents** with [`dist/Sidebar.html`](dist/Sidebar.html)
4. Enable the Calendar Advanced API:
   - Click **+** next to Services → search **Google Calendar API** → click **Add**
5. Deploy as a web app:
   - **Deploy → New deployment** → set type to **Web app**
   - Execute as: **Me** · Who has access: **Only myself** (or your org)
   - Click **Deploy** and copy the web app URL
6. Open the web app URL — the setup sidebar will guide you through adding calendars and activating sync

> **Note:** After any code update, go to **Deploy → Manage deployments**, click the pencil icon on your deployment, set version to **New version**, and save.

### Option A — clasp (recommended for developers)

```bash
npm install
cp .clasp.json.example .clasp.json
# add your Apps Script project ID to .clasp.json
npm run push
```

Then open your Apps Script project, deploy as a web app, and open the setup URL.

### Option B — bundle and paste (no clasp required)

1. Run `npm run bundle` to generate `dist/Code.gs` and `dist/Sidebar.html`
2. Follow the **Quick start** steps above, using the generated `dist/` files

### First-time clasp setup

```bash
npm install -g @google/clasp
clasp login
cd apps-script
clasp create --type webapp --title "Calendar Sync"
# copy the scriptId printed above into .clasp.json at the repo root
```

---

## How it works

- Reads events from source calendars
- Creates corresponding "blocked" placeholder events on target calendars
- Updates or removes blocks when source events change
- Never copies event titles, descriptions, attendees, or locations unless you choose Mirror mode
- Supports per-calendar privacy modes: Fully private, Private, Mirror
- Prevents sync chains — blocks created by this script are never re-synced to other calendars

---

## Architecture

```
gcal_sync/
├── apps-script/          Current deployment — Google Apps Script
│   ├── Code.gs           Sync engine
│   ├── Setup.gs          Config storage, triggers, sidebar handlers
│   ├── Sidebar.html      Setup UI (web app)
│   └── appsscript.json   Manifest — scopes, webapp config
│
├── packages/
│   └── core/             Provider-agnostic sync engine (future)
│       ├── providers/    Google, Microsoft, CalDAV adapters
│       └── storage/      Firestore, database adapters
│
├── marketplace/          Google Workspace Marketplace app (future)
├── self-hosted/          Self-hosted multi-provider app (future)
└── scripts/
    └── bundle.js         Bundles apps-script/*.gs into dist/Code.gs
```

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

---

## License

[BSD 3-Clause](https://tldrlegal.com/license/bsd-3-clause-license-(revised))
