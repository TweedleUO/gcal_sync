# Microsoft Calendar Provider

Implements `CalendarProvider` using `@microsoft/microsoft-graph-client`.

Supports Outlook and Exchange calendars via Microsoft Graph API.

## TODO
- [ ] Implement CalendarProvider interface
- [ ] OAuth2 token refresh handling (MSAL)
- [ ] Map Graph API event resource → CalendarEvent
- [ ] Handle recurring event instances
- [ ] Map Graph API busy/free → TimeRange
