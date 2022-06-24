// Copyright (C) 2022 by Kayla Grey + Jared De Blander

// load environment variables if they are present
require("dotenv").config();

// load dependencies
// const util = require('util');
const fs = require("fs");
const { join } = require("path");
const { Client, Intents, MessageEmbed } = require("discord.js");
const {
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
} = require("@discordjs/voice");
const { SlashCommandRoleOption } = require("@discordjs/builders");

// load additional js files
const soundboard = require("./soundboard");
const functions = require("./functions");
let polly = require("./polly");
// polly = polly.polly;

// Extend string class to include a capitalize method
String.prototype.capitalize = function() {
  return this.charAt(0).toUpperCase() + this.slice(1);
};

// define our connection class
class VoiceConnection {
  constructor() {
    this.connection = null;
    this.channelId = null;
    this.guildId = null;
    this.voiceChannel = null;
    this.player = createAudioPlayer();
    this.playing = false;
    this.advance = false;
    this.lastSpeaker = null;
    this.queue = [];
    this.idx = null;

    this.player.on(AudioPlayerStatus.Playing, (oldState, newState) => {
      this.playing = true;
    });

    this.player.on("stateChange", (oldState, newState) => {
      // console.log(`Audio player transitioned from ${oldState.status} to ${newState.status}`);
      if (
        oldState.status == AudioPlayerStatus.Playing &&
        newState.status != AudioPlayerStatus.Playing
      ) {
        this.playing = false;
        this.advance = true;
      }
    });
  }
}

// Utility functions
async function joinVoice(connection, channel, ttsChannel) {
  try {

    console.log("---Joining voice channel----");
    console.log("channelId:  " + connection.id);
    console.log("guildId:    " + connection.guild.id);
    console.log("ttsChannel: " + ttsChannel);

    activeConnections.push(new VoiceConnection());
    const i = activeConnections.length - 1;

    activeConnections[i].connection = await joinVoiceChannel({
      channelId: connection.id,
      guildId: connection.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });

    activeConnections[i].channelId = connection.id;
    activeConnections[i].guildId = connection.guild.id;
    activeConnections[i].soundboard = [];
    activeConnections[i].ttsChannel = ttsChannel;

    activeConnections[i].connection.on(VoiceConnectionStatus.Ready, () => {
      console.log(`Connection Ready to play audio in GuildID ${connection.guild.id}!`);
    });

    activeConnections[i].connection.subscribe(activeConnections[i].player);
  } catch (e) {
    console.error(e);
  }

}

async function reconnectVoice() {
  try {

    reconnectionList = await functions.load_document('reconnection');

    // Guarantee reconnectionList is an array, otherwise revert it to an empty array
    if (!Array.isArray(reconnectionList)) {
      reconnectionList = [];
      return;
    }

    if (reconnectionList.length > 0) {
      reconnectionList.forEach(async (connection) => {
        const channel = client.channels.cache.get(connection.id);
        if (!channel) return console.error("The channel does not exist!");
        joinVoice(connection, channel, connection.ttsChannel);
      });
    }
  } catch (error) {
    console.error(error);
  }
}

function queueSoundboard(reaction, interaction, idx) {

  const pathguide = soundboardOptions[reaction.emoji.name];

  if (!pathguide) {
    interaction.user.send({ content: `${reaction.emoji.name} isn't a currently supported choice.` });
  } else {
    activeConnections[idx].queue.push({
      id: interaction.guildId,
      path: 'audio/soundboard/' + pathguide + '.mp3',
      message: pathguide,
      soundboard: true,
    });
  }

}

function playQueue() {
  for (let i = 0; i < activeConnections.length; i++) {
    if (activeConnections[i].playing) {
      // console.log('playQueue: Audio is playing! Ignoring request to play queue.');
    } else if (activeConnections[i].queue.length == 0) {
      // console.log('playQueue: Queue is empty!');
    } else if (activeConnections[i].advance) {
      // console.log('playQueue: Advancing the queue!');
      activeConnections[i].advance = false;
      if (activeConnections[i].queue[0].soundboard != true) {
        try {
          fs.unlinkSync(activeConnections[i].queue[0].path);
        } catch (err) {
          console.error(err);
        }
      }
      activeConnections[i].queue.shift();
    } else {
      console.log(
        "playQueue: Playing " + activeConnections[i].queue[0].message,
      );
      activeConnections[i].playing = true;
      activeConnections[i].connection = getVoiceConnection(
        activeConnections[i].queue[0].id,
      );
      const audioFileHandle = createAudioResource(
        fs.createReadStream(
          join(__dirname, activeConnections[i].queue[0].path),
          {
            inputType: StreamType.OggOpus,
          },
        ),
      );
      activeConnections[i].player.play(audioFileHandle);
    }
  }
}

