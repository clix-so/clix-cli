/**
 * Templates for Notification Service Extension files
 */

/**
 * NotificationService.swift template for Clix SDK integration
 */
export const NOTIFICATION_SERVICE_TEMPLATE = `import UserNotifications
import Clix

class NotificationService: ClixNotificationServiceExtension {
    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        // Register with Clix (replace with your project ID from https://console.clix.so/)
        register(projectId: "YOUR_PROJECT_ID")

        super.didReceive(request, withContentHandler: contentHandler)
    }
}
`;

/**
 * Extension Info.plist template
 */
export const EXTENSION_INFO_PLIST_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSExtension</key>
	<dict>
		<key>NSExtensionPointIdentifier</key>
		<string>com.apple.usernotifications.service</string>
		<key>NSExtensionPrincipalClass</key>
		<string>$(PRODUCT_MODULE_NAME).NotificationService</string>
	</dict>
</dict>
</plist>
`;

/**
 * CocoaPods Podfile snippet for extension target
 */
export function generatePodfileSnippet(extensionName: string): string {
  return `target '${extensionName}' do
  pod 'Clix'
end`;
}
