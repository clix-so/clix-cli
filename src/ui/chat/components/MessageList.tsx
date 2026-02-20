import type React from 'react';
import { ChatMessageList } from '@/ui/components/ChatMessageList';
import type { ChatMessage } from '../context/ChatContext';

interface MessageListProps {
  messages: ChatMessage[];
  maxHeight?: number;
  agentName?: string;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, maxHeight, agentName }) => {
  return <ChatMessageList messages={messages} maxHeight={maxHeight} agentName={agentName} />;
};
