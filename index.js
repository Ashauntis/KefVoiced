// Copyright (C) 2022 by Kayla Grey + Jared De Blander

// load environment variables if they are present
require("dotenv").config();

// load dependencies
const fs = require("fs");
const { join } = require("path");
const aws = require("aws-sdk");
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

// extend the String class to add a replace method
String.prototype.replaceAt = function(index, replacement) {
  return (
    this.substr(0, index) +
    replacement +
    this.substr(index + replacement.length)
  );
};
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

// log into AWS Services
aws.config.getCredentials(function(err) {
  if (err) {
    console.log(err.stack);
  } else {
    console.log("Successfully logged into AWS");
  }
});

// Create our service objects
const polly = new aws.Polly({ apiVersion: "2016-06-10", region: "us-east-1" });
const dynamo = new aws.DynamoDB({
  apiVersion: "2012-08-10",
  region: "us-east-1",
});

// defining database utility functions

function makeDefaultSettings(userID) {
    return {
      [userID]: {
        global: {
          voice: "Salli",
        },
      },
    };
  }

function makeEmptyCacheEntry(userID) {
    return {
        [userID]: {
        },
    };
}

function list_tables() {
  const params = {};
  dynamo.listTables(params, function(err, data) {
    if (err) {
      console.log(err, err.stack);
    } else {
      console.log(data);
    }
  });
}

async function load_document(id) {
  // set result_data to null to start
  let result_data = null;

  // specify the parameters for the getItem call
  const params = {
    TableName: "kef_voiced_settings",
    Key: {
      id: { S: id },
    },
  };

  console.log("Loading document with id: " + id);
  // get the document from Amazon DynamoDB
  await dynamo.getItem(params, function (err, data) {
      if (err) {
        console.log(err, err.stack);
      } else if (Object.keys(data).length == 0) {
        // console.log("No document found with id: " + id);
      } else {
        console.dir(data);
        result_data = JSON.parse(data.Item.value.S);
      }
    })
    .promise();

  if (result_data == null) {
    // console.log(`Document not found: ${id}`);
  } else {
    console.log(`Successfully loaded document: ${id} `);
  }

  return result_data;
}

async function save_document(data_object, id) {
  // create a new document from a stringified object
  const value = JSON.stringify(data_object);

  // specify the parameters for the putItem call
  const params = {
    TableName: "kef_voiced_settings",
    Item: {
      id: { S: id },
      value: { S: value },
    },
  };

  // store the document in Amazon DynamoDB
  const r = await dynamo
    .putItem(params, function (err) {
      if (err) {
        console.log("Error", err, err.stack);
      } else {
        console.log(`Document added. ID: ${id}, Data:`);
        console.dir(data_object);
      }
    })
    .promise();

  return r;
}

let cached_user_data = [];
let cached_guild_data = [];
let activeConnections = [];

// Create a new client instance
const client = new Client({
  intents: [
    Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    Intents.FLAGS.GUILD_PRESENCES,
    Intents.FLAGS.GUILD_VOICE_STATES,
    Intents.FLAGS.GUILDS,
  ],
});


// When the client is ready, run this code (only once)
client.once("ready", () => {
  console.log("Ready!");
});

//  _____  _           _        _____                                          _
// / ____ | |         | |      / ____                                         | |
// | (__  | | __ _ ___| |__   | |     ___  _ __ ___  _ __ ___   __ _ _ __   __| |___
// \___ \ | |/ _` / __| '_ \  | |    / _ \| '_ ` _ \| '_ ` _ \ / _` | '_ \ / _` / __|
// ____)  | | (_| \__ \ | | | | |___| (_) | | | | | | | | | | | (_| | | | | (_| \__ \
// |_____/|_|\__,_|___/_| |_|  \_____\___/|_| |_| |_|_| |_| |_|\__,_|_| |_|\__,_|___/

