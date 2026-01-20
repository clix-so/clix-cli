#!/usr/bin/env bun

import { parseArgs } from 'node:util';
import { $ } from 'bun';

// Team members (commits from these users won't be attributed)
const team = ['pitzcarraldo', 'github-actions[bot]', 'dependabot[bot]'];

// GitHub repo info
const REPO_OWNER = 'clix-so';
const REPO_NAME = 'clix-cli';

type Commit = {
  hash: string;
  author: string | null;
  message: string;
};

export async function getLatestRelease(): Promise<string> {
  try {
    const result =
      await $`gh api repos/${REPO_OWNER}/${REPO_NAME}/releases/latest --jq '.tag_name'`.text();
    return result.trim().replace(/^v/, '');
  } catch {
    // No releases yet
    return '0.0.0';
  }
}

export async function getCommits(from: string, to: string): Promise<Commit[]> {
  const fromRef = from === '0.0.0' ? '' : from.startsWith('v') ? from : `v${from}`;
  const toRef = to === 'HEAD' ? to : to.startsWith('v') ? to : `v${to}`;

  try {
    let result: string;

    if (fromRef) {
      // Use compare API for commits between two refs
      const range = `${fromRef}...${toRef}`;
      result =
        await $`gh api "/repos/${REPO_OWNER}/${REPO_NAME}/compare/${range}" --jq '.commits[] | {sha: .sha, login: .author.login, message: .commit.message}'`.text();
    } else {
      // Use list commits API for all commits (no from ref)
      result =
        await $`gh api "/repos/${REPO_OWNER}/${REPO_NAME}/commits?sha=${toRef}&per_page=100" --jq '.[] | {sha: .sha, login: .author.login, message: .commit.message}'`.text();
    }

    const commits: Commit[] = [];

    for (const line of result.split('\n').filter(Boolean)) {
      const data = JSON.parse(line) as {
        sha: string;
        login: string | null;
        message: string;
      };

      const message = data.message.split('\n')[0] ?? '';

      // Skip certain commit types
      if (message.match(/^(chore:|ci:|test:|docs:|release:|Merge )/i)) continue;

      commits.push({
        hash: data.sha.slice(0, 7),
        author: data.login,
        message,
      });
    }

    return filterRevertedCommits(commits);
  } catch (error) {
    console.error('GitHub API failed, falling back to git log:', error);

    // Fallback to git log if GitHub API fails
    const range = fromRef ? `${fromRef}..${toRef}` : toRef;
    const log = await $`git log ${range} --oneline --format="%H|%s"`.text();

    const commits: Commit[] = [];
    for (const line of log.split('\n').filter(Boolean)) {
      const [hash, ...messageParts] = line.split('|');
      const message = messageParts.join('|');

      if (message.match(/^(chore:|ci:|test:|docs:|release:|Merge )/i)) continue;

      // No author attribution in fallback mode (can't get GitHub username from git)
      commits.push({
        hash: hash?.slice(0, 7),
        author: null,
        message,
      });
    }

    return filterRevertedCommits(commits);
  }
}

function filterRevertedCommits(commits: Commit[]): Commit[] {
  const revertPattern = /^Revert "(.+)"$/;
  const seen = new Map<string, Commit>();

  for (const commit of commits) {
    const match = commit.message.match(revertPattern);
    if (match?.[1]) {
      const original = match[1];
      if (seen.has(original)) seen.delete(original);
      else seen.set(commit.message, commit);
    } else {
      const revertMsg = `Revert "${commit.message}"`;
      if (seen.has(revertMsg)) seen.delete(revertMsg);
      else seen.set(commit.message, commit);
    }
  }

  return [...seen.values()];
}

async function summarizeWithAI(commits: Commit[]): Promise<Map<string, string>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('ANTHROPIC_API_KEY not set, using raw commit messages');
    return new Map();
  }

  const summaries = new Map<string, string>();
  const BATCH_SIZE = 10;

  for (let i = 0; i < commits.length; i += BATCH_SIZE) {
    const batch = commits.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (commit) => {
        try {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 100,
              messages: [
                {
                  role: 'user',
                  content: `Summarize this commit message for a changelog entry. Return ONLY a single line summary starting with a capital letter. Be concise but specific. If the commit message is already well-written, just clean it up. Do not include prefixes like "fix:" or "feat:".

Commit: ${commit.message}`,
                },
              ],
            }),
            signal: AbortSignal.timeout(30000),
          });

          if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
          }

          const data = (await response.json()) as {
            content: Array<{ type: string; text: string }>;
          };
          const text = data.content.find((c) => c.type === 'text')?.text;
          return { hash: commit.hash, summary: text?.trim() ?? commit.message };
        } catch (error) {
          console.error(`Failed to summarize ${commit.hash}:`, error);
          return { hash: commit.hash, summary: commit.message };
        }
      }),
    );

    for (const { hash, summary } of results) {
      summaries.set(hash, summary);
    }
  }

  return summaries;
}

// Keep a Changelog categories
// https://keepachangelog.com/en/1.1.0/
type ChangeCategory = 'Added' | 'Changed' | 'Deprecated' | 'Removed' | 'Fixed' | 'Security';

