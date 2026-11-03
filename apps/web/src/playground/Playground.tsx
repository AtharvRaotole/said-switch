import { Seal } from '@said/brand';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { RichText } from '../lib/plain';
import { DANA, headline, newPlay, RIYA, say, type Speaker } from './engine';

const CHIPS: Record<Speaker, string[]> = {
  Dana: [
    '@builder also add dark mode while you are in there',
    'I thought we agreed dark mode was free',
    'Accept DRF-001 v1',
  ],
  Riya: ['Terms DRF-001: +2 days, +$400', 'Accept DRF-001 v1', 'Status'],
};

export function Playground() {
  const [state, setState] = useState(newPlay);
  const [who, setWho] = useState<Speaker>('Dana');
  const [draft, setDraft] = useState(CHIPS.Dana[0]!);
  const threadRef = useRef<HTMLDivElement>(null);
  const status = headline(state.ledger);
  const latest = [...state.ledger.drafts].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const mood = latest?.status === 'LOCKED' ? 'locked' : latest ? 'waiting' : 'idle';

  const send = (body: string) => {
    const text = body.trim();
    if (!text) return;
    setState((s) => say(s, who, text));
    setDraft('');
    queueMicrotask(() => {
      const el = threadRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(draft);
  };

  const party = who === 'Riya' ? RIYA : DANA;
  const fields = useMemo(() => {
    if (!latest) return [];
    const approvals = latest.status === 'LOCKED'
      ? state.ledger.agreements.find((a) => a.id === latest.agreementId)?.approvals ?? latest.approvals
      : latest.approvals;
    return [
      { k: 'What they asked for', v: latest.scope },
      { k: 'Terms', v: latest.terms ?? 'Not set yet' },
      { k: 'Status', v: latest.status === 'LOCKED' ? 'Both agreed' : latest.status === 'NEEDS_TERMS' ? 'Needs terms' : latest.status === 'REJECTED' ? 'Turned down' : 'Waiting' },
      { k: 'Riya', v: approvals.developer ? 'Accepted' : 'Has not accepted' },
      { k: 'Dana', v: approvals.client ? 'Accepted' : 'Has not accepted' },
      { k: 'Fingerprint of the terms', v: latest.termsHash ? latest.termsHash.slice(0, 10) : 'n/a', mono: true },
    ];
  }, [latest, state.ledger.agreements]);

  return (
    <section id="try" className="section">
      <p className="eyebrow">Try it now</p>
      <h2>Two people. One chat. Work waits.</h2>
      <p className="sub">
        This playground is the same consent engine Said uses in a Switch room. It runs in your browser. Nobody is
        signing in. Switch is not connected here. Press the suggested lines in order if you want the short version.
      </p>
      <div className="playground">
        <div className="play-status">
          <Seal mood={mood} size={88} />
          <div>
            <h3>{status.title}</h3>
            <p>{status.detail}</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => setState(newPlay())}>
            Start over
          </button>
        </div>
        <div className="play-grid">
          <div className="chat">
            <div className="who" role="tablist" aria-label="Who is typing">
              <button type="button" role="tab" aria-pressed={who === 'Dana'} onClick={() => setWho('Dana')}>
                Dana, the client
              </button>
              <button type="button" role="tab" aria-pressed={who === 'Riya'} onClick={() => setWho('Riya')}>
                Riya, the developer
              </button>
            </div>
            <div ref={threadRef} className="thread" aria-live="polite">
              {state.chat.map((line) => (
                <div key={line.id} className={`bubble ${line.speaker === 'Said' ? 'said' : 'human'}`}>
                  <span className="meta">{line.speaker}</span>
                  <RichText text={line.body} />
                </div>
              ))}
            </div>
            <div className="composer">
              <div className="chips">
                {CHIPS[who].map((c) => (
                  <button key={c} type="button" className="chip" onClick={() => send(c)}>
                    {c}
                  </button>
                ))}
              </div>
              <form onSubmit={onSubmit}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label={`Message as ${party.label}`}
                  placeholder={`Type as ${party.label}…`}
                />
                <button className="btn btn-wax" type="submit">
                  Send
                </button>
              </form>
            </div>
          </div>
          <aside className="ledger-side">
            <h4>What Said wrote down</h4>
            {fields.length === 0 ? (
              <p className="footnote">Nothing yet. The page stays quiet until someone asks for extra work.</p>
            ) : (
              fields.map((f) => (
                <div key={f.k} className="field">
                  <span>{f.k}</span>
                  <strong className={f.mono ? 'hash' : undefined}>{f.v}</strong>
                </div>
              ))
            )}
            <p className="footnote">
              Identity here is a pretend Switch participant id. In a real room, that id comes from Switch, not from the
              display name on the bubble.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
