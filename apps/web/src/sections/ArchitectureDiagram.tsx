/** Static SVG architecture diagram. No Mermaid runtime on the marketing page. */
export function ArchitectureDiagram() {
  return (
    <figure className="arch">
      <svg
        className="arch-svg"
        viewBox="0 0 960 320"
        role="img"
        aria-label="Architecture: Mattermost clients talk to Switch, Said writes the signed ledger and hands off to the local builder"
      >
        <defs>
          <marker id="arch-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#6a7b8c" />
          </marker>
        </defs>

        <rect x="24" y="48" width="180" height="96" rx="10" fill="#ffffff" stroke="#c5ced8" />
        <text x="114" y="88" textAnchor="middle" className="arch-title">
          Mattermost
        </text>
        <text x="114" y="112" textAnchor="middle" className="arch-sub">
          Riya + Dana
        </text>

        <rect x="260" y="48" width="180" height="96" rx="10" fill="#08131f" />
        <text x="350" y="88" textAnchor="middle" className="arch-title-inv">
          Switch room
        </text>
        <text x="350" y="112" textAnchor="middle" className="arch-sub-inv">
          ids, addressing, docs
        </text>

        <rect x="496" y="28" width="200" height="136" rx="10" fill="#ffffff" stroke="#9b1d2e" strokeWidth="2" />
        <text x="596" y="72" textAnchor="middle" className="arch-title">
          Said notary
        </text>
        <text x="596" y="96" textAnchor="middle" className="arch-sub">
          drafts + accepts
        </text>
        <text x="596" y="120" textAnchor="middle" className="arch-sub">
          signed ledger doc
        </text>

        <rect x="752" y="48" width="184" height="96" rx="10" fill="#102033" />
        <text x="844" y="88" textAnchor="middle" className="arch-title-inv">
          Builder
        </text>
        <text x="844" y="112" textAnchor="middle" className="arch-sub-inv">
          local terminal
        </text>

        <rect x="260" y="212" width="440" height="72" rx="10" fill="#f3f5f8" stroke="#c5ced8" />
        <text x="480" y="244" textAnchor="middle" className="arch-title">
          Room document: Said Ledger
        </text>
        <text x="480" y="266" textAnchor="middle" className="arch-sub">
          Ed25519-signed · only Said can write · console verifies in browser
        </text>

        <line x1="204" y1="96" x2="260" y2="96" stroke="#6a7b8c" strokeWidth="1.5" markerEnd="url(#arch-arrow)" />
        <line x1="440" y1="96" x2="496" y2="96" stroke="#6a7b8c" strokeWidth="1.5" markerEnd="url(#arch-arrow)" />
        <line x1="696" y1="96" x2="752" y2="96" stroke="#9b1d2e" strokeWidth="1.8" markerEnd="url(#arch-arrow)" />
        <line x1="596" y1="164" x2="596" y2="212" stroke="#6a7b8c" strokeWidth="1.5" markerEnd="url(#arch-arrow)" />
        <line x1="844" y1="144" x2="844" y2="248" stroke="#6a7b8c" strokeWidth="1.2" strokeDasharray="4 4" />
        <line x1="844" y1="248" x2="700" y2="248" stroke="#6a7b8c" strokeWidth="1.2" strokeDasharray="4 4" markerEnd="url(#arch-arrow)" />

        <text x="724" y="80" className="arch-tiny" fill="#9b1d2e">
          signed start
        </text>
        <text x="780" y="236" className="arch-tiny" fill="#6a7b8c">
          re-check ledger
        </text>
      </svg>
      <figcaption>
        Switch is load-bearing: participant ids, addressing refusals, the agent-owned document, and the targeted handoff
        all come from the platform. Said is the sign-off step sitting on top.
      </figcaption>
    </figure>
  );
}
