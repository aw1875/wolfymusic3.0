import {
  AudioPlayer,
  AudioPlayerState,
  VoiceConnection,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
} from '@discordjs/voice';
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Message,
  ReactionCollector,
  TextChannel,
  VoiceBasedChannel,
} from 'discord.js';
import { YouTubeVideo } from 'play-dl';
import play from 'play-dl';
import { Log } from '../utils/log';
import { client, instances } from '..';

export enum PlayerState {
  Idle = 'Idle',
  Playing = 'Playing',
  Paused = 'Paused',
}

type QueueItem = {
  title: string | undefined;
  duration: string;
  index: number;
};
const ALLOWED_REACTIONS = ['▶️', '⏸️', '⏭️', '⏹️'];

export class Instance {
  messageChannel: TextChannel;
  private connection: VoiceConnection;
  state: PlayerState;
  private player: AudioPlayer;
  private queue: YouTubeVideo[];

  lastMessage: Message | null;
  reactionCollector: ReactionCollector;

  constructor(messageChannel: TextChannel, voiceChannel: VoiceBasedChannel) {
    this.messageChannel = messageChannel;
    this.state = PlayerState.Idle;
    this.player = createAudioPlayer();
    this.queue = [];

    // Create Connection
    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: messageChannel.guild.id,
      adapterCreator: messageChannel.guild.voiceAdapterCreator,
    });
    this.connection.subscribe(this.player);

    // Start Listener
    this.startListenerEvent();

    // Listen for disconnect event
    this.connection.on(VoiceConnectionStatus.Disconnected, () => {
      Log.Info('Disconnected from voice channel');
      this.stopBot();
    });
  }

  // Handle Queue
  hasQueue = (): boolean => !!this.queue.length && this.queue.length !== 1;
  getQueueLength = (): number => this.queue.length;
  getCurrentSong = (): YouTubeVideo => this.queue[0];
  getQueue = (): QueueItem[] => {
    const queue = this.queue.map((song, index) => ({
      title: song.title,
      duration: song.durationRaw,
      index: index,
    }));

    queue.shift();
    return queue;
  };
  addToQueue = (song: YouTubeVideo): number => this.queue.push(song);

  // Play Song
  playSong = async (
    interaction?: ChatInputCommandInteraction
  ): Promise<boolean> => {
    if (!this.connection) return false;
    try {
      // Get Current Song
      const currentSong = this.queue[0];

      // Get Stream
      const stream = await play.stream(currentSong.url);

      // Create resource
      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
      });

      // Play song
      this.player.play(resource);

      // Set State
      this.connection.setSpeaking(true);
      this.state = PlayerState.Playing;

      if (interaction) {
        await interaction
          .reply({
            content: `Now playing ${currentSong.title}`,
            ephemeral: true,
          })
          .then((i) => setTimeout(() => i.delete(), 3000));
      }

      // Create Embed
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

      if (this.lastMessage) await this.lastMessage.delete();

      const message = await this.messageChannel.send({
        embeds: [embed],
      });

      this.createReactionCollector(message);

      if (this.getQueueLength() > 1) {
        const queueEmbed = new EmbedBuilder().setTitle('Queue');

        this.getQueue().map((song) => {
          queueEmbed.addFields([
            {
              name: `${song.index}. ${song.title}`,
              value: song.duration,
              inline: false,
            },
          ]);
        });

        await message.edit({ embeds: [embed, queueEmbed] });
      } else {
        await message.edit({ embeds: [embed] });
      }

      this.lastMessage = message;
    } catch {
      Log.Error('Error playing song');
      this.stopBot();
      return false;
    }

    return true;
  };

  // Pause Song
  pauseSong = async (): Promise<void> => {
    if (!this.player) return;

    if (this.state === PlayerState.Playing) {
      this.player.pause();
      this.state = PlayerState.Paused;

      const message = await this.messageChannel.send(
        `Paused song ${this.queue[0].title}`
      );
      setTimeout(() => message?.delete(), 3000);
    }
  };

  // Resume Song
  resumeSong = async (): Promise<void> => {
    if (!this.player) return;

    if (this.state === PlayerState.Paused) {
      this.player.unpause();
      this.state = PlayerState.Playing;

      const message = await this.messageChannel.send(
        `Resuming song ${this.queue[0].title}`
      );
      setTimeout(() => message?.delete(), 3000);
    }
  };

  // Skip Song
  skipSong = (): void => {
    if (!this.player) return;

    if (this.getQueueLength() === 1) {
      this.state = PlayerState.Idle;
      this.stopBot();
    } else {
      this.state = PlayerState.Idle;
      this.connection.setSpeaking(false);

      // Play next song
      this.queue.shift();
      if (this.queue.length) this.playSong();
    }
  };

  stopBot = (): void => {
    if (!this.player) return;

    // Cleanup
    this.player.stop();
    this.connection.destroy();
    this.lastMessage?.delete();
    this.lastMessage = null;
    this.queue = [];

    instances.delete(this.messageChannel.guildId);
    Log.Info(`Deleted instance for ${this.messageChannel.guild.id}`);
  };

  renewInteraction = async (
    embed: EmbedBuilder,
    queueEmbed: EmbedBuilder
  ): Promise<void> => {
    if (this.lastMessage) await this.lastMessage.delete();

    const message = await this.messageChannel.send({
      embeds: [embed, queueEmbed],
    });

    await this.createReactionCollector(message);

    this.lastMessage = message;
  };

  private createReactionCollector = async (message: Message): Promise<void> => {
    ALLOWED_REACTIONS.forEach((reaction) => message.react(reaction));

    if (this.reactionCollector) this.reactionCollector.stop();

    this.reactionCollector = message.createReactionCollector({
      filter: (reaction, user) => {
        if (user.id === client.user?.id) return false;
        return ALLOWED_REACTIONS.includes(reaction.emoji.name as string);
      },
    });

    this.reactionCollector.on('collect', async (reaction, user) => {
      if (user.id === client.user?.id) return false;
      const isAllowed = ALLOWED_REACTIONS.includes(
        reaction.emoji.name as string
      );

      if (isAllowed) {
        switch (reaction.emoji.name) {
          case '⏭️':
            this.skipSong();
            break;
          case '▶️':
            this.resumeSong();
            break;
          case '⏸️':
            this.pauseSong();
            break;
          case '⏹️':
            this.stopBot();
            break;
        }
      }
      reaction.users.remove(user.id);
    });

    Log.Success('Successfully created reaction collector');
  };

  private startListenerEvent = (): void => {
    if (!this.player) return;

    this.player.on(
      'stateChange',
      (oldState: AudioPlayerState, newState: AudioPlayerState) => {
        if (oldState.status === 'buffering' && newState.status === 'playing') {
          Log.Info(`Playing ${this.queue[0].title}`);
        }

        if (
          oldState.status === 'playing' &&
          newState.status === 'idle' &&
          this.state !== PlayerState.Paused
        ) {
          Log.Info(`Finished playing ${this.queue[0].title}`);
          this.skipSong();
        }
      }
    );
  };
}
