import { render } from 'ink';
import { FirebaseWizard } from '../ui/components/FirebaseWizard';
import { printFinalOutput } from '../ui/utils/finalOutput';

/**
 * Firebase command - check and configure Firebase credentials
 *
 * Usage: clix firebase
 */
export async function firebaseCommand(): Promise<void> {
  const projectPath = process.cwd();

  return new Promise((resolve) => {
    const { unmount } = render(
      <FirebaseWizard
        projectPath={projectPath}
        onComplete={(result) => {
          unmount();
          if (result.skipped) {
            printFinalOutput({
              type: 'info',
              title: 'Firebase setup',
              message: 'Setup skipped',
            });
          } else if (result.completed) {
            printFinalOutput({
              type: 'success',
              title: 'Firebase setup',
              message: 'Configuration complete',
            });
          }
          resolve();
        }}
        onCancel={() => {
          unmount();
          printFinalOutput({
            type: 'info',
            title: 'Firebase setup',
            message: 'Setup cancelled',
          });
          resolve();
        }}
      />,
      { incrementalRendering: true },
    );
  });
}
