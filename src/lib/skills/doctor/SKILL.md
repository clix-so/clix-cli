# Clix SDK Doctor

You are analyzing a mobile project for Clix SDK integration status and completeness.

## Task

Analyze the project and output a comprehensive diagnostic JSON report followed by actionable recommendations.

## Diagnostic JSON Schema

```json
{
  "platform": "ios" | "android" | "react-native" | "flutter" | "unknown",
  "installationMethod": "spm-package-swift" | "spm-xcode" | "cocoapods" | "npm" | "gradle" | "pubspec" | "none",
  "sdkInstalled": true | false,
  "sdkVersion": "version string or null",
  "sdkInitialized": true | false,
  "pushConfigured": true | false,
  "issues": [
    {
      "type": "sdk" | "push" | "config" | "ios" | "android" | "firebase" | "general",
      "severity": "error" | "warning" | "info",
      "file": "File name or path",
      "description": "Problem explanation",
      "recommendation": "Fix steps"
    }
  ],
  "checklist": {
    "sdkDependency": true | false,
    "sdkInitialization": true | false,
    "apiKeyConfigured": true | false,
    "pushPermissions": true | false,
    "entitlements": true | false,
    "iosNseConfigured": true | false,
    "iosAppGroupsConfigured": true | false,
    "iosPushCapability": true | false,
    "androidManifestComplete": true | false,
    "firebaseConfig": true | false,
    "firebaseAndroid": true | false,
    "firebaseIos": true | false,
    "firebasePackageMatch": true | false,
    "firebaseBundleMatch": true | false
  },
  "installCompleteness": {
    "percentage": 0-100,
    "completedSteps": ["step1", "step2"],
    "missingSteps": ["step3", "step4"]
  },
  "nextSteps": ["Step 1", "Step 2"]
}
```

## Analysis Checklist

### Platform Detection

1. Check for `package.json` (React Native/Expo)
2. Check for `pubspec.yaml` (Flutter)
3. Check for `*.xcodeproj` or `*.xcworkspace` (iOS)
4. Check for `build.gradle` or `AndroidManifest.xml` (Android)

### SDK Installation Check

**iOS** - Check in order of priority:
1. `Package.swift` with iOS platform target (contains `.iOS` or `platforms: [.iOS`) for package dependency containing `clix-ios-sdk` or `clix` → `installationMethod: "spm-package-swift"`
2. `Podfile` for 'ClixSDK' or 'Clix' pod → `installationMethod: "cocoapods"`
3. `*.xcodeproj/project.pbxproj` for `XCRemoteSwiftPackageReference` containing `clix` → `installationMethod: "spm-xcode"`

**Android:**
- Check `build.gradle` for clix dependency → `installationMethod: "gradle"`

**React Native:**
- Check `package.json` for `@clix-so/react-native-sdk` → `installationMethod: "npm"`

**Flutter:**
- Check `pubspec.yaml` for `clix_flutter_sdk` or `clix_flutter` → `installationMethod: "pubspec"`

### SDK Initialization Check

Verify SDK is initialized in the correct entry point:

**React Native:**
- Look for `Clix.initialize` in `app/_layout.tsx`, `index.js`, or `App.tsx`
- Check for import statement: `import { Clix } from '@clix-so/react-native-sdk'`

**iOS:**
- Look for `Clix.initialize` in `AppDelegate.swift` or main app file
- Check for import statement: `import Clix`

**Android:**
- Look for `Clix.initialize` in `Application.kt` or `Application.java`
- Check for import statement: `import so.clix.core.Clix`

**Flutter:**
- Look for `Clix.initialize` in `main.dart`
- Check for import statement: `import 'package:clix_flutter/clix_flutter.dart'`

### Push Configuration Check

**iOS:**
- Check entitlements for `aps-environment` key
- Check for Push Notifications capability in `project.pbxproj`
- Check for Background Modes with `remote-notification`

**Android:**
- Check `AndroidManifest.xml` for FCM service declaration
- Check for required permissions

### iOS Notification Service Extension (NSE) Check

**Verify NSE target exists:**
- Search for `*NotificationServiceExtension` directory
- Look for `NotificationService.swift` file
- Check for `ClixNotificationServiceExtension` base class usage
- Verify `register(projectId:)` is called

**Verify NSE dependencies:**
- CocoaPods: Check `Podfile` for extension target with Clix pod
- SPM: Check `project.pbxproj` for Clix package in extension target

**NSE Issues to Detect:**
- NSE target missing
- NSE target exists but doesn't use `ClixNotificationServiceExtension`
- NSE target missing Clix SDK dependency
- NSE missing `register(projectId:)` call

### iOS Capabilities Check

**Push Notifications Capability:**
- Check `project.pbxproj` for `com.apple.Push` in SystemCapabilities
- Check entitlements file for `aps-environment`

