/**
 * Open a URL in the default browser.
 *
 * @param url - URL to open
 * @returns true if browser was opened, false otherwise
 */
export async function openBrowser(url: string): Promise<boolean> {
  return openBrowserFallback(url);
}

/**
 * Validate URL to prevent command injection.
 * Only allows http and https protocols.
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Fallback browser opener using platform-specific commands.
 */
async function openBrowserFallback(url: string): Promise<boolean> {
  // Validate URL to prevent command injection on Windows
  if (!isValidUrl(url)) {
    return false;
  }

  const { spawn } = await import('node:child_process');

  const platform = process.platform;
  let command: string;
  let args: string[];

  switch (platform) {
    case 'darwin':
      command = 'open';
      args = [url];
      break;
    case 'win32':
      command = 'cmd';
      args = ['/c', 'start', '', url];
      break;
    default: // linux
      command = 'xdg-open';
      args = [url];
      break;
  }

  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      child.on('error', () => resolve(false));
      child.on('spawn', () => resolve(true));
    } catch {
      resolve(false);
    }
  });
}
