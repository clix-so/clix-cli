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
    "firebaseConfig": true | false
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
  1. `Package.swift` for package dependency containing `clix-ios-sdk` or `clix` → `installationMethod: "spm-package-swift"`
  2. `*.xcodeproj/project.pbxproj` for `XCRemoteSwiftPackageReference` containing `clix` → `installationMethod: "spm-xcode"`
  3. `Podfile` for 'ClixSDK' or 'Clix' pod → `installationMethod: "cocoapods"`
- Android: Check build.gradle for clix dependency → `installationMethod: "gradle"`
- React Native: Check package.json for '@clix-so/react-native-sdk' → `installationMethod: "npm"`
- Flutter: Check pubspec.yaml for 'clix_flutter_sdk' → `installationMethod: "pubspec"`

### Push Configuration Check
- iOS: Check entitlements for 'aps-environment'
- Android: Check AndroidManifest.xml for FCM service
- Check for google-services.json (Android) or GoogleService-Info.plist (iOS)

### Common Issues to Detect
- Missing SDK dependency
- Missing or invalid API key
- Missing push notification permissions
- Missing capabilities/entitlements
- Outdated SDK version
- Incomplete Firebase/APNs setup

Output the JSON diagnostic, then provide a brief summary with actionable recommendations.
