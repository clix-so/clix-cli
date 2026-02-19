const OSC_8 = '\u001B]8;;';
const ST = '\u0007';

function sanitizeTerminalValue(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join('');
}

/**
 * Format a clickable terminal hyperlink using OSC 8 escape sequences.
 * Falls back to plain label if URL or label are empty after sanitization.
 */
export function formatTerminalHyperlink(url: string, label: string): string {
  const safeUrl = sanitizeTerminalValue(url);
  const safeLabel = sanitizeTerminalValue(label);

  if (!safeUrl || !safeLabel) {
    return label;
  }

  return `${OSC_8}${safeUrl}${ST}${safeLabel}${OSC_8}${ST}`;
}
