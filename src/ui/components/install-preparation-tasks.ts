import type { PreparationContext } from '@/commands/skill/preparation';

export type InstallTaskId =
  | 'firebase_config_files'
  | 'apns_key_for_firebase'
  | 'firebase_service_account'
  | 'ios_entitlements'
  | 'notification_service_extension';

const INSTALL_TASK_ORDER: InstallTaskId[] = [
  'firebase_config_files',
  'apns_key_for_firebase',
  'firebase_service_account',
  'ios_entitlements',
  'notification_service_extension',
];

export const INSTALL_TASK_LABELS: Record<InstallTaskId, string> = {
  firebase_config_files: 'Firebase Configuration Files',
  apns_key_for_firebase: 'APNS Key for Firebase',
  firebase_service_account: 'Firebase Service Account',
  ios_entitlements: 'iOS Entitlements',
  notification_service_extension: 'Notification Service Extension',
};

export function isTaskApplicable(context: PreparationContext, taskId: InstallTaskId): boolean {
  switch (taskId) {
    case 'firebase_config_files':
    case 'firebase_service_account':
      return context.firebase.needed;
    case 'apns_key_for_firebase':
    case 'ios_entitlements':
    case 'notification_service_extension':
      return context.ios.needed;
    default:
      return false;
  }
}

export function isTaskCompleted(context: PreparationContext, taskId: InstallTaskId): boolean {
  switch (taskId) {
    case 'firebase_config_files':
      return context.firebase.androidConfigured && context.firebase.iosConfigured;
    case 'apns_key_for_firebase':
      return context.apns.registeredWithFirebase;
    case 'firebase_service_account':
      return context.firebase.senderConfigConfigured;
    case 'ios_entitlements':
      return context.ios.entitlementsConfigured;
    case 'notification_service_extension':
      return context.ios.nseConfigured;
    default:
      return false;
  }
}

export function getApplicableInstallTasks(context: PreparationContext): InstallTaskId[] {
  return INSTALL_TASK_ORDER.filter((taskId) => isTaskApplicable(context, taskId));
}

export function getNextIncompleteTaskId(context: PreparationContext): InstallTaskId | null {
  const tasks = getApplicableInstallTasks(context);
  return tasks.find((taskId) => !isTaskCompleted(context, taskId)) ?? null;
}
