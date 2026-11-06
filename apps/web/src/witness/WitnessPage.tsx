import { useEffect, useState } from 'react';
import type { WitnessView } from '@said/witness/view';
import './witness.css';

const POLL_MS = 5000;
const WITNESS_URL = (import.meta.env.VITE_SAID_WITNESS_URL as string | undefined)?.trim() ?? '';

function pendingView(): WitnessView {
  return {
    access: 'read-only',
    label: 'Read only',
    writes: false,
    live: false,
    source: 'offline',
    worker: null,
    heartbeatAt: null,
    lastEventAt: null,
    reason: 'Public host is pending. This page is not connected to Switch.',
    switchVersion: null,
    roomName: null,
    drafts: [],
    acceptances: [],
    lock: null,
    work: null,
  };
}

function clock(value: string | null, empty: string): string {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return empty;
  return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

export function WitnessPage() {
  const [view, setView] = useState<WitnessView>(pendingView);
  const [hostPending] = useState(WITNESS_URL.length === 0);

  useEffect(() => {
    document.title = 'Said. Read only demo';
  }, []);

  useEffect(() => {
    if (!WITNESS_URL) return;
    let stop = false;
    const pull = async () => {
      try {
        const res = await fetch(WITNESS_URL, { method: 'GET', cache: 'no-store' });
        if (!res.ok) throw new Error('status');
        const body = (await res.json()) as WitnessView;
        if (!stop && body && body.access === 'read-only' && body.writes === false) setView(body);
      } catch {
        if (!stop) {
          setView({
            ...pendingView(),
            reason: 'Demo source is offline. Nothing here is a live room.',
          });
        }
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), POLL_MS);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  const draft = view.drafts[0] ?? null;
  const acceptance = view.acceptances[0] ?? null;
  const live = view.live && view.source === 'switch';

  return (
    <main className="witness">
      <p className="witness-kicker">Read only</p>
      <h1>Demo room</h1>
      <p className="witness-lead">
        {live
          ? 'A separate Switch room. This page only reads it. The worker is scripted when work has run.'
          : 'Source offline. This page does not show a sample ledger, and it does not start work.'}
      </p>
      <p className="witness-status" data-live={live ? 'yes' : 'no'}>
        {live ? 'Switch connected' : 'Not live'}
        {view.worker === 'scripted' ? ' · scripted' : ''}
      </p>
      {view.reason ? <p className="witness-reason">{view.reason}</p> : null}
      {hostPending ? <p className="witness-reason">The public gateway URL is not set yet.</p> : null}

      <dl className="witness-times">
        <div>
          <dt>Gateway check</dt>
          <dd>{clock(view.heartbeatAt, 'No reply')}</dd>
        </div>
        <div>
          <dt>Last ledger event</dt>
          <dd>{clock(view.lastEventAt, 'No ledger event yet')}</dd>
        </div>
      </dl>

      <ol className="witness-steps">
        <li>
          <b>Switch</b>
          <span>{live ? `Connected${view.switchVersion ? ` · ${view.switchVersion}` : ''}` : 'Waiting'}</span>
          <small>{view.roomName ?? 'No room name'}</small>
        </li>
        <li>
          <b>Draft</b>
          <span>{draft ? `${draft.id} · v${draft.version} · ${draft.status}` : 'Waiting'}</span>
          <small>{draft ? `${draft.scope}${draft.terms ? ` · ${draft.terms}` : ''}` : 'No draft yet'}</small>
        </li>
        <li>
          <b>Accept</b>
          <span>{acceptance ? 'Recorded' : 'Waiting'}</span>
          <small>
            {acceptance
              ? `Developer ${acceptance.developer ? 'yes' : 'no'} · Client ${acceptance.client ? 'yes' : 'no'}`
              : 'No accepts yet'}
          </small>
        </li>
        <li>
          <b>Lock</b>
          <span>{view.lock ? view.lock.agreementId : 'Waiting'}</span>
          <small>{view.lock ? view.lock.terms : 'No lock yet'}</small>
        </li>
        <li>
          <b>Work</b>
          <span>{view.work ? `${view.work.status} · scripted` : 'Waiting'}</span>
          <small>
            {view.work
              ? `${view.work.jobId}${view.work.resultCommit ? ` · ${view.work.resultCommit}` : ''}${
                  view.work.checks.length ? ` · ${view.work.checks.map((check) => `${check.name} ${check.ok ? 'ok' : 'failed'}`).join(', ')}` : ''
                }`
              : 'No job yet'}
          </small>
        </li>
      </ol>

      <p className="witness-foot">
        <a href="/">Back to Said</a>
        <span>The Telegram video is a different run. This page cannot send a prompt.</span>
      </p>
    </main>
  );
}
