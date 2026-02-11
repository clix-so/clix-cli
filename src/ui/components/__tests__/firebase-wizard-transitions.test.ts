import { describe, expect, test } from 'bun:test';
import {
  type ExtendedWizardPhase,
  PHASE_TRANSITIONS,
  transition,
} from '../firebase-wizard-transitions';

describe('PHASE_TRANSITIONS', () => {
  test('all target phases are valid ExtendedWizardPhase values', () => {
    // Collect all phases that appear as targets
    const targetPhases = new Set<string>();
    for (const events of Object.values(PHASE_TRANSITIONS)) {
      if (events) {
        for (const target of Object.values(events)) {
          targetPhases.add(target);
        }
      }
    }

    // Collect all phases that appear as sources (keys in PHASE_TRANSITIONS)
    // plus 'complete' which is a terminal state
    const sourcePhases = new Set<string>(Object.keys(PHASE_TRANSITIONS));
    sourcePhases.add('complete');

    // Every target phase must be either a source phase or 'complete'
    for (const target of targetPhases) {
      expect(sourcePhases.has(target)).toBe(true);
    }
  });

  test('error phase has retry transition', () => {
    expect(PHASE_TRANSITIONS.error?.retry).toBe('detecting');
  });

  test('complete phase has no transitions', () => {
    expect(PHASE_TRANSITIONS.complete).toBeUndefined();
  });
});

describe('transition()', () => {
  test('returns correct target phase for valid transitions', () => {
    expect(transition('detecting', 'success')).toBe('status');
    expect(transition('detecting', 'error')).toBe('error');
    expect(transition('status', 'continue')).toBe('menu');
    expect(transition('menu', 'done')).toBe('complete');
  });

  test('throws on invalid event', () => {
    expect(() => transition('detecting', 'nonexistent')).toThrow(
      'Invalid phase transition: detecting + "nonexistent"',
    );
  });

  test('throws on phase with no transitions', () => {
    expect(() => transition('complete' as ExtendedWizardPhase, 'anything')).toThrow(
      'Invalid phase transition: complete + "anything"',
    );
  });

  test('error message includes valid events', () => {
    try {
      transition('detecting', 'bad');
      expect(true).toBe(false); // Should not reach
    } catch (err) {
      expect((err as Error).message).toContain('Valid events: success, error');
    }
  });
});

describe('flow: download → sender config → SA → complete', () => {
  test('happy path: download → check sender config (not registered) → SA setup → register → complete', () => {
    // Download completes
    expect(transition('downloading', 'success')).toBe('checking_sender_config');
    // Sender config not registered
    expect(transition('checking_sender_config', 'not_registered')).toBe('service_account_menu');
    // User pastes SA JSON
    expect(transition('service_account_menu', 'paste_json')).toBe('paste_service_account');
    // Save SA JSON
    expect(transition('paste_service_account', 'save')).toBe('saving_service_account');
    // Register sender config (has clixProjectId)
    expect(transition('saving_service_account', 'register')).toBe('registering_sender_config');
    // Registration completes
    expect(transition('registering_sender_config', 'complete')).toBe('complete');
  });

  test('sender config already registered → complete', () => {
    expect(transition('downloading', 'success')).toBe('checking_sender_config');
    expect(transition('checking_sender_config', 'registered')).toBe('sender_config_registered');
    expect(transition('sender_config_registered', 'continue')).toBe('complete');
  });

  test('no clixProjectId → skip sender config check → SA setup → complete without register', () => {
    expect(transition('downloading', 'success')).toBe('checking_sender_config');
    // Skip because no clixProjectId
    expect(transition('checking_sender_config', 'skip')).toBe('service_account_menu');
    expect(transition('service_account_menu', 'paste_json')).toBe('paste_service_account');
    expect(transition('paste_service_account', 'save')).toBe('saving_service_account');
    // No clixProjectId → complete directly
    expect(transition('saving_service_account', 'complete')).toBe('complete');
  });

  test('sender config API error → still goes to SA menu', () => {
    expect(transition('checking_sender_config', 'error')).toBe('service_account_menu');
  });
});

