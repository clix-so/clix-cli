/**
 * Auto-generated file containing embedded skill prompts and metadata.
 * DO NOT EDIT MANUALLY - regenerate with: bun scripts/embed-skills.ts
 *
 * These are embedded at build time from @clix-so/clix-agent-skills package
 * to allow the binary to work without requiring the package to be installed.
 */

/**
 * Skill metadata interface.
 */
export interface SkillMetadata {
  /** Skill folder name (e.g., 'integration', 'event-tracking') */
  folder: string;
  /** Skill name from frontmatter (e.g., 'clix-integration') */
  name: string;
  /** Command name derived from name by removing 'clix-' prefix */
  commandName: string;
  /** Display name from frontmatter (e.g., 'SDK Integration') */
  displayName: string;
  /** Short description for command menus */
  shortDescription: string;
  /** Full description from frontmatter (for agent invocation) */
  description: string;
  /** Whether the skill can be invoked by users */
  userInvocable: boolean;
}

/**
 * Embedded skill content by folder name.
 */
export const EMBEDDED_SKILLS: Record<string, string> = {
  personalization: `---
name: clix-personalization
display-name: Personalization
short-description: Personalization templates
description:
  Helps developers author and debug Clix personalization templates
  (Liquid-style) for message content, deep links/URLs, and audience targeting.
  Use when the user mentions personalization variables, Liquid, templates,
  conditional logic, loops, filters, deep links, message logs, or when the user
  types \`clix-personalization\`.
user-invocable: true
---

# Clix Personalization

Use this skill to help developers write **personalized Clix campaigns** using
template-based variables and light logic in:

- **Message content** (title, body, subtitle)
- **Links** (dynamic URL or deep link params)
- **Audience targeting** (conditional include/exclude rules)

## What the official docs guarantee (high-signal)

- **Data namespaces**:
  - \`user.*\` (user traits/properties)
  - \`event.*\` (event payload properties)
  - \`trigger.*\` (custom properties passed via API-trigger)
  - Device/system vars: \`device.id\`, \`device.platform\`, \`device.locale\`,
    \`device.language\`, \`device.timezone\`, plus \`user.id\`, \`event.name\`
- **Missing variables** render as an **empty string**.
- **Output**: print values with \`{{ ... }}\`.
- **Conditionals**: \`{% if %}\`, \`{% else %}\`, \`{% endif %}\` with operators
  \`== != > < >= <= and or not\`. Invalid conditions evaluate to \`false\`.
- **Loops**: \`{% for x in y %}\` / \`{% endfor %}\` (use guards for empty lists).
- **Filters**: \`upcase\`, \`downcase\`, \`capitalize\`, \`default\`, \`join\`, \`split\`,
  \`escape\`, \`strip\`, \`replace\` (chain with \`|\`).
- **Errors**: template rendering errors show up in **Message Logs**.

## MCP-first (source of truth)

If the Clix MCP tools are available, treat them as the source of truth:

- \`clix-mcp-server:search_docs\` for personalization behavior and supported
  syntax

If MCP tools are not available, use the bundled references in \`references/\`.

## Workflow (copy + check off)

\`\`\`
Personalization progress:
- [ ] 1) Identify where the template runs (message / URL / audience rule)
- [ ] 2) Identify trigger type (event-triggered vs API-triggered)
- [ ] 3) Confirm available inputs (user.*, event.*, trigger.*, device.*)
- [ ] 4) Draft templates with guards/defaults
- [ ] 5) Validate template structure (balance tags, avoid missing vars)
- [ ] 6) Verify in Clix (preview/test payloads, check Message Logs)
\`\`\`

## 1) Confirm the minimum inputs

Ask only what’s needed:

- **Where used**: title/body/subtitle vs URL/deep link vs audience targeting
  rule
- **Campaign trigger**:
  - Event-triggered → \`event.*\` is available
  - API-triggered → \`trigger.*\` is available
- **Inputs**:
  - Which \`user.*\` properties are set by the app
  - Which \`event.*\` / \`trigger.*\` properties are passed (include example
    payload)
- **Fallback policy**: what to show when data is missing (default strings,
  guards)

## 2) Produce a “Template Plan” (before tweaking lots of templates)

Return a compact table the user can approve:

- **field** (title/body/url/audience)
- **template** (Liquid)
- **required variables** (and their source: user/event/trigger/device)
- **fallbacks** (default filter and/or conditional guards)
- **example payload** + **expected rendered output**

## 3) Authoring guidelines (what to do by default)

- Prefer **simple variables + \`default\`** over complex branching.
- Add **guards** for optional data and for arrays (\`size > 0\`) before looping.
- Prefer **pre-formatted** properties from your app (e.g., \`"7.4 miles"\`,
  \`"38m 40s"\`) instead of formatting inside templates.
- Keep logic minimal; complex branching belongs in the app or segmentation
  setup.

## 4) Validation (fast feedback loop)

If you have a template file (recommended for review), run:

\`\`\`bash
bash <skill-dir>/scripts/validate-template.sh path/to/template.liquid
\`\`\`

This script does lightweight checks (matching \`{% if %}\`/\`{% endif %}\`,
\`{% for %}\`/\`{% endfor %}\`, and brace balancing). It can’t guarantee the
variables exist — you still need a payload + console verification.

## 5) Verification checklist

- **Missing data**: does the template still read well with empty strings?
- **Trigger type**: API triggers use \`trigger.*\` (not \`event.*\`).
- **Message Logs**: check rendering errors and fix syntax issues first.
- **Upstream data**:
  - If \`user.*\` is missing → fix user property setting (see
    \`clix-user-management\`)
  - If \`event.*\` is missing → fix event tracking payload (see
    \`clix-event-tracking\`)

## Progressive Disclosure

- **Level 1**: This \`SKILL.md\` (always loaded)
- **Level 2**: \`references/\` (load when writing/debugging templates)
- **Level 3**: \`scripts/\` (execute directly, do not load into context)

## References

- \`references/template-syntax.md\` - Variables, output, conditionals, loops,
  filters
- \`references/common-patterns.md\` - Copy/paste patterns for messages + URLs +
  guards
- \`references/debugging.md\` - Troubleshooting missing variables and Message Logs
`,
  integration: `---
name: clix-integration
display-name: SDK Integration
short-description: SDK integration guide
description:
  Integrates Clix Mobile SDK into iOS, Android, Flutter, and React Native
  projects. Provides step-by-step guidance for installation, initialization, and
  verification. Use when the user asks to install, setup, integrate Clix or when
  the user types \`clix-integration\` / "clix integration".
user-invocable: true
---

# Clix SDK Integration Skill

This skill provides comprehensive guidance for integrating Clix analytics SDK
into mobile applications. Follow the workflow below to ensure proper
installation and configuration.

## Integration Strategy (MCP First)

This skill follows an **"MCP First"** strategy to ensure agents always use the
latest verified SDK source code.

**Step 1: Check for MCP Capability**

- Check if the Clix MCP Server tools (\`clix-mcp-server:search_sdk\`,
  \`clix-mcp-server:search_docs\`) are available in your toolset.

**Step 2: Primary Path (MCP Available)**

- **MUST** use \`clix-mcp-server:search_sdk\` to fetch exact initialization code
  for the target platform (e.g.,
  \`clix-mcp-server:search_sdk(query="initialize", platform="android")\`).
- Use these fetched results as the **Single Source of Truth** for
  implementation.
- Do **NOT** rely on static examples if MCP returns valid results.

**Step 3: Fallback Path (MCP Unavailable)**

- If checks for \`clix-mcp-server\` fail:
  1. **Ask the user**: "The Clix MCP Server is not detected. It provides the
     latest official SDK code. Would you like me to install it now?"
  2. **If User says YES**:
     - Run: \`bash scripts/install-mcp.sh --client <your-client>\`
     - The script will:
       - Verify the package is available
       - Configure the MCP server for the specified client
       - (If you omit \`--client\` and multiple clients are installed, the script
         will stop and ask you to choose.)
       - Automatically configure the MCP server in the appropriate config file
       - Provide clear instructions for restart
     - Instruct user to restart their agent/IDE to load the new server.
     - Stop here (let user restart).
  3. **If User says NO**:
     - Fall back to using the static patterns in
       \`references/framework-patterns.md\` and \`examples/\`.
     - Inform the user: "Proceeding with static fallback examples (may be
       outdated)."

## Interaction Guidelines for Agents

When using this skill (for example inside OpenCode, Amp, Claude Code, Codex,
Cursor, or other AI IDEs), follow these behaviors:

- **Start with reconnaissance**
  - Inspect the project structure first (list key files like \`package.json\`,
    \`Podfile\`, \`build.gradle\`, \`pubspec.yaml\`, \`AppDelegate.swift\`,
    \`MainActivity.kt\`, etc.)
  - Clearly state what you detected (e.g., “This looks like a React Native
    project with iOS and Android”)
- **Ask clarifying questions when needed**
  - If multiple platforms are present, ask the user which one(s) to integrate
    first
  - If the structure is unusual, ask before making assumptions
- **Explain each step briefly**
  - Before making changes, say what you are about to do and why (install
    dependency, update entrypoint, add config, etc.)
  - Keep explanations short but concrete, so the user understands the impact
- **Handle errors gracefully**
  - If a command or change fails, show the error, explain likely causes, and
    suggest concrete next steps
  - Avoid getting stuck in loops—propose a fallback if automation fails
- **End with a verification summary**
  - Summarize what was installed/modified (files touched, dependencies added)
  - Point out any remaining manual steps (e.g., Xcode capabilities, Firebase
    config, running the app to test)

## Integration Workflow

### Phase 1: Prerequisite — Credentials (User Setup)

Before continuing, the user must ensure the following environment variables are
available to the app at runtime:

- \`CLIX_PROJECT_ID\`
- \`CLIX_PUBLIC_API_KEY\`

**How to get credentials:**

- Ask the user to visit \`https://console.clix.so/\` and copy the values for their
  Clix project.

**How to set credentials:**

- Add them to a local \`.env\` file (recommended), or to your framework’s env
  configuration (see \`references/framework-patterns.md\`).
- Ensure \`.env\` is in \`.gitignore\`.

**Security warning:**

- Do **not** paste credentials into chat. Enter them directly into the user’s
  terminal/editor.

### Phase 2: Project Type Detection

**Step 2.1: Identify Platform**

Examine the codebase structure to determine platform:

- **iOS**: Look for \`.xcodeproj\`, \`Podfile\`, \`Info.plist\`, Swift/Objective-C
  files
- **Android**: Look for \`build.gradle\`, \`AndroidManifest.xml\`, Kotlin/Java files
- **Flutter**: Look for \`pubspec.yaml\`, \`lib/main.dart\`, plus \`ios/\` and
  \`android/\` folders
- **React Native**: Look for \`package.json\` with React Native dependencies,
  \`android/\` and \`ios/\` folders
- **Other**: If it’s not one of the above, stop and ask the user—this skill is
  mobile-only.

**Priority rule (important):** If React Native or Flutter is detected, treat it
as the primary platform even if native \`ios/\` and \`android/\` folders exist.

**Step 2.2: Verify Detection**

Confirm platform detection with user if ambiguous:

- Multiple platforms detected (e.g., React Native has both iOS and Android)
- Unusual project structure
- Hybrid applications

### Phase 3: SDK Installation

**Step 3.1: Install SDK Package**

Install the appropriate SDK based on detected platform:

**iOS (Swift Package Manager):**

\`\`\`swift
// Add to Package.swift or Xcode: https://github.com/clix-so/clix-ios-sdk
\`\`\`

**iOS (CocoaPods):**

\`\`\`ruby
# Add to Podfile
pod 'Clix', :git => 'https://github.com/clix-so/clix-ios-sdk.git'
\`\`\`

**Android (Gradle):**

\`\`\`kotlin
// Add to build.gradle.kts
implementation("so.clix:clix-android-sdk:latest")
\`\`\`

**React Native:**

\`\`\`bash
npm install @clix-so/react-native-sdk
# or
yarn add @clix-so/react-native-sdk
\`\`\`

**Flutter:**

- Add the Clix Flutter SDK dependency in \`pubspec.yaml\`:
  \`\`\`yaml
  dependencies:
    clix_flutter: ^0.0.1
    firebase_core: ^3.6.0
    firebase_messaging: ^15.1.3
  \`\`\`
- If MCP tools (\`search_docs\`, \`search_sdk\`) are available, use them to confirm
  the latest package version and setup steps.

**Step 3.2: Verify Installation**

- Check that package appears in dependency files (\`package.json\`,
  \`Podfile.lock\`, \`build.gradle\`)
- Verify import/require statements work
- Check for installation errors

### Phase 4: SDK Initialization

**Step 4.1: Locate Entry Point**

Find the appropriate initialization location:

- **iOS**: \`AppDelegate.swift\` or \`@main\` app file
- **Android**: \`Application.kt\` or \`Application.java\` class
- **Flutter**: \`lib/main.dart\`
- **React Native**: Root component or \`index.js\`

**Step 4.2: Initialize SDK**

Add initialization code following platform-specific patterns (see examples/
directory):

**Key Requirements:**

- Initialize early in application lifecycle
- Use environment variables for credentials (never hardcode)
- Handle initialization errors gracefully
- Follow framework-specific best practices

**Step 4.3: Configure SDK**

Set up SDK configuration:

- Use \`CLIX_PROJECT_ID\` from environment variables
- Use \`CLIX_PUBLIC_API_KEY\` from environment variables
- Set appropriate environment (production/staging/development)
- Configure logging level if needed
- Enable/disable features as required

### Phase 5: Integration Verification

**Step 5.1: Code Review**

Verify integration completeness:

- SDK is imported/required correctly
- Initialization code is in correct location
- Credentials are loaded from environment variables
- Error handling is implemented
- No hardcoded credentials

**Step 5.2: Verify Integration**

Run validation checks:

- Execute \`scripts/validate-sdk.sh\` if available
- Check that SDK initializes without errors
- Verify environment variables are accessible
- Verify SDK is properly imported and initialized

### Platform Verification Checklists (UI Steps → Repo Verification)

Use these checklists to verify manual UI steps were actually completed.

#### iOS Verification

- **Dependencies present**: \`Podfile\`/\`Podfile.lock\` or SwiftPM/Xcode references
- **Entitlements present**: an \`*.entitlements\` file exists and is wired to the
  correct target(s)
- **Capabilities configured**: \`project.pbxproj\` reflects required capabilities
  (as applicable to Push Notifications / Background Modes)

#### Android Verification

- **Dependencies present**: module-level \`build.gradle\` / \`build.gradle.kts\`
  includes required SDK dependencies
- **Manifest updated**: \`AndroidManifest.xml\` contains required permissions,
  services/receivers (as required by the SDK)
- **Firebase config placed** (if used): \`google-services.json\` exists in the
  expected module directory (commonly \`app/\`)

#### React Native Verification

- **JS dependency**: \`package.json\` includes the Clix package
- **iOS native**: \`ios/Podfile.lock\` updated after \`pod install\` (when required)
- **Android native**: Gradle + Manifest updates present if required by the SDK
- **Initialization**: root entrypoint initializes the SDK exactly once

#### Flutter Verification

- **Pub dependency**: \`pubspec.yaml\` includes the required packages and
  \`pubspec.lock\` is updated after \`flutter pub get\`
- **iOS native**: \`ios/Podfile.lock\` updated after \`pod install\` (when required)
- **Android native**: Gradle + Manifest updates present if required
- **Initialization**: SDK initialized before \`runApp\`

**Step 5.3: Documentation**

Create or update documentation:

- Add integration notes to README.md
- Document environment variables needed
- Note any framework-specific considerations
- Update \`.env.example\` if it exists

## Framework-Specific Patterns

### iOS (Swift)

**Initialization Pattern:**

\`\`\`swift
import Clix

@main
struct MyApp: App {
    init() {
        // Load credentials from your app configuration (do NOT hardcode).
        // Example: store values in Info.plist keys.
        let projectId = Bundle.main.object(forInfoDictionaryKey: "CLIX_PROJECT_ID") as? String ?? ""
        let apiKey = Bundle.main.object(forInfoDictionaryKey: "CLIX_PUBLIC_API_KEY") as? String

        let config = ClixConfig(projectId: projectId, apiKey: apiKey)
        Clix.initialize(config: config)
    }
}
\`\`\`

**Key Points:**

- Initialize in \`@main\` app struct or \`AppDelegate\`
- Use environment variables, never hardcode
- Handle optional API key for analytics-only mode

### Android (Kotlin)

**Initialization Pattern:**

\`\`\`kotlin
import so.clix.core.Clix
import so.clix.core.ClixConfig

class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        // Load credentials from BuildConfig (do NOT hardcode).
        val config = ClixConfig.Builder()
            .projectId(BuildConfig.CLIX_PROJECT_ID)
            .apiKey(BuildConfig.CLIX_PUBLIC_API_KEY)
            .build()

        Clix.initialize(this, config)
    }
}
\`\`\`

**Key Points:**

- Initialize in \`Application.onCreate()\`
- Use \`Application\` context, not Activity context
- Register Application class in \`AndroidManifest.xml\`

### React Native

**Initialization Pattern:**

\`\`\`typescript
import { Clix } from "@clix-so/react-native-sdk";
import Config from "react-native-config";

// In App.tsx or index.js
Clix.initialize({
  projectId: Config.CLIX_PROJECT_ID || "",
  apiKey: Config.CLIX_PUBLIC_API_KEY,
});
\`\`\`

**Key Points:**

- Initialize in root component
- Use \`react-native-config\` (or similar) for environment variables
- Link native dependencies if needed

### Flutter

**Initialization Pattern:**

\`\`\`dart
import 'package:clix_flutter/clix_flutter.dart';

Future<void> main() async {
  // Load credentials from build-time configuration (do NOT hardcode).
  // Example:
  // flutter run --dart-define=CLIX_PROJECT_ID=... --dart-define=CLIX_PUBLIC_API_KEY=...
  const projectId = String.fromEnvironment('CLIX_PROJECT_ID');
  const apiKey = String.fromEnvironment('CLIX_PUBLIC_API_KEY');

  await Clix.initialize(
    ClixConfig(
      projectId: projectId,
      apiKey: apiKey,
    ),
  );

  runApp(const MyApp());
}
\`\`\`

**Key Points:**

- Initialize before \`runApp\`
- Use \`--dart-define\` (or your chosen secret mechanism), never hardcode

## Error Handling

**Common Issues:**

1. **Missing Credentials**
   - Error: SDK fails to initialize
   - Solution: Verify \`.env\` file exists and contains required variables
   - Check: Environment variable names match exactly

2. **Wrong Initialization Location**
   - Error: SDK not tracking events
   - Solution: Ensure initialization happens before any SDK usage
   - Check: Initialization is in app entry point, not a component

3. **Environment Variables Not Loading**
   - Error: \`undefined\` or empty values
   - Solution: Verify env loading mechanism (dotenv, framework config, etc.)
   - Check: Variable names match framework requirements (prefixes)

## Best Practices

1. **Never hardcode credentials** - Always use environment variables
2. **Initialize early** - SDK should initialize before app starts or as early as
   possible
3. **Handle errors gracefully** - Wrap initialization in try-catch blocks
4. **Use appropriate environment** - Set production/staging/development based on
   build
5. **Verify integration** - Use validation scripts to verify SDK is properly
   integrated
6. **Document changes** - Update README and configuration files
7. **Version control** - Add \`.env\` to \`.gitignore\`, commit \`.env.example\`

## Docs Usage Note (MCP vs Static vs Web Docs)

- If MCP tools are available: treat \`search_sdk\` results as the source of truth
  for initialization/API usage.
- If MCP tools are unavailable: you may reference the official quickstarts below
  for **manual steps**, and use \`examples/\` + \`references/\` for code patterns.

**Official quickstarts:**

- iOS: \`https://docs.clix.so/sdk-quickstart-ios\`
- Android: \`https://docs.clix.so/sdk-quickstart-android\`
- React Native: \`https://docs.clix.so/sdk-quickstart-react-native\`
- Flutter: \`https://docs.clix.so/sdk-quickstart-flutter\`

## Progressive Disclosure

- **Level 1**: This SKILL.md file (always loaded)
- **Level 2**: \`references/\` directory (loaded when needed for specific topics)
- **Level 3**: \`examples/\` directory (loaded when framework-specific examples
  needed)
- **Level 4**: \`scripts/\` directory (executed directly, not loaded into context)

## References

For detailed information, see:

- \`references/sdk-reference.md\` - Complete SDK API documentation
- \`references/framework-patterns.md\` - Framework-specific integration patterns
- \`references/error-handling.md\` - Common errors and troubleshooting
- \`references/mcp-integration.md\` - Optional: MCP server usage guide (for
  tool-augmented mode)

## Examples

Working code examples available in \`examples/\` directory:

- \`ios-integration.swift\` - iOS integration (UIKit/SwiftUI)
- \`android-integration.kt\` - Android integration (Application)
- \`flutter-integration.dart\` - Flutter integration (main.dart)
- \`react-native-integration.tsx\` - React Native integration (App.tsx)

## Scripts

Utility scripts available in \`scripts/\` directory:

- \`validate-sdk.sh\` - Validate SDK installation and initialization (bash,
  deterministic)

Run scripts with \`--help\` first to see usage. Do not read source code unless
customization is absolutely necessary.
`,
  'api-triggered-campaigns': `---
name: clix-api-triggered-campaigns
display-name: API-Triggered Campaigns
short-description: API-triggered campaign setup
description:
  Helps developers configure API-triggered campaigns in the Clix console and
  trigger them from backend services with safe auth, payload schemas, dynamic
  audience filters (trigger.*), and personalization best practices. Use when the
  user mentions transactional notifications, backend-triggered sends,
  campaign_id trigger APIs, or "API-triggered campaigns".
user-invocable: true
---

# API-Triggered Campaigns (Backend → Clix)

Use this skill to set up **API-triggered campaigns** in the Clix console and
trigger them from your backend with dynamic data (\`trigger.*\`) for:

- Transactional notifications (orders, password reset, receipts)
- Workflow messages (assignments, approvals)
- System alerts (moderation, support tickets)
- Programmatic sends where marketers/ops should control content + targeting

## What the official docs guarantee (high-signal)

- API-triggered campaigns are configured in the console, then triggered via:
  \`POST /api/v1/campaigns/{campaign_id}:trigger\`
- Authentication uses **secret** headers:
  - \`X-Clix-Project-ID\`
  - \`X-Clix-API-Key\`
- Request \`properties\` become **\`trigger.*\`** for:
  - **Dynamic audience filtering** (console audience rules)
  - **Personalization** in templates (title/body/deep links)
- \`audience.broadcast=true\` sends to all users eligible under the campaign’s
  segment definition; \`audience.targets\` narrows to specific users/devices
  (still filtered by the segment definition).
- Dynamic audience filters are intentionally constrained for performance: **max
  3 attributes** in the audience definition.

## MCP-first (source of truth)

If Clix MCP tools are available, treat them as the **source of truth**:

- Use \`clix-mcp-server:search_docs\` to confirm the latest API contract + limits:
  - query examples:
    - \`"API-triggered campaign trigger endpoint"\`
    - \`"campaigns/{campaign_id}:trigger audience targets broadcast"\`
    - \`"trigger.* dynamic audience filters limitations"\`

If MCP tools are not available, use the bundled references:

- API contract → \`references/api-contract.md\`
- Console setup + dynamic filters → \`references/console-setup.md\`
- Backend patterns (auth, retries, timeouts) → \`references/backend-patterns.md\`
- Security/key handling → \`references/security-and-keys.md\`
- Personalization + dynamic filters →
  \`references/personalization-and-dynamic-filters.md\`
- Debugging checklist → \`references/debugging.md\`

## Workflow (copy + check off)

\`\`\`
API-triggered campaign progress:
- [ ] 1) Confirm goals + trigger source (what backend event sends the message?)
- [ ] 2) Define campaign contract (properties keys/types; PII policy)
- [ ] 3) Configure campaign in console (API-triggered + audience rules + templates)
- [ ] 4) Implement backend trigger wrapper (auth, timeout, retries, logging)
- [ ] 5) Validate trigger plan JSON (schema + naming + safety)
- [ ] 6) Verify in Clix (test payloads, Message Logs, segment matching)
\`\`\`

## 1) Confirm the minimum inputs

Ask only what’s needed:

- **Campaign**: where is it in the console? do you already have \`campaign_id\`?
- **Channel**: push / in-app / email / etc. (affects message template fields)
- **Audience mode**: broadcast vs explicit targets
- **Dynamic filter keys**: which \`trigger.*\` keys are used in audience rules
- **Properties**: list of keys + types + example values (avoid PII by default)
- **Backend**: runtime and HTTP client (Node/Fetch, Axios, Python, Go, etc.)

## 2) Create a “Trigger Plan” (before touching backend code)

Create \`api-trigger-plan.json\` in \`.clix/\` (recommended) or project root.

**Recommended location**: \`.clix/api-trigger-plan.json\`

**Plan schema (high-level):**

- \`campaign_id\` (string)
- \`audience.mode\`: \`"broadcast" | "targets" | "default"\`
- \`audience.targets\` (if mode is \`"targets"\`)
- \`dynamic_filter_keys\` (array of up to 3 snake_case keys)
- \`properties\` (map of snake_case keys → \`{ type, required?, example?, pii? }\`)

Example:

\`\`\`json
{
  "campaign_id": "019aa002-1d0e-7407-a0c5-5bfa8dd2be30",
  "audience": {
    "mode": "broadcast"
  },
  "dynamic_filter_keys": ["store_location"],
  "properties": {
    "store_location": {
      "type": "string",
      "required": true,
      "example": "San Francisco"
    },
    "order_id": { "type": "string", "required": true, "example": "ORD-12345" },
    "item_count": { "type": "number", "required": true, "example": 3 },
    "pickup_time": { "type": "string", "required": false, "example": "2:30 PM" }
  }
}
\`\`\`

## 3) Configure campaign in the console (API-triggered)

- Set the campaign type to **API-Triggered**.
- Build audience rules using \`{{ trigger.* }}\` for dynamic filters.
- Use \`{{ trigger.* }}\` in message templates + deep links.

See: \`references/console-setup.md\` for exact guidance and limitations.

## 4) Implement backend trigger wrapper (best practices)

Backend wrapper responsibilities:

- **Auth**: load \`X-Clix-Project-ID\` and \`X-Clix-API-Key\` from
  environment/secret store (never commit).
- **Timeout**: set a short timeout (e.g., 3–10s) and fail fast.
- **Retries**: retry only on transient failures (network/5xx), with backoff; do
  not retry blindly on 4xx.
- **Dedupe**: prevent double-sends in your system (e.g., unique key per order
  event) since the API call is “send-like”.
- **Logging**: log \`campaign_id\`, your correlation id (order id), and the Clix
  response (e.g., \`trigger_id\`).

Copy/paste examples:

- Node: \`examples/trigger-campaign-node.js\`
- Python: \`examples/trigger-campaign-python.py\`

## 5) Validate the plan (fast feedback loop)

Run:

\`\`\`bash
bash <skill-dir>/scripts/validate-api-trigger-plan.sh .clix/api-trigger-plan.json
\`\`\`

This validator checks:

- valid JSON
- \`campaign_id\` present
- \`dynamic_filter_keys\` is ≤ 3 and snake_case
- \`properties\` keys are snake_case and have valid types
- example values match declared types
- \`targets\` entries specify exactly one of \`project_user_id\` or \`device_id\`

## 6) Verify (Clix + end-to-end)

Minimum verification:

- Campaign is **API-Triggered** and \`campaign_id\` matches.
- If using dynamic audience filters, the \`trigger.*\` keys exist in the API call
  and match audience rules exactly.
- Trigger once with a known-good payload; confirm delivery + inspect Message
  Logs for rendering errors.

See \`references/debugging.md\`.

## Progressive Disclosure

- **Level 1**: This \`SKILL.md\` (always loaded)
- **Level 2**: \`references/\` (load when implementing details)
- **Level 3**: \`examples/\` (load when copy/pasting backend code)
- **Level 4**: \`scripts/\` (execute directly; do not load into context)

## References

- \`references/api-contract.md\`
- \`references/console-setup.md\`
- \`references/backend-patterns.md\`
- \`references/security-and-keys.md\`
- \`references/personalization-and-dynamic-filters.md\`
- \`references/debugging.md\`
`,
  'event-tracking': `---
name: clix-event-tracking
display-name: Event Tracking
short-description: Event tracking setup
description:
  Implements Clix event tracking (Clix.trackEvent) with consistent naming, safe
  property schemas, and campaign-ready validation. Use when adding, reviewing,
  or debugging event tracking; when configuring event-triggered campaigns; or
  when the user mentions events, tracking, funnels, or properties — or when the
  user types \`clix-event-tracking\`.
user-invocable: true
---

# Tracking Clix Events

Use this skill to help developers design and implement **Clix event tracking**
via \`Clix.trackEvent(...)\` so events can drive **event-triggered campaigns**,
**audience filters**, and **personalization**.

## What the official docs guarantee (high-signal)

- **When to track**: identify the user action/system event, then attach
  meaningful properties (funnel checkpoints, milestones, button taps).
- **Property normalization**: booleans/numbers/strings map directly; date-like
  values serialize to ISO 8601; unsupported objects become strings.
- **Error handling**: event tracking calls can throw—always handle errors so the
  app stays robust.

## MCP-first (source of truth)

If Clix MCP tools are available, treat them as the **source of truth**:

- \`clix-mcp-server:search_docs\` for conceptual behavior (campaign triggers,
  personalization)
- \`clix-mcp-server:search_sdk\` for exact SDK signatures per platform

If MCP tools are not available, use the bundled references:

- Event API contract + pitfalls → \`references/trackevent-contract.md\`
- Naming + schemas + privacy → \`references/naming-and-schema.md\`
- Implementation patterns → \`references/implementation-patterns.md\`
- Campaign mapping → \`references/campaign-mapping.md\`
- Debugging checklist → \`references/debugging.md\`

## Workflow (copy + check off)

\`\`\`
Event tracking progress:
- [ ] 1) Confirm platform(s) and goals (analytics vs campaign triggers)
- [ ] 2) Propose event plan (names, when fired, properties, where in code)
- [ ] 3) Validate plan (names, keys, types, PII constraints)
- [ ] 4) Implement trackEvent calls (platform-correct)
- [ ] 5) Verify: events fire once, serialize cleanly, match campaign configs
\`\`\`

## 1) Confirm the minimum inputs

Ask only what’s needed:

- **Platform**: iOS / Android / React Native / Flutter
- **Goal**: analytics only, event-triggered campaigns, or both
- **Top flows** (1–3): e.g., onboarding, checkout, subscription
- **PII policy**: what must never be sent (email/phone/name/free-text, etc.)

## 2) Propose an “Event Plan” (before touching code)

Return a compact table the user can approve:

- **event_name** (stable, \`snake_case\`)
- **when** (exact moment the event fires)
- **properties** (key + type, mark required vs optional)
- **location** (file/function/UI handler/network response)
- **purpose** (campaign trigger / analytics / both)

If campaigns are involved, remind: **event names and property keys must match
exactly** in the Clix console.

## 3) Validate the plan (fast feedback loop)

Create \`event-plan.json\` in \`.clix/\` directory (recommended) or project root:

**Recommended location**: \`.clix/event-plan.json\`

- Organized: keeps tooling configs together
- Hidden: doesn't clutter project root
- Committable: planning document for team review

**Alternative**: \`event-plan.json\` in project root (simpler, but less organized)

**For agents**: Locate \`scripts/validate-event-plan.sh\` in the installed skill
directory, then run it:

\`\`\`bash
# From project root:
bash <skill-dir>/scripts/validate-event-plan.sh .clix/event-plan.json
# Or if in root:
bash <skill-dir>/scripts/validate-event-plan.sh event-plan.json
\`\`\`

The skill directory is typically:

- \`.cursor/skills/event-tracking/\` (Cursor)
- \`.claude/skills/event-tracking/\` (Claude Code)
- \`.vscode/skills/event-tracking/\` (VS Code/Amp)
- Or check where this skill was installed

If validation fails: fix the plan first, then implement.

## 4) Implement tracking (platform-correct)

Use MCP to fetch the exact \`trackEvent\` signature for the platform; then:

- **Place calls at stable boundaries** (action confirmed, request succeeded,
  state updated)
- **Avoid duplicates** (don’t fire on every render; debounce where needed)
- **Avoid null/complex values** (prefer primitives; serialize dates to ISO)
- **Do not track PII by default**

See \`references/implementation-patterns.md\` for placement heuristics and code
patterns.

## 5) Verify

Minimum verification:

- Event fires **exactly once** per user action (or the intended cadence)
- Properties are **primitive + stable** (no null surprises)
- For campaigns: console trigger conditions match **exact names/keys**

For troubleshooting steps, see \`references/debugging.md\`.
`,
  'user-management': `---
name: clix-user-management
display-name: User Management
short-description: User management setup
description:
  Implements Clix user identification and user properties (setUserId,
  removeUserId, setUserProperty/setUserProperties,
  removeUserProperty/removeUserProperties) with safe schemas, logout best
  practices, and campaign-ready personalization/audience usage. Use when the
  user mentions login/logout, userId, user properties, personalization, audience
  targeting or when the user types \`clix-user-management\`.
user-invocable: true
---

# Clix User Management

Use this skill to help developers implement **Clix user identification** and
**user properties** so campaigns can use \`user.*\` variables and audience
filters, and so user identity is consistent across devices and sessions.

## What the official docs guarantee (high-signal)

- **Anonymous vs identified**: if no user ID is set, Clix treats the user as
  anonymous; setting a user ID converts the anonymous user into an identified
  user and links prior activity.
- **Logout**: **do not** call \`setUserId(null)\` on logout; handle logout in app
  logic only; when a different user logs in, call \`setUserId(newUserId)\` to
  switch.
- **User properties**: values are strings, numbers, or booleans; user operations
  can throw—handle errors.

## MCP-first (source of truth)

If Clix MCP tools are available, treat them as the **source of truth**:

- \`clix-mcp-server:search_docs\` for conceptual behavior and logout guidance
- \`clix-mcp-server:search_sdk\` for exact SDK signatures per platform

If MCP tools are not available, use the bundled references:

- Contract + pitfalls → \`references/user-management-contract.md\`
- Logout + switching rules → \`references/logout-and-switching.md\`
- Property schema + PII → \`references/property-schema.md\`
- Implementation patterns → \`references/implementation-patterns.md\`
- Personalization + audience mapping →
  \`references/personalization-and-audience.md\`
- Debugging checklist → \`references/debugging.md\`

## Workflow (copy + check off)

\`\`\`
User management progress:
- [ ] 1) Confirm platform(s) and auth model (anonymous browsing? login? shared devices?)
- [ ] 2) Propose user plan (when setUserId/removeUserId, properties, logout policy)
- [ ] 3) Validate plan (PII, property types, logout rules)
- [ ] 4) Implement (platform-correct calls + error handling)
- [ ] 5) Verify (switching works, properties appear, campaigns can target/personalize)
\`\`\`

## 1) Confirm the minimum inputs

Ask only what’s needed:

- **Platform**: iOS / Android / React Native / Flutter
- **Auth events**: where login success and logout happen in code
- **User identifier**: what stable ID to use (prefer internal user id, not
  email)
- **PII policy**: what must never be stored as user properties
- **Campaign goals**: personalization, audience filters, or both

## 2) Propose a “User Plan” (before touching code)

Return a compact table:

- **user_id source**: where it comes from (auth response, local db)
- **setUserId timing**: exact point (after login success / token saved)
- **logout behavior**: explicitly “no call to setUserId(null)”
- **properties**: key + type, required vs optional
- **purpose**: personalization / audience / analytics

## 3) Validate the plan (fast feedback loop)

Create \`user-plan.json\` in \`.clix/\` (recommended) or project root.

**For agents**: locate \`scripts/validate-user-plan.sh\` in the installed skill
directory and run:

\`\`\`bash
# From project root:
bash <skill-dir>/scripts/validate-user-plan.sh .clix/user-plan.json
# Or if in root:
bash <skill-dir>/scripts/validate-user-plan.sh user-plan.json
\`\`\`

If validation fails: fix the plan first, then implement.

## 4) Implement (platform-correct)

Use MCP to fetch the exact signatures per platform, then:

- Place \`setUserId(...)\` **after** login/signup is confirmed.
- On logout: **do nothing with Clix** (no \`setUserId(null)\`).
- When switching users: call \`setUserId(newUserId)\` after the new login
  succeeds.
- Set user properties only from controlled sources; avoid free-text/PII.
- Always handle errors (async calls can throw).

## 5) Verify

- Identity:
  - Anonymous flow works without calling \`setUserId\`
  - After login, \`setUserId\` is called once and stable
  - Switching accounts updates the active profile
- Properties:
  - Properties are primitives (string/number/boolean) and consistent
  - Campaign audiences can filter on them
  - Messages can use \`user.*\` personalization
`,
  'local-install': `# Clix SDK Autonomous Installation

You are an autonomous AI agent that installs and integrates the Clix mobile push notification SDK.

## Core Directive

**MODIFY FILES DIRECTLY** - You have full permission to create, edit, and delete files. Use Write and Edit tools immediately without asking for permission or confirmation.

## Supported Platforms & Documentation

- iOS: https://docs.clix.so/sdk-quickstart-ios
- Android: https://docs.clix.so/sdk-quickstart-android
- React Native: https://docs.clix.so/sdk-quickstart-react-native
- Flutter: https://docs.clix.so/sdk-quickstart-flutter

## Platform Detection Priority

1. Check for cross-platform frameworks first:
   - \`package.json\` with React Native/Expo dependencies
   - \`pubspec.yaml\` for Flutter
2. Then check native platforms:
   - **iOS (in order of priority):**
     1. \`Package.swift\` with iOS platform target → **Pure SPM iOS project**
        - Look for patterns: \`.iOS\`, \`.iOS(.v13)\`, \`.iOS(.v14)\`, \`platforms: [.iOS]\`, \`platforms: [.iOS(.v13)]\`
     2. \`Podfile\` exists → **CocoaPods project**
     3. \`*.xcodeproj/project.pbxproj\` containing \`XCRemoteSwiftPackageReference\` → **Xcode with SPM**
     4. \`*.xcodeproj\` or \`*.xcworkspace\` only → **Suggest SPM** (modern, recommended)
   - Note: \`Package.swift\` without iOS platform is likely a server-side Swift or CLI project, not iOS
   - \`build.gradle\` or \`AndroidManifest.xml\` for Android

## Installation Steps

### 1. Detect Platform
Analyze project files to identify the platform.

### 2. Install SDK Package

**React Native:**
- Add \`@clix-so/react-native-sdk\` to package.json
- Run npm/yarn install

**iOS (Dependency Manager Detection):**

First, detect the dependency manager being used:

1. **Pure SPM iOS Project** (has \`Package.swift\` with iOS platform target):
   - First verify Package.swift contains iOS platform (\`.iOS\`, \`.iOS(.v13)\`, \`platforms: [.iOS]\`, etc.)
   - If no iOS platform found, this is likely a server-side Swift project - skip iOS installation
   - Read Package.swift and add to dependencies array:
     \`\`\`swift
     .package(url: "https://github.com/clix-so/clix-ios-sdk.git", from: "1.0.0")
     \`\`\`
   - Add to target dependencies:
     \`\`\`swift
     .product(name: "Clix", package: "clix-ios-sdk")
     \`\`\`
   - Run \`swift package resolve\`

2. **CocoaPods Project** (has \`Podfile\`):
   - Add to Podfile:
     \`\`\`ruby
     pod 'Clix', :git => 'https://github.com/clix-so/clix-ios-sdk.git'
     \`\`\`
   - Run: \`cd ios && pod install\`

3. **Xcode Project with SPM** (has \`project.pbxproj\` with \`XCRemoteSwiftPackageReference\`):
   - Inform user to add via Xcode: File > Add Package Dependencies
   - URL: \`https://github.com/clix-so/clix-ios-sdk\`
   - Note: Direct .pbxproj modification is complex; prefer Xcode UI

4. **Bare Xcode Project** (only \`*.xcodeproj\` or \`*.xcworkspace\`):
   - Recommend SPM: Guide user to add via Xcode (File > Add Package Dependencies)
   - Alternative: Create Podfile and use CocoaPods

**Android:**
- Add to build.gradle

**Flutter:**
- Add to pubspec.yaml
- Run flutter pub get

### 3. Create/Modify Files Directly

**React Native:**
- Create initialization module or add to existing entry file
- Update constants file with CLIX_PROJECT_ID and CLIX_PUBLIC_API_KEY exports
- Add initialization call in app entry point (app/_layout.tsx or index.js)
- Add configuration to environment files with placeholders

**iOS:**
- Modify AppDelegate to initialize SDK
- Add Info.plist entries
- Note: Xcode capabilities (Push Notifications, Background Modes) require manual IDE steps

**Android:**
- Modify MainActivity or Application class
- Update AndroidManifest.xml with permissions
- Verify Firebase configuration (see step 6)

**Flutter:**
- Modify main.dart to initialize SDK
- Update platform-specific files as needed
- Verify Firebase configuration (see step 6)

### 4. Use Placeholders for Secrets

Use \`YOUR_CLIX_PROJECT_ID\` and \`YOUR_CLIX_PUBLIC_API_KEY\` as placeholders. Inform user to replace with actual credentials from https://console.clix.so/

### 5. Run Post-Installation Commands

Execute necessary commands:
- \`npm install\` or \`yarn install\` after package.json changes
- \`cd ios && pod install\` for iOS dependencies
- \`flutter pub get\` for Flutter

### 6. Verify Firebase Configuration

For push notifications to work, Firebase must be properly configured:

**Android (google-services.json):**
- Expected locations:
  - Standard Android: \`app/google-services.json\`
  - React Native/Flutter: \`android/app/google-services.json\`
- Download from Firebase Console > Project Settings > Your apps > Android app
- Verify package name matches your AndroidManifest.xml

**iOS (GoogleService-Info.plist):**
- Expected locations:
  - React Native: \`ios/GoogleService-Info.plist\`
  - Flutter: \`ios/Runner/GoogleService-Info.plist\`
  - Native iOS: \`<AppName>/GoogleService-Info.plist\`
- Download from Firebase Console > Project Settings > Your apps > iOS app
- Verify bundle ID matches your Xcode project

**Validation:**
- Check if files exist in correct locations
- Verify JSON/plist structure is valid
- Confirm project IDs match between platforms (for cross-platform apps)

Use \`/firebase\` command in interactive mode to check and configure Firebase credentials.

## Automation Rules

✅ **DO:**
- Use Write tool to create new files immediately
- Use Edit tool to modify existing files immediately
- Use Bash tool to run installation commands
- Proceed autonomously through all steps
- Report what was done after completion

❌ **DO NOT:**
- Ask for permission or confirmation
- Say "you should" or "please add" - just do it
- Provide manual steps for code changes - make the changes
- Wait for user input (except for IDE-only tasks)

## IDE-Only Manual Steps

Only these require user action:
- Xcode: Adding capabilities, configuring entitlements
- Android Studio: Firebase setup UI, capability configuration
- Building and running the project

For these, provide brief instructions but don't wait for confirmation.

### iOS Notification Service Extension (Recommended)

For rich push notifications (images, buttons), create a Notification Service Extension:

1. In Xcode: File > New > Target > Notification Service Extension
2. Add Clix SDK to the extension target:
   - **CocoaPods**: Add \`target 'YourExtension' do pod 'Clix' end\` to Podfile, then \`pod install\`
   - **SPM**: Add Clix package to extension target in Xcode (General > Frameworks)
3. Implement NotificationService.swift:
   \`\`\`swift
   import UserNotifications
   import Clix

   class NotificationService: ClixNotificationServiceExtension {
       override func didReceive(_ request: UNNotificationRequest,
                               withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
           register(projectId: "YOUR_PROJECT_ID")
           super.didReceive(request, withContentHandler: contentHandler)
       }
   }
   \`\`\`
4. Add App Groups capability to both main app and extension (same group ID: \`group.clix.{BUNDLE_ID}\`)
5. For Xcode 15+: Set \`ENABLE_USER_SCRIPT_SANDBOXING\` to "No" in extension's Build Settings

For detailed setup, run \`clix ios-setup\` or \`/ios-setup\` in interactive mode.

## Output Format

After completion, report:
✓ Files created/modified (with paths)
✓ Commands executed
✓ Placeholders that need replacement
✓ Any IDE-only steps required
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

Use \`/firebase\` command to interactively check and configure Firebase credentials.
`,
  'local-ios-setup': `# iOS Capabilities Configuration

You are an AI agent that configures iOS capabilities required for the Clix SDK.

## Core Directive

**GUIDE USERS** through iOS capability configuration for push notifications and data sharing. For file modifications, use Edit/Write tools when possible. For Xcode-only steps, provide clear step-by-step instructions.

## Required Capabilities for Clix iOS SDK

### 1. Push Notifications

- **Purpose:** Enable APNs (Apple Push Notification service) communication
- **Entitlement Key:** \`aps-environment\`
- **Values:** \`development\` (debug builds) or \`production\` (release builds)
- **Xcode Capability:** Push Notifications

### 2. App Groups

- **Purpose:** Share data between main app and Notification Service Extension using MMKV
- **Entitlement Key:** \`com.apple.security.application-groups\`
- **ID Format:** \`group.clix.{BUNDLE_ID}\` (e.g., \`group.clix.com.example.myapp\`)
- **Xcode Capability:** App Groups
- **Important:** Must be configured for BOTH main app AND Notification Service Extension targets

## Workflow

### Phase 1: Project Analysis

1. **Detect iOS Project**
   - Search for \`*.xcodeproj\` or \`*.xcworkspace\` files
   - Identify the main app target name
   - Check if this is a native iOS, React Native, or Flutter project

2. **Find Bundle Identifier**
   - Check \`Info.plist\` for \`CFBundleIdentifier\`
   - Or parse \`project.pbxproj\` for \`PRODUCT_BUNDLE_IDENTIFIER\`

3. **Check Current Capabilities Status**
   - Search for existing \`*.entitlements\` files
   - Check for \`aps-environment\` entitlement (Push Notifications configured)
   - Check for \`com.apple.security.application-groups\` (App Groups configured)
   - Check \`project.pbxproj\` for \`SystemCapabilities\` section

4. **Report Current State**
   Output findings:
   \`\`\`text
   Project: {project_name}
   Bundle ID: {bundle_id}
   Push Notifications: {configured/not configured}
   App Groups: {configured/not configured}
   Existing entitlements files: {list}
   \`\`\`

### Phase 2: Xcode Configuration (Manual Steps)

Provide clear instructions for adding capabilities in Xcode. These steps CANNOT be automated and require user action in Xcode IDE.

**Add Push Notifications:**
\`\`\`text
1. Open your project in Xcode
2. Select your main app target in the Navigator (left sidebar)
3. Go to the "Signing & Capabilities" tab
4. Click the "+ Capability" button
5. Search for and select "Push Notifications"
6. Xcode will automatically create an entitlements file if one doesn't exist
\`\`\`

**Add Background Modes (Recommended):**
\`\`\`text
1. In "Signing & Capabilities", click "+ Capability"
2. Select "Background Modes"
3. Enable "Remote notifications" checkbox
   - This allows the app to process push notifications in the background
\`\`\`

**Add App Groups:**
\`\`\`text
1. Click "+ Capability"
2. Select "App Groups"
3. Click the "+" button under App Groups
4. Enter the App Group ID: group.clix.{BUNDLE_ID}
   Example: group.clix.com.example.myapp
5. Click OK to create the group

IMPORTANT: Repeat steps 1-5 for the Notification Service Extension target:
1. Select the extension target (usually named "{AppName}NotificationServiceExtension")
2. Go to "Signing & Capabilities"
3. Add "App Groups" capability
4. Select the SAME App Group ID you created above
\`\`\`

### Phase 3: Entitlements Files

Create or modify entitlements files. Use Write/Edit tools for these operations.

**Main App Entitlements** (\`{AppName}.entitlements\` or \`{AppName}/{AppName}.entitlements\`):

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>aps-environment</key>
    <string>development</string>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.clix.{BUNDLE_ID}</string>
    </array>
</dict>
</plist>
\`\`\`

**Notification Service Extension Entitlements** (\`{ExtensionName}/{ExtensionName}.entitlements\`):

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.clix.{BUNDLE_ID}</string>
    </array>
</dict>
</plist>
\`\`\`

**Note:** Replace \`{BUNDLE_ID}\` with the actual bundle identifier (e.g., \`com.example.myapp\`).

### Phase 3.5: Notification Service Extension Setup

Create a Notification Service Extension for rich push notifications (images, buttons, etc.).

**Create Extension Target in Xcode:**
\`\`\`text
1. File > New > Target
2. Select "Notification Service Extension"
3. Name it "{AppName}NotificationServiceExtension" (e.g., "MyAppNotificationServiceExtension")
4. Click "Finish" (Cancel the "Activate scheme" dialog)
5. Note: Use this exact name consistently in Podfile, entitlements path, and SPM setup
\`\`\`

**Implement NotificationService.swift:**

\`\`\`swift
import UserNotifications
import Clix

class NotificationService: ClixNotificationServiceExtension {
    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        register(projectId: "YOUR_PROJECT_ID")
        super.didReceive(request, withContentHandler: contentHandler)
    }
}
\`\`\`

**Note:** Replace \`YOUR_PROJECT_ID\` with your actual Clix project ID from <https://console.clix.so/>

**Add Clix SDK to Extension Target:**

For CocoaPods projects, add to Podfile:
\`\`\`ruby
target '{AppName}NotificationServiceExtension' do
  pod 'Clix'
end
\`\`\`
Then run: \`cd ios && pod install\`

For SPM projects in Xcode:
1. Select the extension target
2. Go to General > Frameworks, Libraries, and Embedded Content
3. Click + and add the Clix package

**Configure Build Settings (Xcode 15+):**

For the extension target:
- Set \`ENABLE_USER_SCRIPT_SANDBOXING\` to "No" in Build Settings

For React Native projects with Firebase:
- In Build Phases, move "Embed Foundation Extensions" above "[RNFB] Core Configuration"

### Phase 4: Apple Developer Portal Configuration

Guide user through manual portal configuration. These steps CANNOT be automated.

**Enable Capabilities on App ID:**
\`\`\`text
1. Go to https://developer.apple.com/account
2. Navigate to "Certificates, Identifiers & Profiles"
3. Select "Identifiers" from the sidebar
4. Find and click your App ID (Bundle ID)
5. Scroll down to "Capabilities" section
6. Enable "Push Notifications"
   - You may need to configure certificates (Development/Production)
7. Enable "App Groups"
8. Click "Save"
\`\`\`

**Register App Group ID:**
\`\`\`text
1. In the sidebar, select "Identifiers"
2. Click the "+" button
3. Select "App Groups" and click "Continue"
4. Enter:
   - Description: Clix SDK App Group for {App Name}
   - Identifier: group.clix.{BUNDLE_ID}
5. Click "Continue" then "Register"
6. Go back to your App ID and associate the App Group:
   - Edit your App ID
   - Under "App Groups", click "Configure"
   - Select the App Group you just created
   - Click "Save"
\`\`\`

**Regenerate Provisioning Profile:**
\`\`\`text
After enabling capabilities, your provisioning profiles become invalid.

1. Navigate to "Profiles" in the sidebar
2. Find your Development and/or Distribution profile
3. Click on the profile
4. Click "Edit" or delete and recreate the profile
5. Ensure the updated App ID is selected
6. Download the new profile

In Xcode:
1. Go to Xcode > Settings (or Preferences) > Accounts
2. Select your Apple ID
3. Click "Download Manual Profiles"
   Or: Delete old profiles and let Xcode auto-manage
\`\`\`

### Phase 5: Verification

After configuration, verify the setup and output a report.

**Check Entitlements Files:**
- Main app entitlements contains \`aps-environment\`
- Main app entitlements contains \`com.apple.security.application-groups\`
- Extension entitlements contains matching App Group ID

**Check project.pbxproj (if accessible):**
- Look for \`SystemCapabilities\` dictionary
- Verify \`com.apple.Push\` is enabled
- Verify \`com.apple.ApplicationGroups.iOS\` is enabled

**Output Verification Report:**

\`\`\`json
{
  "project": "{project_name}",
  "bundleId": "{bundle_id}",
  "capabilities": {
    "pushNotifications": {
      "entitlementFile": true,
      "environment": "development",
      "xcodeCapability": "verify manually in Xcode",
      "developerPortal": "verify manually at developer.apple.com"
    },
    "appGroups": {
      "groupId": "group.clix.{bundle_id}",
      "mainAppEntitlement": true,
      "extensionEntitlement": true,
      "developerPortal": "verify manually at developer.apple.com"
    }
  },
  "nextSteps": [
    "Verify capabilities are added in Xcode Signing & Capabilities",
    "Confirm App Group ID is registered in Apple Developer Portal",
    "Regenerate provisioning profiles if needed",
    "Build and run to verify no signing errors"
  ]
}
\`\`\`

## Common Issues and Solutions

### Missing Entitlements File

**Symptom:** No \`.entitlements\` file exists in the project.

**Solution:**
- Xcode automatically creates one when you add your first capability
- Or create manually and link in Build Settings:
  1. Create \`{AppName}.entitlements\` file
  2. In Xcode, select target > Build Settings
  3. Search for "Code Signing Entitlements"
  4. Set the path to your entitlements file

### App Group ID Mismatch

**Symptom:** Data not shared between app and extension.

**Solution:**
- Verify the App Group ID is EXACTLY the same in both targets
- Format must be: \`group.clix.{BUNDLE_ID}\`
- Check both entitlements files have identical values

### Provisioning Profile Invalid

**Symptom:** "Provisioning profile doesn't include the X capability" error.

**Solution:**
1. Go to Apple Developer Portal
2. Delete the old provisioning profile
3. Create a new one with the updated App ID
4. Download and install in Xcode
5. Or enable "Automatically manage signing" in Xcode

### Push Notifications Not Working

**Symptom:** Push notifications not received.

**Checklist:**
- [ ] Push Notifications capability added in Xcode
- [ ] \`aps-environment\` in entitlements (check value matches build config)
- [ ] Push Notifications enabled on App ID in Developer Portal
- [ ] APNs certificate or key configured in Clix console
- [ ] Provisioning profile regenerated after enabling capability
- [ ] Physical device used (simulator doesn't receive push)

### App Group Data Not Shared

**Symptom:** MMKV data not accessible from extension.

**Checklist:**
- [ ] App Groups capability added to BOTH main app AND extension
- [ ] Same App Group ID in both targets' entitlements
- [ ] App Group ID registered in Developer Portal
- [ ] App Group associated with App ID in Developer Portal

## Automation Rules

**CAN automate (use Write/Edit tools):**
- Creating entitlements files
- Modifying existing entitlements files
- Reading project configuration files
- Detecting current capabilities status

**CANNOT automate (provide instructions only):**
- Adding capabilities in Xcode UI (Signing & Capabilities tab)
- Enabling capabilities in Apple Developer Portal
- Registering App Group IDs in Developer Portal
- Generating/downloading provisioning profiles
- Associating App Groups with App IDs

For manual steps, provide clear instructions and proceed without waiting for confirmation.

## Output Format

After completing the workflow, summarize:

1. **Files Created/Modified**
   - List all entitlements files with full paths
   - Show what was added or changed

2. **Manual Steps Required**
   - Xcode capability additions
   - Developer Portal configurations

3. **Verification Checklist**
   - JSON report with status of each component
   - Next steps for user to complete

4. **Troubleshooting Tips**
   - Common issues to watch for based on project state
`,
};

