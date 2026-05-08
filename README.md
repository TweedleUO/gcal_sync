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

### Option A — clasp (recommended for developers)

```bash
npm install
cp .clasp.json.example .clasp.json
# add your Apps Script project ID to .clasp.json
npm run push
```

Then open your Apps Script project, deploy as a web app, and open the setup URL.

### Option B — paste into editor

1. Run `npm run bundle` to generate `dist/Code.gs` and `dist/Sidebar.html`
2. Create a new [Apps Script project](https://script.google.com)
3. Paste `dist/Code.gs` into the default `Code.gs` file
4. Add an HTML file: **+** → **HTML** → name it `Sidebar` → paste `dist/Sidebar.html`
5. Enable Advanced Calendar API: **Services → Calendar API**
6. Deploy as a web app: **Deploy → New deployment → Web app**
7. Open the web app URL to complete setup

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
