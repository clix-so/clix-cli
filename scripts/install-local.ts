#!/usr/bin/env bun

/**
 * Local installation script.
 * Builds the binary for the current platform and installs it to ~/.local/bin
 */

import { chmod, copyFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const INSTALL_DIR = join(homedir(), '.local', 'bin');
const BINARY_NAME = 'clix';

function detectPlatform(): string {
  const os = process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `${os}-${arch}`;
}

async function build(platform: string): Promise<string> {
  // Always run full build to ensure latest code is included
  console.log('Building dist/cli.js...');
  const buildProc = Bun.spawn(['bun', 'run', 'build'], {
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const buildExitCode = await buildProc.exited;
  if (buildExitCode !== 0) {
    throw new Error(`Build failed with exit code ${buildExitCode}`);
  }

  console.log(`\nCompiling binary for ${platform}...`);
  const compileProc = Bun.spawn(['bun', 'run', 'build:binary', platform], {
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const compileExitCode = await compileProc.exited;
  if (compileExitCode !== 0) {
    throw new Error(`Compile failed with exit code ${compileExitCode}`);
  }

  return `./dist/bin/clix-${platform}`;
}

async function install(binaryPath: string): Promise<void> {
  const destPath = join(INSTALL_DIR, BINARY_NAME);

  // Create install directory
  await mkdir(INSTALL_DIR, { recursive: true });

  // Copy binary
  console.log(`\nInstalling to ${destPath}...`);
  await copyFile(binaryPath, destPath);

  // Make executable
  await chmod(destPath, 0o755);

  console.log('\n✓ Installation complete!');
  console.log(`\nRun 'clix --help' to get started.`);

  // Check if in PATH
  const path = process.env.PATH || '';
  if (!path.includes(INSTALL_DIR)) {
    console.log(`\n⚠ ${INSTALL_DIR} is not in your PATH.`);
    console.log(`  Add the following to your shell profile:`);
    console.log(`  export PATH="$PATH:${INSTALL_DIR}"`);
  }
}

async function main() {
  const platform = detectPlatform();
  const binaryPath = await build(platform);
  await install(binaryPath);
}

main().catch((error) => {
  console.error('Installation failed:', error.message);
  process.exit(1);
});
