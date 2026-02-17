# Repository Guidelines

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Clix CLI is an interactive AI-powered assistant for Clix SDK integration. Built with React/Ink for terminal UI, it supports multiple AI agents (Claude, Codex, Gemini, OpenCode, Cursor, Copilot) with streaming responses, slash commands, and pre-built skills for SDK workflows.

## Agent Behavior

- After any code change, run `bun run check && bun test` automatically. Do not ask permission to run tests.
- Before introducing a new pattern, search the codebase for existing implementations first.
- Prefer automation over confirmation — run tests, fix lint issues, and verify results yourself.
- Only modify files directly related to the task. Do not refactor or "improve" surrounding code.
- When fixing lint/test failures, fix ALL issues in one pass, not incrementally.
- Do not create helper functions that are referenced only once.

## Commands

```bash
bun install                    # Install dependencies
bun run dev                    # Run CLI from source
bun run build                  # Bundle for distribution
bun test                       # Run all tests
bun test path/to/file.test.ts  # Run single test
bun run check                  # Lint + typecheck (Biome + tsc)
```

Debug mode: `DEBUG=1 bun run src/cli.tsx <command>`

## Conditional Workflows

If you change X, do Y:

- **Slash commands added/removed/renamed** → Update `README.md` and `llms.txt` per the sync table below. Run `bun test src/ui/chat/components/__tests__/slash-command-menu.test.ts` to verify registry sync.
- **New UI command added** → Use `safeRender()` (not Ink's `render()`), see [Safe Rendering](#safe-rendering)
- **New React component added** → Include `useCancelInput` hook for ESC/Ctrl+C support, see [Cancel Input](#cancel-input-handling)
- **Biome config (`biome.json`) changed** → Run `bun run lint:fix` to apply new rules across the codebase
- **Command registry (`src/lib/commands/registry.ts`) changed** → Verify slash command menu test passes

**Documentation Sync**: When making changes to the following, update both `README.md` and `llms.txt`:

| Change Type                     | README.md Section                      | llms.txt Section                                     |
| ------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| Slash commands                  | "Slash Commands" table                 | "Slash Commands" + "Slash Commands Reference"        |
| AI agents                       | "Prerequisites" table, "clix agent"    | "Prerequisites", "Agent System", "For AI Assistants" |
| Skills (interactive/autonomous) | "Interactive Skills", "Slash Commands" | "Interactive Skills", "Autonomous Commands"          |
| CLI commands                    | "Commands" section                     | "Commands" section                                   |
| Config paths                    | N/A                                    | "Configuration" section                              |

## Architecture

### Entry & Routing

`src/cli.tsx` - meow-based CLI entry. Routes to commands or starts chat TUI (default).

### Agent Executor Pattern

Pluggable AI agent system with streaming responses:

- Interface: `src/lib/executor.ts:28` - `AgentExecutor` with `execute()`, history, compaction
- Implementations: `src/lib/executors/` - claude, codex, gemini, opencode, cursor, copilot executors
- Message types: `text`, `tool_call`, `tool_result`, `error`, `complete`

### Command System

Three command types in `src/lib/commands/types.ts`:

- `LocalCommand` - Returns string (e.g., `/new`)
- `LocalJSXCommand` - Returns React component (e.g., `/help`, `/debug`)
- `PromptCommand` - Sends prompt to AI (skill commands)

Registry and lookup: `src/lib/commands/registry.ts`. Session reset: `/new` (legacy alias: `/clear`).

Slash command suggestions in `src/ui/chat/components/SlashCommandMenu.tsx` derive from the registry (no hardcoded lists). Use `isHidden: true` to hide a command from help + suggestions.

### Chat UI

`src/ui/chat/ChatApp.tsx` - Main component with context provider. State split into focused hooks under `src/ui/chat/hooks/`.

### Install Preparation Tasks

`src/ui/components/InstallPreparationUI.tsx` orchestrates setup as sequential 1-depth tasks.

- Task order and labels are defined in `src/ui/components/install-preparation-tasks.ts`
- Firebase, APNS, iOS entitlements, and Notification Extension are implemented as reusable task components under:
  - `src/ui/components/FirebaseConfigFilesSetup.tsx`
  - `src/ui/components/FirebaseServiceAccountSetup.tsx`
  - `src/ui/components/push-setup/PushSetupTasks.tsx`
  - `src/ui/components/ios-setup/IosEntitlementsTask.tsx`
  - `src/ui/components/notification-extension-setup/NotificationExtensionTasks.tsx`

### Skills

`src/lib/skills.ts` - Manages skill workflows.

**Interactive Skills** (from `@clix-so/clix-agent-skills` package):

- `integration`, `event-tracking`, `user-management`, `personalization`, `api-triggered-campaigns`
- All use "Guided Interactive Workflow" pattern (Confirm → Propose → Validate → Implement → Verify)
- Only available in Interactive mode (require conversation context)

**Autonomous Commands** (local skills in `src/lib/skills.ts`):

- `install`, `doctor`, `debug` - defined as `LOCAL_SKILLS` with `isLocal: true`
- Can be executed in both Command mode (`clix install`) and Interactive mode (`/install`)

## TypeScript Patterns

**Avoid `any`** — use `unknown` with type narrowing:

```typescript
// BAD
function process(data: any) { return data.value; }

// GOOD
function process(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'value' in data) {
    return String((data as { value: unknown }).value);
  }
  throw new Error('Invalid data');
}
```

**No non-null assertions** — use guard checks:

```typescript
// BAD
const name = user!.name;

// GOOD
if (!user) throw new Error('User not found');
const name = user.name;
```

**Prefer interfaces + plain objects** over classes:

```typescript
// BAD
class Config { constructor(public name: string, public value: number) {} }

// GOOD
interface Config { name: string; value: number }
const config: Config = { name: 'foo', value: 42 };
```

**Additional rules**:
- Use `import type { X }` for type-only imports (Biome `useImportType` enforced)
- Always `const` over `let` when variable is not reassigned
- Use existing type guards: `isLocalCommand()`, `isLocalJSXCommand()`, `isPromptCommand()` in `src/lib/commands/types.ts:119-135`
- Error handling: use `ClixError` subclasses from `src/lib/errors/` (AgentError, ConfigError, NetworkError, ValidationError, etc.)

## React/Ink Patterns

**Functional components only**: Use hooks for state (`useState`, `useReducer`) and effects (`useEffect`).

**Keep components pure**: No side effects during render. Side effects go in `useEffect` or event handlers.

**Hooks rules**: Call hooks unconditionally at top level. See existing patterns in `src/ui/chat/hooks/`.

**Composition**: Break down UI into small, focused components. Abstract reusable logic into custom hooks.

### Cancel Input Handling

Use the shared `useCancelInput` hook from `@/ui/hooks` for ESC/Ctrl+C cancellation:

```typescript
import { useCancelInput } from '@/ui/hooks';

// Basic usage
useCancelInput(() => onCancel());

// With options
useCancelInput(onCancel, {
  isActive: isOverlayVisible,
  handleCtrlC: false  // ESC only
});

// For Ctrl+C detection in custom handlers
import { isCtrlCInput } from '@/ui/hooks';
if (isCtrlCInput(input, key)) { ... }
```

**New components**: Import `useCancelInput`, add cancel handler with `isActive` condition. For selector-based components, extend `GenericSelector` (has built-in cancel).

### Safe Rendering

**Always use `safeRender()` instead of Ink's `render()`** to prevent terminal flickering (Ink issue #450).

```typescript
// BAD — DO NOT USE
import { render } from 'ink';
render(<MyComponent />, { incrementalRendering: true });

// GOOD — ALWAYS USE THIS
import { safeRender } from '@/ui/utils/safeRender';
safeRender(<MyComponent />);
```

### UI Component Architecture

**Execution Modes**:

- **Command mode**: `clix <command>` - Single execution, auto-exits (`oneShot: true`)
- **Interactive mode**: `clix` - Persistent conversation session (`oneShot: false`)

**Path Alias**: `@/` = `src/` directory (e.g., `import { Header } from '@/ui/components/Header'`)

**Directory rules**:

- `@/ui/components/` - Shared components (used by both modes)
- `@/ui/chat/components/` - Interactive mode only
- `@/ui/` (root level) - Command mode only (`AgentExecutionUI.tsx`, `ConfigUI.tsx`)

**Rules**:

1. Do not import from `@/ui/chat/components/` in Command mode
2. If Interactive mode component is needed in Command mode, promote it to `@/ui/components/`
3. When modifying one mode, test both modes (`bun run dev` + `bun run dev install`)

## Testing

Tests use `bun:test` (`describe`, `test`, `expect`, `mock`).

- Unit tests: `src/lib/__tests__/` and colocated `__tests__/` directories
- E2E tests: `tests/e2e/`
- Test utilities: `src/lib/__tests__/test-utils/`

**Test hierarchy**: First run the specific file test (`bun test path/to/file.test.ts`). If shared code changed, run full suite (`bun test`).

**Mocking**: Use `mock.module()` for module mocks. Keep tests deterministic — avoid network calls.

```typescript
import { describe, expect, mock, test } from 'bun:test';

mock.module('@/lib/services/firebase/firebase-service', () => ({
  getFirebaseStatus: () => Promise.resolve({ configured: true }),
}));
```

**Rules**: No `as any` in tests — use proper typing. Test files go in `__tests__/` directories adjacent to the code they test.

## Code Quality & Commits

**Zero tolerance**: The codebase must have zero warnings, zero errors, AND all tests must pass after any change.

**After every code change**:

```bash
bun run check && bun test          # Lint + typecheck + unit tests
bun run build && bun test tests/e2e/  # E2E tests (requires build first)
```

Before committing: `bun run check && bun test && bun run build && bun test tests/e2e/`

**Rules**:
1. **Errors**: Must be fixed immediately
2. **Warnings**: Treat as errors — fix them too
3. **Unrelated issues**: Fix warnings/errors in unrelated files if encountered
4. **E2E failures**: Must be fixed even if seemingly unrelated

**Complexity** (`noExcessiveCognitiveComplexity`, threshold: 25): Refactor by extracting helper functions — extract validation logic, split async operations, create focused sub-functions.

**Commits**: Follow Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

## OAuth Callback URL Convention

All browser-based OAuth flows use port **9005** and path **`/auth/callback`**:

- Auth0 (Clix login): `http://localhost:9005/auth/callback` — see `src/lib/auth/pkce-flow.ts`
- Firebase/Google: `http://127.0.0.1:9005/auth/callback` (loopback IP per RFC 8252) — see `src/lib/services/firebase/oauth/config.ts`

Shared utilities in `src/lib/utils/oauth.ts`: `OAuthCallbackServer`, PKCE helpers, CSRF state generation.

When adding new OAuth flows, use port 9005, path `/auth/callback`, and the shared `OAuthCallbackServer` class.

## Common Mistakes

- **Never** use `render()` from ink directly — use `safeRender()` from `@/ui/utils/safeRender`
- **Never** hardcode slash command lists — derive from registry (`getCommands()`)
- **Never** use `as any` type assertions — use `unknown` with type narrowing
- **Never** use non-null assertion (`!`) — add guard checks
- **Never** commit with failing tests or warnings — zero tolerance

## Security

Do not commit API keys or user data. Global config lives in `$XDG_CONFIG_HOME/clix/config.json` (default: `~/.config/clix/config.json`).
Project-local data is stored in `project/.clix/` directory:
- Sessions: `project/.clix/sessions/`
- Credentials: `project/.clix/credentials.json` (unified: Clix Auth + Firebase tokens)
