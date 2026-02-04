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
