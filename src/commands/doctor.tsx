import { skillCommand } from './skill/index';

interface DoctorCommandOptions {
  platform?: 'ios' | 'android' | 'react-native' | 'flutter';
}

export async function doctorCommand(options: DoctorCommandOptions = {}): Promise<void> {
  await skillCommand({
    action: 'doctor',
    platform: options.platform,
  });
}
