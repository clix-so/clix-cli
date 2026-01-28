import { render } from 'ink';
import { WhoamiUI } from '../ui/WhoamiUI';

/**
 * Whoami command - displays current authenticated user
 *
 * Usage: clix whoami
 */
export async function whoamiCommand(): Promise<void> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <WhoamiUI
        onComplete={(result) => {
          unmount();
          if (result.status === 'error') {
            process.exitCode = 1;
          }
          resolve();
        }}
      />,
      { incrementalRendering: true },
    );
  });
}
