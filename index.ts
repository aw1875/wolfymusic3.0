import { config } from 'dotenv';
config();

import fs from 'fs';
import path from 'path';

// Utils
import { Log } from './utils/log';
import {
  ActivityType,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  Partials,
} from 'discord.js';

// Instances
import type { Instance } from './src/Instance';
export const instances: Collection<string, Instance> = new Collection();

// Setup Discord Client
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel],
});

// Setup Commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith('.ts'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));

  if ('data' in command && 'execute' in command) {
    Log.Success(`Added command ${command.data.name}`);
    client.commands.set(command.data.name, command);
  } else {
    Log.Error(
      `The command at ${path.join(
        commandsPath,
        file
      )} is missing a required "data" or "execute" property`
    );
  }
}

// Start Bot
client.once(Events.ClientReady, (c) => {
  Log.Info(`Bot is ready! Logged in as ${c.user.tag}`);
  client.user?.setActivity({
    type: ActivityType.Listening,
    name: 'Crab Rave 10 Hours',
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    Log.Error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error: any) {
    Log.Error(error.message);
    await interaction.reply({
      content: `There was an error while executing this command! ${error.message}`,
      ephemeral: true,
    });
  }
});

client.login(process.env.BOT_TOKEN);
