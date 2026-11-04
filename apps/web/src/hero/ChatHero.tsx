import { Seal } from '@said/brand';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  HERO_HASH_LOCKED,
  HERO_IDLE_TERMINAL,
  HERO_REVISION_LOCKED,
  HERO_ROOM,
  HERO_SCRIPT,
  type HeroBeat,
  type HeroSpeaker,
  type HeroTone,
  type LedgerPatch,
} from './script';

interface ChatMsg {
  id: string;
  speaker: HeroSpeaker;
  body: string;
  tone?: HeroTone;
  time?: string;
  cite?: { revision: number; at: string; hash: string; valid: boolean };
}

interface TermLine {
  id: string;
  text: string;
  tone?: 'ok' | 'dim' | 'cmd' | 'warn' | 'idle';
}

interface LedgerState {
  draft: string | null;
  version: number;
  accepts: number;
  need: number;
  agreement: string | null;
  revision: number;
  hash: string;
  sealed: boolean;
  scope: string;
  terms: string;
}

type Phase = 'playing' | 'paused' | 'done';
type TermStatus = 'idle' | 'blocked' | 'running' | 'done';

const INITIAL_LEDGER: LedgerState = {
  draft: null,
  version: 1,
  accepts: 0,
  need: 2,
  agreement: null,
  revision: 2,
  hash: '00000000',
  sealed: false,
  scope: 'none',
  terms: 'none',
};

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduce(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return reduce;
}

function roleLabel(speaker: HeroSpeaker): string {
  if (speaker === 'Dana') return 'Dana · client';
  if (speaker === 'Riya') return 'Riya · developer';
  if (speaker === 'Said') return 'Said · notary';
  if (speaker === 'Builder') return 'Builder · local agent';
  return 'Room';
}

function isHuman(speaker: HeroSpeaker): boolean {
  return speaker === 'Dana' || speaker === 'Riya';
}

