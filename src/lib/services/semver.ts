/**
 * Minimal semver utilities for version comparison.
 *
 * @module services/semver
 */

/**
 * Parse a semver string into components.
 * Supports formats like "1.2.3", "1.2.3-beta.1", "v1.2.3"
 */
function parse(version: string): { major: number; minor: number; patch: number } | null {
  // Remove leading 'v' if present
  const cleaned = version.replace(/^v/, '');

  // Match major.minor.patch, ignoring prerelease/metadata
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);

  if (!match) {
    return null;
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  };
}

/**
 * Check if a version string is valid semver.
 *
 * @param version - Version string to validate
 * @returns The version string if valid, null otherwise
 */
export function valid(version: string): string | null {
  const parsed = parse(version);
  return parsed ? version : null;
}

/**
 * Compare two semver versions.
 *
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compare(a: string, b: string): -1 | 0 | 1 {
  const parsedA = parse(a);
  const parsedB = parse(b);

  if (!parsedA || !parsedB) {
    return 0;
  }

  // Compare major
  if (parsedA.major > parsedB.major) return 1;
  if (parsedA.major < parsedB.major) return -1;

  // Compare minor
  if (parsedA.minor > parsedB.minor) return 1;
  if (parsedA.minor < parsedB.minor) return -1;

  // Compare patch
  if (parsedA.patch > parsedB.patch) return 1;
  if (parsedA.patch < parsedB.patch) return -1;

  return 0;
}

/**
 * Check if version a is greater than version b.
 */
export function gt(a: string, b: string): boolean {
  return compare(a, b) === 1;
}

/**
 * Check if version a is less than version b.
 */
export function lt(a: string, b: string): boolean {
  return compare(a, b) === -1;
}

/**
 * Check if version a equals version b.
 */
export function eq(a: string, b: string): boolean {
  return compare(a, b) === 0;
}

/**
 * Check if version a is greater than or equal to version b.
 */
export function gte(a: string, b: string): boolean {
  return compare(a, b) >= 0;
}

/**
 * Check if version a is less than or equal to version b.
 */
export function lte(a: string, b: string): boolean {
  return compare(a, b) <= 0;
}
