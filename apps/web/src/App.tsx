import { SaidMark, Seal } from '@said/brand';
import { Playground } from './playground/Playground';

export function App() {
  return (
    <div className="site-shell">
      <header className="site-nav">
        <a href="#top" aria-label="Said home">
          <SaidMark width={92} height={28} />
        </a>
        <nav className="nav-links">
          <a href="#try">Try it</a>
          <a href="#how">How it works</a>
          <a href="#switch">On Switch</a>
        </nav>
        <a className="btn btn-wax" href="#try">
          Try the engine
        </a>
      </header>

      <main id="top">
        <section className="hero">
          <div>
            <p className="eyebrow">A consent notary for Switch rooms</p>
            <h1>
              Nothing starts until <em>both of you</em> say yes.
            </h1>
            <p className="lede">
              Someone asks for extra work in the chat. Said writes it down. The coding agent does not move until the
              developer and the client accept the same terms. If they argue later, Said quotes the signed record, not a
              vibe.
            </p>
            <div className="hero-actions">
              <a className="btn btn-wax" href="#try">
                Try it in your browser
              </a>
              <a className="btn btn-ghost" href="#how">
                Show me in three steps
              </a>
            </div>
          </div>
          <div className="hero-stage">
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

        <Playground />

        <section id="how" className="section">
          <p className="eyebrow">How it works</p>
          <h2>Ask. Both accept. Then work.</h2>
          <p className="sub">
            You do not need to know what a hash is. You need to know who asked, what they asked for, and whether both
            people said yes to the same thing.
          </p>
          <div className="beats">
            <article className="beat">
              <b>1. Someone asks</b>
              <h3>Even if they skip the line</h3>
              <p>
                A client can type straight at the builder. Switch can refuse that message. Said still logs the ask as a
                numbered draft. Nothing has started.
              </p>
            </article>
            <article className="beat">
              <b>2. Both people accept</b>
              <h3>The same version, the same terms</h3>
              <p>
                The developer writes time and price. Each person accepts from their own account. A proposal is not an
                approval. “Yes if it is free” does not count.
              </p>
            </article>
            <article className="beat">
              <b>3. Then the builder runs</b>
              <h3>Only after the seal locks</h3>
              <p>
                Said hands a signed start note to the builder. The builder checks the ledger itself, then runs Claude
                Code or Codex in a throwaway git folder. If the checks fail, the client site does not change.
              </p>
            </article>
          </div>
        </section>

        <section id="switch" className="section" style={{ paddingTop: 0 }}>
          <p className="eyebrow">Built on Switch, not around it</p>
          <h2>The control lives in the room.</h2>
          <p className="sub">
            Switch’s own docs say approval rules are only instructions unless you put the control in a sign-off step.
            Said is that step, using Switch primitives judges can see.
          </p>
          <div className="switch-grid">
            <article className="switch-card">
              <h3>Addressing</h3>
              <p>
                Said listens to everyone. The builder only listens to the owner and owner agents. A client who pings
                the builder gets Switch’s own refusal, and Said still writes a draft.
              </p>
            </article>
            <article className="switch-card">
              <h3>Room document</h3>
              <p>
                The ledger lives in a Switch room document only Said can update. Every revision is Ed25519-signed.
                Humans can delete it. Said will stop, not invent a blank book.
              </p>
            </article>
            <article className="switch-card">
              <h3>Participant id</h3>
              <p>
                Approvals bind to the Switch-authenticated id, never to a display name, never to “Dana said yes” in
                quoted text.
              </p>
            </article>
            <article className="switch-card">
              <h3>Targeted handoff</h3>
              <p>
                When both accept, Said sends a signed start token to the builder. The builder loads the ledger again
                and refuses to start if anything does not match.
              </p>
            </article>
          </div>
        </section>
      </main>

      <footer className="site-foot">
        <p>
          <strong>Said</strong> is built for Flip the Switch 2026. The playground on this page is not Switch. Offline
          demo mode is a labeled simulation. Live mode talks to a real Switch server.
        </p>
      </footer>
    </div>
  );
}
