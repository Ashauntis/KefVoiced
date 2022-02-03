// Require the necessary discord.js classes
require('dotenv').config();

const { createReadStream } = require('fs');
const { join } = require('path');

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

player.on(AudioPlayerStatus.Playing, (oldState, newState) => {
	console.log('Audio player is in the Playing state!');
});

player.on('stateChange', (oldState, newState) => {
	console.log(`Audio player transitioned from ${oldState.status} to ${newState.status}`);
});

// When the client is ready, run this code (only once)
client.once('ready', () => {
	console.log('Ready!');
});

client.on('interactionCreate', async interaction => {
	if (!interaction.isCommand()) return;

	const { commandName } = interaction;
	let response = '';

	switch (commandName) {

	case 'ping':
		response = 'Pong!';
		if (connection !== null) {
			const resource = createAudioResource(join(__dirname, 'buttchugs.mp3'));
			connection = getVoiceConnection(channel.guild.id);
			player.play(resource);
			await entersState(player, AudioPlayerStatus.Playing, 5_000);
		}
		break;

	case 'join':
		response = 'Request to join voice received';
		channel = interaction.member?.voice.channel;
		if (channel) {
			response += ' - Valid channel';
			try {
				connection = await joinVoiceChannel({
					channelId: channel.id,
					guildId: channel.guild.id,
					adapterCreator: channel.guild.voiceAdapterCreator,
				});

				connection.on('stateChange', (oldState, newState) => {
					console.log(`Connection transitioned from ${oldState.status} to ${newState.status}`);
				});

				connection.on(VoiceConnectionStatus.Ready, () => {
					console.log('The connection has entered the Ready state - ready to play audio!');
				});

				connection.subscribe(player);

				response += ' - Joining voice!';
			} catch (error) {
				response = error.message;
				console.error(error);
			}
		} else {
			response = 'Join a voice channel and then try again!';
		}
		break;

	default:
		response = 'Command not currently supported';
		break;
	}

	if (response !== '') {
		await interaction.reply(response);
	}
});

// Login to Discord with your client's token
client.login(process.env.token);
