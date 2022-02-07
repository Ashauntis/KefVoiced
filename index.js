// Copyright (C) 2022 by Kayla Grey + Jared De Blander
// Require the necessary discord.js classes

require('dotenv').config();

const fs = require('fs');
const { join } = require('path');

// AWS login
const aws = require('aws-sdk');

aws.config.getCredentials(function(err) {
    if (err) {
        console.log(err.stack);
    } else {
        console.log('Successfully logged into AWS');
    }
});

// Create Polly
const polly = new aws.Polly({ apiVersion: '2016-06-10', region: 'us-east-1' });

// bring in the main discord.js client
const {
    Client,
    Intents,
} = require('discord.js');

// bring in the discord.js voice/audio classes
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
} = require('@discordjs/voice');

// Create a new client instance
const client = new Client({ intents: [
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_PRESENCES,
    Intents.FLAGS.GUILD_VOICE_STATES,
    Intents.FLAGS.GUILDS,
] });

let connection = null;
let channel = null;
const player = createAudioPlayer();

let lastSpeaker = null;
let queue = {
    playing: false,
    advance: false,
};

//  _____       _                       _
// |  __ \     | |                     (_)
// | |  | | ___| |__  _   _  __ _  __ _ _ _ __   __ _
// | |  | |/ _ \ '_ \| | | |/ _` |/ _` | | '_ \ / _` |
// | |__| |  __/ |_) | |_| | (_| | (_| | | | | | (_| |
// |_____/ \___|_.__/ \__,_|\__, |\__, |_|_| |_|\__, |
//                           __/ | __/ |         __/ |
//                          |___/ |___/         |___/

player.on(AudioPlayerStatus.Playing, (oldState, newState) => {
    queue.playing = true;
	// console.log('Audio player is in the Playing state!');
});

player.on('stateChange', (oldState, newState) => {
	// console.log(`Audio player transitioned from ${oldState.status} to ${newState.status}`);
    if (oldState.status == AudioPlayerStatus.Playing && newState.status != AudioPlayerStatus.Playing) {
        // console.log('Audio player has left the the Playing state!');
        queue.playing = false;
        queue.advance = true;
    }
});


// When the client is ready, run this code (only once)
client.once('ready', () => {
    console.log('Ready!');
});

//  _____  _           _        _____                                          _
// / ____ | |         | |      / ____                                         | |
// | (__  | | __ _ ___| |__   | |     ___  _ __ ___  _ __ ___   __ _ _ __   __| |___
// \___ \ | |/ _` / __| '_ \  | |    / _ \| '_ ` _ \| '_ ` _ \ / _` | '_ \ / _` / __|
// ____)  | | (_| \__ \ | | | | |___| (_) | | | | | | | | | | | (_| | | | | (_| \__ \
// |_____/|_|\__,_|___/_| |_|  \_____\___/|_| |_| |_|_| |_| |_|\__,_|_| |_|\__,_|___/

// Listen for slash commands from the discord client.
client.on('interactionCreate', async interaction => {
    if (interaction.isCommand()) {

        const { commandName } = interaction;
        let response = '';

        channel = interaction.member?.voice.channel;

        switch (commandName) {

            case 'join':
                response = 'Request to join voice received';
                if (channel) {
                    response += ' - Valid channel';
                    try {
                        connection = await joinVoiceChannel({
                            channelId: channel.id,
                            guildId: channel.guild.id,
                            adapterCreator: channel.guild.voiceAdapterCreator,
                        });

                        connection.on('stateChange', (oldState, newState) => {
                            // console.log(`Connection transitioned from ${oldState.status} to ${newState.status}`);
                        });

                        connection.on(VoiceConnectionStatus.Ready, () => {
                            // console.log('The connection has entered the Ready state - ready to play audio!');
                        });

                        connection.subscribe(player);

                        response += ' - Joining voice!';
                    } catch (error) {
                        response = error.message;
                        console.error(error);
                    }
                    response = 'Yo!';
                } else {
                    response = 'Join a voice channel and then try again!';
                }
                break;

            case 'leave':
                if (connection) {
                    response = 'Goodbye!';
                    connection.destroy();
                } else {
                    response = 'Not currently connected to voice.';
                }
                break;

            case 'perfect':
                response = 'perfect!';
                if (connection !== null) {
                    const resource = createAudioResource(join(__dirname, 'perfect.mp3'));
                    connection = getVoiceConnection(channel.guild.id);
                    player.play(resource);
                    await entersState(player, AudioPlayerStatus.Playing, 5_000);
                }
                break;

            case 'ping':
                response = 'Pong!';
                if (connection !== null) {
                    const resource = createAudioResource(join(__dirname, 'buttchugs.mp3'));
                    connection = getVoiceConnection(channel.guild.id);
                    player.play(resource);
                    await entersState(player, AudioPlayerStatus.Playing, 5_000);
                }
                break;

            default:
                response = 'Command not currently supported';
                break;
        }

        if (response !== '') {
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

let voiceQueue = [];

client.on('messageCreate', async message => {

    let author = message.member.nickname;
    if (author === null) {
        author = message.author.username;
    }

    if (lastSpeaker !== author) {
        message.content = author + ' said ' + message.content;
        lastSpeaker = author;
    }

    if (VoiceConnectionStatus.Ready) {
        console.log(author + ' said ' + message.content);
        const params = {
            OutputFormat: 'ogg_vorbis',
            Text: message.content,
            VoiceId: 'Salli',
            SampleRate: '24000',
        };

        if (message.content.search('http') != -1) {
            console.log(message.content.search('http'));
            message.content = 'A link';
        }

        if (message.content.search('')) {
            // remove emoji's from string with regex;
        }

        polly.synthesizeSpeech(params, function(err, data) {
            if (connection !== null) {
                const audioFile = 'audio/' + message.id + '.ogg';
                fs.writeFile(audioFile, data.AudioStream, err => {
                    if (err) {
                        console.log(err);
                        return;
                    } else {
                    voiceQueue.push({
                        id: message.guildId,
                        path: audioFile,
                        message: message.content,
                    });
                }
                });
            } else if (err) {
                console.log(err, err.stack);
            } else {
                console.log('Something broke - Failed attempt to send request to AWS');
            }
        });
    } else {
        console.log('Voice connection has not been established yet...');
    }
});

function playQueue() {
    if (queue.playing) {
        // console.log('playQueue: Audio is playing! Ignoring request to play queue.');
    } else if (voiceQueue.length == 0) {
        // console.log('playQueue: Queue is empty!');
    } else if (queue.advance) {
        // console.log('playQueue: Advancing the queue!');
        queue.advance = false;
        try {
            fs.unlinkSync(voiceQueue[0].path);
        } catch (err) {
            console.error(err);
        }
        voiceQueue.shift();
    } else {
        console.log('playQueue: Playing ' + voiceQueue[0].message);
        queue.playing = true;
        connection = getVoiceConnection(voiceQueue[0].id);
        const audioFileHandle = createAudioResource(fs.createReadStream(join(__dirname, voiceQueue[0].path), {
            inputType: StreamType.OggOpus,
        }));
        player.play(audioFileHandle);
    }
}

setInterval(playQueue, 1);

// Login to Discord with your client's token
client.login(process.env.token);
