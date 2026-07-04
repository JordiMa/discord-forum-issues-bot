import type { AppConfig } from '../config/app-config.js';

export interface ResolvedStatus {
  key: string;
  label: string;
  emoji: string;
  name: string;
}

const PRIORITY_PREFIX = 'priority:';

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

export function resolvePriorityFromLabels(labels: string[]): string | undefined {
  const label = labels.find((entry) => entry.startsWith(PRIORITY_PREFIX));
  if (!label) {
    return undefined;
  }
  return capitalize(label.slice(PRIORITY_PREFIX.length));
}

export function labelToStatusName(label: string): string {
  return label
    .replace(/^status:/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function capitalize(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}
