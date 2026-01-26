import { render } from 'ink';
import type { AgentInfo } from '../../lib/agents';
import type { AgentExecutor, AgentMessage } from '../../lib/executor';
import { generateAgentPrompt } from '../../lib/ios';
import { AgentExecutionUI } from '../../ui/AgentExecutionUI';
import { type IosSetupOptions, type IosSetupResult, IosSetupUI } from '../../ui/IosSetupUI';
import { type FinalOutputResult, printFinalOutput } from '../../ui/utils/finalOutput';

export interface IosSetupCommandOptions {
  /** Path to .p8 API Key file */
  apiKeyPath?: string;
  /** API Key ID */
  keyId?: string;
  /** Issuer ID */
  issuerId?: string;
  /** Bundle ID (override auto-detection) */
  bundleId?: string;
  /** Skip Apple Developer Portal sync */
  skipPortal?: boolean;
  /** Push notification environment */
  pushEnvironment?: 'development' | 'production';
}

function toDirectSetupOutput(result: IosSetupResult): FinalOutputResult {
  if (result.success) {
    const details: string[] = [];

    if (result.projectInfo) {
      details.push(`Project: ${result.projectInfo.appName}`);
      details.push(`Bundle ID: ${result.projectInfo.bundleId}`);
    }

    if (result.portalSync) {
      if (result.portalSync.enabled.length > 0) {
        details.push(`Enabled: ${result.portalSync.enabled.join(', ')}`);
      }
      if (result.portalSync.appGroupCreated && result.portalSync.appGroupId) {
        details.push(`Created App Group: ${result.portalSync.appGroupId}`);
      }
    }

    if (result.entitlementsUpdated.length > 0) {
      details.push(`Updated files: ${result.entitlementsUpdated.length}`);
    }

    return {
      type: 'success',
      title: 'Direct setup completed',
      message: result.agentContext
        ? 'Portal sync and entitlements configured. Starting agent for remaining tasks...'
        : 'Portal sync and entitlements configured.',
      details: details.length > 0 ? details : undefined,
    };
  }

  return {
    type: 'error',
    title: 'iOS setup failed',
    message: result.error || 'Unknown error occurred',
  };
}

/**
 * Run the direct implementation phase (Portal sync + Entitlements)
 */
async function runDirectSetup(options: IosSetupCommandOptions): Promise<IosSetupResult> {
  const uiOptions: IosSetupOptions = {
    apiKeyPath: options.apiKeyPath,
    keyId: options.keyId,
    issuerId: options.issuerId,
    bundleId: options.bundleId,
    skipPortal: options.skipPortal ?? (!options.apiKeyPath && !options.keyId && !options.issuerId),
    pushEnvironment: options.pushEnvironment,
  };

  return new Promise((resolve) => {
    const { unmount } = render(
      <IosSetupUI
        options={uiOptions}
        onComplete={(result) => {
          unmount();
          resolve(result);
        }}
      />,
      { incrementalRendering: true },
    );
  });
}

/**
 * Run the agent phase to complete remaining tasks (Xcode project modifications, Extension setup)
 */
async function runAgentCompletion(
  directResult: IosSetupResult,
): Promise<FinalOutputResult | undefined> {
  if (!directResult.agentContext) {
    return undefined;
  }

  const agentPrompt = generateAgentPrompt(directResult.agentContext);

  // Create execute function for agent
  async function* executeAgent(
    executor: AgentExecutor,
    _agent: AgentInfo,
  ): AsyncGenerator<AgentMessage> {
    yield* executor.execute(agentPrompt);
  }

  return new Promise((resolve) => {
    const { unmount } = render(
      <AgentExecutionUI
        title="iOS Setup - Agent Completion"
        description="Completing Xcode project modifications and Extension setup"
        execute={executeAgent}
        onComplete={(result) => {
          unmount();
          resolve(result);
        }}
      />,
      { incrementalRendering: true },
    );
  });
}

export async function iosSetupCommand(options: IosSetupCommandOptions): Promise<void> {
  // Phase 1: Direct implementation (Portal sync + Entitlements)
  const directResult = await runDirectSetup(options);

  if (!directResult.success) {
    printFinalOutput(toDirectSetupOutput(directResult));
    return;
  }

  // Show direct setup completion
  printFinalOutput(toDirectSetupOutput(directResult));

  // Phase 2: Agent completion (Xcode project modifications, Extension setup)
  if (directResult.agentContext) {
    console.log('\n'); // Add spacing before agent phase
    const agentResult = await runAgentCompletion(directResult);

    if (agentResult) {
      printFinalOutput(agentResult);
    }
  }
}
