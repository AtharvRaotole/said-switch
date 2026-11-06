import { SaidMark, Seal } from '@said/brand';
import { useEffect } from 'react';
import { ChatHero } from './hero/ChatHero';
import { Playground } from './playground/Playground';
import { ArchitectureDiagram } from './sections/ArchitectureDiagram';

const YEAR = 2026;

function useReveal() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!nodes.length) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      nodes.forEach((n) => n.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
}

export function App() {
  useReveal();

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-nav">
        <a href="#top" aria-label="Said home" className="nav-brand">
          <SaidMark width={92} height={28} />
        </a>
        <nav className="nav-links" aria-label="Primary">
          <a href="#problem">Problem</a>
          <a href="#primitives">Primitives</a>
          <a href="#how">How it works</a>
          <a href="#security">Security</a>
          <a href="#try">Try it</a>
          <a href="#run">Run it</a>
        </nav>
        <a className="btn btn-wax btn-nav" href="#try">
          Try the engine
        </a>
      </header>

      <main id="main">
        <section id="top" className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Bilateral consent for Switch rooms</p>
            <h1>
              Nothing starts until <em>both of you</em> say yes.
            </h1>
            <p className="lede">
              Coding agents in shared channels obey anyone. Said makes a Switch room a bilateral gate: refuse unauthorized
              asks, lock the same terms with both humans, then hand a signed start to the developer&apos;s local agent.
            </p>
            <div className="hero-actions">
              <a className="btn btn-wax" href="#demo">
                Watch the room
              </a>
              <a className="btn btn-ghost" href="#try">
                Try it in your browser
              </a>
            </div>
            <ul className="hero-proof">
              <li>Identity-bound accepts</li>
              <li>Tamper-proof room ledger</li>
              <li>Local handoff after lock</li>
            </ul>
          </div>
          <div className="hero-stage" aria-hidden="true">
            <div className="mini-room">
              <div className="mini-room-bar">
                <span className="mini-dot" />
                <strong>larkspur-site</strong>
                <span>said + builder</span>
              </div>
              <div className="mini-room-body">
                <div className="mini-msg human">
                  <b>Dana</b>
                  <p>
                    <mark>@builder</mark> also add dark mode
                  </p>
                </div>
                <div className="mini-msg refuse">
                  <b>Builder</b>
                  <p>Not permitted. Addressing refused.</p>
                </div>
                <div className="mini-msg agent">
                  <b>Said</b>
                  <p>Logged. Waiting on both accepts for DRF-001.</p>
                </div>
              </div>
              <div className="mini-room-foot">
                <div className="mini-ledger" aria-label="Room ledger snapshot">
                  <span className="mini-chip">
                    <em>Accepts</em>
                    <strong>0/2</strong>
                  </span>
                  <span className="mini-chip">
                    <em>Rev</em>
                    <strong>4</strong>
                  </span>
                  <span className="mini-chip">
                    <em>State</em>
                    <strong>unlocked</strong>
                  </span>
                </div>
                <Seal mood="idle" size={84} label="Said seal" />
              </div>
            </div>
          </div>
        </section>

        <section id="demo" className="section section-demo" data-reveal>
          <div className="section-head">
            <p className="eyebrow">See it once</p>
            <h2>Refuse. Lock. Execute.</h2>
            <p className="sub">
              Watch the full path in one room: a client ping is refused, both people accept the same draft, the seal
              stamps the ledger, and the builder runs only after that lock.
            </p>
          </div>
          <ChatHero />
        </section>

        <section id="problem" className="section section-muted" data-reveal>
          <div className="section-head">
            <p className="eyebrow">The problem</p>
            <h2>Shared channels give agents zero bilateral consent.</h2>
            <p className="sub">
              Anyone in Slack, Teams, Discord, or Mattermost can steer a coding agent. Scope expands without a deal, or
              Monday starts with &quot;I thought we agreed.&quot;
            </p>
          </div>
          <div className="problem-grid">
            <article className="problem-card">
              <b>Blind obedience</b>
              <h3>Anyone can command the agent</h3>
              <p>An external stakeholder can spend the developer&apos;s machine without a signed deal.</p>
            </article>
            <article className="problem-card">
              <b>He-said, she-said</b>
              <h3>Chat is not a contract</h3>
              <p>Scrollback lies. Display names change. There is no timestamped quote both people can trust.</p>
            </article>
            <article className="problem-card">
              <b>Prompt-only gates fail</b>
              <h3>Instructions are not enforcement</h3>
              <p>Approval rules in a prompt are only instructions. Control has to live in a real sign-off step.</p>
            </article>
          </div>
        </section>

        <section id="primitives" className="section" data-reveal>
          <div className="section-head">
            <p className="eyebrow">Three primitives</p>
            <h2>What a webhook cannot do.</h2>
            <p className="sub">
              Addressing modes, room documents, agent registration, and WebSocket sessions. Remove Switch and each one
              collapses.
            </p>
          </div>
          <div className="beats">
            <article className="beat">
              <b>1. Addressing boundaries</b>
              <h3>Identity-enforced reach</h3>
              <p>
                Said listens to anyone. The builder listens only to the owner and owner agents. A client mention gets
                Switch&apos;s refusal in-channel; Said still logs a draft.
              </p>
            </article>
            <article className="beat">
              <b>2. Agent-owned state</b>
              <h3>Human-uneditable ledger</h3>
              <p>
                The signed ledger lives in a Switch room document only Said can update. Humans can delete it. Said stops;
                it does not invent a blank book.
              </p>
            </article>
            <article className="beat">
              <b>3. Authenticated handoff</b>
              <h3>Chat to local terminal</h3>
              <p>
                After both enrolled humans accept the same terms fingerprint, Said sends a signed start to the builder.
                The builder re-checks before any worker runs.
              </p>
            </article>
          </div>
        </section>

        <section id="how" className="section section-muted" data-reveal>
          <div className="section-head">
            <p className="eyebrow">How it works on Switch</p>
            <h2>Ask. Both accept. Then work.</h2>
            <p className="sub">Who asked, what they asked for, and whether both people said yes to the same thing.</p>
          </div>
          <ArchitectureDiagram />
          <div className="switch-grid" style={{ marginTop: '1.5rem' }}>
            <article className="switch-card">
              <h3>Addressing</h3>
              <p>Said: anyone. Builder: owner and owner agents. The refusal is Switch&apos;s, visible in the room.</p>
            </article>
            <article className="switch-card">
              <h3>Room document</h3>
              <p>Said Ledger is server-side. Authorship is enforced by Switch. The console verifies Ed25519 in-browser.</p>
            </article>
            <article className="switch-card">
              <h3>Participant id</h3>
              <p>Approvals bind to the Switch-authenticated id, never a display name or quoted text.</p>
            </article>
            <article className="switch-card">
              <h3>Targeted handoff</h3>
              <p>The start token is aimed at the builder. It re-checks sender, signature, both ids, terms, and lock.</p>
            </article>
          </div>
        </section>

        <section id="security" className="section" data-reveal>
          <div className="section-head">
            <p className="eyebrow">Security model</p>
            <h2>The builder does not trust the chat alone.</h2>
            <p className="sub">
              A proposal is not an approval. Conditional yes does not count. Details live in the repository security notes.
            </p>
          </div>
          <ol className="security-list">
            <li>
              <strong>Two enrolled ids only.</strong> Display names, quoted text, and model paraphrases never approve.
            </li>
            <li>
              <strong>Same draft, same fingerprint.</strong> Any revision clears both approvals.
            </li>
            <li>
              <strong>Independent re-check.</strong> The builder reloads the signed ledger before any worker runs.
            </li>
            <li>
              <strong>Isolated apply.</strong> Work runs in a disposable git worktree with path allow-lists and build gates.
            </li>
            <li>
              <strong>Fail closed.</strong> Missing or tampered ledger stops authorization.
            </li>
          </ol>
          <p className="doc-link">
            Full model: <code>docs/SECURITY.md</code>. Live ops: <code>docs/LIVE_RUN.md</code>.
          </p>
        </section>

        <div data-reveal>
          <Playground />
        </div>

        <section id="run" className="section section-muted" data-reveal>
          <div className="section-head">
            <p className="eyebrow">Run it yourself</p>
            <h2>Offline in under two minutes.</h2>
            <p className="sub">
              Offline is a labeled simulation with a mock Switch server. Live mode talks to a real Switch server. The
              demo room is a Telegram group bridged by Switch. Mattermost works the same way.
            </p>
          </div>
          <div className="run-grid">
            <article className="run-card">
              <b>Offline simulation</b>
              <h3>No Switch install</h3>
              <pre className="code-block">{`npm install
npm run demo:offline -- --script`}</pre>
              <p>Two-persona chat, Said Console, and the client site. The banner says this is not Switch.</p>
            </article>
            <article className="run-card">
              <b>Live Switch</b>
              <h3>Telegram group</h3>
              <pre className="code-block">{`npm install
npm run setup
npm run register
npm run enroll -- --developer "Riya" --client "Dana" --wait
npm run doctor
npm run dev`}</pre>
              <p>
                Two agents: <code>said</code> (anyone) and <code>builder</code> (owner and owner agents). Telegram
                steps, including Group Privacy and account linking, are in the README. Mattermost is{' '}
                <code>docs/SETUP_LIVE.md</code>.
              </p>
            </article>
          </div>
        </section>

        <section id="faq" className="section" data-reveal>
          <div className="section-head">
            <p className="eyebrow">FAQ</p>
            <h2>Short answers for judges.</h2>
          </div>
          <div className="faq">
            <details open>
              <summary>Does this pass the remove-Switch test?</summary>
              <p>
                Without Switch there is no participant id to bind an accept to, no visible addressing refusal, no room
                document only Said can write, and no authenticated targeted handoff. A webhook chatbot would just start
                the job.
              </p>
            </details>
            <details>
              <summary>Is the playground Switch?</summary>
              <p>
                No. It runs the consent engine in your browser. Offline demo is a labeled mock. Live mode connects to a
                real Switch server.
              </p>
            </details>
            <details>
              <summary>Can the client ever start the builder?</summary>
              <p>
                No. Builder addressing is owner and owner agents. The client&apos;s mention produces Switch&apos;s
                refusal. Work still waits for both accepts.
              </p>
            </details>
            <details>
              <summary>What track is this for?</summary>
              <p>
                Best Business Workflow (Track 01) at Flip the Switch {YEAR}. Presentation weight is twenty percent: demo
                video plus README clarity.
              </p>
            </details>
          </div>
        </section>
      </main>

      <footer className="site-foot">
        <div className="foot-grid">
          <div>
            <SaidMark width={88} height={26} />
            <p>
              <strong>Said</strong> · Built for Flip the Switch {YEAR}. Best Business Workflow.
            </p>
            <p className="foot-note">
              The playground on this page is not Switch. Offline demo mode is a labeled simulation. Live mode talks to a
              real Switch server.
            </p>
          </div>
          <div className="foot-links">
            <p className="foot-label">Repository</p>
            <p>
              <a href="https://github.com/AtharvRaotole/said-switch">github.com/AtharvRaotole/said-switch</a>
            </p>
            <p className="foot-label">Hackathon</p>
            <p>
              <a href="https://www.wemakedevs.org/hackathons/switch">Flip the Switch · WeMakeDevs</a>
            </p>
            <p className="foot-label">Team</p>
            <p>Atharv Raotole</p>
            <p className="foot-label">Read only demo</p>
            <p>
              <a href="/witness">Host pending. Not a live room yet.</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