// Create a new client instance
const client = new Client({

  intents: [
    Intents.FLAGS.DIRECT_MESSAGES,
    Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    Intents.FLAGS.GUILD_PRESENCES,
    Intents.FLAGS.GUILD_VOICE_STATES,
    Intents.FLAGS.GUILDS,
  ],

  partials: [
    'MESSAGE',
    'CHANNEL',
    'REACTION',
  ],

});

// When the client is ready, run this code (only once)
client.once("ready", () => {
  console.log("Ready!");
  reconnectVoice();
});

client.login(process.env.token);
setInterval(playQueue, 1);

// Define our data tracking arrays
const soundboardOptions = soundboard.soundboardOptions;
let cached_user_data = [];
let cached_guild_data = [];
let activeConnections = [];
let reconnectionList = [];

// Listen for slash commands from the discord client.
client.on("interactionCreate", async (interaction) => {
  if (interaction.isCommand()) {

    // console.log(interaction);
    const { commandName } = interaction;
    const userID = interaction.member.id;
    const guildID = interaction.member.guildID;
    const voicechannel = interaction.member?.voice.channel;
    let idx = -1;

    let response = "";
    let choice = null;
    let validChoice = null;
    let cached = false;
    let newSetting = null;

    let filter = (reaction, user) => { return user.id != '941537585170382928' && user.id != '941542196337844245'; };

    let sbReactCounter = 0;

    let sbMessages = [];
    let collectorReactions = [];

    // define soundboard embedded message
    const sb = new MessageEmbed()
      .setTitle('Kef Voiced Soundboard')
      .setDescription('The following emoji\'s will play a soundboard in the channel you performed the /soundboard command')
      .addFields(
        { name: 'Click here for the soundboard key', value: '[Click me!](https://docs.google.com/spreadsheets/d/1eYwxOGZScgQpLbsAtN5fP0WfLq9VT6jnxzj6-p5QPqE/edit#gid=0)', inline: true },
        );

    // determine if a connection is present in the channel command was used
    for (let i = 0; i < activeConnections.length; i++) {
      if (activeConnections[i].guildId === interaction.guildId) {
        idx = i;
        console.log('Matching active connection found for interaction');
        break;
      }
    }

    switch (commandName) {
      case "join":

        if (idx != -1) {
          interaction.reply({ content: 'There is already an established connection on this server. If you are trying to move channels, use /leave and try again.', ephemeral: true });
          // todo: add a way to move channels
          // todo: update the reconnection list with new channel info
          break;
        }

        if (voicechannel) {
          try {
            joinVoice(voicechannel, voicechannel, interaction.channelId);

            reconnectionList.push({
                id: voicechannel.id,
                guild: {
                  id: voicechannel.guild.id,
                },
                ttsChannel: interaction.channelId,
              });

            functions.save_document(reconnectionList, 'reconnection');

          } catch (error) {
            console.error(error);
          }
          interaction.reply({ content: 'Kef Voiced has joined the channel', ephemeral: false });
        } else {
          interaction.reply({ content: 'Join a voice channel and then try again!', ephemeral: true });
        }
        break;

      case "leave":
        if (activeConnections.length > 0) {
          let match = false;
          for (let i = 0; i < activeConnections.length; i++) {
            if (activeConnections[i].guildId === interaction.member.guild.id) {
              match = true;
              interaction.reply({ content: 'Goodbye!' });
              activeConnections[i].connection.destroy();
              activeConnections.splice(i, 1);
              break;
            }
          }

          // check if we found a match in the active connection list
          if (!match) {
            // if no match found notify the user
            interaction.reply({ content: 'Not currently connected to voice.' });
          } else {
            // if a match was found remove the match from the reconnection list as well
            for (let i = 0; i < reconnectionList.length; i++) {
              if (reconnectionList[i].guild.id === interaction.member.guild.id) {
                reconnectionList.splice(i, 1);
                functions.save_document(reconnectionList, 'reconnection');
              }
            }
          }
        } else {
          interaction.reply({ content: 'Not currently connected to voice.' });
        }
        break;

      case "listvoices":
        polly.polly.describeVoices({ LanguageCode: "en-US" }, function(err, data) {
          if (err) {
            console.log(err, err.stack);
          } else {
            response = "The currently supported voices include ";
            for (let i = 0; i < data.Voices.length; i++) {
              if (data.Voices[i].Name === 'Kevin') {
                continue;
              }
              if (i != data.Voices.length - 1) {
                response +=
                  data.Voices[i].Name + " (" + data.Voices[i].Gender + "), ";
              } else {
                response +=
                  'and ' + data.Voices[i].Name + " (" + data.Voices[i].Gender + "). ";
              }
            }
            interaction.reply({ content: response, ephemeral: true });
          }
        });
        break;

      case "setvoice":
        choice = interaction.options.getString("input").capitalize();
        // console.log("Choice input was " + choice);
        polly.polly.describeVoices(
          { LanguageCode: "en-US" },
          async function(err, data) {
            if (err) {
              console.log(err, err.stack);
            } else {
              validChoice = false;
              for (let i = 0; i < data.Voices.length; i++) {
                if (data.Voices[i].Name === choice) {
                  validChoice = true;
                  // console.log("Choice was valid");
                  break;
                }
              }
              if (choice == 'Kevin') {
                validChoice = false;
              }
            }

            if (validChoice) {
              interaction.reply({ content: `Setting your voice to ${choice}.`, ephemeral: true });
              // console.log(`Checking for existing setting for ${userID}`);
              const query = await functions.load_document(userID);

              if (query) {

                // console.log("Found existing setting");
                query.global.voice = choice;
                newSetting = {
                  [userID]: query,
                };

                for (let i = 0; i < cached_user_data.length; i++) {
                  if (cached_user_data[i].hasOwnProperty(userID)) {
                    cached = true;
                    cached_user_data.splice(i, 1, newSetting);
                    functions.save_document(query, userID);
                    break;
                  }
                }

                if (!cached) {
                  cached_user_data.push(newSetting);
                }

              } else {
                newSetting = functions.makeDefaultSettings(userID);
                newSetting[userID].global.voice = choice;
                cached_user_data.push(newSetting);
                console.log(newSetting[userID]);
                functions.save_document(newSetting[userID], userID);
                console.log(`Saved new voice setting for ${userID}`);
              }
            } else {
              interaction.reply({ content: `${choice} is not a currently supported voice. You can use /listvoices to see the currently supported choices.`, ephemeral: true });
            }
          },
        );
        break;

      case 'soundboard':
        if (idx == -1) {
          interaction.reply({ content: 'Connect the bot to voice and try again!', ephemeral: true });
          break;
        }

        interaction.reply({ content: 'Sending you the soundboard via Direct Message', ephemeral: true });

        await interaction.user.send({ embeds: [sb] });

        for (let key in soundboard.soundboardOptions) {

          if (sbReactCounter == 0) {
            sbMessages.push(await interaction.user.send({ content: '-', fetchReply: true }));
            collectorReactions.push(sbMessages[sbMessages.length - 1].createReactionCollector({ filter, time: 86_400_000 }));
            collectorReactions[collectorReactions.length - 1].on('collect', (reaction, user) => {
              queueSoundboard(reaction, interaction, idx);
            });
          }

          await sbMessages[sbMessages.length - 1].react(key);

          sbReactCounter++;

          if (sbReactCounter == 19) {
            sbReactCounter = 0;
          }
        }

        break;

      case 'help':
        interaction.reply({ content: 'Hello! If the bot is not reading your messages aloud, be sure that the bot is connected to a voice channel, and your messages are from the channel that the /join command was used from.', ephemeral: true });
        break;

      default:
        interaction.reply({ content: "Command not currently supported", ephemeral: true });
        break;
    }
  }
});

