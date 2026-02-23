/**
 * Podfile modifier for iOS setup automation.
 * Adds Clix SDK to extension targets in CocoaPods projects.
 *
 * @module ios/podfile-modifier
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Options for Podfile modification operations.
 */
export interface PodfileModifierOptions {
  /** iOS project directory containing Podfile */
  iosDir: string;
  /** NSE target name */
  extensionName: string;
  /** Custom pod spec (default: 'Clix') */
  clixPodSpec?: string;
}

/**
 * Result of Podfile modification operations.
 */
export interface PodfileModificationResult {
  success: boolean;
  modified: boolean;
  podfileExists: boolean;
  targetAdded: boolean;
  clixPodAdded: boolean;
  error?: string;
}

/**
 * Check if Podfile exists in the iOS directory.
 */
export function hasPodfile(iosDir: string): boolean {
  return fs.existsSync(path.join(iosDir, 'Podfile'));
}

/**
 * Check if extension target already exists in Podfile.
 */
export function hasExtensionTarget(iosDir: string, extensionName: string): boolean {
  const podfilePath = path.join(iosDir, 'Podfile');
  if (!fs.existsSync(podfilePath)) return false;

  const content = fs.readFileSync(podfilePath, 'utf-8');
  const targetRegex = new RegExp(`target\\s+['"]${escapeRegex(extensionName)}['"]\\s+do`, 'i');
  return targetRegex.test(content);
}

function extractTargetBlock(content: string, targetName: string): string | null {
  const targetRegex = new RegExp(
    `target\\s+['"]${escapeRegex(targetName)}['"]\\s+do([\\s\\S]*?)\\n\\s*end`,
    'i',
  );
  const match = content.match(targetRegex);
  return match?.[0] ?? null;
}

export function hasClixPodInExtensionTarget(
  iosDir: string,
  extensionName: string,
  clixPodSpec = 'Clix',
): boolean {
  const podfilePath = path.join(iosDir, 'Podfile');
  if (!fs.existsSync(podfilePath)) return false;

  const content = fs.readFileSync(podfilePath, 'utf-8');
  const targetBlock = extractTargetBlock(content, extensionName);
  if (!targetBlock) {
    return false;
  }

  const podRegex = new RegExp(`pod\\s+['"]${escapeRegex(clixPodSpec)}['"]`, 'i');
  return podRegex.test(targetBlock);
}

/**
 * Create backup of Podfile before modification.
 */
export function backupPodfile(iosDir: string): string {
  const podfilePath = path.join(iosDir, 'Podfile');
  const backupPath = `${podfilePath}.backup.${Date.now()}`;
  fs.copyFileSync(podfilePath, backupPath);
  return backupPath;
}

/**
 * Restore Podfile from backup.
 */
export function restorePodfile(backupPath: string, iosDir: string): void {
  const podfilePath = path.join(iosDir, 'Podfile');
  fs.copyFileSync(backupPath, podfilePath);
}

/**
 * Add Clix SDK to extension target in Podfile.
 */
export async function addClixToExtensionTarget(
  options: PodfileModifierOptions,
): Promise<PodfileModificationResult> {
  const result: PodfileModificationResult = {
    success: false,
    modified: false,
    podfileExists: false,
    targetAdded: false,
    clixPodAdded: false,
  };

  const podfilePath = path.join(options.iosDir, 'Podfile');

  if (!fs.existsSync(podfilePath)) {
    // Not an error - just skip for non-CocoaPods projects
    result.success = true;
    return result;
  }

  result.podfileExists = true;

  try {
    let content = fs.readFileSync(podfilePath, 'utf-8');

    if (hasExtensionTarget(options.iosDir, options.extensionName)) {
      if (hasClixPodInExtensionTarget(options.iosDir, options.extensionName, options.clixPodSpec)) {
        result.success = true;
        return result;
      }

      const targetBlock = extractTargetBlock(content, options.extensionName);
      if (!targetBlock) {
        result.error = `Failed to locate target block for ${options.extensionName}`;
        return result;
      }

      const updatedBlock = targetBlock.replace(
        /\nend$/i,
        `\n  pod '${options.clixPodSpec || 'Clix'}'\nend`,
      );
      content = content.replace(targetBlock, updatedBlock);

      fs.writeFileSync(podfilePath, content);
      result.success = true;
      result.modified = true;
      result.clixPodAdded = true;
      return result;
    }

    const targetBlock = generateTargetBlock(options.extensionName, options.clixPodSpec);
    const postInstallMatch = content.match(/^post_install\s+do/m);

    if (postInstallMatch && postInstallMatch.index !== undefined) {
      content =
        content.slice(0, postInstallMatch.index) +
        targetBlock +
        '\n\n' +
        content.slice(postInstallMatch.index);
    } else {
      content = `${content.trimEnd()}\n\n${targetBlock}\n`;
    }

    fs.writeFileSync(podfilePath, content);

    result.success = true;
    result.modified = true;
    result.targetAdded = true;
    result.clixPodAdded = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

/**
 * Generate Podfile target block for extension.
 */
function generateTargetBlock(extensionName: string, clixPodSpec?: string): string {
  const podSpec = clixPodSpec || 'Clix';
  return `target '${extensionName}' do
  pod '${podSpec}'
end`;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get all target names from Podfile.
 */
export function getPodfileTargets(iosDir: string): string[] {
  const podfilePath = path.join(iosDir, 'Podfile');
  if (!fs.existsSync(podfilePath)) return [];

  try {
    const content = fs.readFileSync(podfilePath, 'utf-8');
    const targetRegex = /target\s+['"]([^'"]+)['"]\s+do/gi;
    const matches = content.matchAll(targetRegex);
    return Array.from(matches, (m) => m[1]);
  } catch {
    return [];
  }
}
