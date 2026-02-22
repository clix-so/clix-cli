import { skillCommand } from './skill/index';

interface InstallCommandOptions {
  platform?: 'ios' | 'android' | 'react-native' | 'flutter';
  startTask?: string;
}

export async function installCommand(options: InstallCommandOptions = {}): Promise<void> {
  await skillCommand({
    action: 'install',
    platform: options.platform,
    startTask: options.startTask,
  });
}