// Listen for messages for in the designated TTS channel to send to Polly
client.on("messageCreate", async (message) => {
  // console.log(message);
  // console.log(util.inspect(message, { showHidden: true, depth: 2, colors: true }));

  let userID = null;
  let voice = 'Joey'; // Default voice for users who haven't made a custom choice
  let idx = -1;
  let cached = false;
  if (message.member) {
    userID = message.member.id;
  } else {
    return;
  }

  if (message.channel.type === 'DM') {
    console.log('DM check triggered');
  }

  // check to see if bot is connected to voice in the server
  console.log("Looking for connection matching guild.id of " + message.channel.guild.id);
  for (let i = 0; i < activeConnections.length; i++) {
    if (activeConnections[i].guildId === message.channel.guild.id) {
      console.log("Found active connection matching " + message.channel.guild.id);
      idx = i;
      break;
    } else {
      console.log("Connection did not match " + activeConnections[i].guildId);
    }
  }

  if (idx == -1) {
    // Bot is not connected to voice
    return;
  }

  // check to see if message was in the same channel the bot was joined from
  if (activeConnections[idx].ttsChannel != message.channelId) {
    console.log(`Not processing tts request as this message was not in the designated TTS channel. (Message content: ${message.content})`);
    return;
  }

  // check to see if user has a cached voice setting
  for (let i = 0; i < cached_user_data.length; i++) {
    if (cached_user_data[i].hasOwnProperty(userID)) {
        cached = true;
      if (cached_user_data[i][userID].global) {
        if (cached_user_data[i][userID].global.voice) {
          voice = cached_user_data[i][userID].global.voice;
        }
      }
      break;
    }
  }

  // if not cached query the database to check for a voice setting
  if (!cached) {
    const query = await functions.load_document(userID);
    if (query) {
      const newSetting = {
        [userID]: query,
      };
      cached_user_data.push(newSetting);
      voice = newSetting[userID].global.voice;
    } else {
      cached_user_data.push(functions.makeEmptyCacheEntry(userID));
    }
  }


  // define who spoke last
  let author = message.member.nickname;
  if (author === null) {
    author = message.author.username;
  }

  // if last speaker matches current speaker, no need to inform who's speaking again
  if (activeConnections[idx].lastSpeaker !== author) {
    message.content = author + " said " + message.content;
    activeConnections[idx].lastSpeaker = author;
  }

  // filter tts for links
  if (message.content.search("http") != -1) {
    message.content = author + " sent a link.";
  }

  // filter discord tags to read user name instead of full tag
  message.mentions.users.forEach((value, key) => {
    const needle = `<@!${key}>`;
    const needle_alt = `<@${key}>`;
    const replace = ` at ${value.username} `;
    message.content = message.content.replaceAll(needle, replace);
    message.content = message.content.replaceAll(needle_alt, replace);
  });

  // filter custom emojis to emoji name
  if (message.content.match(/<:[A-Za-z0-9_]{1,64}:\d{1,64}>/g)) {
    const custemoji = message.content.match(/<:[A-Za-z0-9]{1,64}:\d{1,64}>/g);
    custemoji.forEach((emoji) => {
      const emojiname = emoji.split(':');
      message.content = message.content.replaceAll(emoji, ` ${emojiname[1]} `);
    });
  }

  // filter animated emojis to emoji name with fpstag
  if (message.content.match(/<a:[0-9]{1,3}fps_[A-Za-z0-9_]{1,64}:\d{1,64}>/g)) {
    const custemoji = message.content.match(/<a:[0-9]{1,3}fps_[A-Za-z0-9_]{1,64}:\d{1,64}>/g);
    custemoji.forEach((emoji) => {
      let emojiname = emoji.split(':');
      emojiname = emojiname[1].slice(emojiname[1].indexOf('_') + 1);
      message.content = message.content.replaceAll(emoji, ` ${emojiname} `);
    });
  }

  // filter animated emojis to emoji name without fpstag
  if (message.content.match(/<a:[A-Za-z0-9_]{1,64}:\d{1,64}>/g)) {
    const custemoji = message.content.match(/<a:[A-Za-z0-9_]{1,64}:\d{1,64}>/g);
    custemoji.forEach((emoji) => {
      let emojiname = emoji.split(':');
      message.content = message.content.replaceAll(emoji, ` ${emojiname[1]} `);
    });
  }

  // filter for messages that only contain an image
  if ((message.content === '') && (message.attachments.first().contentType.includes('image/'))) {
    message.content = author + ' sent an image.';
  }


  console.log("Preparing to connect to polly");
  // send the message to the Polly API
  const params = {
    OutputFormat: "ogg_vorbis",
    Text: message.content,
    VoiceId: voice,
    SampleRate: "24000",
  };

  polly.polly.synthesizeSpeech(params, function(err, data) {
    if (activeConnections[idx].connection !== null) {
      const audioFile = "audio/" + message.id + ".ogg";
      fs.writeFile(audioFile, data.AudioStream, (err) => {
        if (err) {
          console.log(err);
          return;
        } else {
          console.log("adding to queue");
          activeConnections[idx].queue.push({
            id: message.guildId,
            path: audioFile,
            message: message.content,
          });
        }
      });
    } else if (err) {
      console.log(err, err.stack);
    } else {
      console.log("Something broke - Failed attempt to send request to AWS");
    }
  });
}); // end of on messageCreate listener