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

The project has four source files that need to be in your Apps Script project.

1. Open [script.google.com](https://script.google.com) and click **New project**

2. **Add Code.gs** — click the default `Code.gs` file and replace all its contents with [`apps-script/Code.gs`](apps-script/Code.gs)

3. **Add Setup.gs** — click **+** next to Files → **Script** → name it `Setup` → replace all its contents with [`apps-script/Setup.gs`](apps-script/Setup.gs)
   *(This file contains `doGet`, which serves the web app — without it you'll get "Script function not found: doGet")*

4. **Add Sidebar.html** — click **+** next to Files → **HTML** → name it `Sidebar` (exactly) → replace all its contents with [`apps-script/Sidebar.html`](apps-script/Sidebar.html)

5. **Set the manifest** — go to **Project Settings** (gear icon, bottom-left) → tick **Show "appsscript.json" manifest file in editor** → click the `appsscript.json` file that appears → replace all its contents with [`apps-script/appsscript.json`](apps-script/appsscript.json)
   *(This declares the required OAuth scopes — without it, authorization for `userinfo.email` may not be requested and the app will throw a permission error at runtime)*

6. **Enable the Calendar Advanced API:**
   - Click **+** next to Services → search **Google Calendar API** → click **Add**

7. **Deploy as a web app:**
   - **Deploy → New deployment** → click the gear icon and set type to **Web app**
   - Execute as: **Me** · Who has access: **Only myself** (or your org)
   - Click **Deploy**, authorize all requested permissions, and copy the web app URL

8. Open the web app URL — the setup sidebar will guide you through adding calendars and activating sync

> **Updating:** After any code change, go to **Deploy → Manage deployments**, click the pencil icon, set version to **New version**, and save. If you changed `appsscript.json`, you may need to re-authorize by revoking access in [myaccount.google.com/permissions](https://myaccount.google.com/permissions) and re-opening the web app URL.

### Option A — clasp (recommended for developers)

```bash
npm install
cp .clasp.json.example .clasp.json
# add your Apps Script project ID to .clasp.json
npm run push
```

Then open your Apps Script project, deploy as a web app, and open the setup URL.

### Option B — bundle and paste

Combines `Code.gs` and `Setup.gs` into a single file for a two-file paste (instead of three):

1. Run `npm run bundle` — generates `dist/Code.gs` and `dist/Sidebar.html`
2. Create a new Apps Script project, paste `dist/Code.gs` into `Code.gs`, add an HTML file named `Sidebar` and paste `dist/Sidebar.html`
3. Follow steps 5–8 from the Quick start above (manifest, Calendar API, deploy)

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
