import type { ChatEvent } from '../api/types';
import { plainText, truncate } from '../lib/format';
import { SectionHeader } from './SectionHeader';
import { Time } from './Time';

const SHOWN = 7;

export function RoomActivity({ chat }: { chat: ChatEvent[] }) {
  const recent = chat.slice(-SHOWN);
  return (
    <section aria-labelledby="activity-title">
      <SectionHeader id="activity-title" title="Room activity" meta="read-only mirror of the Switch room" />
      {recent.length === 0 ? (
        <p className="text-[13px] text-ink-3">No messages since this page opened.</p>
      ) : (
        <ol className="space-y-1.5">
          {recent.map((m) => (
            <li key={m.messageId} className="grid grid-cols-[62px_minmax(0,1fr)] gap-x-2 text-[13px] leading-snug">
              <Time ms={m.timestamp} suffix={false} className="font-mono text-[12px] text-ink-4" />
              <p className="min-w-0 text-ink-2">
                <span className={`font-semibold ${m.fromAgent ? 'text-ink-3' : 'text-ink'}`}>{m.senderName}</span>
                {m.fromAgent && <span className="eyebrow ml-1.5 text-[9.5px] text-ink-4">agent</span>}{' '}
                <span className={m.fromAgent ? 'text-ink-3' : ''}>{truncate(plainText(m.body), 150)}</span>
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
