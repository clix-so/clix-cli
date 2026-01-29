# iOS Capabilities Configuration

You are an AI agent that configures iOS capabilities required for the Clix SDK. This skill can run standalone or as a sub-skill invoked by `/install`.

## Core Directive

**GUIDE USERS** through iOS capability configuration for push notifications and data sharing. For file modifications, use Edit/Write tools when possible. For Xcode-only steps, provide clear step-by-step instructions.

## Structured Output Format

When invoked as a sub-skill (by `/install`), output structured progress:

```
IOS SETUP PROGRESS
==================
  [Scanning] Detecting iOS project...
  [Done] Found: MyApp.xcodeproj
  [Done] Bundle ID: com.example.myapp

  [Scanning] Checking capabilities status...
  [Done] Push Notifications: not configured
  [Done] App Groups: not configured
  [Done] NSE target: not found

  [Creating] Main app entitlements...
  [Done] Created: ios/MyApp/MyApp.entitlements

  [Creating] NSE entitlements...
  [Done] Created: ios/MyAppNotificationServiceExtension/MyAppNotificationServiceExtension.entitlements

  [Creating] NotificationService.swift...
  [Done] Created: ios/MyAppNotificationServiceExtension/NotificationService.swift

  [Action Required] Complete in Xcode:
    1. Create NSE target (File > New > Target > Notification Service Extension)
    2. Add Push Notifications capability
    3. Add App Groups capability to main app and NSE
```

## Required Capabilities for Clix iOS SDK

### 1. Push Notifications

- **Purpose:** Enable APNs (Apple Push Notification service) communication
- **Entitlement Key:** `aps-environment`
- **Values:** `development` (debug builds) or `production` (release builds)
- **Xcode Capability:** Push Notifications

### 2. App Groups

- **Purpose:** Share data between main app and Notification Service Extension using MMKV
- **Entitlement Key:** `com.apple.security.application-groups`
- **ID Format:** `group.clix.{BUNDLE_ID}` (e.g., `group.clix.com.example.myapp`)
- **Xcode Capability:** App Groups
- **Important:** Must be configured for BOTH main app AND Notification Service Extension targets

### 3. Background Modes (Recommended)

- **Purpose:** Process push notifications in the background
- **Key:** `UIBackgroundModes` with `remote-notification`
- **Xcode Capability:** Background Modes > Remote notifications

## Workflow

### Phase 1: Project Analysis

1. **Detect iOS Project**
   - Search for `*.xcodeproj` or `*.xcworkspace` files
   - Identify the main app target name
   - Check if this is a native iOS, React Native, or Flutter project

2. **Find Bundle Identifier**
   - Check `Info.plist` for `CFBundleIdentifier`
   - Or parse `project.pbxproj` for `PRODUCT_BUNDLE_IDENTIFIER`

3. **Check Current Capabilities Status**
   - Search for existing `*.entitlements` files
   - Check for `aps-environment` entitlement (Push Notifications configured)
   - Check for `com.apple.security.application-groups` (App Groups configured)
   - Check `project.pbxproj` for `SystemCapabilities` section
   - Check for existing NSE target

4. **Report Current State**
   ```
   Project: {project_name}
   Bundle ID: {bundle_id}
   Push Notifications: {configured/not configured}
   App Groups: {configured/not configured}
   NSE Target: {found/not found}
   Existing entitlements files: {list}
   ```

### Phase 2: Automated File Creation

Create entitlements files and NSE implementation. Use Write/Edit tools for these operations.

**Main App Entitlements** (`{AppName}.entitlements` or `ios/{AppName}/{AppName}.entitlements`):

```xml
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
```

**Notification Service Extension Entitlements** (`{ExtensionName}/{ExtensionName}.entitlements`):

```xml
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
```

**Note:** Replace `{BUNDLE_ID}` with the actual bundle identifier (e.g., `com.example.myapp`).

**NotificationService.swift:**

```swift
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
```

**Note:** Replace `YOUR_PROJECT_ID` with actual Clix project ID from https://console.clix.so/

### Phase 3: Xcode Configuration (Manual Steps)

Provide clear instructions for adding capabilities in Xcode. These steps CANNOT be automated and require user action.

**Create Notification Service Extension:**
```
[Action Required] Create NSE target in Xcode:
1. File > New > Target
2. Select "Notification Service Extension"
3. Name it "{AppName}NotificationServiceExtension"
4. Click "Finish" (Cancel the "Activate scheme" dialog)
5. Replace generated NotificationService.swift with Clix implementation
```

**Add Push Notifications:**
```
[Action Required] Add Push Notifications capability:
1. Select your main app target
2. Go to "Signing & Capabilities" tab
3. Click "+ Capability"
4. Select "Push Notifications"
```

**Add Background Modes (Recommended):**
```
[Action Required] Add Background Modes:
1. In "Signing & Capabilities", click "+ Capability"
2. Select "Background Modes"
3. Enable "Remote notifications" checkbox
```

**Add App Groups:**
```
[Action Required] Add App Groups capability:
1. Click "+ Capability"
2. Select "App Groups"
3. Click the "+" button
4. Enter: group.clix.{BUNDLE_ID}
5. Click OK

IMPORTANT: Repeat for NSE target:
1. Select the extension target
2. Go to "Signing & Capabilities"
3. Add "App Groups" capability
4. Select the SAME App Group ID
```

**Add Clix SDK to Extension:**

For CocoaPods projects, add to Podfile:
```ruby
target '{AppName}NotificationServiceExtension' do
  pod 'Clix', :git => 'https://github.com/clix-so/clix-ios-sdk.git'
end
```
Then run: `cd ios && pod install`

