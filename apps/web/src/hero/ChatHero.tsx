import { Seal } from '@said/brand';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { HERO_ROOM, HERO_REVISION_LOCKED, HERO_SCRIPT, type HeroBeat, type HeroSpeaker } from './script';

interface ChatMsg {
  id: string;
  speaker: HeroSpeaker;
  body: string;
  tone?: 'refuse' | 'lock' | 'quote' | 'handoff';
}

interface TermLine {
  id: string;
  text: string;
  tone?: 'ok' | 'dim' | 'cmd';
}

type Phase = 'playing' | 'paused' | 'done';

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

function finalSnapshot(): { messages: ChatMsg[]; terminal: TermLine[]; seal: boolean; termOpen: boolean } {
  const messages: ChatMsg[] = [];
  const terminal: TermLine[] = [];
  let seal = false;
  let termOpen = false;
  let i = 0;
  for (const beat of HERO_SCRIPT) {
    if (beat.kind === 'msg') {
      messages.push({ id: `f-${i++}`, speaker: beat.speaker, body: beat.body, tone: beat.tone });
    } else if (beat.kind === 'seal') {
      seal = true;
    } else if (beat.kind === 'terminal-open') {
      termOpen = true;
    } else if (beat.kind === 'terminal-line') {
      terminal.push({ id: `t-${i++}`, text: beat.text, tone: beat.tone });
    }
  }
  return { messages, terminal, seal, termOpen };
}

export function ChatHero() {
  const reduce = usePrefersReducedMotion();
  const threadRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const indexRef = useRef(0);
  const pausedRef = useRef(false);
  const runId = useId().replace(/:/g, '');

  const snap = finalSnapshot();
  const [messages, setMessages] = useState<ChatMsg[]>(reduce ? snap.messages : []);
  const [typing, setTyping] = useState<HeroSpeaker | null>(null);
  const [terminal, setTerminal] = useState<TermLine[]>(reduce ? snap.terminal : []);
  const [termOpen, setTermOpen] = useState(reduce ? snap.termOpen : false);
  const [sealOn, setSealOn] = useState(reduce ? snap.seal : false);
  const [revision, setRevision] = useState(reduce ? HERO_REVISION_LOCKED : 3);
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
    setTerminal([]);
    setTermOpen(false);
    setSealOn(false);
    setRevision(3);
    setPhase('playing');
    setLoopKey((k) => k + 1);
  }, []);

  const applyBeat = useCallback((beat: HeroBeat) => {
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
          },
        ]);
        queueMicrotask(scrollChat);
        break;
      case 'typing':
        setTyping(beat.speaker);
        queueMicrotask(scrollChat);
        break;
      case 'seal':
        setTyping(null);
        setSealOn(true);
        setRevision(HERO_REVISION_LOCKED);
        break;
      case 'terminal-open':
        setTermOpen(true);
        break;
      case 'terminal-line':
        setTerminal((t) => [...t, { id: `${runId}-t-${indexRef.current}`, text: beat.text, tone: beat.tone }]);
        queueMicrotask(scrollTerm);
        break;
      case 'pause':
        setTyping(null);
        break;
      case 'loop':
        setTyping(null);
        setPhase('done');
        break;
    }
  }, [runId]);

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
          <span className="chat-hero-rev">
            Ledger rev <b>{revision}</b>
          </span>
          <div className="chat-hero-controls">
            <button type="button" className="chat-hero-btn" onClick={togglePause} aria-pressed={phase === 'paused'}>
              {phase === 'done' ? 'Replay' : phase === 'paused' ? 'Play' : 'Pause'}
            </button>
            <button type="button" className="chat-hero-btn" onClick={reset} disabled={reduce && phase === 'done'}>
              Restart
            </button>
          </div>
        </div>
      </div>

      <div className={`chat-hero-stage${termOpen ? ' is-split' : ''}`}>
        <div className="chat-hero-panel chat-hero-chat">
          <div ref={threadRef} className="chat-hero-thread" aria-live="polite" aria-relevant="additions">
            {messages.map((m) => (
              <article
                key={m.id}
                className={`chat-hero-bubble speaker-${m.speaker.toLowerCase()}${m.tone ? ` tone-${m.tone}` : ''}`}
              >
                <header>
                  <span className="chat-hero-avatar" data-who={m.speaker} aria-hidden>
                    {m.speaker.slice(0, 1)}
                  </span>
                  <span className="chat-hero-who">{roleLabel(m.speaker)}</span>
                </header>
                <p>{m.body}</p>
              </article>
            ))}
            {typing && (
              <div className="chat-hero-typing" aria-label={`${typing} is typing`}>
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

          {sealOn && (
            <div className="chat-hero-seal" aria-hidden={!sealOn}>
              <Seal mood="locked" size={112} label="Both people agreed. The seal is locked." />
              <p>AGR-001 sealed</p>
            </div>
          )}
        </div>

        {termOpen && (
          <aside className="chat-hero-panel chat-hero-term" aria-label="Local builder terminal">
            <div className="chat-hero-term-bar">
              <span>builder · local terminal</span>
              <span className="chat-hero-term-live">running</span>
            </div>
            <div ref={termRef} className="chat-hero-term-body">
              {terminal.map((line) => (
                <pre key={line.id} className={`term-line tone-${line.tone ?? 'dim'}`}>
                  {line.text}
                </pre>
              ))}
            </div>
          </aside>
        )}
      </div>

      <p className="chat-hero-caption">
        Autoplaying the full path: ask, visible refusal, both accepts, sealed ledger, local handoff, then a timestamped
        quote when someone disputes the deal.
      </p>
    </div>
  );
}
