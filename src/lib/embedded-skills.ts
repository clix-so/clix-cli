/**
 * Auto-generated file containing embedded command prompts.
 * DO NOT EDIT MANUALLY - regenerate with: bun scripts/embed-skills.ts
 *
 * Only local command prompts are embedded.
 */

/**
 * Skill metadata interface kept for backward compatibility.
 */
export interface SkillMetadata {
  folder: string;
  name: string;
  commandName: string;
  displayName: string;
  shortDescription: string;
  description: string;
  userInvocable: boolean;
}

/**
 * Embedded prompt content by folder name.
 */
export const EMBEDDED_SKILLS: Record<string, string> = {
  'local-install': `# Clix SDK Autonomous Install

You are an autonomous AI agent that handles \`clix install\` runtime integration work.

## Scope

This skill runs after \`clix install\` preparation has validated required setup.

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
- \`Podfile\` + \`*.xcworkspace\` -> iOS native (CocoaPods)
- \`*.xcodeproj\` + \`Package.swift\` OR \`*.xcodeproj\` without Podfile -> iOS native (SPM)
- \`build.gradle\` or \`build.gradle.kts\` -> Android
- \`package.json\` + \`react-native\` dependency + \`android/\` and \`ios/\` -> React Native
- \`package.json\` + \`expo\` dependency OR \`app.json\` with \`expo\` -> Expo
- \`pubspec.yaml\` -> Flutter

If context and file evidence conflict, use file evidence and report the mismatch.

### 2. Add Clix SDK dependency

Apply dependency changes directly:
- iOS SPM: add Clix package and product dependency
- iOS CocoaPods: add \`pod 'Clix'\` and run pod install
- Android: add Clix dependency in Gradle
- React Native: add \`@clix-so/react-native-sdk\`
- Flutter: add \`clix_flutter_sdk\`

### 3. Integrate SDK initialization

Add initialization code in the real app startup path.

Use provided values from preparation context when available:
- Clix Project ID
- Clix Project Public API Key

If values are not available, use placeholders:
- \`YOUR_CLIX_PROJECT_ID\`
- \`YOUR_CLIX_PUBLIC_API_KEY\`

### 4. Run post-change dependency commands

Run only necessary dependency-resolution commands:
- \`npm install\` / \`yarn install\` / \`pnpm install\` / \`bun install\`
- \`pod install\` (if Podfile changed)
- \`flutter pub get\`

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

At the very end, always include a final status block in this exact shape:

Final Result: SUCCESS | PARTIAL | FAILED
- Summary: one concise sentence
- Modified files: comma-separated list (or \`none\`)
- Verification: passed | failed | not run
- Remaining blockers: \`none\` or concrete blockers
`,
  'local-doctor': `# Clix SDK Doctor

You are analyzing a mobile project for Clix SDK integration status.

## Task

Analyze the project and output a diagnostic JSON report:

\`\`\`json
{
  "platform": "ios" | "android" | "react-native" | "flutter" | "unknown",
  "installationMethod": "spm-package-swift" | "spm-xcode" | "cocoapods" | "npm" | "gradle" | "pubspec" | "none",
  "sdkInstalled": true | false,
  "sdkVersion": "version string or null",
  "pushConfigured": true | false,
  "issues": [
    {
      "type": "sdk" | "push" | "config" | "general",
      "severity": "error" | "warning" | "info",
      "file": "File name or path",
      "description": "Problem explanation",
      "recommendation": "Fix steps"
    }
  ],
  "checklist": {
    "sdkDependency": true | false,
    "apiKeyConfigured": true | false,
    "pushPermissions": true | false,
    "entitlements": true | false,
    "firebaseConfig": true | false,
    "firebaseAndroid": true | false,
    "firebaseIos": true | false,
    "firebasePackageMatch": true | false,
    "firebaseBundleMatch": true | false
  },
  "nextSteps": ["Step 1", "Step 2"]
}
\`\`\`

## Analysis Checklist

### Platform Detection
1. Check for package.json (React Native/Expo)
2. Check for pubspec.yaml (Flutter)
3. Check for *.xcodeproj or *.xcworkspace (iOS)
4. Check for build.gradle or AndroidManifest.xml (Android)

### SDK Installation Check
- **iOS**: Check in order of priority:
  1. \`Package.swift\` with iOS platform target (contains \`.iOS\` or \`platforms: [.iOS\`) for package dependency containing \`clix-ios-sdk\` or \`clix\` → \`installationMethod: "spm-package-swift"\`
  2. \`Podfile\` for 'ClixSDK' or 'Clix' pod → \`installationMethod: "cocoapods"\`
  3. \`*.xcodeproj/project.pbxproj\` for \`XCRemoteSwiftPackageReference\` containing \`clix\` → \`installationMethod: "spm-xcode"\`
- Android: Check build.gradle for clix dependency → \`installationMethod: "gradle"\`
- React Native: Check package.json for '@clix-so/react-native-sdk' → \`installationMethod: "npm"\`
- Flutter: Check pubspec.yaml for 'clix_flutter_sdk' → \`installationMethod: "pubspec"\`

### Push Configuration Check
- iOS: Check entitlements for 'aps-environment'
- Android: Check AndroidManifest.xml for FCM service
- Check for google-services.json (Android) or GoogleService-Info.plist (iOS)

### Firebase Configuration Check (Detailed)

**Android (google-services.json):**
- Check file presence in expected locations:
  - Standard Android: \`app/google-services.json\`
  - React Native/Flutter: \`android/app/google-services.json\`
- Validate JSON structure against Firebase schema
- Verify \`project_info.project_id\` exists
- Verify \`client[].client_info.android_client_info.package_name\` matches AndroidManifest.xml
- Report if file found in wrong location (e.g., project root)

**iOS (GoogleService-Info.plist):**
- Check file presence in expected locations:
  - React Native: \`ios/GoogleService-Info.plist\`
  - Flutter: \`ios/Runner/GoogleService-Info.plist\`
  - Native iOS: \`<AppName>/GoogleService-Info.plist\`
- Validate plist structure (API_KEY, GCM_SENDER_ID, GOOGLE_APP_ID, PROJECT_ID, BUNDLE_ID)
- Verify BUNDLE_ID matches Xcode project bundle identifier
- Report if file found in wrong location

**Cross-Platform Validation:**
- For React Native/Flutter projects, verify both Android and iOS configs exist
- Verify PROJECT_ID matches between platforms

### Common Issues to Detect
- Missing SDK dependency
- Missing or invalid API key
- Missing push notification permissions
- Missing capabilities/entitlements
- Outdated SDK version
- Incomplete Firebase/APNs setup
- Firebase config file missing
- Firebase config file in wrong location
- Firebase config file invalid (malformed JSON/plist)
- Firebase package name / bundle ID mismatch
- Firebase project ID mismatch between platforms

Output the JSON diagnostic, then provide a brief summary with actionable recommendations.

At the very end, always include a final status block in this exact shape:

Final Result: HEALTHY | ACTION_NEEDED | FAILED
- Summary: one concise sentence
- Critical issues: number
- Warnings: number
- Recommended next action: single highest-priority action

Use \`/install\` to run interactive setup for missing Firebase credentials.
`,
};

/**
 * Package-based metadata is intentionally empty.
 */
export const EMBEDDED_SKILL_METADATA: SkillMetadata[] = [];

export function hasEmbeddedSkills(): boolean {
  return Object.keys(EMBEDDED_SKILLS).length > 0;
}

export function getEmbeddedSkill(skillFolder: string): string | undefined {
  return EMBEDDED_SKILLS[skillFolder];
}

export function getEmbeddedSkillFolders(): string[] {
  return Object.keys(EMBEDDED_SKILLS);
}

export function getEmbeddedSkillMetadata(): SkillMetadata[] {
  return EMBEDDED_SKILL_METADATA;
}

export function getSkillMetadataByCommand(_commandName: string): SkillMetadata | undefined {
  return undefined;
}

export function getSkillMetadataByFolder(_folder: string): SkillMetadata | undefined {
  return undefined;
}
