import type { Interaction } from 'discord.js';

export interface InteractionHandler {
  handle(interaction: Interaction): Promise<void>;
}
