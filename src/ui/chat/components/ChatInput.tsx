import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getRandomPhrase } from '../constants/wittyPhrases';
import { getFilteredCommands, SlashCommandMenu } from './SlashCommandMenu';

interface ChatInputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  inputHistory?: string[];
  historyIndex?: number;
  onHistoryNavigate?: (direction: 'up' | 'down') => string | null;
  onExit?: () => void;
}

interface InputHandlers {
  handleMenuNavigation: (key: { upArrow: boolean; downArrow: boolean; tab: boolean }) => boolean;
  handleHistoryNavigation: (key: { upArrow: boolean; downArrow: boolean }) => void;
}

function createInputHandlers(
  filteredCommands: Array<{ command: string; description: string }>,
  selectedCommandIndex: number,
  setSelectedCommandIndex: React.Dispatch<React.SetStateAction<number>>,
  setValue: React.Dispatch<React.SetStateAction<string>>,
  setInputKey: React.Dispatch<React.SetStateAction<number>>,
  onHistoryNavigate?: (direction: 'up' | 'down') => string | null,
): InputHandlers {
  const handleMenuNavigation = (key: {
    upArrow: boolean;
    downArrow: boolean;
    tab: boolean;
  }): boolean => {
    if (key.upArrow) {
      setSelectedCommandIndex((prev) => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
      return true;
    }
    if (key.downArrow) {
      setSelectedCommandIndex((prev) => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
      return true;
    }
    if (key.tab) {
      const selectedCmd = filteredCommands[selectedCommandIndex];
      if (selectedCmd) {
        setValue(`/${selectedCmd.command} `);
        setSelectedCommandIndex(0);
        setInputKey((prev) => prev + 1);
      }
      return true;
    }
    return false;
  };

  const handleHistoryNavigation = (key: { upArrow: boolean; downArrow: boolean }): void => {
    if (!onHistoryNavigate) return;

    if (key.upArrow) {
      const historyValue = onHistoryNavigate('up');
      if (historyValue !== null) {
        setValue(historyValue);
        setInputKey((prev) => prev + 1);
      }
    } else if (key.downArrow) {
      const historyValue = onHistoryNavigate('down');
      if (historyValue !== null) {
        setValue(historyValue);
        setInputKey((prev) => prev + 1);
      }
    }
  };

  return { handleMenuNavigation, handleHistoryNavigation };
}

// Witty phrase display for loading state
const WittyPhraseDisplay: React.FC = () => {
  const [wittyPhrase, setWittyPhrase] = useState(getRandomPhrase);

  useEffect(() => {
    const interval = setInterval(() => {
      setWittyPhrase(getRandomPhrase());
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return <Text dimColor>{wittyPhrase}</Text>;
};

export const ChatInput: React.FC<ChatInputProps> = ({
  onSubmit,
  disabled = false,
  onHistoryNavigate,
  onExit,
}) => {
  const [value, setValue] = useState('');
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [inputKey, setInputKey] = useState(0);
  const lastCtrlCTime = useRef<number>(0);

  // Double Ctrl+C threshold (ms)
  const DOUBLE_CTRL_C_THRESHOLD = 500;

  // Check if we're in slash command mode
  const isSlashMode = value.startsWith('/');
  const slashFilter = isSlashMode ? value.slice(1).split(' ')[0] : '';
  const hasArgs = isSlashMode && value.includes(' ');

  // Check if we're in bash mode (! prefix)
  const isBashMode = value.startsWith('!');

  // Only show menu when typing a command (no space yet)
  const showMenu = isSlashMode && !hasArgs && !disabled;

  const filteredCommands = useMemo(() => getFilteredCommands(slashFilter), [slashFilter]);

  const { handleMenuNavigation, handleHistoryNavigation } = useMemo(
    () =>
      createInputHandlers(
        filteredCommands,
        selectedCommandIndex,
        setSelectedCommandIndex,
        setValue,
        setInputKey,
        onHistoryNavigate,
      ),
    [filteredCommands, selectedCommandIndex, onHistoryNavigate],
  );

  useInput((input, key) => {
    if (disabled) return;

    // Handle Ctrl+C: clear input or exit on double press
    const isCtrlC = (input === 'c' && key.ctrl) || input === '\x03';
    if (isCtrlC) {
      const now = Date.now();
      if (now - lastCtrlCTime.current < DOUBLE_CTRL_C_THRESHOLD) {
        // Double Ctrl+C - exit
        onExit?.();
        return;
      }
      lastCtrlCTime.current = now;

      // Single Ctrl+C - clear input
      if (value) {
        setValue('');
        setSelectedCommandIndex(0);
        setInputKey((prev) => prev + 1);
      }
      return;
    }

    // Handle escape: clear input (always, regardless of menu state)
    if (key.escape) {
      if (value) {
        setValue('');
        setSelectedCommandIndex(0);
        setInputKey((prev) => prev + 1);
      }
      return;
    }

    // Handle menu navigation when menu is visible
    if (showMenu && filteredCommands.length > 0) {
      if (handleMenuNavigation(key)) return;
    }

    // Handle history navigation (only when not in slash mode)
    if (!showMenu) {
      handleHistoryNavigation(key);
    }
  });

  const handleChange = useCallback(
    (newValue: string) => {
      if (disabled) return;
      setValue(newValue);
      // Reset selection when filter changes
      if (newValue.startsWith('/')) {
        setSelectedCommandIndex(0);
      }
    },
    [disabled],
  );

  const handleSubmit = useCallback(
    (submittedValue: string) => {
      if (disabled || !submittedValue.trim()) return;

      // If in slash mode with menu visible and Enter pressed, select the command
      if (showMenu && filteredCommands.length > 0) {
        const selectedCmd = filteredCommands[selectedCommandIndex];
        if (selectedCmd) {
          onSubmit(`/${selectedCmd.command}`);
          setValue('');
          setSelectedCommandIndex(0);
          return;
        }
      }

      onSubmit(submittedValue.trim());
      setValue('');
      setSelectedCommandIndex(0);
    },
    [disabled, onSubmit, showMenu, filteredCommands, selectedCommandIndex],
  );

  return (
    <Box flexDirection="column">
      {showMenu && (
        <SlashCommandMenu
          filter={slashFilter}
          selectedIndex={selectedCommandIndex}
          visible={showMenu}
        />
      )}
      <Box marginLeft={2}>
        {disabled ? (
          // Disabled state: show spinner and witty phrase
          <>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
            <Text> </Text>
            <WittyPhraseDisplay />
          </>
        ) : (
          // Active state: normal input
          <>
            <Text color={isBashMode ? 'yellow' : 'blue'} bold>
              {isBashMode ? '! ' : '> '}
            </Text>
            <TextInput
              key={inputKey}
              value={value}
              onChange={handleChange}
              onSubmit={handleSubmit}
              placeholder={
                isBashMode
                  ? 'Enter bash command...'
                  : 'Ask anything or type / for commands, ! for bash'
              }
            />
          </>
        )}
      </Box>
    </Box>
  );
};
