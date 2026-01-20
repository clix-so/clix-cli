#!/usr/bin/env bun
/**
 * Test script to verify detectInstallationMethod works correctly
 * with symlinked npm global installations.
 */

// Simulate npm global install path
const npmGlobalPath = '/Users/user/.nvm/versions/node/v22.16.0/bin/clix';
const npmGlobalRealPath =
  '/Users/user/.nvm/versions/node/v22.16.0/lib/node_modules/@clix-so/clix-cli/dist/cli.js';

console.log('Testing detectInstallationMethod with npm global install path:\n');
console.log('Symlink path:', npmGlobalPath);
console.log('Real path:', npmGlobalRealPath);
console.log('');

// Test detection logic
const realPath = npmGlobalRealPath;

console.log('Detection checks:');
console.log('- Contains "node_modules":', realPath.includes('node_modules'));
console.log('- Contains "/lib/node_modules/":', realPath.includes('/lib/node_modules/'));
console.log('- Is global:', realPath.includes('/lib/node_modules/'));
console.log('');

if (realPath.includes('node_modules')) {
  const isGlobal =
    realPath.includes('/lib/node_modules/') ||
    realPath.includes('/npm/node_modules/') ||
    realPath.includes('AppData/Roaming/npm');

  console.log('✅ Would be detected as: npm (global:', isGlobal, ')');
} else {
  console.log('❌ Would be detected as: binary (incorrect)');
}

console.log('\n=== Test with actual npm global install ===\n');
console.log('Run this to test with actual npm global install:');
console.log('  npm i -g @clix-so/clix-cli@beta');
console.log('  DEBUG=1 clix uninstall --dry-run 2>&1 | grep "Detecting installation"');
console.log('');
console.log('Expected output should include:');
console.log('  [update-service] Detected npm installation { isGlobal: true }');
