import type { AppConfig } from '../config/app-config.js';

export interface ResolvedStatus {
  key: string;
  label: string;
  emoji: string;
  name: string;
  color: number;
}

const PRIORITY_PREFIX = 'priority:';

export const DEFAULT_STATUS_COLOR = 0x5865f2;
export const CLOSED_STATUS_COLOR = 0x6e7681;

const STATUS_COLORS: Record<string, number> = {
  'status:new': 0xf1c40f,
  'status:confirmed': 0x3498db,
  'status:planned': 0x9b59b6,
  'status:in-progress': 0xe67e22,
  'status:review': 0x1abc9c,
  'status:testing': 0xe91e63,
  'status:done': 0x2ecc71,
  'status:wontfix': 0x95a5a6,
  'status:duplicate': 0x95a5a6,
};

const PRIORITY_DISPLAY: Record<string, string> = {
  critical: '🔴 Critique',
  high: '🟠 Élevée',
  medium: '🟡 Moyenne',
  low: '🟢 Faible',
};

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
        name: status.name ?? labelToStatusName(status.label),
        color: parseHexColor(status.color) ?? STATUS_COLORS[status.label] ?? DEFAULT_STATUS_COLOR,
      };
    }
  }
  return null;
}

function parseHexColor(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value.replace(/^#/, ''), 16);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function resolvePriorityFromLabels(labels: string[]): string | undefined {
  const label = labels.find((entry) => entry.startsWith(PRIORITY_PREFIX));
  if (!label) {
    return undefined;
  }
  const key = label.slice(PRIORITY_PREFIX.length);
  return PRIORITY_DISPLAY[key] ?? capitalize(key);
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