function renderBody(body: string): ReactNode {
  const parts = body.split(/(@[a-z][\w-]*)/gi);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <mark key={i} className="chat-hero-mention">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function mergeLedger(base: LedgerState, patch: LedgerPatch): LedgerState {
  return { ...base, ...patch };
}

function finalSnapshot(): {
  messages: ChatMsg[];
  terminal: TermLine[];
  seal: boolean;
  ledger: LedgerState;
  termStatus: TermStatus;
} {
  const messages: ChatMsg[] = [];
  let terminal: TermLine[] = HERO_IDLE_TERMINAL.map((l, i) => ({
    id: `fi-${i}`,
    text: l.text,
    tone: l.tone,
  }));
  let seal = false;
  let ledger = { ...INITIAL_LEDGER };
  let termStatus: TermStatus = 'idle';
  let i = 0;
  for (const beat of HERO_SCRIPT) {
    if (beat.kind === 'msg') {
      messages.push({
        id: `f-${i++}`,
        speaker: beat.speaker,
        body: beat.body,
        tone: beat.tone,
        time: beat.time,
        cite: beat.cite,
      });
    } else if (beat.kind === 'seal') {
      seal = true;
      termStatus = 'idle';
      terminal = [
        ...HERO_IDLE_TERMINAL.map((l, idx) => ({ id: `fs-${idx}`, text: l.text, tone: l.tone })),
        { id: `fs-ready`, text: 'AGR-001 sealed · signed start pending', tone: 'ok' as const },
      ];
    } else if (beat.kind === 'ledger') {
      ledger = mergeLedger(ledger, beat.patch);
    } else if (beat.kind === 'terminal-line') {
      terminal = [...terminal, { id: `t-${i++}`, text: beat.text, tone: beat.tone }];
    } else if (beat.kind === 'term-status') {
      termStatus = beat.status;
    }
  }
  return { messages, terminal, seal, ledger, termStatus };
}

function termStatusLabel(status: TermStatus): string {
  if (status === 'idle') return 'idle';
  if (status === 'blocked') return 'blocked';
  if (status === 'running') return 'running';
  return 'done';
}

export function ChatHero() {
  const reduce = usePrefersReducedMotion();
  const threadRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const indexRef = useRef(0);
  const pausedRef = useRef(false);
  const runId = useId().replace(/:/g, '');

  const snap = useMemo(() => finalSnapshot(), []);
  const [messages, setMessages] = useState<ChatMsg[]>(reduce ? snap.messages : []);
  const [typing, setTyping] = useState<HeroSpeaker | null>(null);
  const [terminal, setTerminal] = useState<TermLine[]>(
    reduce
      ? snap.terminal
      : HERO_IDLE_TERMINAL.map((l, i) => ({ id: `idle-${i}`, text: l.text, tone: l.tone })),
  );
  const [termStatus, setTermStatus] = useState<TermStatus>(reduce ? snap.termStatus : 'idle');
  const [sealOn, setSealOn] = useState(reduce ? snap.seal : false);
  const [ledger, setLedger] = useState<LedgerState>(reduce ? snap.ledger : { ...INITIAL_LEDGER });
  const [phase, setPhase] = useState<Phase>(reduce ? 'done' : 'playing');
  const [loopKey, setLoopKey] = useState(0);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const scrollChat = () => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  const scrollTerm = () => {
    const el = termRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const reset = useCallback(() => {
    clearTimer();
    indexRef.current = 0;
    pausedRef.current = false;
    setMessages([]);
    setTyping(null);
    setTerminal(HERO_IDLE_TERMINAL.map((l, i) => ({ id: `idle-${Date.now()}-${i}`, text: l.text, tone: l.tone })));
    setTermStatus('idle');
    setSealOn(false);
    setLedger({ ...INITIAL_LEDGER });
    setPhase('playing');
    setLoopKey((k) => k + 1);
  }, []);

  const applyBeat = useCallback(
    (beat: HeroBeat) => {
      switch (beat.kind) {
        case 'msg':
          setTyping(null);
          setMessages((m) => [
            ...m,
            {
              id: `${runId}-${indexRef.current}`,
              speaker: beat.speaker,
              body: beat.body,
              tone: beat.tone,
              time: beat.time,
              cite: beat.cite,
            },
          ]);
          queueMicrotask(() => {
            scrollChat();
            // Keep signed citations fully visible
            requestAnimationFrame(scrollChat);
          });
          break;
        case 'typing':
          setTyping(beat.speaker);
          queueMicrotask(scrollChat);
          break;
        case 'ledger':
          setLedger((cur) => mergeLedger(cur, beat.patch));
          break;
        case 'seal':
          setTyping(null);
          setSealOn(true);
          setTermStatus('idle');
          setTerminal((prev) => {
            const base = HERO_IDLE_TERMINAL.map((l, i) => ({
              id: `${runId}-seal-idle-${i}`,
              text: l.text,
              tone: l.tone,
            }));
            return [
              ...base,
              {
                id: `${runId}-seal-ready`,
                text: 'AGR-001 sealed · signed start pending',
                tone: 'ok' as const,
              },
            ];
          });
          setLedger((cur) =>
            mergeLedger(cur, {
              sealed: true,
              agreement: cur.agreement ?? 'AGR-001',
              accepts: cur.need,
              revision: HERO_REVISION_LOCKED,
              hash: HERO_HASH_LOCKED,
            }),
          );
          queueMicrotask(scrollTerm);
          break;
        case 'terminal-line':
          setTerminal((t) => [...t, { id: `${runId}-t-${indexRef.current}`, text: beat.text, tone: beat.tone }]);
          queueMicrotask(scrollTerm);
          break;
        case 'term-status':
          setTermStatus(beat.status);
          break;
        case 'pause':
          setTyping(null);
          break;
        case 'loop':
          setTyping(null);
          setPhase('done');
          break;
      }
    },
    [runId],
  );

  useEffect(() => {
    if (reduce) return;
    pausedRef.current = phase === 'paused';
    if (phase !== 'playing') return;

    const step = () => {
      if (pausedRef.current) return;
      const i = indexRef.current;
      if (i >= HERO_SCRIPT.length) {
        setPhase('done');
        return;
      }
      const beat = HERO_SCRIPT[i]!;
      applyBeat(beat);
      indexRef.current = i + 1;
      if (beat.kind === 'loop') {
        timerRef.current = window.setTimeout(() => {
          reset();
        }, beat.ms);
        return;
      }
      timerRef.current = window.setTimeout(step, beat.ms);
    };

    timerRef.current = window.setTimeout(step, 80);
    return clearTimer;
  }, [phase, loopKey, reduce, applyBeat, reset]);

  const togglePause = () => {
    if (reduce) return;
    if (phase === 'done') {
      reset();
      return;
    }
    if (phase === 'paused') {
      setPhase('playing');
    } else {
      clearTimer();
      setPhase('paused');
    }
  };

  return (
    <div className="chat-hero" data-phase={phase} aria-label="Animated demonstration of a Said Switch room">
      <div className="chat-hero-toolbar">
        <div className="chat-hero-room">
          <span className="chat-hero-dot" aria-hidden />
          <div>
            <strong>{HERO_ROOM}</strong>
            <span>Switch room · said + builder online</span>
          </div>
        </div>
        <div className="chat-hero-meta">
          <div className="chat-hero-controls">
            <button type="button" className="chat-hero-btn" onClick={togglePause} aria-pressed={phase === 'paused'}>
              {phase === 'done' ? 'Replay' : phase === 'paused' ? 'Play' : 'Pause'}
            </button>
            <button type="button" className="chat-hero-btn" onClick={reset}>
              Restart
            </button>
          </div>
        </div>
      </div>

      <div className={`chat-hero-ledger${sealOn ? ' is-sealed' : ''}`} aria-live="polite">
        <div className="chat-hero-ledger-main">
          <div className="ledger-cell">
            <span>Draft</span>
            <strong>{ledger.draft ? `${ledger.draft} v${ledger.version}` : 'none'}</strong>
          </div>
          <div className="ledger-cell">
            <span>Accepts</span>
            <strong className={ledger.accepts >= ledger.need ? 'is-ok' : ''}>
              {ledger.accepts}/{ledger.need}
            </strong>
          </div>
          <div className="ledger-cell">
            <span>Agreement</span>
            <strong>{ledger.agreement ?? 'unlocked'}</strong>
          </div>
          <div className="ledger-cell">
            <span>Rev</span>
            <strong className="mono">{ledger.revision}</strong>
          </div>
          <div className="ledger-cell">
            <span>Hash</span>
            <strong className="mono">{ledger.hash}</strong>
          </div>
          <div className="ledger-cell hide-sm">
            <span>Terms</span>
            <strong>{ledger.terms}</strong>
          </div>
        </div>
        <div className="chat-hero-ledger-seal" aria-hidden={!sealOn}>
          {sealOn ? (
            <>
              <Seal mood="locked" size={72} label="Both people agreed. The seal is locked." />
              <p>AGR-001 sealed</p>
            </>
          ) : (
            <div className="chat-hero-seal-slot">
              <span>Seal waits for 2/2</span>
            </div>
          )}
        </div>
      </div>

      <div className="chat-hero-stage">
        <div className="chat-hero-panel chat-hero-chat">
          <div ref={threadRef} className="chat-hero-thread" aria-live="polite" aria-relevant="additions">
            {messages.length === 0 && !typing && (
              <p className="chat-hero-empty">Room quiet. Waiting for the first ask.</p>
            )}
            {messages.map((m) => (
              <article
                key={m.id}
                className={[
                  'chat-hero-bubble',
                  isHuman(m.speaker) ? 'is-human' : 'is-agent',
                  `speaker-${m.speaker.toLowerCase()}`,
                  m.tone ? `tone-${m.tone}` : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <header>
                  <span className="chat-hero-avatar" data-who={m.speaker} aria-hidden>
                    {m.speaker.slice(0, 1)}
                  </span>
                  <span className="chat-hero-who">{roleLabel(m.speaker)}</span>
                  {m.time && (
                    <time className="chat-hero-time" dateTime={`2026-11-04T${m.time}Z`}>
                      {m.time}
                    </time>
                  )}
                  {m.tone === 'refuse' && <span className="chat-hero-badge refuse">refused</span>}
                  {m.tone === 'quote' && <span className="chat-hero-badge quote">ledger quote</span>}
                </header>
                {m.cite ? (
                  <div className="chat-hero-cite">
                    <p className="chat-hero-cite-kicker">Signed citation · ledger rev {m.cite.revision}</p>
                    <p>{renderBody(m.body)}</p>
                    <dl className="chat-hero-cite-meta">
                      <div>
                        <dt>Timestamp</dt>
                        <dd>{m.cite.at}</dd>
                      </div>
                      <div>
                        <dt>Hash</dt>
                        <dd className="mono">{m.cite.hash}</dd>
                      </div>
                      <div>
                        <dt>Signature</dt>
                        <dd className={m.cite.valid ? 'is-ok' : ''}>{m.cite.valid ? 'valid' : 'invalid'}</dd>
                      </div>
                    </dl>
                  </div>
                ) : (
                  <p>{renderBody(m.body)}</p>
                )}
              </article>
            ))}
            {typing && (
              <div className={`chat-hero-typing ${isHuman(typing) ? 'is-human' : 'is-agent'}`} aria-label={`${typing} is typing`}>
                <span className="chat-hero-avatar" data-who={typing} aria-hidden>
                  {typing.slice(0, 1)}
                </span>
                <span className="chat-hero-dots" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <span className="sr-only">{typing} is typing</span>
              </div>
            )}
          </div>
        </div>

        <aside className="chat-hero-panel chat-hero-term" aria-label="Local builder terminal">
          <div className="chat-hero-term-bar">
            <span>builder · local terminal</span>
            <span className={`chat-hero-term-live status-${termStatus}`}>{termStatusLabel(termStatus)}</span>
          </div>
          <div ref={termRef} className="chat-hero-term-body">
            {terminal.map((line) => (
              <pre key={line.id} className={`term-line tone-${line.tone ?? 'dim'}`}>
                {line.text}
              </pre>
            ))}
          </div>
        </aside>
      </div>

      <p className="chat-hero-caption">
        Autoplay: ask, visible refusal, both accepts, sealed ledger, local handoff, then a signed citation when someone
        disputes the deal.
      </p>
    </div>
  );
}
