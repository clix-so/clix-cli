/**
 * Application version utility.
 * Uses build-time embedded version for binary builds, falls back to package.json.
 */

// Try to import package.json for development/npm installs
let packageVersion = '0.0.0';
try {
  // Dynamic import to avoid build issues
  const pkg = await import('../../package.json');
  packageVersion = pkg.version || pkg.default?.version || '0.0.0';
} catch {
  // package.json not available (binary build)
}

/**
 * Get the current application version.
 * Prioritizes build-time embedded version (CLIX_VERSION) for binary builds.
 */
export const VERSION: string = process.env.CLIX_VERSION || packageVersion;
