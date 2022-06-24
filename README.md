# KefVoiced
A Discord bot that provides a text to speech voice from Amazon Polly.

## Features

### Text-To-Speech

Using **/join** will have the bot join your current voice channel, and **/leave** to disconnect. While in voice chat, the bot will read any text written in the **channel it was joined** from will be read aloud. *If you want to switch the channel it is reading from, you must use /leave and then /join again in the new channel.*

**/skip** will skip the current audio clip and move to the next one.

Using **/setvoice** will change the voice your tts messages are read with. Kefvoiced uses Amazon Polly and supports the US English voices.

Currently supported voices include Salli, Joanna, Matthew, Kendra, Ivy, Justin, Kimberly, and Joey. Use **/listvoices** to display these in the discord client.

#### Reconnection

The bot is restarted automatically once per day. By default, any active connections will be reconnected when the bot restarts. To toggle this setting on a server basis, use **/reconnect on/off**.

**Toggle feature is not currently functioning. /leave to disconnect the bot.**

### Soundboard

There is an extensive list of movie quotes and sound effects available for use in voice. Use **/soundboard** to have the bot send you a direct message with the full list of reactions and the sounboard key. You can view the soundboard key [here](https://docs.google.com/spreadsheets/d/1eYwxOGZScgQpLbsAtN5fP0WfLq9VT6jnxzj6-p5QPqE/edit#gid=0).