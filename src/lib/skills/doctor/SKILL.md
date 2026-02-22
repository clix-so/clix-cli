# Clix SDK Doctor

You are analyzing a mobile project for Clix SDK integration status.

## Task

Analyze the project and output a diagnostic JSON report:

```json
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
```

## Analysis Checklist

### Platform Detection
1. Check for package.json (React Native/Expo)
2. Check for pubspec.yaml (Flutter)
3. Check for *.xcodeproj or *.xcworkspace (iOS)
4. Check for build.gradle or AndroidManifest.xml (Android)

### SDK Installation Check
- **iOS**: Check in order of priority:
  1. `Package.swift` with iOS platform target (contains `.iOS` or `platforms: [.iOS`) for package dependency containing `clix-ios-sdk` or `clix` → `installationMethod: "spm-package-swift"`
  2. `Podfile` for 'ClixSDK' or 'Clix' pod → `installationMethod: "cocoapods"`
  3. `*.xcodeproj/project.pbxproj` for `XCRemoteSwiftPackageReference` containing `clix` → `installationMethod: "spm-xcode"`
- Android: Check build.gradle for clix dependency → `installationMethod: "gradle"`
- React Native: Check package.json for '@clix-so/react-native-sdk' → `installationMethod: "npm"`
- Flutter: Check pubspec.yaml for 'clix_flutter_sdk' → `installationMethod: "pubspec"`

### Push Configuration Check
- iOS: Check entitlements for 'aps-environment'
- Android: Check AndroidManifest.xml for FCM service
- Check for google-services.json (Android) or GoogleService-Info.plist (iOS)

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

Use `/install` to run interactive setup for missing Firebase credentials.
