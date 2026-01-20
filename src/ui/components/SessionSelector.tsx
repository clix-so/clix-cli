import { Box, Text } from 'ink';
import type React from 'react';
import { useMemo } from 'react';

import type { ChatSessionSummary } from '@/lib/services/session-store';
import { GenericSelector, type SelectorItem } from './GenericSelector';

interface SessionSelectorProps {
  sessions: ChatSessionSummary[];
  onSelect: (session: ChatSessionSummary) => void;
  selectedIndex?: number;
  onCancel?: () => void;
  onNavigate?: (direction: 'up' | 'down') => void;
}

function formatRelativeTime(updatedAt: number): string {
  const diffMs = Date.now() - updatedAt;
  if (diffMs < 0) return 'just now';

  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function truncatePreview(preview: string, maxLen = 80): string {
  const trimmed = preview.trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLen - 1))}…`;
}

interface SessionItem extends SelectorItem {
  session: ChatSessionSummary;
  agent: string;
  when: string;
  preview: string;
}

export const SessionSelector: React.FC<SessionSelectorProps> = ({
  sessions,
  onSelect,
  selectedIndex,
  onCancel,
  onNavigate,
}) => {
  const items = useMemo<SessionItem[]>(() => {
    return sessions.map((s) => ({
      id: s.id,
      label: '',
      session: s,
      agent: s.currentAgentName ?? 'unknown',
      when: formatRelativeTime(s.updatedAt),
      preview: truncatePreview(s.preview),
    }));
  }, [sessions]);

  return (
    <GenericSelector<SessionItem>
      items={items}
      title="Resume Session"
      onSelect={(item) => onSelect(item.session)}
      selectedIndex={selectedIndex}
      onCancel={onCancel}
      onNavigate={onNavigate}
      emptyMessage="No saved sessions found (last 7 days)."
      renderItem={(item, isSelected) => {
        const details = `${item.when} · ${item.agent}`;
        const preview = item.preview ? ` · "${item.preview}"` : '';

        return (
          <Box flexDirection="row">
            <Text color={isSelected ? 'blue' : 'gray'}>{isSelected ? '› ' : '  '}</Text>
            <Text color={isSelected ? 'blue' : undefined} bold={isSelected}>
              {details}
            </Text>
            <Text dimColor>{preview}</Text>
          </Box>
        );
      }}
    />
  );
};