// Listen for slash commands from the discord client.
client.on("interactionCreate", async (interaction) => {
  if (interaction.isCommand()) {
    // console.log(interaction);
    const { commandName } = interaction;
    const userID = interaction.member.id;
    const guildID = interaction.member.guildID;
    let response = "";
    let choice = null;
    let validChoice = null;
    let cached = false;
    let newSetting = null;
    let collector = null;
    let filter = null;

    let idx = -1;

    const soundboardcard = new MessageEmbed()
        .setTitle('Kef Voiced Soundboard')
        .setDescription('The following emoji\'s will play a soundboard in the channel you performed the /soundboard command')
        .addFields(
            { name: 'Buttchugs', value: ':blossom:', inline: true },
            { name: 'perfect', value: ':100:', inline: true },
          )
        .setFooter({ text: 'If you have any questions, feel free to ask' });

    // determine if a connection is present in the channel command was used
    for (let i = 0; i < activeConnections.length; i++) {
      if (activeConnections[i].guildId === interaction.guildId) {
        idx = i;
        console.log('Matching active connection found');
        break;
      }
    }

    const voicechannel = interaction.member?.voice.channel;

    switch (commandName) {
      case "join":

        if (idx != -1) {
          interaction.reply({ content: 'There is already an established connection on this server. If you are trying to move channels, use /leave and try again.', ephemeral: true });
          break;
        }

        if (voicechannel) {
          try {
            activeConnections.push(new VoiceConnection());
            const idx2 = activeConnections.length - 1;
            activeConnections[idx2].connection = await joinVoiceChannel({
              channelId: voicechannel.id,
              guildId: voicechannel.guild.id,
              adapterCreator: voicechannel.guild.voiceAdapterCreator,
            });

            // console.log(activeConnections[idx2].connection._state);

            activeConnections[idx2].channelId = voicechannel.id;
            activeConnections[idx2].guildId = voicechannel.guild.id;
            activeConnections[idx2].ttsChannel = interaction.channelId;

            activeConnections[idx2].connection.on(
              "stateChange",
              (oldState, newState) => {
                // console.log(
                  // `Connection transitioned from ${oldState.status} to ${newState.status}`,
                // );
              },
            );

            activeConnections[idx2].connection.on(
              VoiceConnectionStatus.Ready,
              () => {
                console.log(
                  "The connection has entered the Ready state - ready to play audio!",
                );
              },
            );

            activeConnections[idx2].connection.subscribe(
              activeConnections[activeConnections.length - 1].player,
            );

            // response += " - Joining voice!";

            activeConnections[idx2].soundboard = [];
          } catch (error) {
            response = error.message;
            console.error(error);
          }
          // interaction.reply({ content: 'Hello!', ephemeral: false });
          interaction.reply({ content: 'Voice Connection Ready', ephemeral: true });
        } else {
          response = "Join a voice channel and then try again!";
        }
        break;

      case "leave":
        if (activeConnections.length > 0) {
          for (let i = 0; i < activeConnections.length; i++) {
            if (activeConnections[i].guildId === interaction.member.guild.id) {
              response = "Goodbye!";
              activeConnections[i].connection.destroy();
              activeConnections.splice(i, 1);
              break;
            } else {
              response = "Not currently connected to voice.";
            }
          }
        } else {
          response = "Not currently connected to voice.";
        }
        break;

      case "listvoices":
        polly.describeVoices({ LanguageCode: "en-US" }, function(err, data) {
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
                  data.Voices[i].Name + " (" + data.Voices[i].Gender + "). ";
              }
            }
            interaction.reply({ content: response, ephemeral: true });
          }
        });
        break;

      case "setvoice":
        choice = interaction.options.getString("input").capitalize();
        // console.log("Choice input was " + choice);
        polly.describeVoices(
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
              const query = await load_document(userID);

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
                    save_document(query, userID);
                    break;
                  }
                }

                if (!cached) {
                  cached_user_data.push(newSetting);
                }

              } else {
                // console.log("No existing setting found");
                // console.log("Attempting to set voice as " + choice);
                newSetting = makeDefaultSettings(userID);
                newSetting[userID].global.voice = choice;
                cached_user_data.push(newSetting);
                console.log(newSetting[userID]);
                save_document(newSetting[userID], userID);
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

        activeConnections[idx].soundboard[userID] = await interaction.user.send({ embeds: [soundboardcard], fetchReply: true });
        await activeConnections[idx].soundboard[userID].react('🌼');
        filter = (reaction, user) => { return user.id != '941537585170382928' && user.id != '941542196337844245'; };
        collector = activeConnections[idx].soundboard[userID].createReactionCollector({ filter, time: 86_400_000 });
        collector.on('collect', (reaction, user) => {
          // console.log(`Collected ${reaction.emoji.name} from ${user.id} to play in ${interaction.member?.voice.channel}`);
          activeConnections[idx].queue.push({
                id: interaction.guildId,
                path: 'audio/soundboard/buttchugs.mp3',
                message: 'Buttchugs',
                soundboard: true,
              });
        });
        break;

        // if (interaction.options.getSubcommand() === 'buttchugs') {
        //   interaction.reply({ content: 'Playing "Buttchugs"!', ephemeral: true });
        //   activeConnections[idx].queue.push({
        //     id: interaction.guildId,
        //     path: 'audio/soundboard/buttchugs.mp3',
        //     message: 'Buttchugs',
        //     soundboard: true,
        //   });
        // }
        // break;

      case 'help':
        interaction.reply({ content: 'Hello! If the bot is not reading your messages aloud, be sure that the bot is connected to a voice channel, and your messages are from the channel that the /join command was used from.', ephemeral: true });
        break;

      default:
        response = { content: "Command not currently supported", ephemeral: true };
        break;
    }

    if (response !== "") {
      await interaction.reply(response);
    }
  }
});

