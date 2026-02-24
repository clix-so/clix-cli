/**
 * Extract append-only delta from streamed text snapshots.
 *
 * This keeps a cumulative transcript visible in terminal UI even when
 * upstream agents emit full snapshot rewrites.
 */
function findSuffixPrefixOverlap(previous: string, next: string): number {
  const maxLength = Math.min(previous.length, next.length);
  for (let length = maxLength; length > 0; length--) {
    if (previous.endsWith(next.slice(0, length))) {
      return length;
    }
  }
  return 0;
}

export function extractCumulativeDelta(previous: string, next: string): string {
  if (!previous) {
    return next;
  }

  if (next.startsWith(previous)) {
    return next.slice(previous.length);
  }

  const overlap = findSuffixPrefixOverlap(previous, next);
  if (overlap > 0) {
    return next.slice(overlap);
  }

  // Snapshot rewound to an older segment that is already shown.
  if (next.length <= previous.length && previous.includes(next)) {
    return '';
  }

  // Fully rewritten snapshot: append as a new log block.
  return `\n${next}`;
}
