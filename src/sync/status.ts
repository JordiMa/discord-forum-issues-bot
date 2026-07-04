import type { AppConfig } from '../config/app-config.js';

export interface ResolvedStatus {
  key: string;
  label: string;
  emoji: string;
  name: string;
}

export function resolveStatusFromLabels(
  labels: string[],
  workflow: AppConfig['workflow'],
): ResolvedStatus | null {
  for (const [key, status] of Object.entries(workflow.statuses)) {
    if (labels.includes(status.label)) {
      return {
        key,
        label: status.label,
        emoji: status.emoji ?? '⚪',
        name: labelToStatusName(status.label),
      };
    }
  }
  return null;
}

export function labelToStatusName(label: string): string {
  return label
    .replace(/^status:/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