For SPM projects:
```
[Action Required] Add Clix to extension target:
1. Select the extension target
2. Go to General > Frameworks, Libraries, and Embedded Content
3. Click + and add the Clix package
```

**Configure Build Settings (Xcode 15+):**
```
[Action Required] For Xcode 15+:
1. Select extension target
2. Go to Build Settings
3. Search for "ENABLE_USER_SCRIPT_SANDBOXING"
4. Set to "No"

For React Native with Firebase:
- In Build Phases, move "Embed Foundation Extensions" above "[RNFB] Core Configuration"
```

### Phase 4: Apple Developer Portal Configuration

Guide user through manual portal configuration. These steps CANNOT be automated.

**Enable Capabilities on App ID:**
```
[Action Required] Enable capabilities in Apple Developer Portal:
1. Go to https://developer.apple.com/account
2. Navigate to "Certificates, Identifiers & Profiles"
3. Select "Identifiers"
4. Find your App ID (Bundle ID)
5. Enable "Push Notifications"
6. Enable "App Groups"
7. Click "Save"
```

**Register App Group ID:**
```
[Action Required] Register App Group:
1. In Identifiers, click "+"
2. Select "App Groups" and click "Continue"
3. Enter:
   - Description: Clix SDK App Group for {App Name}
   - Identifier: group.clix.{BUNDLE_ID}
4. Click "Continue" then "Register"
5. Associate with your App ID:
   - Edit your App ID
   - Under "App Groups", click "Configure"
   - Select the App Group
   - Click "Save"
```

**Regenerate Provisioning Profile:**
```
[Action Required] Regenerate profiles:
1. Navigate to "Profiles"
2. Delete old Development/Distribution profiles
3. Create new profiles with updated App ID
4. Download and install

In Xcode:
- Go to Xcode > Settings > Accounts
- Select your Apple ID
- Click "Download Manual Profiles"
- Or enable "Automatically manage signing"
```

### Phase 5: Verification

After configuration, output a verification report.

**JSON Report:**

```json
{
  "project": "{project_name}",
  "bundleId": "{bundle_id}",
  "filesCreated": [
    "{path_to_main_entitlements}",
    "{path_to_nse_entitlements}",
    "{path_to_notification_service_swift}"
  ],
  "capabilities": {
    "pushNotifications": {
      "entitlementFile": true,
      "environment": "development",
      "xcodeCapability": "verify manually",
      "developerPortal": "verify manually"
    },
    "appGroups": {
      "groupId": "group.clix.{bundle_id}",
      "mainAppEntitlement": true,
      "extensionEntitlement": true,
      "developerPortal": "verify manually"
    },
    "nseTarget": {
      "notificationServiceSwift": true,
      "sdkDependency": "verify manually"
    }
  },
  "manualStepsRequired": [
    "Create NSE target in Xcode",
    "Add Push Notifications capability",
    "Add App Groups capability to both targets",
    "Add Clix SDK to extension target",
    "Set ENABLE_USER_SCRIPT_SANDBOXING = No",
    "Enable capabilities in Apple Developer Portal",
    "Regenerate provisioning profiles"
  ]
}
```

## Common Issues and Solutions

### Missing Entitlements File

**Symptom:** No `.entitlements` file exists.

**Solution:**
- Xcode creates one when adding first capability
- Or create manually and link in Build Settings > Code Signing Entitlements

### App Group ID Mismatch

**Symptom:** Data not shared between app and extension.

**Solution:**
- Verify App Group ID is EXACTLY the same in both targets
- Format: `group.clix.{BUNDLE_ID}`
- Check both entitlements files

### Provisioning Profile Invalid

**Symptom:** "Provisioning profile doesn't include the X capability"

**Solution:**
1. Delete old profile in Developer Portal
2. Create new profile with updated App ID
3. Download and install
4. Or use automatic signing

### NSE Not Working

**Symptom:** Rich push notifications don't display.

**Checklist:**
- [ ] NSE target created in Xcode
- [ ] NotificationService.swift uses `ClixNotificationServiceExtension`
- [ ] `register(projectId:)` called with correct project ID
- [ ] Clix SDK added to extension target
- [ ] App Groups configured on both targets
- [ ] `ENABLE_USER_SCRIPT_SANDBOXING` = No (Xcode 15+)

## Automation Rules

**CAN automate (use Write/Edit tools):**
- Creating entitlements files
- Creating NotificationService.swift
- Modifying existing entitlements files
- Adding extension target to Podfile

**CANNOT automate (provide instructions):**
- Creating NSE target in Xcode
- Adding capabilities in Xcode UI
- Adding SDK to extension via SPM
- Configuring build settings
- Apple Developer Portal configuration
- Provisioning profile regeneration

For manual steps, provide clear numbered instructions and proceed without waiting for confirmation.

## Output Summary

After completing the workflow:

```
IOS SETUP COMPLETE
==================

Files Created:
  - ios/{AppName}/{AppName}.entitlements
  - ios/{AppName}NotificationServiceExtension/{AppName}NotificationServiceExtension.entitlements
  - ios/{AppName}NotificationServiceExtension/NotificationService.swift

Podfile Updated:
  - Added extension target with Clix pod

Manual Steps Required:
  1. Create NSE target in Xcode
  2. Add Push Notifications capability
  3. Add Background Modes capability (Remote notifications)
  4. Add App Groups capability to main app
  5. Add App Groups capability to NSE (same group ID)
  6. Add Clix SDK to extension target (if using SPM)
  7. Set ENABLE_USER_SCRIPT_SANDBOXING = No
  8. Enable capabilities in Apple Developer Portal
  9. Regenerate provisioning profiles

Next Steps:
  1. Run: cd ios && pod install
  2. Complete manual steps in Xcode
  3. Build and run to verify no signing errors
  4. Run /doctor to verify setup
```
