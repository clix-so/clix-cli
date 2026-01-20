import { render } from 'ink';
import { listChatSessions } from '@/lib/services/session-store';
import { SessionSelector } from '@/ui/components/SessionSelector';
import { chatCommand } from './chat';

export async function resumeCommand(): Promise<void> {
  const sessions = await listChatSessions();

  if (sessions.length === 0) {
    console.log('No saved sessions found (last 7 days).');
    return;
  }

  if (sessions.length === 1) {
    await chatCommand({ resumeSessionId: sessions[0].id });
    return;
  }

  const selected = await new Promise<string | null>((resolve) => {
    const { unmount } = render(
      <SessionSelector
        sessions={sessions}
        onSelect={(s) => {
          unmount();
          resolve(s.id);
        }}
        onCancel={() => {
          unmount();
          resolve(null);
        }}
      />,
      { incrementalRendering: true },
    );
  });

  if (!selected) {
    return;
  }

  await chatCommand({ resumeSessionId: selected });
}