describe('flow: initial detection → menu → done', () => {
  test('detect → status → menu → done', () => {
    expect(transition('detecting', 'success')).toBe('status');
    expect(transition('status', 'continue')).toBe('menu');
    expect(transition('menu', 'done')).toBe('complete');
  });

  test('detect → status → menu → skip', () => {
    expect(transition('detecting', 'success')).toBe('status');
    expect(transition('status', 'continue')).toBe('menu');
    expect(transition('menu', 'skip')).toBe('complete');
  });

  test('detect error → retry', () => {
    expect(transition('detecting', 'error')).toBe('error');
    expect(transition('error', 'retry')).toBe('detecting');
  });
});

describe('flow: download authentication', () => {
  test('auth → select project → select apps → download', () => {
    expect(transition('authenticating', 'select_project')).toBe('select_project');
    expect(transition('select_project', 'select_android_app')).toBe('select_android_app');
    expect(transition('select_android_app', 'select_ios_app')).toBe('select_ios_app');
    // select_ios_app triggers download via ref (not a phase transition)
  });

  test('auth → no projects → open console → menu', () => {
    expect(transition('authenticating', 'no_projects')).toBe('no_projects');
    expect(transition('no_projects', 'open_console')).toBe('menu');
  });

  test('auth → no projects → GCP → add firebase', () => {
    expect(transition('authenticating', 'no_projects')).toBe('no_projects');
    // Note: no_projects → select_gcp is indirect (goes through authenticating again)
  });

  test('auth error', () => {
    expect(transition('authenticating', 'error')).toBe('error');
  });
});

describe('flow: app creation', () => {
  test('no apps → create android → creating → needs iOS → no apps found again', () => {
    expect(transition('no_apps_found', 'create_android')).toBe('create_android_app');
    // create_android_app submission triggers handleCreateApp directly (not via transition)
    // After creating: needs iOS → go back to no_apps_found
    expect(transition('creating_app', 'no_apps_found')).toBe('no_apps_found');
  });

  test('no apps → create ios', () => {
    expect(transition('no_apps_found', 'create_ios')).toBe('create_ios_app');
  });

  test('no apps → cancel → back to project selection', () => {
    expect(transition('no_apps_found', 'cancel')).toBe('select_project');
  });

  test('app creation error', () => {
    expect(transition('creating_app', 'error')).toBe('error');
  });
});

describe('flow: service account menu', () => {
  test('open console → paste SA', () => {
    expect(transition('service_account_menu', 'open_console')).toBe('paste_service_account');
  });

  test('paste json → paste SA', () => {
    expect(transition('service_account_menu', 'paste_json')).toBe('paste_service_account');
  });

  test('skip SA → status', () => {
    expect(transition('service_account_menu', 'skip')).toBe('status');
  });

  test('cancel paste → back to SA menu', () => {
    expect(transition('paste_service_account', 'cancel')).toBe('service_account_menu');
  });

  test('save error', () => {
    expect(transition('saving_service_account', 'error')).toBe('error');
  });
});

describe('flow: menu → validate', () => {
  test('validate → success → status', () => {
    expect(transition('menu', 'validate')).toBe('validating');
    expect(transition('validating', 'success')).toBe('status');
  });

  test('validate → error', () => {
    expect(transition('menu', 'validate')).toBe('validating');
    expect(transition('validating', 'error')).toBe('error');
  });
});

describe('flow: menu → redetect', () => {
  test('redetect all → detecting', () => {
    expect(transition('menu', 'redetect')).toBe('detecting');
  });

  test('redetect platform → detecting', () => {
    expect(transition('menu', 'redetect_platform')).toBe('detecting');
  });
});

describe('flow: GCP project', () => {
  test('select GCP → add firebase', () => {
    expect(transition('select_gcp_project', 'adding_firebase')).toBe('adding_firebase');
  });

  test('select GCP error', () => {
    expect(transition('select_gcp_project', 'error')).toBe('error');
  });

  test('add firebase error', () => {
    expect(transition('adding_firebase', 'error')).toBe('error');
  });
});
