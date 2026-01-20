import { render } from 'ink';
import { ConfigUI } from '../ui/ConfigUI';
import { printFinalOutput } from '../ui/utils/finalOutput';

export async function configCommand(): Promise<void> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <ConfigUI
        onComplete={(result) => {
          unmount();
          if (result) {
            printFinalOutput(result);
          }
          resolve();
        }}
      />,
      { incrementalRendering: true },
    );
  });
}
