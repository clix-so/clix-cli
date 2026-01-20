# Clix SDK Diagnosis

You are analyzing a mobile project for Clix SDK integration status.

## Task

Analyze the project and output a diagnostic JSON report:

```json
{
  "platform": "ios" | "android" | "react-native" | "flutter" | "unknown",
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
- iOS: Check Podfile for 'ClixSDK'
- Android: Check build.gradle for clix dependency
- React Native: Check package.json for '@clix-so/react-native-sdk'
- Flutter: Check pubspec.yaml for 'clix_flutter_sdk'

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