/**
 * Embedded skill metadata.
 */
export const EMBEDDED_SKILL_METADATA: SkillMetadata[] = [
  {
    folder: 'personalization',
    name: 'clix-personalization',
    commandName: 'personalization',
    displayName: 'Personalization',
    shortDescription: 'Personalization templates',
    description:
      'Helps developers author and debug Clix personalization templates (Liquid-style) for message content, deep links/URLs, and audience targeting. Use when the user mentions personalization variables, Liquid, templates, conditional logic, loops, filters, deep links, message logs, or when the user types `clix-personalization`.',
    userInvocable: true,
  },
  {
    folder: 'integration',
    name: 'clix-integration',
    commandName: 'integration',
    displayName: 'SDK Integration',
    shortDescription: 'SDK integration guide',
    description:
      'Integrates Clix Mobile SDK into iOS, Android, Flutter, and React Native projects. Provides step-by-step guidance for installation, initialization, and verification. Use when the user asks to install, setup, integrate Clix or when the user types `clix-integration` / "clix integration".',
    userInvocable: true,
  },
  {
    folder: 'api-triggered-campaigns',
    name: 'clix-api-triggered-campaigns',
    commandName: 'api-triggered-campaigns',
    displayName: 'API-Triggered Campaigns',
    shortDescription: 'API-triggered campaign setup',
    description:
      'Helps developers configure API-triggered campaigns in the Clix console and trigger them from backend services with safe auth, payload schemas, dynamic audience filters (trigger.*), and personalization best practices. Use when the user mentions transactional notifications, backend-triggered sends, campaign_id trigger APIs, or "API-triggered campaigns".',
    userInvocable: true,
  },
  {
    folder: 'event-tracking',
    name: 'clix-event-tracking',
    commandName: 'event-tracking',
    displayName: 'Event Tracking',
    shortDescription: 'Event tracking setup',
    description:
      'Implements Clix event tracking (Clix.trackEvent) with consistent naming, safe property schemas, and campaign-ready validation. Use when adding, reviewing, or debugging event tracking; when configuring event-triggered campaigns; or when the user mentions events, tracking, funnels, or properties — or when the user types `clix-event-tracking`.',
    userInvocable: true,
  },
  {
    folder: 'user-management',
    name: 'clix-user-management',
    commandName: 'user-management',
    displayName: 'User Management',
    shortDescription: 'User management setup',
    description:
      'Implements Clix user identification and user properties (setUserId, removeUserId, setUserProperty/setUserProperties, removeUserProperty/removeUserProperties) with safe schemas, logout best practices, and campaign-ready personalization/audience usage. Use when the user mentions login/logout, userId, user properties, personalization, audience targeting or when the user types `clix-user-management`.',
    userInvocable: true,
  },
];

/**
 * Check if embedded skills are available.
 */
export function hasEmbeddedSkills(): boolean {
  return Object.keys(EMBEDDED_SKILLS).length > 0;
}

/**
 * Get an embedded skill by folder name.
 */
export function getEmbeddedSkill(skillFolder: string): string | undefined {
  return EMBEDDED_SKILLS[skillFolder];
}

/**
 * Get all embedded skill folder names.
 */
export function getEmbeddedSkillFolders(): string[] {
  return Object.keys(EMBEDDED_SKILLS);
}

/**
 * Get metadata for all embedded skills.
 */
export function getEmbeddedSkillMetadata(): SkillMetadata[] {
  return EMBEDDED_SKILL_METADATA;
}

/**
 * Get metadata for a specific skill by command name.
 */
export function getSkillMetadataByCommand(commandName: string): SkillMetadata | undefined {
  return EMBEDDED_SKILL_METADATA.find((m) => m.commandName === commandName);
}

/**
 * Get metadata for a specific skill by folder name.
 */
export function getSkillMetadataByFolder(folder: string): SkillMetadata | undefined {
  return EMBEDDED_SKILL_METADATA.find((m) => m.folder === folder);
}
