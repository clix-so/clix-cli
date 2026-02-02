#!/usr/bin/env bun

import { mkdir, readFile, rm } from 'node:fs/promises';

const DIST_DIR = './dist';

/**
 * Embed skills from @clix-so/clix-agent-skills package.
 * This must run before building to ensure skills are available in the binary.
 */
async function embedSkills() {
  console.log('Embedding skills from @clix-so/clix-agent-skills...');
  const proc = Bun.spawn(['bun', 'scripts/embed-skills.ts'], {
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Failed to embed skills (exit code: ${exitCode})`);
  }
}

async function build() {
  console.log('Building clix-cli...');

  // Embed skills before building (required for binary to work standalone)
  await embedSkills();
  console.log('');

  // Read version from package.json
  const packageJson = JSON.parse(await readFile('./package.json', 'utf-8'));
  const version = packageJson.version;
  console.log(`Version: ${version}`);

  // Clean dist directory
  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(DIST_DIR, { recursive: true });

  // Build with Bun - target node for compatibility
  const result = await Bun.build({
    entrypoints: ['./src/cli.tsx'],
    outdir: DIST_DIR,
    target: 'node',
    format: 'esm',
    external: [
      // Agent SDKs must be external - they contain native binaries in vendor/ directories
      // that need to be resolved at runtime from node_modules
      '@anthropic-ai/claude-agent-sdk',
      '@openai/codex-sdk',
      // Note: @clix-so/clix-agent-skills is embedded at build time via embed-skills.ts
      // External optional dependencies that shouldn't be bundled
      'react-devtools-core',
      'ws',
      'bufferutil',
      'utf-8-validate',
      // @expo/plist uses relative requires - must be external
      '@expo/plist',
    ],
    define: {
      // Disable dev mode to prevent react-devtools-core import
      'process.env.DEV': 'false',
      'process.env.NODE_ENV': '"production"',
      // Embed version at build time for binary builds
      'process.env.CLIX_VERSION': JSON.stringify(version),
    },
    minify: false, // Keep readable for debugging
    sourcemap: 'external',
  });

  if (!result.success) {
    console.error('Build failed:');
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  // Read the built file and remove react-devtools-core import
  const cliPath = `${DIST_DIR}/cli.js`;
  let cliContent = await Bun.file(cliPath).text();

  // Remove the devtools import line that causes issues
  cliContent = cliContent.replace(
    /import\s+\w+\s+from\s+["']react-devtools-core["'];?\n?/g,
    '// react-devtools-core removed for production\nvar devtools = null;\n',
  );

  // Add shebang that works with both node and bun
  await Bun.write(cliPath, `#!/usr/bin/env node\n${cliContent}`);

  // Make executable
  const proc = Bun.spawn(['chmod', '+x', cliPath]);
  await proc.exited;

  console.log('Build complete!');
  console.log(`Output: ${cliPath}`);
  console.log('');
  console.log('Run with:');
  console.log('  Node.js: node dist/cli.js');
  console.log('  Bun:     bun dist/cli.js');
}

build().catch((error) => {
  console.error('Build error:', error);
  process.exit(1);
});
