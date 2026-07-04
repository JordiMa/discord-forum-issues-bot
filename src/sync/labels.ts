export function swapPrefixedLabel(labels: string[], prefix: string, nextLabel: string): string[] {
  const others = labels.filter((label) => !label.startsWith(prefix));
  return Array.from(new Set([...others, nextLabel]));
}
