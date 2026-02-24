import { setExitCode } from '../lib/exit';
import { safeRender } from '../ui/utils/safeRender';
import { WhoamiUI } from '../ui/WhoamiUI';

/**
 * Whoami command - displays current authenticated user
 *
 * Usage: clix whoami
 */
export async function whoamiCommand(): Promise<void> {
  return new Promise((resolve) => {
    const { unmount } = safeRender(
      <WhoamiUI
        onComplete={(result) => {
          unmount();
          if (result.status === 'error') {
            setExitCode(1);
          }
          resolve();
        }}
      />,
    );
  });
}
