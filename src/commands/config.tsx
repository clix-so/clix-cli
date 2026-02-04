import { ConfigUI } from '../ui/ConfigUI';
import { printFinalOutput } from '../ui/utils/finalOutput';
import { safeRender } from '../ui/utils/safeRender';

export async function configCommand(): Promise<void> {
  return new Promise((resolve) => {
    const { unmount } = safeRender(
      <ConfigUI
        onComplete={(result) => {
          unmount();
          if (result) {
            printFinalOutput(result);
          }
          resolve();
        }}
      />,
    );
  });
}
