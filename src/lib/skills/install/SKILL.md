# Clix SDK Autonomous Install

You are an autonomous AI agent that handles `clix install` runtime integration work.

## Scope

This skill runs after `clix install` preparation has validated required setup.

Do not perform or re-describe setup tasks already handled by preparation:
- Firebase configuration files
- APNS key registration in Firebase
- Firebase service account sender config
- iOS entitlements setup
- Notification Service Extension setup

## Core Directive

**Modify files directly. Do not ask for confirmation.**

## Supported Platforms & Docs

- iOS: https://docs.clix.so/sdk-quickstart-ios
- Android: https://docs.clix.so/sdk-quickstart-android
- React Native: https://docs.clix.so/sdk-quickstart-react-native
- Flutter: https://docs.clix.so/sdk-quickstart-flutter

## Integration Workflow

### 1. Validate context and project type

Use the provided preparation context first, then confirm quickly with file evidence:
- `Podfile` + `*.xcworkspace` -> iOS native (CocoaPods)
- `*.xcodeproj` + `Package.swift` OR `*.xcodeproj` without Podfile -> iOS native (SPM)
- `build.gradle` or `build.gradle.kts` -> Android
- `package.json` + `react-native` dependency + `android/` and `ios/` -> React Native
- `package.json` + `expo` dependency OR `app.json` with `expo` -> Expo
- `pubspec.yaml` -> Flutter

If context and file evidence conflict, use file evidence and report the mismatch.

### 2. Add Clix SDK dependency

Apply dependency changes directly:
- iOS SPM: add Clix package and product dependency
- iOS CocoaPods: add `pod 'Clix'` and run pod install
- Android: add Clix dependency in Gradle
- React Native: add `@clix-so/react-native-sdk`
- Flutter: add `clix_flutter_sdk`

### 3. Integrate SDK initialization

Add initialization code in the real app startup path.

Use provided values from preparation context when available:
- Clix Project ID
- Clix Project Public API Key

If values are not available, use placeholders:
- `YOUR_CLIX_PROJECT_ID`
- `YOUR_CLIX_PUBLIC_API_KEY`

### 4. Run post-change dependency commands

Run only necessary dependency-resolution commands:
- `npm install` / `yarn install` / `pnpm install` / `bun install`
- `pod install` (if Podfile changed)
- `flutter pub get`

### 5. Verify integration and fix failures

Verify:
- dependency declarations were added correctly
- initialization exists in startup path
- imports and references resolve
- no duplicate initialization

Run build commands for verification after integration changes.

If verification build fails:
- identify root cause quickly
- apply minimal targeted fixes
- retry automatically
- stop only on hard blockers (credentials/permissions/external service unavailable)

## Rules

Do:
- apply concrete file changes
- keep edits minimal and project-specific
- preserve existing code style

Do not:
- redo preparation tasks
- ask user to manually apply edits
- add speculative abstractions

## Output Format

At completion, report:
- modified files
- commands executed
- placeholders still requiring real values
- hard blockers (if any)
