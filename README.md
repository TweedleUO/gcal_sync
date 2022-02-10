# gcal_sync
A script to block time on your calendar from a secondary calendar

<body>
<p class="p2"><span class="s1">A script to block time on your google calendar from a secondary google calendar</span></p>
<p class="p3"><span class="s1"><b>Installation:</b></span></p>
<ol class="ol1">
  <li class="li4"><span class="s2"></span>Make sure each account can view the calendars</li>
  <ul class="ul1">
    <li class="li5">Go to your google calendar settings</li>
    <li class="li5">locate “settings for my calendars”</li>
    <li class="li6"><span class="s3">click </span>“+ Add people” under the Share with specific people section</li>
    <li class="li6">add the appropriate email of the account</li>
  </ul>
  <li class="li6">Add the script to your secondary account’s google Drive</li>
  <ul class="ul1">
    <li class="li6">Go to the google drive of the account you are wanting to source from (this is considered the “secondary” calendar)</li>
    <li class="li6">click “+ New” and find “Google Apps Script”</li>
    <li class="li6">Rename the project to something you’ll recognize (“gcal sync” for default)</li>
    <li class="li6">cut &amp; paste code into the window</li>
    <li class="li6">click the disk icon to save</li>
  </ul>
  <li class="li6">Modify the script to reflect your calendar accounts</li>
  <ul class="ul1">
    <li class="li6">change the variable ‘primary_id’ to the calendar id you want to create the blocked time on</li>
    <li class="li6">change the variable ‘secondary_id’ to the calendar id you want to source the events from</li>
    <li class="li6">If you want a different time period than 30 days from now, change the variable ‘time_frame’ to a number of days you prefer</li>
    <li class="li6">If you want weekend events to create blocks on your primary calendar, change the variable ‘skip_weekends’ from yes to no</li>
  </ul>
  <li class="li6">Add the “Google Calendar API” to the services tab</li>
  <ul class="ul1">
    <li class="li6">find “Services” and click the +</li>
    <li class="li6">scroll to the Google Calendar API</li>
    <li class="li6">click “Add” in the bottom right</li>
  </ul>
  <li class="li6">Set up a trigger for the script</li>
  <ul class="ul1">
    <li class="li6">click the clock icon on the left “Triggers”</li>
    <li class="li6">click “+ add Trigger” from bottom right hand corner</li>
    <ul class="ul1">
      <li class="li6">run function: cal_sync</li>
      <li class="li6">deploy to: Head</li>
      <li class="li6">select event source: From calendar</li>
      <li class="li6">Enter calendar details: Calendar updated</li>
      <li class="li6">Calendar owner email: your “secondary” calendar account</li>
      <li class="li6">click Save</li>
    </ul>
  </ul>
</ol>
</body>
</html>
