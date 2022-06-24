/skip command to advance queue
fix /leave function - something is causing it to be added to reconnectionlist multiple times (or just not removing it) which borks reconnection by attempting to connect multiple times.
set up a "not allowed to use the bot" role, maybe a slash command with a 30 min timeout?
log in a channel who's using soundboard stuff and possibly channel joins/disconnects