import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useState } from 'react';
import { useCancelInput } from '@/ui/hooks';

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
}: GenericSelectorProps<T>): React.ReactElement {
  const [internalIndex, setInternalIndex] = useState(0);

  const isControlled = controlledIndex !== undefined && onNavigate !== undefined;
  const selectedIndex = isControlled ? controlledIndex : internalIndex;

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
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      marginX={1}
      marginY={1}
    >
      <Box marginBottom={1}>
        <Text bold>{title}</Text>
      </Box>

      {items.map((item, index) => {
        const isSelected = index === selectedIndex;
        const isCurrent = item.id === currentItemId;

        if (renderItem) {
          return <Box key={item.id}>{renderItem(item, isSelected)}</Box>;
        }

        return (
          <Box key={item.id} flexDirection="row">
            <Text color={isSelected ? 'blue' : 'gray'}>{isSelected ? '› ' : '  '}</Text>
            <Text color={isSelected ? 'blue' : undefined} bold={isSelected}>
              {item.label}
            </Text>
            {isCurrent && <Text color="green"> (current)</Text>}
            {item.description && <Text dimColor> {item.description}</Text>}
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text dimColor>{helpText}</Text>
      </Box>
    </Box>
  );
}
