/**
 * Normalize streamed text chunks before rendering in terminal UI.
 * This avoids layout corruption from mixed newline styles and control characters.
 */
export function normalizeStreamText(input: string): string {
  let normalized = input.replaceAll('\r\n', '\n').replaceAll('\r', '\n');

  // Strip ASCII control characters except TAB(0x09) and LF(0x0A).
  normalized = [...normalized]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 0x09 || code === 0x0a || (code >= 0x20 && code !== 0x7f);
    })
    .join('');

  return normalized;
}
