// iOS project analysis

// Agent context (used to pass setup context between phases)
export { type AgentContext, buildAgentContext } from './agent-prompt-generator';

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
export {
  analyzeIosProject,
  findEntitlementsFiles,
  getIosProjectDir,
  type IosProjectInfo,
  type ProjectAnalysisResult,
} from './project-analyzer';
