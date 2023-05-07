import { config } from 'dotenv';
config();

import { REST, Routes } from 'discord.js';

import { client } from '..';
const commands = client.commands.map((c) => c.data.toJSON());

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.BOT_TOKEN as string);

// and deploy your commands!
(async () => {
  try {
    console.log(
      `Started refreshing ${commands.length} application (/) commands.`
    );

    // The put method is used to fully refresh all commands in the guild with the current set
    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID as string),
      { body: commands }
    );

    console.log(
      // @ts-ignore
      `Successfully reloaded ${data.length} application (/) commands.`
    );
  } catch (error) {
    // And of course, make sure you catch and log any errors!
    console.error(error);
  }
})();
