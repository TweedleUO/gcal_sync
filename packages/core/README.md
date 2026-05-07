# Core Sync Engine

Provider-agnostic sync engine shared across all deployment targets.

Extracted from `apps-script/Code.gs` when the Marketplace or self-hosted app is built.

## Planned interfaces

### CalendarProvider
Abstracts calendar API calls behind a common interface so the sync engine
works identically regardless of provider.

```ts
interface CalendarProvider {
  listEvents(calendarId: string, timeMin: Date, timeMax: Date): Promise<CalendarEvent[]>
  insertEvent(calendarId: string, event: CalendarEvent): Promise<void>
  patchEvent(calendarId: string, eventId: string, patch: Partial<CalendarEvent>): Promise<void>
  removeEvent(calendarId: string, eventId: string): Promise<void>
  getBusyRanges(calendarId: string, timeMin: Date, timeMax: Date): Promise<TimeRange[]>
}
```

### StorageAdapter
Abstracts config and sync state storage.

```ts
interface StorageAdapter {
  getConfig(userId: string): Promise<SyncConfig>
  saveConfig(userId: string, config: SyncConfig): Promise<void>
  getLastRunSummary(userId: string): Promise<RunSummary | null>
  saveRunSummary(userId: string, summary: RunSummary): Promise<void>
}
```

## TODO
- [ ] Extract sync engine from apps-script/Code.gs
- [ ] Define CalendarProvider interface
- [ ] Define StorageAdapter interface
- [ ] Define SyncConfig and SyncFlow types
- [ ] Implement GoogleCalendarProvider (googleapis)
- [ ] Implement MicrosoftCalendarProvider (@microsoft/microsoft-graph-client)
- [ ] Implement CalDAVProvider (tsdav)
- [ ] Implement FirestoreStorageAdapter
- [ ] Implement DatabaseStorageAdapter (PostgreSQL / SQLite)
- [ ] Unit tests for sync engine logic
