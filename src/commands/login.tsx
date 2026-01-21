import { render } from 'ink';
import { LoginUI } from '../ui/LoginUI';
import { printFinalOutput } from '../ui/utils/finalOutput';

/**
 * Login command - authenticates user via Auth0 Device Flow
 *
 * Usage: clix login
 */
export async function loginCommand(): Promise<void> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <LoginUI
        onComplete={(credentials) => {
          unmount();
          printFinalOutput({
            type: 'success',
            title: 'Login successful',
            message: `Token expires at ${new Date(credentials.expiresAt).toLocaleString()}`,
          });
          resolve();
        }}
        onError={(error) => {
          unmount();
          printFinalOutput({
            type: 'error',
            title: 'Login failed',
            message: error.message,
          });
          resolve();
        }}
      />,
      { incrementalRendering: true },
    );
  });
}
