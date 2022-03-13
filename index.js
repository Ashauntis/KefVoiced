// Copyright (C) 2022 by Kayla Grey + Jared De Blander

// load environment variables if they are present
require("dotenv").config();

// load dependencies
const fs = require("fs");
const { join } = require("path");
const aws = require("aws-sdk");
const { Client, Intents } = require("discord.js");
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
      console.log("Audio player is in the Playing state!");
    });

    this.player.on("stateChange", (oldState, newState) => {
      // console.log(`Audio player transitioned from ${oldState.status} to ${newState.status}`);
      if (
        oldState.status == AudioPlayerStatus.Playing &&
        newState.status != AudioPlayerStatus.Playing
      ) {
        console.log("Audio player has left the the Playing state!");
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
      console.log("callback for document with id: " + id);
      if (err) {
        console.log(err, err.stack);
      } else if (Object.keys(data).length == 0) {
        console.log("No document found with id: " + id);
      } else {
        console.dir(data);
        result_data = JSON.parse(data.Item.value.S);
      }
    })
    .promise();

  if (result_data == null) {
    console.log(`Document not found: ${id}`);
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

// Create a new client instance
const client = new Client({
  intents: [
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_PRESENCES,
    Intents.FLAGS.GUILD_VOICE_STATES,
    Intents.FLAGS.GUILDS,
  ],
});

let activeConnections = [];

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
    const { commandName } = interaction;
    const userID = interaction.member.id;
    const guildID = interaction.member.guildID;
    let response = "";
    let choice = null;
    let validChoice = null;
    let cached = false;
    let newSetting = null;

    const channel = interaction.member?.voice.channel;

    switch (commandName) {
      case "join":
        response = "Request to join voice received";
        if (channel) {
          try {
            activeConnections.push(new VoiceConnection());
            const idx = activeConnections.length - 1;
            activeConnections[idx].connection = await joinVoiceChannel({
              channelId: channel.id,
              guildId: channel.guild.id,
              adapterCreator: channel.guild.voiceAdapterCreator,
            });

            console.log(activeConnections[idx].connection._state);

            activeConnections[idx].channelId = channel.id;
            activeConnections[idx].guildId = channel.guild.id;

            activeConnections[idx].connection.on(
              "stateChange",
              (oldState, newState) => {
                console.log(
                  `Connection transitioned from ${oldState.status} to ${newState.status}`,
                );
              },
            );

            activeConnections[idx].connection.on(
              VoiceConnectionStatus.Ready,
              () => {
                console.log(
                  "The connection has entered the Ready state - ready to play audio!",
                );
              },
            );

            activeConnections[idx].connection.subscribe(
              activeConnections[activeConnections.length - 1].player,
            );

            response += " - Joining voice!";
          } catch (error) {
            response = error.message;
            console.error(error);
          }
          response = "Yo!";
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
              return;
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
        console.log("Choice input was " + choice);
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
                  console.log("Choice was valid");
                  break;
                }
              }
              if (choice == 'Kevin') {
                validChoice = false;
              }
            }

            if (validChoice) {
              interaction.reply({ content: `Setting your voice to ${choice}.`, ephemeral: true });
              console.log(`Checking for existing setting for ${userID}`);
              const query = await load_document(userID);

              if (query) {

                console.log("Found existing setting");
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
                console.log("No existing setting found");
                console.log("Attempting to set voice as " + choice);
                newSetting = makeDefaultSettings(userID);
                newSetting[userID].global.voice = choice;
                cached_user_data.push(newSetting);
                console.log(newSetting[userID]);
                save_document(newSetting[userID], userID);
                console.log("Saved new setting");
              }
            } else {
              interaction.reply({ content: `${choice} is not a currently supported voice. You can use /listvoices to see the currently supported choices.`, ephemeral: true });
            }
          },
        );
        break;

      default:
        response = "Command not currently supported";
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

client.on("messageCreate", async (message) => {
  const userID = message.member.id;
  console.log('User ID listing as ' + userID);
  let voice = 'Salli';
  let idx = -1;
  let cached = false;

  for (let i = 0; i < cached_user_data.length; i++) {
    if (cached_user_data[i].hasOwnProperty(userID)) {
        cached = true;
      if (cached_user_data[i][userID].global) {
          if (cached_user_data[i][userID].global.voice) {
            voice = cached_user_data[i][userID].global.voice;
            console.log('Attempted to change voice for this TTS request to ' + voice);
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
    console.log('Using cached voice setting of ' + voice);
  }

  for (let i = 0; i < activeConnections.length; i++) {
    if (activeConnections[i].guildId === message.channel.guild.id) {
      console.log("found connection");
      console.log(activeConnections[i].guildId);
      console.log(message.channel.guild.id);

      idx = i;
      break;
    }
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
      try {
        fs.unlinkSync(activeConnections[i].queue[0].path);
      } catch (err) {
        console.error(err);
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