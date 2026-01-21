import * as fs from 'node:fs';
import * as path from 'node:path';

export interface IosProjectInfo {
  /** Path to .xcodeproj directory */
  projectPath: string;
  /** Path to .xcworkspace directory (if exists) */
  workspacePath?: string;
  /** Bundle identifier from project */
  bundleId: string;
  /** App name extracted from project */
  appName: string;
  /** List of target names */
  targets: string[];
  /** Existing entitlements file paths */
  entitlementsFiles: string[];
}

export interface ProjectAnalysisResult {
  success: boolean;
  project?: IosProjectInfo;
  error?: string;
}

/**
 * Analyze iOS project structure in the given directory
 */
export async function analyzeIosProject(cwd: string): Promise<ProjectAnalysisResult> {
  // Find .xcodeproj directory
  const projectPath = findXcodeProject(cwd);
  if (!projectPath) {
    return {
      success: false,
      error: 'No Xcode project found. Please run this command in an iOS project directory.',
    };
  }

  // Find .xcworkspace if exists
  const workspacePath = findXcodeWorkspace(cwd);

  // Parse project.pbxproj to get project info
  const pbxprojPath = path.join(projectPath, 'project.pbxproj');
  if (!fs.existsSync(pbxprojPath)) {
    return {
      success: false,
      error: `project.pbxproj not found at ${pbxprojPath}`,
    };
  }

  const pbxprojContent = fs.readFileSync(pbxprojPath, 'utf-8');

  // Extract bundle ID
  const bundleId = extractBundleId(pbxprojContent);
  if (!bundleId) {
    return {
      success: false,
      error:
        'Could not extract bundle identifier from project. Please ensure PRODUCT_BUNDLE_IDENTIFIER is set.',
    };
  }

  // Extract app name
  const appName = extractAppName(pbxprojContent, projectPath);

  // Extract targets
  const targets = extractTargets(pbxprojContent);

  // Find existing entitlements files
  const entitlementsFiles = await findEntitlementsFiles(cwd);

  return {
    success: true,
    project: {
      projectPath,
      workspacePath,
      bundleId,
      appName,
      targets,
      entitlementsFiles,
    },
  };
}

/**
 * Find .xcodeproj directory in the given directory
 */
function findXcodeProject(cwd: string): string | null {
  const entries = fs.readdirSync(cwd, { withFileTypes: true });

  // Look for .xcodeproj in current directory
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.endsWith('.xcodeproj')) {
      return path.join(cwd, entry.name);
    }
  }

  // Check common iOS project subdirectories
  const iosSubdirs = ['ios', 'iOS'];
  for (const subdir of iosSubdirs) {
    const subdirPath = path.join(cwd, subdir);
    if (fs.existsSync(subdirPath) && fs.statSync(subdirPath).isDirectory()) {
      const subdirEntries = fs.readdirSync(subdirPath, { withFileTypes: true });
      for (const entry of subdirEntries) {
        if (entry.isDirectory() && entry.name.endsWith('.xcodeproj')) {
          return path.join(subdirPath, entry.name);
        }
      }
    }
  }

  return null;
}

/**
 * Find .xcworkspace directory in the given directory
 */
function findXcodeWorkspace(cwd: string): string | undefined {
  const entries = fs.readdirSync(cwd, { withFileTypes: true });

  // Look for .xcworkspace in current directory
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.endsWith('.xcworkspace')) {
      return path.join(cwd, entry.name);
    }
  }

  // Check common iOS project subdirectories
  const iosSubdirs = ['ios', 'iOS'];
  for (const subdir of iosSubdirs) {
    const subdirPath = path.join(cwd, subdir);
    if (fs.existsSync(subdirPath) && fs.statSync(subdirPath).isDirectory()) {
      const subdirEntries = fs.readdirSync(subdirPath, { withFileTypes: true });
      for (const entry of subdirEntries) {
        if (entry.isDirectory() && entry.name.endsWith('.xcworkspace')) {
          return path.join(subdirPath, entry.name);
        }
      }
    }
  }

  return undefined;
}

