import { listChatSessions } from '@/lib/services/session-store';
import { SessionSelector } from '@/ui/components/SessionSelector';
import { safeRender } from '@/ui/utils/safeRender';
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
    const { unmount } = safeRender(
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
    );
  });

  if (!selected) {
    return;
  }

  await chatCommand({ resumeSessionId: selected });
}
