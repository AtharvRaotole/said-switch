import { SaidMark, Seal } from '@said/brand';
import { ChatHero } from './hero/ChatHero';
import { Playground } from './playground/Playground';
import { ArchitectureDiagram } from './sections/ArchitectureDiagram';

const YEAR = 2026;

export function App() {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-nav">
        <a href="#top" aria-label="Said home">
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
        <a className="btn btn-wax" href="#try">
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
              AI coding agents in shared channels obey anyone. Said turns a Switch room into a bilateral execution
              gatekeeper: unauthorized instructions get a visible refusal, both humans must accept the same terms, and
              only then does a signed handoff reach the developer&apos;s local terminal.
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
              <li>Local agent handoff after lock</li>
            </ul>
          </div>
          <div className="hero-stage" aria-hidden="true">
            <div className="paper-card">
              <span className="tiny">Draft DRF-001</span>
              <h2>Add dark mode</h2>
              <p>+2 days, +$400. Waiting for Dana.</p>
              <div className="seal-on-paper">
                <Seal mood="waiting" size={150} />
              </div>
            </div>
          </div>
        </section>

        <section id="demo" className="section section-demo">
          <div className="section-head">
            <p className="eyebrow">See it once</p>
            <h2>A Switch room that refuses, locks, and executes.</h2>
            <p className="sub">
              The client pings the builder and Switch refuses. Said still logs the ask. Both people accept the same
              draft. The wax seal stamps the ledger. The builder runs only after that lock, on the developer&apos;s
              machine. When someone disputes the deal, Said quotes the signed record.
            </p>
          </div>
          <ChatHero />
        </section>

        <section id="problem" className="section section-muted">
          <div className="section-head">
            <p className="eyebrow">The problem</p>
            <h2>Shared channels give agents zero bilateral consent.</h2>
            <p className="sub">
              Freelancers, agencies, and product teams bring coding agents into Slack, Teams, Discord, or Mattermost.
              Anyone in the channel can steer the agent. &quot;Also add dark mode while you are in there&quot; becomes a
              change order nobody priced, or a Monday argument about what was agreed.
            </p>
          </div>
          <div className="problem-grid">
            <article className="problem-card">
              <b>Blind obedience</b>
              <h3>Anyone can command the agent</h3>
              <p>
                A standard agent treats every mention as work. An external stakeholder can spend the developer&apos;s
                machine without a signed deal.
              </p>
            </article>
            <article className="problem-card">
              <b>He-said, she-said</b>
              <h3>Chat is not a contract</h3>
              <p>
                Scrollback lies. Display names change. &quot;I thought we agreed&quot; has no timestamped quote both
                people can trust.
              </p>
            </article>
            <article className="problem-card">
              <b>Prompt-only gates fail</b>
              <h3>Instructions are not enforcement</h3>
              <p>
                Switch docs say approval rules in a prompt are only instructions. The control has to live in a real
                sign-off step the platform can enforce.
              </p>
            </article>
          </div>
        </section>

        <section id="primitives" className="section">
          <div className="section-head">
            <p className="eyebrow">Three primitives</p>
            <h2>What Said adds that a webhook cannot.</h2>
            <p className="sub">
              These map onto Switch addressing modes, room documents, agent registration, and authenticated WebSocket
              sessions. Remove Switch and each one collapses.
            </p>
          </div>
          <div className="beats">
            <article className="beat">
              <b>1. Addressing boundaries</b>
              <h3>Identity-enforced reach</h3>
              <p>
                Said listens to anyone. The builder listens only to the owner and owner agents. A client who pings the
                builder gets Switch&apos;s own refusal in the channel, and Said still writes a numbered draft.
              </p>
            </article>
            <article className="beat">
              <b>2. Agent-owned state</b>
              <h3>Human-uneditable ledger</h3>
              <p>
                The signed ledger lives in a Switch room document only Said can update. Every revision is Ed25519-signed.
                Humans can delete it. Said will stop, not invent a blank book.
              </p>
            </article>
            <article className="beat">
              <b>3. Authenticated handoff</b>
              <h3>Chat to local terminal</h3>
              <p>
                After both enrolled humans accept the same terms fingerprint, Said sends a signed start token to the
                builder. The builder reloads the ledger and refuses to start if anything does not match.
              </p>
            </article>
          </div>
        </section>

        <section id="how" className="section section-muted">
          <div className="section-head">
            <p className="eyebrow">How it works on Switch</p>
            <h2>Ask. Both accept. Then work.</h2>
            <p className="sub">
              You do not need to know what a hash is. You need to know who asked, what they asked for, and whether both
              people said yes to the same thing.
            </p>
          </div>
          <ArchitectureDiagram />
          <div className="switch-grid" style={{ marginTop: '1.75rem' }}>
            <article className="switch-card">
              <h3>Addressing</h3>
              <p>
                Said: anyone. Builder: owner and owner agents. The refusal text is Switch&apos;s, visible in the room,
                not a soft prompt.
              </p>
            </article>
            <article className="switch-card">
              <h3>Room document</h3>
              <p>
                Said Ledger is a server-side document. Authorship is enforced by Switch. The console verifies the
                signature in the browser.
              </p>
            </article>
            <article className="switch-card">
              <h3>Participant id</h3>
              <p>
                Approvals bind to the Switch-authenticated id, never to a display name, never to &quot;Dana said yes&quot;
                in quoted text.
              </p>
            </article>
            <article className="switch-card">
              <h3>Targeted handoff</h3>
              <p>
                The start token is aimed at the builder, not broadcast. The builder checks sender, signature, both
                distinct ids, matching terms, and lock state before touching git.
              </p>
            </article>
          </div>
        </section>

        <section id="security" className="section">
          <div className="section-head">
            <p className="eyebrow">Security model</p>
            <h2>The builder does not trust the chat alone.</h2>
            <p className="sub">
              A proposal is not an approval. Conditional yes does not count. The coding worker never sees raw keys or
              the full transcript. Details live in the security notes in the repository.
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
              <strong>Independent re-check.</strong> The builder reloads the signed ledger and verifies the start token
              before any worker runs.
            </li>
            <li>
              <strong>Isolated apply.</strong> Work runs in a disposable git worktree with path allow-lists, typecheck,
              and build gates.
            </li>
            <li>
              <strong>Fail closed.</strong> Missing or tampered ledger stops authorization. Said does not silently
              recreate an empty book.
            </li>
          </ol>
          <p className="doc-link">
            Read the full model in <code>docs/SECURITY.md</code> once the core stream lands it. Live run notes:
            <code>docs/LIVE_RUN.md</code>.
          </p>
        </section>

        <Playground />

        <section id="run" className="section section-muted">
          <div className="section-head">
            <p className="eyebrow">Run it yourself</p>
            <h2>Offline in under two minutes. Live when you are ready.</h2>
            <p className="sub">
              The offline path is a labeled simulation. It uses a mock Switch server so judges can see the whole story
              without installing Switch Console. Live mode talks to a real Switch server and Mattermost.
            </p>
          </div>
          <div className="run-grid">
            <article className="run-card">
              <b>Offline simulation</b>
              <h3>No Switch install</h3>
              <pre className="code-block">{`npm install
npm run demo:offline -- --script`}</pre>
              <p>
                Opens a two-persona chat simulator, the Said Console, and the client site. The banner says this is not
                Switch.
              </p>
            </article>
            <article className="run-card">
              <b>Live Switch</b>
              <h3>Mattermost room</h3>
              <pre className="code-block">{`npm install
npm run setup
npm run register
npm run enroll -- --developer "Riya" --client "Dana" --wait
npm run doctor
npm run dev`}</pre>
              <p>
                Follow <code>docs/SETUP_LIVE.md</code> for Switch Console, the registration key, and enrollment codes.
              </p>
            </article>
          </div>
        </section>

        <section id="faq" className="section">
          <div className="section-head">
            <p className="eyebrow">FAQ</p>
            <h2>Short answers for judges and operators.</h2>
          </div>
          <div className="faq">
            <details open>
              <summary>Does this pass the remove-Switch test?</summary>
              <p>
                Without Switch there is no participant id to bind an accept to, no visible addressing refusal, no room
                document only Said can write, and no authenticated targeted handoff the builder can re-check. A webhook
                chatbot would just start the job.
              </p>
            </details>
            <details>
              <summary>Is the playground Switch?</summary>
              <p>
                No. The in-browser playground runs the same consent engine in your browser. Offline demo mode is a
                labeled mock. Live mode connects to a real Switch server.
              </p>
            </details>
            <details>
              <summary>Can the client ever start the builder?</summary>
              <p>
                No. Builder addressing is owner and owner agents. The client&apos;s mention produces Switch&apos;s
                refusal. Said logs it. Work still waits for both accepts.
              </p>
            </details>
            <details>
              <summary>What track is this for?</summary>
              <p>
                Best Business Workflow (Track 01) at Flip the Switch {YEAR}. Presentation weight is twenty percent:
                demo video plus README clarity.
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
              <strong>Said</strong> is built for Flip the Switch {YEAR}. The playground on this page is not Switch.
              Offline demo mode is a labeled simulation. Live mode talks to a real Switch server.
            </p>
          </div>
          <div>
            <p className="foot-label">Repository</p>
            <p>
              <a href="https://github.com/AtharvRaotole/said-switch">github.com/AtharvRaotole/said-switch</a>
            </p>
            <p className="foot-label">Team</p>
            <p>Atharv Raotole</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
