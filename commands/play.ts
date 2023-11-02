import {
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  SlashCommandBuilder,
} from 'discord.js';
import { instances } from '..';
import { Instance } from '../src/Instance';
import play from 'play-dl';
import { Log } from '../utils/log';

const findInstance = (guildId: string): Instance | undefined => {
  return instances.get(guildId);
};

const createQueueEmbed = (instance: Instance): EmbedBuilder => {
  const queue = instance.getQueue();
  const embed = new EmbedBuilder();
  embed.setTitle('Queue');

  queue.map((song) => {
    embed.addFields([
      {
        name: `${song.index}. ${song.title}`,
        value: song.duration,
        inline: false,
      },
    ]);
  });

  return embed;
};

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Plays a song')
  .addStringOption((option) =>
    option
      .setName('query')
      .setDescription('Song Query or URL')
      .setRequired(true)
  );

export const execute = async (interaction: ChatInputCommandInteraction) => {
  if (interaction.channel?.type !== ChannelType.GuildText) {
    await interaction.reply('This command can only be used within a guild!');
    return;
  }

  const user: GuildMember = interaction.member as GuildMember;
  const messageChannel = interaction.channel;
  const voiceChannel = user.voice.channel;

  // Check if user is in a voice channel
  if (!voiceChannel) {
    const embed = new EmbedBuilder().setColor(0xf20000).addFields([
      {
        name: 'Error',
        value: 'You must be in a voice channel to use this command!',
        inline: false,
      },
    ]);

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // Check for instances and create new one if one doesn't exist
  let instance = findInstance(messageChannel.guild.id);
  if (!instance) {
    instance = new Instance(messageChannel, voiceChannel);
    instances.set(messageChannel.guild.id, instance);
    Log.Info(`Created new instance for ${messageChannel.guild.id}`);
  }

  // Check if current message channel is binding channel
  if (instance.messageChannel !== messageChannel) {
    const embed = new EmbedBuilder().setColor(0xf20000).addFields([
      {
        name: 'Error',
        value: `Commands are currently bound to <#${instance.messageChannel.id}>`,
        inline: false,
      },
    ]);

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // Get Song
  const query = interaction.options.getString('query', true);
  const video = (
    await play.search(query, {
      source: {
        youtube: 'video',
      },
      limit: 1,
    })
  )[0];

  // Add to Queue and play
  instance.addToQueue(video);
  if (!instance.hasQueue()) {
    const status = await instance.playSong(interaction);
    if (!status)
      await interaction.reply({
        content: `Failed to play: ${video.title}`,
        ephemeral: true,
      });
  } else {
    const currentSong = instance.getCurrentSong();
    const embed = new EmbedBuilder()
      .setTitle('Now Playing')
      .setColor(0x71e1d2)
      .setImage(
        currentSong.thumbnails[0].url ||
          'https://cdn.discordapp.com/avatars/480796746986029057/e18b15e7c72546d4fad5a30ba89749a8.png'
      )
      .addFields([
        {
          name: currentSong.title || 'Current Song',
          value: currentSong.durationRaw,
          inline: false,
        },
      ]);
    const queueEmbed = createQueueEmbed(instance);
    await instance.renewInteraction(embed, queueEmbed);

    await interaction
      .reply(`Added ${video.title} to the queue`)
      .then((i) => setTimeout(() => i.delete(), 3000));
  }
};
