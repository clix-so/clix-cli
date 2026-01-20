#!/usr/bin/env bun

import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';

const DIST_BIN_DIR = './dist/bin';
const DIST_CLI_JS = './dist/cli.js';

interface Target {
  name: string;
  bunTarget: string;
}

const TARGETS: Target[] = [
  // macOS
  { name: 'darwin-arm64', bunTarget: 'bun-darwin-arm64' },
  { name: 'darwin-x64', bunTarget: 'bun-darwin-x64' },
  // Linux glibc
  { name: 'linux-arm64', bunTarget: 'bun-linux-arm64' },
  { name: 'linux-x64', bunTarget: 'bun-linux-x64' },
  // Linux musl (Alpine, etc.)
  { name: 'linux-arm64-musl', bunTarget: 'bun-linux-arm64-musl' },
  { name: 'linux-x64-musl', bunTarget: 'bun-linux-x64-musl' },
];

async function calculateSha256(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const buffer = await file.arrayBuffer();
  const hash = createHash('sha256');
  hash.update(Buffer.from(buffer));
  return hash.digest('hex');
}

async function ensureDistCliExists(): Promise<void> {
  try {
    await access(DIST_CLI_JS, constants.R_OK);
  } catch {
    console.log('Building dist/cli.js first...');
    const buildProc = Bun.spawn(['bun', 'run', 'build'], {
      stdout: 'inherit',
      stderr: 'inherit',
    });
    const exitCode = await buildProc.exited;
    if (exitCode !== 0) {
      throw new Error('Failed to build dist/cli.js');
    }
  }
}

async function compile() {
  const args = process.argv.slice(2);
  const generateChecksums = args.includes('--checksums');
  const targetArg = args.find((arg) => arg !== '--checksums');

  // Ensure dist/cli.js exists (it has react-devtools-core import removed)
  await ensureDistCliExists();

  // Clean dist/bin directory
  await rm(DIST_BIN_DIR, { recursive: true, force: true });
  await mkdir(DIST_BIN_DIR, { recursive: true });

  const targetsToCompile = targetArg
    ? TARGETS.filter((t) => t.name === targetArg || t.bunTarget === targetArg)
    : TARGETS;

  if (targetsToCompile.length === 0) {
    console.error(`Unknown target: ${targetArg}`);
    console.error('Available targets:', TARGETS.map((t) => t.name).join(', '));
    process.exit(1);
  }

  console.log('Compiling binaries...');

  const checksums: string[] = [];

  for (const target of targetsToCompile) {
    const outName = `clix-${target.name}`;
    const outPath = `${DIST_BIN_DIR}/${outName}`;

    console.log(`  Compiling for ${target.name}...`);

    // Compile from dist/cli.js which has react-devtools-core import removed
    // This avoids the runtime error when the binary tries to resolve the external package
    const proc = Bun.spawn(
      [
        'bun',
        'build',
        DIST_CLI_JS,
        '--compile',
        '--target',
        target.bunTarget,
        '--outfile',
        outPath,
      ],
      {
        stdout: 'inherit',
        stderr: 'inherit',
      },
    );

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      console.error(`  Failed to compile for ${target.name}`);
      process.exit(1);
    }

    console.log(`  Created: ${outPath}`);

    if (generateChecksums) {
      const hash = await calculateSha256(outPath);
      checksums.push(`${hash}  ${outName}`);
      console.log(`  SHA256: ${hash}`);
    }
  }

  if (generateChecksums && checksums.length > 0) {
    const checksumsPath = `${DIST_BIN_DIR}/checksums.sha256`;
    await writeFile(checksumsPath, `${checksums.join('\n')}\n`);
    console.log(`\nChecksums written to: ${checksumsPath}`);
  }

  console.log('Compilation complete!');
}

compile().catch((error) => {
  console.error('Compilation error:', error);
  process.exit(1);
});
