# Repository Guidelines

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Clix CLI is an interactive AI-powered assistant for Clix SDK integration. Built with React/Ink for terminal UI, it supports multiple AI agents (Claude, Codex, Gemini, OpenCode, Cursor, Copilot) with streaming responses, slash commands, and pre-built skills for SDK workflows.

## Commands

```bash
bun install                    # Install dependencies
bun run dev                    # Run CLI from source
bun run build                  # Bundle for distribution
bun test                       # Run all tests
bun test path/to/file.test.ts  # Run single test
bun run check                  # Lint + typecheck
```

Debug mode: `DEBUG=1 bun run src/cli.tsx <command>`

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

Registry and lookup: `src/lib/commands/registry.ts`

Session reset command: use `/new` to start a new session; `/clear` is a legacy alias.

Slash command suggestions: `src/ui/chat/components/SlashCommandMenu.tsx` derives its list (canonical names only, no aliases) from the registry (no hardcoded system command list). Sync is enforced by `src/ui/chat/components/__tests__/slash-command-menu.test.ts`. Use `isHidden: true` to hide a command from help + suggestions.

**Documentation Sync**: When making changes to the following, update both `README.md` and `llms.txt`:

| Change Type                     | README.md Section                      | llms.txt Section                                     |
| ------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| Slash commands                  | "Slash Commands" table                 | "Slash Commands" + "Slash Commands Reference"        |
| AI agents                       | "Prerequisites" table, "clix agent"    | "Prerequisites", "Agent System", "For AI Assistants" |
| Skills (interactive/autonomous) | "Interactive Skills", "Slash Commands" | "Interactive Skills", "Autonomous Commands"          |
| CLI commands                    | "Commands" section                     | "Commands" section                                   |
| Config paths                    | N/A                                    | "Configuration" section                              |

Key files:

- `README.md` - User-facing documentation (concise)
- `llms.txt` - AI assistant reference (comprehensive)

### Chat UI

`src/ui/chat/ChatApp.tsx` - Main component with context provider. State split into focused hooks under `src/ui/chat/hooks/`.

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

**Avoid `any`**: Use `unknown` with type narrowing instead. If you need to assert types, ensure it's truly necessary.

**Type guards**: Use existing guards like `isLocalCommand()`, `isLocalJSXCommand()`, `isPromptCommand()` in `src/lib/commands/types.ts:119-135`.

**Prefer plain objects with interfaces** over classes where possible. Use ES module exports for encapsulation.

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

**New Component Checklist:**
1. Import `useCancelInput` from `@/ui/hooks`
2. Add cancel handler with appropriate `isActive` condition
3. For selector-based components, extend `GenericSelector` (has built-in cancel)
4. Update help text to include `Esc/Ctrl+C to cancel`

### Safe Rendering (Anti-Flicker)

**Always use `safeRender()` instead of Ink's `render()`** to prevent terminal flickering.

