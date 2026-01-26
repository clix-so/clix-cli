import type { IosProjectInfo } from './project-analyzer';

/**
 * Context for agent to complete remaining iOS setup tasks
 */
export interface AgentContext {
  bundleId: string;
  appGroupId: string;
  projectPath: string;
  entitlementsPath: string;
  appName: string;
  iosDir: string;
}

/**
 * Generate agent prompt for completing iOS setup
 * The agent will handle tasks that cannot be done programmatically:
 * - Xcode project file modifications (.pbxproj)
 * - Notification Service Extension creation
 * - Extension code generation
 */
export function generateAgentPrompt(context: AgentContext): string {
  return `## iOS Setup - Remaining Tasks

The following has been completed automatically:
- Apple Developer Portal capabilities synced (Push Notifications, App Groups)
- Entitlements file created: ${context.entitlementsPath}
- App Group ID: ${context.appGroupId}

### Project Information
- App Name: ${context.appName}
- Bundle ID: ${context.bundleId}
- iOS Directory: ${context.iosDir}
- Project Path: ${context.projectPath}

### Tasks to Complete

#### 1. Link Entitlements in Xcode Project [Required]
Modify the Xcode project file (.pbxproj) to link the entitlements file:
- Find the main app target
- Add CODE_SIGN_ENTITLEMENTS build setting pointing to the entitlements file
- Ensure both Debug and Release configurations are updated

#### 2. Create Notification Service Extension [Required]
Create a new Notification Service Extension target for rich push notifications:
- Target name: \`${context.appName}NotificationServiceExtension\` or \`NotificationServiceExtension\`
- Bundle ID: \`${context.bundleId}.NotificationServiceExtension\`
- Deployment target: Same as main app or iOS 14.0+
- Create necessary files in the extension directory

#### 3. Implement NotificationService.swift [Required]
Create the NotificationService.swift file with Clix SDK integration:

\`\`\`swift
import UserNotifications
import ClixSDK

class NotificationService: UNNotificationServiceExtension {
    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)

        if let bestAttemptContent = bestAttemptContent {
            // Let Clix SDK handle the notification
            Clix.shared.handleNotificationServiceExtension(
                request: request,
                content: bestAttemptContent
            ) { processedContent in
                contentHandler(processedContent)
            }
        }
    }

    override func serviceExtensionTimeWillExpire() {
        if let contentHandler = contentHandler,
           let bestAttemptContent = bestAttemptContent {
            contentHandler(bestAttemptContent)
        }
    }
}
\`\`\`

#### 4. Create Extension Entitlements [Required]
Create entitlements file for the extension at \`${context.iosDir}/NotificationServiceExtension/NotificationServiceExtension.entitlements\`:

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>${context.appGroupId}</string>
    </array>
</dict>
</plist>
\`\`\`

#### 5. Update Extension Info.plist [Required]
Ensure the extension's Info.plist has the correct NSExtension configuration:

\`\`\`xml
<key>NSExtension</key>
<dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.usernotifications.service</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).NotificationService</string>
</dict>
\`\`\`

### Important Notes
- The extension must share the same App Group as the main app
- The extension's bundle ID must be a child of the main app's bundle ID
- Add the ClixSDK to the extension target's frameworks
- Ensure the extension is added to the app's "Embed App Extensions" build phase

Please complete these tasks by modifying the Xcode project files directly.`;
}

/**
 * Build agent context from iOS setup results
 */
export function buildAgentContext(
  projectInfo: IosProjectInfo,
  bundleId: string,
  appGroupId: string,
  entitlementsPath: string,
  iosDir: string,
): AgentContext {
  return {
    bundleId,
    appGroupId,
    projectPath: projectInfo.projectPath,
    entitlementsPath,
    appName: projectInfo.appName,
    iosDir,
  };
}