**App Groups Capability:**
- Check `project.pbxproj` for `com.apple.ApplicationGroups.iOS` in SystemCapabilities
- Check entitlements for `com.apple.security.application-groups`
- Verify format: `group.clix.{BUNDLE_ID}`
- Verify SAME App Group ID in both main app and NSE entitlements

**Background Modes:**
- Check for `remote-notification` in UIBackgroundModes (Info.plist or project.pbxproj)

**Capability Issues to Detect:**
- Push Notifications capability missing
- App Groups capability missing
- App Group ID mismatch between main app and NSE
- App Group ID format incorrect (should be `group.clix.{BUNDLE_ID}`)
- Background Modes missing or remote-notification not enabled

### Android Manifest Check

**Required permissions:**
- `android.permission.INTERNET`
- `android.permission.POST_NOTIFICATIONS` (Android 13+)

**Required services/receivers:**
- FCM messaging service
- Broadcast receivers for push handling

### Firebase Configuration Check (Detailed)

**Android (google-services.json):**
- Check file presence in expected locations:
  - Standard Android: `app/google-services.json`
  - React Native/Flutter: `android/app/google-services.json`
- Validate JSON structure against Firebase schema
- Verify `project_info.project_id` exists
- Verify `client[].client_info.android_client_info.package_name` matches AndroidManifest.xml
- Report if file found in wrong location (e.g., project root)

**iOS (GoogleService-Info.plist):**
- Check file presence in expected locations:
  - React Native: `ios/GoogleService-Info.plist`
  - Flutter: `ios/Runner/GoogleService-Info.plist`
  - Native iOS: `<AppName>/GoogleService-Info.plist`
- Validate plist structure (API_KEY, GCM_SENDER_ID, GOOGLE_APP_ID, PROJECT_ID, BUNDLE_ID)
- Verify BUNDLE_ID matches Xcode project bundle identifier
- Report if file found in wrong location

**Cross-Platform Validation:**
- For React Native/Flutter projects, verify both Android and iOS configs exist
- Verify PROJECT_ID matches between platforms

### Installation Completeness Assessment

Based on platform, calculate completeness percentage:

**React Native Checklist:**
1. SDK dependency in package.json
2. SDK initialized in entry point
3. iOS: Entitlements configured
4. iOS: NSE target configured
5. iOS: Push Notifications capability
6. iOS: App Groups capability
7. Android: Manifest permissions
8. Firebase: google-services.json present
9. Firebase: GoogleService-Info.plist present

**iOS Native Checklist:**
1. SDK dependency (CocoaPods/SPM)
2. SDK initialized in AppDelegate
3. Entitlements configured
4. NSE target configured
5. Push Notifications capability
6. App Groups capability
7. Firebase: GoogleService-Info.plist present

**Android Native Checklist:**
1. SDK dependency in build.gradle
2. SDK initialized in Application class
3. Manifest permissions
4. Firebase: google-services.json present

**Flutter Checklist:**
1. SDK dependency in pubspec.yaml
2. SDK initialized in main.dart
3. iOS: Entitlements configured
4. iOS: NSE target configured
5. iOS: Push Notifications capability
6. iOS: App Groups capability
7. Android: Manifest permissions
8. Firebase: google-services.json present
9. Firebase: GoogleService-Info.plist present

### Common Issues to Detect

**SDK Issues:**
- Missing SDK dependency
- SDK not initialized
- SDK initialized in wrong location
- API key placeholders not replaced
- Outdated SDK version

**iOS Issues:**
- Missing or invalid API key
- Missing push notification permissions
- Missing capabilities/entitlements
- NSE not configured
- NSE using wrong base class
- NSE missing SDK dependency
- App Group ID mismatch
- App Group ID format incorrect

**Android Issues:**
- Missing manifest permissions
- FCM service not configured
- Application class not registered in manifest

**Firebase Issues:**
- Firebase config file missing
- Firebase config file in wrong location
- Firebase config file invalid (malformed JSON/plist)
- Firebase package name / bundle ID mismatch
- Firebase project ID mismatch between platforms

## Output Format

1. **Output the JSON diagnostic** with all checks completed

2. **Provide a brief summary:**
   ```
   DOCTOR SUMMARY
   ==============
   Platform: React Native
   SDK Status: Installed (npm)
   Initialization: Configured
   Push Ready: Partial (iOS NSE missing)

   Installation Completeness: 67% (6/9 steps)

   Issues Found: 3
     [Error] iOS NSE not configured - rich push notifications won't work
     [Warning] Firebase iOS config missing - push notifications won't work
     [Info] API key placeholders need replacement

   Run /install to complete missing setup steps.
   ```

3. **Provide actionable recommendations** for each issue found

## Cross-Reference with Install

When issues are found, reference what `/install` would have done:

- "NSE not configured" → `/install` creates NotificationService.swift and entitlements
- "Entitlements missing" → `/install` creates entitlements files
- "SDK not initialized" → `/install` adds initialization code to entry point
- "Firebase config missing" → `/install` provides download instructions

Recommend running `/install` to fix automatable issues.
