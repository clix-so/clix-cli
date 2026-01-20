/**
 * Chat hooks module.
 */

// Types
export type { ChatRefs, ContextUsage, SlashCommandResult } from './types';

// Hooks
export { useAgentManagement } from './useAgentManagement';
export { useChatActions } from './useChatActions';
export { useCommandHandler } from './useCommandHandler';
export { useHistoryManagement } from './useHistoryManagement';
export { useMessageSending } from './useMessageSending';
export { useMessageStreaming } from './useMessageStreaming';
export type { OverlayType } from './useOverlays';
export { useOverlays } from './useOverlays';
export { parseSlashCommand, useSlashCommands } from './useSlashCommands';
