import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import type React from 'react';
import { useEffect, useState } from 'react';
import { type AgentInfo, detectAvailableAgents, getAgentByName } from '../lib/agents';
import { ConfigManager } from '../lib/config/index';
import { Header } from './components/Header';
import { NoAgentGuide } from './components/NoAgentGuide';
import { StatusMessage } from './components/StatusMessage';
import type { FinalOutputResult } from './utils/finalOutput';

interface ConfigUIProps {
  onComplete: (result?: FinalOutputResult) => void;
}

export const ConfigUI: React.FC<ConfigUIProps> = ({ onComplete }) => {
  const [phase, setPhase] = useState<
    'detecting' | 'selecting' | 'saving' | 'complete' | 'no_agent' | 'error'
  >('detecting');
  const [availableAgents, setAvailableAgents] = useState<AgentInfo[]>([]);
  const [currentAgent, setCurrentAgent] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const detect = async () => {
      try {
        await delay(800);
        const agents = await detectAvailableAgents();

        if (agents.length === 0) {
          setPhase('no_agent');
          return;
        }

        const config = new ConfigManager();
        const cfg = await config.load();

        if (cfg.selectedAgent) {
          const agent = getAgentByName(cfg.selectedAgent);
          if (agent) {
            setCurrentAgent(agent.displayName);
          }
        }

        setAvailableAgents(agents);
        await delay(400);
        setPhase('selecting');
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
        setPhase('error');
      }
    };

    detect();
  }, []);

  const handleSelect = async (item: { value: AgentInfo }) => {
    const agent = item.value;
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    setPhase('saving');
    try {
      await delay(600);
      const config = new ConfigManager();
      await config.save({ selectedAgent: agent.name, lastUsedAt: new Date().toISOString() });
      setCurrentAgent(agent.displayName);
      setPhase('complete');
      setTimeout(() => {
        const result: FinalOutputResult = {
          type: 'success',
          title: 'Configuration completed',
          message: `Configured to use ${agent.displayName}`,
        };
        onComplete(result);
      }, 1500);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save configuration';
      setErrorMessage(message);
      setPhase('error');
      setTimeout(() => {
        const result: FinalOutputResult = {
          type: 'error',
          title: 'Configuration failed',
          message,
        };
        onComplete(result);
      }, 1500);
    }
  };

  const handleNoAgentExit = () => {
    onComplete();
  };

  if (phase === 'no_agent') {
    return <NoAgentGuide onExit={handleNoAgentExit} />;
  }

  const items = availableAgents.map((agent) => ({
    key: agent.name,
    label: agent.displayName,
    value: agent,
  }));

  const Indicator: React.FC<{ isSelected?: boolean }> = ({ isSelected }) => (
    <Box marginRight={1}>
      <Text color={isSelected ? 'blue' : undefined}>{isSelected ? '>' : ' '}</Text>
    </Box>
  );

  const Item: React.FC<{ isSelected?: boolean; label: string }> = ({ isSelected, label }) => (
    <Text color={isSelected ? 'blue' : undefined}>{label}</Text>
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Configure AI Coding Agent" />

      {phase === 'detecting' && (
        <StatusMessage type="loading" message="Detecting AI coding agents..." />
      )}

      {phase === 'selecting' && (
        <Box flexDirection="column">
          <StatusMessage
            type="success"
            message={`Found ${availableAgents.length} available agent${availableAgents.length > 1 ? 's' : ''}`}
          />
          <Box marginTop={1} flexDirection="column">
            {currentAgent && (
              <Box marginBottom={1}>
                <Text dimColor>Currently configured: </Text>
                <Text bold>{currentAgent}</Text>
              </Box>
            )}
            <Text dimColor>Select AI agent:</Text>
            <Box marginTop={1}>
              <SelectInput
                items={items}
                onSelect={handleSelect}
                indicatorComponent={Indicator}
                itemComponent={Item}
              />
            </Box>
          </Box>
        </Box>
      )}

      {phase === 'saving' && <StatusMessage type="loading" message="Saving configuration..." />}

      {phase === 'complete' && (
        <StatusMessage type="success" message={`Configured to use ${currentAgent}`} />
      )}

      {phase === 'error' && (
        <Box flexDirection="column">
          <StatusMessage type="error" message={errorMessage} />
        </Box>
      )}
    </Box>
  );
};
