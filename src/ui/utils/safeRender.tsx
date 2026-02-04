import { type Instance, type RenderOptions, render } from 'ink';
import type React from 'react';
import { SafeHeightContainer } from '../components/SafeHeightContainer';

/**
 * Options for safeRender, extending Ink's RenderOptions.
 * incrementalRendering defaults to true for better performance.
 */
export interface SafeRenderOptions extends Omit<RenderOptions, 'incrementalRendering'> {
  incrementalRendering?: boolean;
  /**
   * Disable height constraint. Use when full terminal height is needed
   * and flickering is acceptable.
   */
  disableSafeHeight?: boolean;
}

/**
 * Wrapper around Ink's render() that automatically applies:
 * 1. SafeHeightContainer to prevent terminal flickering (Ink issue #450)
 * 2. incrementalRendering: true for better rendering performance
 *
 * Use this instead of Ink's render() for consistent behavior across all CLI commands.
 *
 * Note: The returned rerender function also wraps elements with SafeHeightContainer.
 *
 * @example
 * const { unmount } = safeRender(<MyComponent />);
 *
 * @example
 * // With custom options
 * const { unmount } = safeRender(<MyComponent />, { exitOnCtrlC: false });
 *
 * @example
 * // Disable height constraint if needed
 * const { unmount } = safeRender(<MyComponent />, { disableSafeHeight: true });
 */
export function safeRender(element: React.ReactElement, options: SafeRenderOptions = {}): Instance {
  const { disableSafeHeight = false, incrementalRendering = true, ...inkOptions } = options;

  const wrapElement = (el: React.ReactElement) =>
    disableSafeHeight ? el : <SafeHeightContainer>{el}</SafeHeightContainer>;

  const instance = render(wrapElement(element), {
    ...inkOptions,
    incrementalRendering,
  });

  // Wrap rerender to also apply SafeHeightContainer
  const originalRerender = instance.rerender.bind(instance);
  instance.rerender = (newElement: React.ReactElement) => {
    originalRerender(wrapElement(newElement));
  };

  return instance;
}
