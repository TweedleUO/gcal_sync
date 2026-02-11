# Google Calendar Sync

This is a google apps script to block time on a primary calendar based on events from a secondary calendar.  For example if you wanted to block time on your work calendar from events on your personal calendar like medical appointments or if you are a consultant and have multiple calendars you work off of.

# gcal_sync — Busy-only Calendar Sync for Google Calendar (Apps Script)

A Google Apps Script that mirrors **busy time** from one or more source calendars into a single **target** calendar as generic “blocked” events — without copying event details.

This is useful when you want to open any one calendar and see your real availability while keeping other calendars private.

## What it does

- Reads events from **source calendars**
- Filters + normalizes them (timed vs all-day, weekend skip, etc.)
- Creates/updates corresponding **busy blocks** on a **target calendar**
- Deletes target blocks that no longer have a matching source event (“orphan cleanup”)
- Avoids duplication and update storms using an **idempotent upsert** approach:
  - A stable `srcKey`
  - Ownership tagging in `extendedProperties.private`
  - A SHA-256 `sig` to skip no-op updates

## Privacy model

- **No event titles, attendees, locations, or descriptions** are copied from sources.
- Target blocks have a constant title (default: `blocked`).
- The script only stores minimal metadata for tracking/debugging in:
  - `extendedProperties.private` (recommended)
  - `description` contains `srcEventId:<srcKey>` for informational visibility only

## Requirements

- Google Apps Script project
- **Advanced Google Services** enabled:
  - `Calendar API` (Advanced Google Service) in Apps Script
  - `Google Calendar API` enabled in the linked GCP project

## Setup

1. Create a new Apps Script project.
2. Paste `Code.gs` contents into the editor.
3. Enable Advanced Calendar API:
   - Apps Script editor → **Services** (or **Extensions → Advanced Google services**) → enable **Calendar API**
   - In Google Cloud console for the project → enable **Google Calendar API**
4. Create a trigger, either timed or on calendar update.
5. Edit configuration at the top of the script: (Note: set "dryRun: true", after first test to enable writes)

```js
const CONFIG = {
  calendarIds: [
    "target-calendar-id@domain.com",
    "source-1@domain.com",
    "source-2@domain.com"
  ],
  timeFrameDays: 30,
  skipWeekends: true,
  skipAllDayEvents: false,
  doubleBookEvents: true,
  enablePrimaryReminder: false,
  managedBy: "gcal-sync",
  dryRun: false,
  blockTitle: "blocked"
};
```


## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License
[BSD 3](https://tldrlegal.com/license/bsd-3-clause-license-(revised))

## TODO
- refactor and deploy as a Google Workspace Add-on
