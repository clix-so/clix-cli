import { access, readFile } from 'node:fs/promises';

export const DEFAULT_PROMPT_URL =
  'https://raw.githubusercontent.com/clix-so/cli-prompt/refs/heads/main/prompt.txt';

export class PromptFetcher {
  async fetch(url?: string): Promise<string> {
    const targetUrl = url || DEFAULT_PROMPT_URL;

    // file:// 프로토콜 지원 (테스트용)
    if (targetUrl.startsWith('file://')) {
      const filePath = targetUrl.slice(7);
      try {
        await access(filePath);
        return readFile(filePath, 'utf-8');
      } catch {
        throw new Error(`File not found: ${filePath}`);
      }
    }

    const response = await fetch(targetUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch prompt: ${response.statusText}`);
    }

    return response.text();
  }
}
