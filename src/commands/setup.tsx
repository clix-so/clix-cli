import { SetupUI } from '@/ui/SetupUI';
import { safeRender } from '@/ui/utils/safeRender';

interface SetupCommandOptions {
  /** Project path (defaults to cwd) */
  projectPath?: string;
}

/**
 * Run the project setup command.
 * Sets up .clix/config.jsonc with org, project, and member information.
 */
export async function setupCommand(options?: SetupCommandOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const { waitUntilExit } = safeRender(
      <SetupUI
        projectPath={options?.projectPath}
        onComplete={() => {
          resolve();
        }}
        onError={(error) => {
          reject(error);
        }}
      />,
    );

    waitUntilExit().then(() => {
      resolve();
    });
  });
}
