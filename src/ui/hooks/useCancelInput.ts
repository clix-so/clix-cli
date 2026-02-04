import { useInput } from 'ink';

export interface UseCancelInputOptions {
  /** Whether the cancel handler is active (default: true) */
  isActive?: boolean;
  /** Handle ESC key (default: true) */
  handleEsc?: boolean;
  /** Handle Ctrl+C key (default: true) */
  handleCtrlC?: boolean;
}

/**
 * Detects if the input represents a Ctrl+C key press.
 * Handles both direct Ctrl+C and raw escape sequence.
 */
export function isCtrlCInput(input: string, key: { ctrl: boolean }): boolean {
  return (input === 'c' && key.ctrl) || input === '\x03';
}

/**
 * Hook for handling ESC and/or Ctrl+C cancellation.
 * Provides consistent cancel key detection across all components.
 *
 * @example
 * // Basic usage
 * useCancelInput(() => onCancel());
 *
 * @example
 * // With options
 * useCancelInput(onCancel, {
 *   isActive: isOverlayVisible,
 *   handleCtrlC: false  // ESC only
 * });
 */
export function useCancelInput(onCancel: () => void, options: UseCancelInputOptions = {}): void {
  const { isActive = true, handleEsc = true, handleCtrlC = true } = options;

  useInput(
    (input, key) => {
      const shouldCancel = (handleEsc && key.escape) || (handleCtrlC && isCtrlCInput(input, key));

      if (shouldCancel) {
        onCancel();
      }
    },
    { isActive },
  );
}