**Background**: When rendered content approaches terminal height, Ink causes "unintentional scrolling" resulting in screen flicker (Ink issue #450). The solution is to limit rendering height to `process.stdout.rows - 1`.

**Implementation**:

- `src/ui/utils/safeRender.tsx` - Wrapper around Ink's `render()`
- `src/ui/components/SafeHeightContainer.tsx` - Height-limiting container

**Usage**:

```typescript
// Before (DO NOT USE)
import { render } from 'ink';
render(<MyComponent />, { incrementalRendering: true });

// After (ALWAYS USE THIS)
import { safeRender } from '@/ui/utils/safeRender';
safeRender(<MyComponent />);
```

**Features**:

- Automatically wraps components with `SafeHeightContainer`
- `incrementalRendering: true` applied by default
- `rerender()` also applies safe height automatically
- Use `{ disableSafeHeight: true }` option only if full terminal height is required

**When adding new commands**: Always use `safeRender()` for consistent flicker-free rendering.

### UI Component Architecture

Rules for separating Command mode and Interactive mode:

**Execution Modes**:

- **Command mode**: `clix <command>` - Single execution, auto-exits (`oneShot: true`)
- **Interactive mode**: `clix` - Persistent conversation session (`oneShot: false`)

**Path Alias**:

- `@/` = `src/` directory
- Example: `import { Header } from '@/ui/components/Header'`

**Shared Components (`@/ui/components/`)**:

- `ToolCallDisplay` - Tool execution status (used by both modes)
- `StatusMessage` - Status messages (loading/success/error)
- `Header` - Simple title header
- `AgentSelector`, `NoAgentGuide`, etc.

**Interactive Mode Only (`@/ui/chat/components/`)**:

- `ChatHeader`, `ChatFooter`, `ChatInput`
- `MessageList`, `UserMessage`, `AgentMessage`
- `SlashCommandMenu`

**Command Mode Only (`@/ui/`)**:

- `AgentExecutionUI.tsx` - AI agent-based command execution UI (install, doctor, etc.)
- `ConfigUI.tsx` - Configuration UI

**Rules**:

1. Do not import from `@/ui/chat/components/` in Command mode
2. If Interactive mode component is needed in Command mode, promote it to `@/ui/components/`
3. When modifying one mode, test both modes (`bun run dev` + `bun run dev install`)

## Testing

Tests use `bun:test` (`describe`, `test`, `expect`, `mock`).

- Unit tests: `src/lib/__tests__/` and `src/lib/**/__tests__/`
- E2E tests: `tests/e2e/`
- Test utilities: `src/lib/__tests__/test-utils/`

**Mocking**: Use `mock.module()` for module mocks. See existing patterns in test files. Keep tests deterministic—avoid network calls.

## Code Quality Requirements

**After every code change**, run the full test suite and fix ALL issues:

```bash
bun run check && bun test          # Unit tests
bun run build && bun test tests/e2e/  # E2E tests (requires build first)
```

1. **Errors**: Must be fixed immediately - code cannot be committed with errors
2. **Warnings**: Must also be fixed - treat warnings as errors
3. **Unrelated issues**: If you encounter warnings/errors in files unrelated to your current change, fix them too
4. **E2E test failures**: Must be fixed even if seemingly unrelated - E2E tests verify integrated behavior

**Complexity warnings** (`noExcessiveCognitiveComplexity`):
- When a function exceeds complexity threshold (25), refactor it by extracting helper functions
- Common patterns: extract validation logic, split async operations, create focused sub-functions

**Zero tolerance policy**: The codebase must have zero warnings, zero errors, AND all tests (unit + E2E) must pass after any change.

## Commits

Follow Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

Before committing: `bun run check && bun test && bun run build && bun test tests/e2e/`

**Important**: All lint, typecheck warnings, unit tests, and E2E tests must pass before committing. The codebase should have zero warnings, not just zero errors.

## OAuth Callback URL Convention

All browser-based OAuth flows use port **9005** and path **`/auth/callback`**, but the hostname varies by provider due to technical requirements.

**Rationale**: Using a fixed port and path simplifies OAuth provider configuration (Allowed Callback URLs).

**Implementation**:

- Auth0 (Clix login): `http://localhost:9005/auth/callback` via `getCallbackUrl()` - see `src/lib/auth/pkce-flow.ts`
- Firebase/Google: `http://127.0.0.1:9005/auth/callback` via `getCallbackUrlIp()` - see `src/lib/services/firebase/oauth/config.ts`

**Why different hostnames?** Desktop app OAuth (like Google OAuth for installed applications) requires the loopback IP address (`127.0.0.1`) rather than `localhost` per OAuth 2.0 for Native Apps (RFC 8252). Auth0 works with either, so it uses `localhost` for consistency.

**Shared utilities**: `src/lib/utils/oauth.ts` provides:

- `OAuthCallbackServer` - Local HTTP server for OAuth callbacks
- `OAUTH_CALLBACK_CONFIG.getCallbackUrl()` - Returns `localhost` variant
- `OAUTH_CALLBACK_CONFIG.getCallbackUrlIp()` - Returns `127.0.0.1` variant for desktop OAuth
- `generateCodeVerifier()`, `generateCodeChallenge()` - PKCE utilities
- `generateState()` - CSRF protection

When adding new OAuth flows, use port 9005, path `/auth/callback`, the shared `OAuthCallbackServer` class, and pick the appropriate hostname method based on OAuth provider requirements.

## Security

Do not commit API keys or user data. Local config lives in `$XDG_CONFIG_HOME/clix/config.json` (default: `~/.config/clix/config.json`).
Sessions are stored in `$XDG_STATE_HOME/clix/sessions/` (default: `~/.local/state/clix/sessions/`).