function categorizeCommit(message: string): ChangeCategory {
  const lowerMsg = message.toLowerCase();

  // feat: -> Added
  if (message.match(/^feat(\(.+\))?:/i)) return 'Added';

  // fix: -> Fixed
  if (message.match(/^fix(\(.+\))?:/i)) return 'Fixed';

  // security related
  if (
    lowerMsg.includes('security') ||
    lowerMsg.includes('vulnerability') ||
    lowerMsg.includes('cve')
  )
    return 'Security';

  // deprecate -> Deprecated
  if (message.match(/^deprecate(\(.+\))?:/i) || lowerMsg.includes('deprecat')) return 'Deprecated';

  // remove/delete -> Removed
  if (
    message.match(/^(remove|delete)(\(.+\))?:/i) ||
    lowerMsg.includes('remove') ||
    lowerMsg.includes('delete')
  )
    return 'Removed';

  // refactor/perf/style/update -> Changed
  if (message.match(/^(refactor|perf|style|update|improve)(\(.+\))?:/i)) return 'Changed';

  // Default to Changed for uncategorized
  return 'Changed';
}

export async function generateChangelog(commits: Commit[], useAI = false): Promise<string[]> {
  const summaries = useAI ? await summarizeWithAI(commits) : new Map();

  // Group by Keep a Changelog categories
  const grouped: Record<ChangeCategory, string[]> = {
    Added: [],
    Changed: [],
    Deprecated: [],
    Removed: [],
    Fixed: [],
    Security: [],
  };

  for (const commit of commits) {
    const summary = summaries.get(commit.hash) ?? commit.message;
    const attribution =
      commit.author && !team.includes(commit.author) ? ` (@${commit.author})` : '';

    // Clean up conventional commit prefix for display
    const cleanSummary = summary.replace(
      /^(feat|fix|refactor|perf|style|docs|test|chore|ci|build|revert)(\(.+\))?:\s*/i,
      '',
    );
    const entry = `- ${cleanSummary.charAt(0).toUpperCase() + cleanSummary.slice(1)}${attribution}`;

    const category = categorizeCommit(commit.message);
    grouped[category].push(entry);
  }

  const lines: string[] = [];

  // Output in Keep a Changelog order
  const categoryOrder: ChangeCategory[] = [
    'Added',
    'Changed',
    'Deprecated',
    'Removed',
    'Fixed',
    'Security',
  ];

  for (const category of categoryOrder) {
    const entries = grouped[category];
    if (entries.length > 0) {
      lines.push(`### ${category}`);
      lines.push(...entries);
      lines.push('');
    }
  }

  return lines;
}

export async function getContributors(commits: Commit[]): Promise<Map<string, string[]>> {
  const contributors = new Map<string, string[]>();

  for (const commit of commits) {
    if (commit.author && !team.includes(commit.author)) {
      if (!contributors.has(commit.author)) {
        contributors.set(commit.author, []);
      }
      contributors.get(commit.author)?.push(commit.message);
    }
  }

  return contributors;
}

export async function buildNotes(from: string, to: string, useAI = false): Promise<string[]> {
  const commits = await getCommits(from, to);

  if (commits.length === 0) {
    return ['No notable changes'];
  }

  console.log(`Found ${commits.length} commits since v${from}`);

  const notes: string[] = [];

  try {
    const lines = await generateChangelog(commits, useAI);
    notes.push(...lines);
  } catch (error) {
    console.error('Changelog generation failed, using raw commits:', error);
    for (const commit of commits) {
      const attribution =
        commit.author && !team.includes(commit.author) ? ` (@${commit.author})` : '';
      notes.push(`- ${commit.message}${attribution}`);
    }
  }

  const contributors = await getContributors(commits);

  if (contributors.size > 0) {
    notes.push('### Contributors');
    notes.push('');
    notes.push(
      `Thank you to ${contributors.size} community contributor${contributors.size > 1 ? 's' : ''}:`,
    );
    for (const [username, userCommits] of contributors) {
      notes.push(`- @${username}:`);
      for (const c of userCommits) {
        notes.push(`  - ${c}`);
      }
    }
  }

  return notes;
}

// CLI entrypoint
if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      from: { type: 'string', short: 'f' },
      to: { type: 'string', short: 't', default: 'HEAD' },
      ai: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    console.log(`
Usage: bun scripts/changelog.ts [options]

Options:
  -f, --from <version>   Starting version (default: latest GitHub release)
  -t, --to <ref>         Ending ref (default: HEAD)
  --ai                   Use AI to summarize commits (requires ANTHROPIC_API_KEY)
  -h, --help             Show this help message

Examples:
  bun scripts/changelog.ts                     # Latest release to HEAD
  bun scripts/changelog.ts --from 1.0.0        # v1.0.0 to HEAD
  bun scripts/changelog.ts -f 1.0.0 -t 1.1.0   # Between versions
  bun scripts/changelog.ts --ai                # With AI summarization
`);
    process.exit(0);
  }

  const to = values.to ?? 'HEAD';
  const from = values.from ?? (await getLatestRelease());

  console.log(`Generating changelog: v${from} -> ${to}\n`);

  const notes = await buildNotes(from, to, values.ai);
  console.log('\n=== Release Notes ===\n');
  console.log(notes.join('\n'));
}
