# CalDAV Provider

Implements `CalendarProvider` using `tsdav`.

Supports Apple Calendar, Nextcloud, Fastmail, and any CalDAV-compliant calendar service.

## TODO
- [ ] Implement CalendarProvider interface
- [ ] Basic auth and OAuth2 token handling
- [ ] Map CalDAV VEVENT → CalendarEvent
- [ ] Handle recurring VEVENT with RRULE
- [ ] Free/busy lookup via REPORT or FREEBUSY
