// iOS project analysis

// Agent prompt generation for remaining tasks
export {
  type AgentContext,
  buildAgentContext,
  generateAgentPrompt,
} from './agent-prompt-generator';

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
export {
  analyzeIosProject,
  findEntitlementsFiles,
  getIosProjectDir,
  type IosProjectInfo,
  type ProjectAnalysisResult,
} from './project-analyzer';