//  _______ _______ _____                _   _
// |__   __|__   __/ ____|     /\       | | (_)
//    | |     | | | (___      /  \   ___| |_ _  ___  _ __
//    | |     | |  \___ \    / /\ \ / __| __| |/ _ \| '_ \
//    | |     | |  ____) |  / ____ \ (__| |_| | (_) | | | |
//    |_|     |_| |_____/  /_/    \_\___|\__|_|\___/|_| |_|
// Let's create a queue!

client.login(process.env.token);
setInterval(playQueue, 1);

client.on("messageReactionAdd", async (messageReaction) => {
  // console.log(messageReaction);
});

client.on("messageCreate", async (message) => {
  // console.log(message);
  // console.log(message.attachments.first().contentType);

  const userID = message.member.id;
  // console.log('User ID listing as ' + userID);
  let voice = 'Joey';
  let idx = -1;
  let cached = false;

  for (let i = 0; i < activeConnections.length; i++) {
    if (activeConnections[i].guildId === message.channel.guild.id) {
      idx = i;
      break;
    }
  }

  if (idx == -1) {
    // console.log('Not processing request as the bot is not connected to voice.');
    return;
  }

  if (activeConnections[idx].ttsChannel != message.channelId) {
    console.log(`Not processing tts request as this message was not in the designated TTS channel. (Message content: ${message.content})`);
    return;
  }

  for (let i = 0; i < cached_user_data.length; i++) {
    if (cached_user_data[i].hasOwnProperty(userID)) {
        cached = true;
      if (cached_user_data[i][userID].global) {
          if (cached_user_data[i][userID].global.voice) {
            voice = cached_user_data[i][userID].global.voice;
            // console.log('Attempted to change voice for this TTS request to ' + voice);
          }
      }
      break;
    }
  }

  if (!cached) {
    const query = await load_document(userID);
    if (query) {
      const newSetting = {
        [userID]: query,
      };
      cached_user_data.push(newSetting);
      voice = newSetting[userID].global.voice;
    } else {
        cached_user_data.push(makeEmptyCacheEntry(userID));
    }
  } else {
    // console.log('Using cached voice setting of ' + voice);
  }

  if (idx >= 0) {
    let author = message.member.nickname;
    if (author === null) {
      author = message.author.username;
    }

    if (activeConnections[idx].lastSpeaker !== author) {
      message.content = author + " said " + message.content;
      activeConnections[idx].lastSpeaker = author;
    }

    if (message.content.search("http") != -1) {
      message.content = author + " sent a link.";
    }

    message.mentions.users.forEach((value, key) => {
      const needle = `<@!${key}>`;
      const needle_alt = `<@${key}>`;
      const replace = ` at ${value.username} `;
      // console.log(`${value.username} is ${needle}`);
      message.content = message.content.replaceAll(needle, replace);
      message.content = message.content.replaceAll(needle_alt, replace);
    });

    if (message.content.match(/<:[A-Za-z0-9]{1,64}:\d{1,64}>/g)) {
      const custemoji = message.content.match(/<:[A-Za-z0-9]{1,64}:\d{1,64}>/g);
      custemoji.forEach((emoji) => {
        const emojiname = emoji.split(':');
        message.content = message.content.replaceAll(emoji, ` ${emojiname[1]} `);
      });
    }

    if ((message.content === '') && (message.attachments.first().contentType.includes('image/'))) {
      message.content = author + ' sent an image.';
    }

    const params = {
      OutputFormat: "ogg_vorbis",
      Text: message.content,
      VoiceId: voice,
      SampleRate: "24000",
    };

    polly.synthesizeSpeech(params, function(err, data) {
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
  }
});

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