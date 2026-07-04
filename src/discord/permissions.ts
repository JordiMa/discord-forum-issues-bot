import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import type { ModerationConfig } from '../config/app-config.js';

export function isModerator(member: GuildMember, moderation: ModerationConfig): boolean {
  if (moderation.roleId) {
    return member.roles.cache.has(moderation.roleId);
  }
  return member.permissions.has(PermissionFlagsBits.ManageThreads);
}
