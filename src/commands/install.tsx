import { skillCommand } from './skill/index';

interface InstallCommandOptions {
  startTask?: string;
}

export async function installCommand(options: InstallCommandOptions = {}): Promise<void> {
  await skillCommand({
    action: 'install',
    startTask: options.startTask,
  });
}
