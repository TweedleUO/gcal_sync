# Google Calendar Sync

This is a google apps script to block time on a primary calendar based on events from a secondary calendar.  For example if you wanted to block time on your work calendar from events on your personal calendar like medical appointments or if you are a consultant and have multiple calendars you work off of.

## Installation

1. Make sure each account can view the calendars
   - Go to your google calendar settings
   - locate “settings for my calendars”
   - click “+ Add people” under the Share with specific people section
   - add the appropriate email of the account
2. Add the script to your [Google Apps Script Account](https://script.google.com/home) 
   - Make sure you are signed into the account you want to execute the script from
   - click “+ New” and find “Google Apps Script”
   - Rename the project to something you’ll recognize (“Personal -> Work Gcal Sync” as an example)
   - cut & paste code into the window replacing any default code
   - click the disk icon to save
3. Modify the script to reflect your calendar accounts
   - change the variable ‘primary_id’ to the calendar id you want to create the blocked time on
   - change the variable ‘secondary_id’ to the calendar id you want to source the events from
   - If you want a different time period than 30 days from now, change the variable ‘time_frame’ to a number of days you prefer
   - If you want weekend events to create blocks on your primary calendar, change the variable ‘skip_weekends’ from yes to no
   - If you want to double book events (create a block event on your primary calendar even if you already have a meeting in the slot) change to "yes"
   - If you want to receive reminder notifications from your block events change enable_primary_reminder to "yes"
4. Add the “Google Calendar API” to the services tab
   - find “Services” and click the +
   - scroll to the Google Calendar API
   - click “Add” in the bottom right
5. Set up a trigger for the script
   - click the clock icon on the left “Triggers”
   - click “+ add Trigger” from bottom right hand corner
   - run function: cal_sync
   - deploy to: Head
   - select event source: From calendar
   - Enter calendar details: Calendar updated
   - Calendar owner email: your “secondary” calendar account
   - click Save

## Usage

With the update trigger applied the script will run a sync every time your secondary calendar is updated.  This is when an existing event is modified or a new event is created.

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License
[BSD 3](https://tldrlegal.com/license/bsd-3-clause-license-(revised))

## TODO
- refactor and deploy as a Google Workspace Add-on
