// iOS project analysis

// Agent context (used to pass setup context between phases)
export { type AgentContext, buildAgentContext } from './agent-prompt-generator';

// Apple account authentication (supports both API Key and User login)
export {
  type ApiKeyAuthConfig as ApiKeyAuthConfigNew,
  type ApiKeyAuthContext,
  type AppleTeam,
  type AuthContext,
  AuthenticationMode,
  type AuthOptions,
  authenticateWithApiKeyAsync,
  deleteCachedPasswordAsync,
  getApiKeyFromEnvAsync,
  getAppleIdFromEnv,
  getRequestContext,
  hasApiKeyEnvVars,
  hasAppleIdEnvVars,
  isUserAuthContext,
  loginWithUserCredentialsAsync,
  promptAppleIdAsync,
  promptPasswordAsync,
  type UserAuthContext,
} from './apple-auth';
// Apple Developer Portal integration
export {
  type ApiKeyAuthConfig,
  type AppleAuthConfig,
  type CapabilitySyncResult,
  createAuthContext,
  findOrCreateAppGroup,
  findOrCreateBundleId,
  getAppleApiErrorMessage,
  loadApiKeyFromFile,
  syncCapabilities,
  validateCredentials,
} from './apple-portal';
// Entitlements management
export {
  type EntitlementsConfig,
  type EntitlementsData,
  generateAppGroupId,
  generateExtensionEntitlements,
  getEntitlementsPath,
  getEntitlementsSummary,
  hasClixConfiguration,
  readEntitlements,
  updateEntitlementsForClix,
  writeEntitlements,
} from './entitlements-manager';
// Extension file generation (replaces agent-based approach)
export {
  createExtensionFiles,
  type ExtensionContext,
  type ExtensionGeneratorResult,
  extensionFilesExist,
  getExtensionBundleId,
  getExtensionName,
  verifyExtensionFiles,
} from './extension-generator';
export { generatePodfileSnippet } from './extension-templates';
// Keychain integration
export {
  CLIX_NO_KEYCHAIN,
  deletePasswordAsync as deleteKeychainPasswordAsync,
  getAppleKeychainServiceName,
  getPasswordAsync as getKeychainPasswordAsync,
  isKeychainAvailable,
  type KeychainCredentials,
  setPasswordAsync as setKeychainPasswordAsync,
} from './keychain';
// pbxproj manipulation
export {
  addNotificationServiceExtension,
  backupProject,
  getProjectTargets,
  hasNotificationServiceExtension,
  type PbxprojModificationResult,
  type PbxprojModifierOptions,
  restoreProject,
} from './pbxproj-modifier';
// Podfile manipulation
export {
  addClixToExtensionTarget,
  backupPodfile,
  getPodfileTargets,
  hasExtensionTarget,
  hasPodfile,
  type PodfileModificationResult,
  type PodfileModifierOptions,
  restorePodfile,
} from './podfile-modifier';
export {
  analyzeIosProject,
  findEntitlementsFiles,
  getIosProjectDir,
  type IosProjectInfo,
  type ProjectAnalysisResult,
} from './project-analyzer';
// Push Key management
export {
  APPLE_KEYS_TOO_MANY_ERROR,
  createPushKeyAsync,
  downloadPushKeyAsync,
  isPushKeyValid,
  listPushKeysAsync,
  type PushKey,
  type PushKeyStoreInfo,
  revokePushKeysAsync,
} from './push-key';
