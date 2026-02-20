import type { PreparationContext } from '@/commands/skill/preparation';

export type InstallTaskId =
  | 'firebase_config_files'
  | 'apns_key_for_firebase'
  | 'firebase_service_account'
  | 'ios_entitlements'
  | 'notification_service_extension'
  | 'install_skill';

export type RuntimeTaskState = 'idle' | 'running' | 'failed' | 'complete';
export type RuntimeTaskStateMap = Partial<Record<InstallTaskId, RuntimeTaskState>>;
export interface InstallTaskSelectionOptions {
  includeRuntimeTasks?: boolean;
}

const INSTALL_TASK_ORDER: InstallTaskId[] = [
  'firebase_config_files',
  'firebase_service_account',
  'apns_key_for_firebase',
  'ios_entitlements',
  'notification_service_extension',
  'install_skill',
];

const RUNTIME_TASK_IDS: InstallTaskId[] = ['install_skill'];

export const INSTALL_TASK_LABELS: Record<InstallTaskId, string> = {
  firebase_config_files: 'Firebase Configuration Files',
  apns_key_for_firebase: 'APNS Key for Firebase',
  firebase_service_account: 'Firebase Service Account',
  ios_entitlements: 'iOS Entitlements',
  notification_service_extension: 'Notification Service Extension',
  install_skill: 'SDK Installation',
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
    case 'install_skill':
      return true;
    default:
      return false;
  }
}

export function isRuntimeTask(taskId: InstallTaskId): boolean {
  return RUNTIME_TASK_IDS.includes(taskId);
}

function shouldIncludeTask(
  taskId: InstallTaskId,
  options: InstallTaskSelectionOptions = {},
): boolean {
  if (options.includeRuntimeTasks === false && isRuntimeTask(taskId)) {
    return false;
  }
  return true;
}

export function getTaskRuntimeState(
  taskId: InstallTaskId,
  runtimeTaskState: RuntimeTaskStateMap = {},
): RuntimeTaskState {
  return runtimeTaskState[taskId] ?? 'idle';
}

export function isTaskCompleted(
  context: PreparationContext,
  taskId: InstallTaskId,
  runtimeTaskState: RuntimeTaskStateMap = {},
): boolean {
  if (isRuntimeTask(taskId)) {
    return getTaskRuntimeState(taskId, runtimeTaskState) === 'complete';
  }

  switch (taskId) {
    case 'firebase_config_files':
      return context.firebase.androidConfigured && context.firebase.iosConfigured;
    case 'apns_key_for_firebase':
      return context.apns.registeredWithFirebase;
    case 'firebase_service_account':
      if (context.firebase.senderConfigProjectMatched === false) {
        return false;
      }
      return context.firebase.senderConfigConfigured;
    case 'ios_entitlements':
      return context.ios.entitlementsConfigured;
    case 'notification_service_extension':
      return context.ios.nseConfigured;
    default:
      return false;
  }
}

export function getApplicableInstallTasks(
  context: PreparationContext,
  options: InstallTaskSelectionOptions = {},
): InstallTaskId[] {
  return INSTALL_TASK_ORDER.filter(
    (taskId) => isTaskApplicable(context, taskId) && shouldIncludeTask(taskId, options),
  );
}

export function getNextIncompleteTaskId(
  context: PreparationContext,
  runtimeTaskState: RuntimeTaskStateMap = {},
  options: InstallTaskSelectionOptions = {},
): InstallTaskId | null {
  const tasks = getApplicableInstallTasks(context, options);
  return tasks.find((taskId) => !isTaskCompleted(context, taskId, runtimeTaskState)) ?? null;
}
