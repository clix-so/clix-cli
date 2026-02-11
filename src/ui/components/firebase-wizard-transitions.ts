import type { WizardPhase } from '@/lib/services/firebase';

/**
 * Extended wizard phase for download flow.
 */
export type ExtendedWizardPhase =
  | WizardPhase
  | 'authenticating'
  | 'select_project'
  | 'select_android_app'
  | 'select_ios_app'
  | 'downloading'
  | 'no_apps_found'
  | 'create_android_app'
  | 'create_ios_app'
  | 'creating_app'
  | 'no_projects'
  | 'select_gcp_project'
  | 'adding_firebase'
  | 'checking_sender_config'
  | 'sender_config_registered'
  | 'service_account_menu'
  | 'paste_service_account'
  | 'saving_service_account'
  | 'registering_sender_config';

/**
 * Phase transition event type.
 * Each key represents a named event that triggers a transition.
 */
type TransitionEvent = string;

/**
 * Centralized phase transition map.
 *
 * Every valid phase transition is defined here. This makes the entire
 * wizard flow visible in one place and prevents invalid transitions.
 *
 * Flow overview:
 *   detecting → status → menu → (various actions)
 *   menu/download → authenticating → select_project → select_*_app → downloading
 *   downloading → checking_sender_config → service_account_menu → paste → saving → complete
 *
 * Adding a new phase:
 *   1. Add the phase to ExtendedWizardPhase type
 *   2. Add transition rules here
 *   3. Add the phase component and rendering case
 */
export const PHASE_TRANSITIONS: Partial<
  Record<ExtendedWizardPhase, Record<TransitionEvent, ExtendedWizardPhase>>
> = {
  // === Initial Detection ===
  detecting: {
    success: 'status',
    error: 'error',
  },

  // === Status & Menu ===
  status: {
    continue: 'menu',
  },
  menu: {
    redetect: 'detecting',
    redetect_platform: 'detecting',
    validate: 'validating',
    download: 'authenticating',
    setup_service_account: 'service_account_menu',
    done: 'complete',
    skip: 'complete',
  },
  validating: {
    success: 'status',
    error: 'error',
  },

  // === Download / Auth Flow ===
  authenticating: {
    no_projects: 'no_projects',
    select_project: 'select_project',
    select_gcp_project: 'select_gcp_project',
    error: 'error',
  },
  select_project: {
    no_apps_found: 'no_apps_found',
    select_android_app: 'select_android_app',
    select_ios_app: 'select_ios_app',
    error: 'error',
  },
  select_android_app: {
    select_ios_app: 'select_ios_app',
    // note: also triggers download via ref (not a phase transition)
  },
  select_ios_app: {
    // note: triggers download via ref (not a phase transition)
  },
  downloading: {
    success: 'checking_sender_config',
    error: 'error',
  },

  // === No Apps / App Creation ===
  no_apps_found: {
    create_android: 'create_android_app',
    create_ios: 'create_ios_app',
    cancel: 'select_project',
  },
  create_android_app: {
    submit: 'creating_app',
    cancel: 'select_project',
  },
  create_ios_app: {
    submit: 'creating_app',
    cancel: 'select_project',
  },
  creating_app: {
    no_apps_found: 'no_apps_found',
    select_ios_app: 'select_ios_app',
    error: 'error',
    // note: also triggers download via ref (not a phase transition)
  },

  // === No Projects / GCP ===
  no_projects: {
    open_console: 'menu',
    select_gcp: 'authenticating',
  },
  select_gcp_project: {
    adding_firebase: 'adding_firebase',
    error: 'error',
  },
  adding_firebase: {
    error: 'error',
    // note: on success, triggers project selection via ref
  },

  // === Sender Config Check ===
  checking_sender_config: {
    registered: 'sender_config_registered',
    not_registered: 'service_account_menu',
    skip: 'service_account_menu',
    error: 'service_account_menu',
  },
  sender_config_registered: {
    continue: 'complete',
  },

  // === Service Account Setup ===
  service_account_menu: {
    open_console: 'paste_service_account',
    paste_json: 'paste_service_account',
    skip: 'status',
    error: 'error',
  },
  paste_service_account: {
    save: 'saving_service_account',
    cancel: 'service_account_menu',
  },
  saving_service_account: {
    register: 'registering_sender_config',
    complete: 'complete',
    error: 'error',
  },
  registering_sender_config: {
    complete: 'complete',
  },

  // === Terminal States ===
  error: {
    retry: 'detecting',
    // note: retry with re-auth goes through handleDownload (not a simple transition)
  },
  // 'complete' has no outgoing transitions
};

/**
 * Perform a validated phase transition.
 *
 * @param from - Current phase
 * @param event - Named event triggering the transition
 * @returns Target phase
 * @throws Error if the transition is not defined in PHASE_TRANSITIONS
 */
export function transition(from: ExtendedWizardPhase, event: TransitionEvent): ExtendedWizardPhase {
  const transitions = PHASE_TRANSITIONS[from];
  const target = transitions?.[event];
  if (!target) {
    throw new Error(
      `Invalid phase transition: ${from} + "${event}". ` +
        `Valid events: ${transitions ? Object.keys(transitions).join(', ') : 'none'}`,
    );
  }
  return target;
}
