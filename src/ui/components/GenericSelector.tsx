import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useState } from 'react';
import { useCancelInput } from '@/ui/hooks';

const FALLBACK_TERMINAL_WIDTH = 80;
const SELECTOR_CHROME_WIDTH = 6;
const MIN_SELECTOR_LINE_WIDTH = 10;

export interface SelectorItem {
  id: string;
  label: string;
  description?: string;
}

interface GenericSelectorProps<T extends SelectorItem> {
  items: T[];
  title: string;
  onSelect: (item: T) => void;
  selectedIndex?: number;
  onCancel?: () => void;
  onNavigate?: (direction: 'up' | 'down') => void;
  renderItem?: (item: T, isSelected: boolean) => React.ReactNode;
  currentItemId?: string;
  emptyMessage?: string;
  helpText?: string;
  showBorder?: boolean;
}

function fitToWidth(text: string, width: number): string {
  const clipped = text.length > width ? text.slice(0, width) : text;
  return clipped.padEnd(width, ' ');
}

export function getSelectorLineWidth(columns = process.stdout.columns): number {
  const terminalWidth =
    typeof columns === 'number' && Number.isFinite(columns) && columns > 0
      ? columns
      : FALLBACK_TERMINAL_WIDTH;
  return Math.max(terminalWidth - SELECTOR_CHROME_WIDTH, MIN_SELECTOR_LINE_WIDTH);
}

export function formatDefaultSelectorLine(
  item: SelectorItem,
  options: {
    isSelected: boolean;
    isCurrent: boolean;
    width: number;
  },
): string {
  const prefix = options.isSelected ? '› ' : '  ';
  const currentTag = options.isCurrent ? ' (current)' : '';
  const description = item.description ? ` ${item.description}` : '';
  return fitToWidth(`${prefix}${item.label}${currentTag}${description}`, options.width);
}

function splitDefaultSelectorLine(
  item: SelectorItem,
  options: {
    isSelected: boolean;
    isCurrent: boolean;
    width: number;
  },
): {
  prefix: string;
  label: string;
  currentTag: string;
  description: string;
  padding: string;
} {
  const prefixRaw = options.isSelected ? '› ' : '  ';
  const labelRaw = item.label;
  const currentTagRaw = options.isCurrent ? ' (current)' : '';
  const descriptionRaw = item.description ? ` ${item.description}` : '';
  const fullLine = formatDefaultSelectorLine(item, options);

  let cursor = 0;
  const take = (maxLen: number): string => {
    const nextCursor = Math.min(cursor + maxLen, fullLine.length);
    const part = fullLine.slice(cursor, nextCursor);
    cursor = nextCursor;
    return part;
  };

  const prefix = take(prefixRaw.length);
  const label = take(labelRaw.length);
  const currentTag = take(currentTagRaw.length);
  const description = take(descriptionRaw.length);
  const padding = fullLine.slice(cursor);

  return { prefix, label, currentTag, description, padding };
}

export function GenericSelector<T extends SelectorItem>({
  items,
  title,
  onSelect,
  selectedIndex: controlledIndex,
  onCancel,
  onNavigate,
  renderItem,
  currentItemId,
  emptyMessage = 'No items available.',
  helpText = '↑↓ to navigate · Enter to select · Esc/Ctrl+C to cancel',
  showBorder = true,
}: GenericSelectorProps<T>): React.ReactElement {
  const [internalIndex, setInternalIndex] = useState(0);

  const isControlled = controlledIndex !== undefined && onNavigate !== undefined;
  const selectedIndex = isControlled ? controlledIndex : internalIndex;
  const lineWidth = getSelectorLineWidth();

  useInput((_input, key) => {
    if (key.upArrow) {
      if (isControlled) {
        onNavigate?.('up');
      } else {
        setInternalIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
      }
    } else if (key.downArrow) {
      if (isControlled) {
        onNavigate?.('down');
      } else {
        setInternalIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
      }
    } else if (key.return) {
      const selected = items[selectedIndex];
      if (selected) {
        onSelect(selected);
      }
    }
  });

  useCancelInput(() => onCancel?.(), { isActive: !!onCancel });

  if (items.length === 0) {
    if (showBorder) {
      return (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
          marginX={1}
          marginY={1}
        >
          <Text dimColor>{emptyMessage}</Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Text dimColor>{emptyMessage}</Text>
      </Box>
    );
  }

  const content = (
    <>
      {title && (
        <Box marginBottom={1}>
          <Text bold>{title}</Text>
        </Box>
      )}

      {items.map((item, index) => {
        const isSelected = index === selectedIndex;
        const isCurrent = item.id === currentItemId;

        if (renderItem) {
          return <Box key={item.id}>{renderItem(item, isSelected)}</Box>;
        }

        const lineParts = splitDefaultSelectorLine(item, {
          isSelected,
          isCurrent,
          width: lineWidth,
        });

        return (
          <Box key={item.id} flexDirection="row">
            <Text color={isSelected ? 'cyan' : 'gray'}>{lineParts.prefix}</Text>
            <Text bold={isSelected}>{lineParts.label}</Text>
            <Text color="green">{lineParts.currentTag}</Text>
            <Text dimColor>{lineParts.description}</Text>
            <Text>{lineParts.padding}</Text>
          </Box>
        );
      })}

      {helpText ? (
        <Box>
          <Text dimColor>{helpText}</Text>
        </Box>
      ) : null}
    </>
  );

  if (!showBorder) {
    return <Box flexDirection="column">{content}</Box>;
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginX={1}>
      {content}
    </Box>
  );
}