/**
 * Extract bundle identifier from pbxproj content
 */
function extractBundleId(pbxprojContent: string): string | null {
  // Look for PRODUCT_BUNDLE_IDENTIFIER in build settings
  // Pattern: PRODUCT_BUNDLE_IDENTIFIER = "com.example.app";
  // or: PRODUCT_BUNDLE_IDENTIFIER = com.example.app;
  const patterns = [
    /PRODUCT_BUNDLE_IDENTIFIER\s*=\s*"([^"]+)"/,
    /PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;\s]+)/,
  ];

  for (const pattern of patterns) {
    const match = pbxprojContent.match(pattern);
    if (match?.[1]) {
      // Skip if it's a variable reference like $(PRODUCT_BUNDLE_IDENTIFIER)
      const bundleId = match[1];
      if (!bundleId.startsWith('$(') && !bundleId.startsWith('${')) {
        return bundleId;
      }
    }
  }

  return null;
}

/**
 * Extract app name from pbxproj content
 */
function extractAppName(pbxprojContent: string, projectPath: string): string {
  // Try to find PRODUCT_NAME in build settings
  const productNameMatch = pbxprojContent.match(/PRODUCT_NAME\s*=\s*"?([^";\n]+)"?/);
  if (productNameMatch?.[1]) {
    const name = productNameMatch[1].trim();
    // Skip variable references
    if (!name.startsWith('$(') && !name.startsWith('${')) {
      return name;
    }
  }

  // Fallback: use project directory name
  const projectName = path.basename(projectPath, '.xcodeproj');
  return projectName;
}

/**
 * Extract target names from pbxproj content
 */
function extractTargets(pbxprojContent: string): string[] {
  const targets: string[] = [];

  // Pattern to match PBXNativeTarget sections
  // name = "TargetName";
  const targetPattern =
    /\/\* Begin PBXNativeTarget section \*\/([\s\S]*?)\/\* End PBXNativeTarget section \*\//;
  const sectionMatch = pbxprojContent.match(targetPattern);

  if (sectionMatch) {
    const section = sectionMatch[1];
    const namePattern = /name\s*=\s*"?([^";\n]+)"?;/g;
    const matches = section.matchAll(namePattern);
    for (const match of matches) {
      if (match[1]) {
        targets.push(match[1].trim());
      }
    }
  }

  return targets;
}

/**
 * Find existing entitlements files in the project directory
 */
export async function findEntitlementsFiles(cwd: string): Promise<string[]> {
  const entitlementsFiles: string[] = [];

  const searchDirs = [cwd, path.join(cwd, 'ios'), path.join(cwd, 'iOS')];

  for (const searchDir of searchDirs) {
    if (!fs.existsSync(searchDir)) continue;

    await searchForEntitlements(searchDir, entitlementsFiles);
  }

  return entitlementsFiles;
}

/**
 * Recursively search for .entitlements files
 */
async function searchForEntitlements(dir: string, results: string[], depth = 0): Promise<void> {
  // Limit search depth to avoid deep recursion
  if (depth > 5) return;

  // Skip certain directories
  const skipDirs = ['node_modules', 'Pods', 'build', 'DerivedData', '.git'];

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!skipDirs.includes(entry.name)) {
        await searchForEntitlements(fullPath, results, depth + 1);
      }
    } else if (entry.isFile() && entry.name.endsWith('.entitlements')) {
      results.push(fullPath);
    }
  }
}

/**
 * Get the iOS project directory (either cwd or cwd/ios)
 */
export function getIosProjectDir(cwd: string): string | null {
  // Check if current directory has .xcodeproj
  const entries = fs.readdirSync(cwd, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.endsWith('.xcodeproj')) {
      return cwd;
    }
  }

  // Check ios subdirectory
  const iosDir = path.join(cwd, 'ios');
  if (fs.existsSync(iosDir)) {
    const iosEntries = fs.readdirSync(iosDir, { withFileTypes: true });
    for (const entry of iosEntries) {
      if (entry.isDirectory() && entry.name.endsWith('.xcodeproj')) {
        return iosDir;
      }
    }
  }

  return null;
}
