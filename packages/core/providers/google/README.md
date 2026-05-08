# Google Calendar Provider

Implements `CalendarProvider` using the `googleapis` npm package.

## TODO
- [ ] Implement CalendarProvider interface
- [ ] OAuth2 token refresh handling
- [ ] Map Google Calendar event resource → CalendarEvent
- [ ] Handle singleEvents expansion for recurring events
- [ ] Normalize originalStartTime to UTC (recurring event key stability)
