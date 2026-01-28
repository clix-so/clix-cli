# Contributing to Clix CLI

We welcome contributions to Clix CLI! This guide covers local development, testing, and the contribution process.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Development Workflow](#development-workflow)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Code Style](#code-style)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)

## Prerequisites

- [Bun](https://bun.sh) v1.0 or higher
- Git

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/clix-so/clix-cli.git
cd clix-cli

# 2. Install dependencies
bun install

# 3. Run in development mode
bun run dev

# 4. Test locally
bun run src/cli.tsx --help
```

## Development Workflow

### 1. Install Dependencies

```bash
bun install
```

This installs all required dependencies including:
- `ink` - React for CLIs
- `meow` - CLI argument parsing
- `chalk` - Terminal styling
- TypeScript and build tools

### 2. Run in Development Mode

```bash
# Run directly (recommended for development)
bun run dev

# Or run the CLI directly
bun run src/cli.tsx --help
bun run src/cli.tsx config
bun run src/cli.tsx install
```

### 3. Build the Project

```bash
# Build for distribution
bun run build

# Build binary for current platform
bun run build:binary
```

**Build output:** `dist/` directory
- `dist/cli.js` - Main bundled CLI
- `dist/bin/` - Compiled binaries (after `build:binary`)

### 4. Run Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test src/lib/__tests__/config.test.ts

# Run tests with coverage
bun test --coverage
```

### 5. Type Checking

```bash
bun run typecheck
```

## Project Structure

```
.
├── src/
│   ├── cli.tsx              # Main entry point
│   ├── commands/            # Command implementations
│   │   ├── config.tsx       # Config command
│   │   ├── install.tsx      # Install command
│   │   └── root.tsx         # Root/welcome command
│   ├── lib/                 # Core functionality
│   │   ├── config.ts        # Configuration management
│   │   ├── executor.ts      # AI tool execution
│   │   ├── llm.ts           # AI tool detection
│   │   ├── mcp.ts           # MCP server management
│   │   ├── prompt.ts        # Prompt fetching
│   │   └── __tests__/       # Unit tests
│   └── ui/                  # Ink UI components
│       ├── components/      # Reusable components
│       │   ├── Banner.tsx
│       │   ├── Header.tsx
│       │   ├── StatusMessage.tsx
│       │   └── ToolSelector.tsx
│       ├── ConfigUI.tsx     # Config screen
│       └── InstallUI.tsx    # Install screen
├── scripts/                 # Build scripts
│   ├── build.ts             # Bun build script
│   ├── compile.ts           # Binary compilation script
│   └── install              # Installation script
├── dist/                    # Build output (gitignored)
├── package.json
├── tsconfig.json
└── bunfig.toml              # Bun configuration
```

## Making Changes

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Your Changes

Edit files in `src/`:
- Add new commands in `src/commands/`
- Add new UI components in `src/ui/components/`
- Add new utilities in `src/lib/`

### 3. Test Your Changes

```bash
# Run in development mode
bun run dev

# Or test directly
bun run src/cli.tsx --help
```

### 4. Run Tests

```bash
bun test
```

### 5. Type Check

```bash
bun run typecheck
```

### 6. Commit Your Changes

```bash
git add .
git commit -m "feat: add your feature description"
```

Use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

## Building Binaries

### Build for All Platforms

```bash
bun run build:binary
```

This creates binaries in `dist/bin/`:
- `clix-darwin-arm64` - macOS Apple Silicon
- `clix-darwin-x64` - macOS Intel
- `clix-linux-arm64` - Linux ARM64
- `clix-linux-x64` - Linux x64

### Build for Specific Platform

```bash
bun run build:binary darwin-arm64
bun run build:binary linux-x64
```

## Testing in Real Projects

### Test with iOS Project

```bash
# 1. Go to an iOS project
cd /path/to/ios/project

# 2. Test the install command
bun run /path/to/clix-cli/src/cli.tsx install

# 3. Verify the AI assistant launches and works correctly
```

### Test with Android Project

```bash
# 1. Go to an Android project
cd /path/to/android/project

# 2. Test the install command
bun run /path/to/clix-cli/src/cli.tsx install

# 3. Verify the AI assistant launches and works correctly
```

## Debugging

### Enable Debug Mode

```bash
export DEBUG=1
bun run src/cli.tsx install
```

### View Detailed Logs

```bash
# Add console.log statements in your code
console.log('Debug info:', someVariable);

# Test
bun run src/cli.tsx install
```

## Common Tasks

### Add a New Command

1. Create a new file in `src/commands/`:
```tsx
// src/commands/mycommand.tsx
import React from 'react';
import { render } from 'ink';
import { Box, Text } from 'ink';

export function myCommand() {
  const ui = (
    <Box>
      <Text>My Command!</Text>
    </Box>
  );
  render(ui);
}
```

2. Register in `src/cli.tsx`:
```tsx
case 'mycommand':
  myCommand();
  break;
```

3. Test:
```bash
bun run src/cli.tsx mycommand
```

### Add a New UI Component

1. Create component in `src/ui/components/`:
```tsx
// src/ui/components/MyComponent.tsx
import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  message: string;
}

export function MyComponent({ message }: Props) {
  return (
    <Box>
      <Text color="green">{message}</Text>
    </Box>
  );
}
```

2. Use in a command:
```tsx
import { MyComponent } from '../ui/components/MyComponent.js';

const ui = (
  <MyComponent message="Hello!" />
);
```

### Add a Test

```typescript
// src/lib/__tests__/mymodule.test.ts
import { describe, expect, test } from 'bun:test';
import { myFunction } from '../mymodule';

describe('myFunction', () => {
  test('should work correctly', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });
});
```

## CI/CD Testing

The repository has automated workflows:

### Build Workflow (`.github/workflows/build.yml`)

Triggered on tags:
- Builds binaries for all platforms
- Uploads artifacts

### Release Workflow (`.github/workflows/release.yml`)

Runs when version changes in `package.json`:
- Builds the project
- Publishes to npm
- Creates GitHub release with binaries
- Updates Homebrew formula

## Troubleshooting

### "Cannot find module" errors

**Cause:** Missing dependencies or incorrect imports

**Solution:**
```bash
bun install
```

### TypeScript errors

**Cause:** Type mismatches or missing types

**Solution:**
```bash
bun run typecheck
# Fix errors in src/ files
```

### Binary compilation fails

**Cause:** Bun version issue or platform incompatibility

**Solution:**
```bash
# Update Bun
bun upgrade

# Check Bun version
bun --version
```

### Tests fail

**Cause:** Test environment issues

**Solution:**
```bash
# Clean and reinstall
rm -rf node_modules bun.lockb
bun install

# Run tests
bun test
```

## Code Style

- Use TypeScript for type safety
- Use React/Ink for UI components
- Use Bun APIs where possible (Bun.file, Bun.spawn, etc.)
- Follow existing code structure
- Add tests for new functionality
- Keep components small and focused

## Submitting Changes

Before submitting a pull request, ensure:

- [ ] Code builds without errors (`bun run build`)
- [ ] Types check correctly (`bun run typecheck`)
- [ ] Tests pass (`bun test`)
- [ ] Tested locally with real projects
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] Updated documentation if needed
- [ ] Added tests for new functionality

### Pull Request Process

1. **Fork the repository** and create a feature branch
2. **Make your changes** following the code style guidelines
3. **Test thoroughly** in development and production builds
4. **Commit with clear messages** using Conventional Commits
5. **Open a pull request** with a clear description of changes
6. **Address review feedback** promptly

## Release Process

Releases are fully automated via GitHub Actions. When you push a version change to the main branch, the workflow automatically:

1. **Detects version change** in `package.json`
2. **Builds binaries** for all platforms (macOS, Linux x64/ARM)
3. **Publishes to npm** with the new version
4. **Updates Homebrew formula** with new version and SHA256
5. **Creates GitHub release** with binaries attached

### How to Release

**For Maintainers:**

1. Update version in `package.json`:
   ```bash
   npm version patch  # or minor, or major
   ```

2. Commit and push to main:
   ```bash
   git add package.json bun.lock
   git commit -m "chore: bump version to vX.X.X"
   git push origin main
   ```

3. **That's it!** GitHub Actions handles the rest automatically.

### Automated Workflow

The release workflow (`.github/workflows/release.yml`) runs on every push to main that modifies `package.json`. It:

- ✅ Compares version with previous commit
- ✅ Skips if version unchanged (no unnecessary releases)
- ✅ Checks for existing tags to prevent duplicates
- ✅ Creates git tag automatically (e.g., `v1.0.1`)
- ✅ Builds and publishes everything

### Manual Testing Before Release

```bash
# Test locally first
bun run build
node dist/cli.js --help
node dist/cli.js agent

# Test installation in a real project
cd /path/to/test/project
node /path/to/clix-cli/dist/cli.js install

# Run all checks
bun test
bun run typecheck
```

## Resources

- [Bun Documentation](https://bun.sh/docs) - Runtime and build tool
- [Ink Documentation](https://github.com/vadimdemedes/ink) - React for CLIs
- [meow Documentation](https://github.com/sindresorhus/meow) - CLI framework
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Conventional Commits](https://www.conventionalcommits.org/) - Commit message format

## Getting Help

- [GitHub Issues](https://github.com/clix-so/clix-cli/issues) - Bug reports and feature requests
- [GitHub Discussions](https://github.com/clix-so/clix-cli/discussions) - Questions and general discussion

---

Thank you for contributing to Clix CLI! 🎉
