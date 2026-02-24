/**
 * Centralized process exit code management.
 *
 * All command-level exit code assignments should go through this function
 * instead of setting `process.exitCode` directly. The actual `process.exit()`
 * call happens once in `cli.tsx` via `main().finally()`.
 */
export function setExitCode(code: number): void {
  process.exitCode = code;
}
