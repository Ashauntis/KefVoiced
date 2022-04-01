const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
require('dotenv').config();
const clientId = process.env.clientId;
const guildId = process.env.guildId;
const token = process.env.token;

const commands = [
	new SlashCommandBuilder().setName('join').setDescription('Join\'s your current voice channel.'),
	new SlashCommandBuilder().setName('leave').setDescription('Leaves voice chat'),
	new SlashCommandBuilder().setName('help').setDescription('Need some help?'),
	new SlashCommandBuilder().setName('listvoices').setDescription('Lists the voices available for use'),
	new SlashCommandBuilder().setName('setvoice').setDescription('Set your personal voice option. Eg: /setvoice Salli').addStringOption(option => option.setName('input')
	.setDescription('What voice would you like to use?')
	.setRequired(true)),
	new SlashCommandBuilder().setName('soundboard').setDescription('Play a prerecorded sound!').addSubcommand(subcommand =>
		subcommand
			.setName('buttchugs')
			.setDescription('Play this sound')),
]
	.map(command => command.toJSON());

const rest = new REST({ version: '9' }).setToken(token);

rest.put(Routes.applicationCommands(clientId), { body: commands })
	.then(() => console.log('Successfully registered application commands.'))
	.catch(console.error);