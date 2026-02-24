import { skillCommand } from './skill/index';

export async function doctorCommand(): Promise<void> {
  await skillCommand({
    action: 'doctor',
  });
}
