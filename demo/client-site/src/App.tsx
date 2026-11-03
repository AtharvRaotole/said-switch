import { useState, type FormEvent } from 'react';

interface OriginLot {
  lotNumber: string;
  name: string;
  region: string;
  country: string;
  process: string;
  cultivar: string;
  altitude: string;
  harvest: string;
  roastLevel: string;
  notes: string[];
  story: string;
}

interface PricingTier {
  id: string;
  name: string;
  price: string;
  cadenceLabel: string;
  weightSummary: string;
  description: string;
  popular?: boolean;
  ctaLabel: string;
  features: string[];
}

interface FaqItem {
  question: string;
  answer: string;
}

const PARTNER_ROASTERS = [
  { name: 'FINCA EL INJERTO', location: 'Huehuetenango · Est. 1900' },
  { name: 'SUKE QUTO MILL', location: 'Guji Highlands · 2,150m' },
  { name: 'COOP KIANJOKOMA', location: 'Embu Slopes · Kenya' },
  { name: 'LA PALMA & EL TUCÁN', location: 'Zipacón · Colombia' },
  { name: 'MOUNT TOTUMO', location: 'Santa Ana · El Salvador' },
];

const HOW_IT_WORKS_STEPS = [
  {
    step: '01',
    phase: 'Selection & Calibration',
    title: 'Choose your bag cadence & brew method',
    description:
      'Tell us how you brew at home—V60, Chemex, AeroPress, or espresso—and how many cups your household pours each week. We ship whole bean by default or grind on our Mahlkönig EK43S minutes before sealing.',
    metric: 'Whole bean or custom burr setting',
  },
  {
    step: '02',
    phase: 'Tuesday Loring Roasts',
    title: 'Roasted to order in 12 kg micro-batches',
    description:
      'We never warehouse roasted inventory. Every Tuesday at 6:00 AM in Portland, we roast only the lots spoken for that week, logging bean-probe curves to preserve origin sweetness and clean acidity.',
    metric: 'Zero warehoused stock',
  },
  {
    step: '03',
    phase: 'Cooling Tray to Doorstep',
    title: 'Nitrogen-flushed and dispatched within 18 hours',
    description:
      'Bags are one-way valve sealed before evening courier pickup so your beans rest in transit and arrive at peak degassing—4 to 6 days off-roast—with a printed brew recipe card for that exact lot.',
    metric: 'Arrives 4–6 days off-roast',
  },
];

const FEATURED_ORIGINS: OriginLot[] = [
  {
    lotNumber: 'LOT № 042',
    name: 'Finquita La Loma',
    region: 'San Pedro Necta, Huehuetenango',
    country: 'Guatemala',
    process: 'Fully Washed · Spring Water',
    cultivar: 'Caturra & Pache',
    altitude: '1,880 MASL',
    harvest: 'Feb 2026',
    roastLevel: 'Light-Medium (Agtron 64)',
    notes: ['Brown Butter', 'Blood Orange', 'Toasted Almond'],
    story:
      'Fermented 28 hours in ceramic-tiled tanks and dried slowly on raised cedar beds under high-altitude canyon breezes.',
  },
  {
    lotNumber: 'LOT № 043',
    name: 'Worka Sakaro Station',
    region: 'Gedeb District, Gedeo Zone',
    country: 'Ethiopia',
    process: 'Anaerobic Natural · 72hr',
    cultivar: '74110 & 74112 Landraces',
    altitude: '2,140 MASL',
    harvest: 'Jan 2026',
    roastLevel: 'Filter Light (Agtron 68)',
    notes: ['Bergamot', 'White Peach', 'Wildflower Honey'],
    story:
      'Hand-sorted ripe purple cherries from 38 smallholder families, producing a silky, tea-like cup with lingering floral aromatics.',
  },
  {
    lotNumber: 'LOT № 044',
    name: 'El Mirador Pink Bourbon',
    region: 'Palestina, Southern Huila',
    country: 'Colombia',
    process: 'Semi-Washed · Thermal Shock',
    cultivar: 'Pink Bourbon',
    altitude: '1,960 MASL',
    harvest: 'Mar 2026',
    roastLevel: 'Omni Light (Agtron 65)',
    notes: ['Blackberry Jam', 'Panela Cane', 'Cacao Nib'],
    story:
      'Crisp tropical fruit clarity balanced by structured cane-sugar sweetness, versatile enough for both conical pour-overs and modern espresso.',
  },
];

const PRICING_TIERS: PricingTier[] = [
  {
    id: 'taster',
    name: 'Taster',
    price: '$18/mo',
    cadenceLabel: '1 × 250g bag monthly (~16 cups)',
    weightSummary: '250g single-origin release',
    description:
      'For solo morning rituals or weekend pour-over explorers looking to taste a new farm harvest every month.',
    ctaLabel: 'Choose Taster — $18/mo',
    features: [
      'One 250g single-origin bag roasted every first Tuesday',
      'Printed farm dossier, elevation profile & V60 recipe card',
      'Whole bean or precision burr grind for your brewer',
      'Skip, pause, or swap origins with one click anytime',
    ],
  },
  {
    id: 'regular',
    name: 'Regular',
    price: '$32/mo',
    cadenceLabel: '2 × 250g bags monthly (~32 cups)',
    weightSummary: '500g total · Two distinct origins',
    description:
      'Our signature household pairing: one washed classic alongside an adventurous seasonal natural or honey lot.',
    popular: true,
    ctaLabel: 'Start Regular — $32/mo',
    features: [
      'Two distinct 250g single-origin lots every month',
      'Free tracked priority shipping on every Tuesday dispatch',
      'Early access to micro-lot Pink Bourbon & Pacamara releases',
      'Detailed water-chemistry & extraction dial-in notes',
      'Pause, gift a box, or adjust delivery dates anytime',
    ],
  },
  {
    id: 'cafe',
    name: 'Café',
    price: '$58/mo',
    cadenceLabel: '4 × 250g bags monthly (~64 cups)',
    weightSummary: '1,000g total · Full seasonal flight',
    description:
      'Built for daily multi-cup households, home espresso bars, and design studios that never want the hopper empty.',
    ctaLabel: 'Choose Café — $58/mo',
    features: [
      'Four 250g bags (or split into bi-weekly 500g dispatches)',
      'Includes quarterly Reserve Geisha & competition auction lots',
      'Complimentary expedited 2-day courier delivery',
      'Direct SMS roast-day alerts & barista dial-in support',
      '15% member discount on add-on cold brew & guest roasts',
    ],
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'When will my first bag actually be roasted and shipped?',
    answer:
      'We roast every Tuesday starting at 6:00 AM Pacific. Orders placed before Monday at 8:00 PM join that week’s roast log and ship out Wednesday morning via USPS Priority or UPS Ground, arriving 4 to 6 days off-roast—right as the coffee hits its peak flavor window.',
  },
  {
    question: 'Can I pause a shipment when I travel or have extra beans left over?',
    answer:
      'Yes, instantaneously. You receive a reminder email every Friday before Tuesday roast day with a one-click link to skip a week, push your date back, or gift that shipment to a friend’s address—no support tickets required.',
  },
  {
    question: 'How light do you roast, and will these coffees work for espresso?',
    answer:
      'We roast in a Nordic-inspired light-to-medium style (Agtron 63–68) that develops full caramelization inside the bean without scorching out delicate floral and stone-fruit aromatics. Our Regular and Café plans always include at least one soluble, higher-body lot calibrated to pull syrupy modern espresso.',
  },
  {
    question: 'How much are farmers paid compared to commodity C-market prices?',
    answer:
      'Every bag includes our transparent Farm Gate Ledger. In 2025–2026 we paid an average of $4.85/lb FOB directly to our producing partners and co-ops—more than double the Fair Trade minimum—on multi-year forward contracts.',
  },
  {
    question: 'Should I order whole bean or pre-ground?',
    answer:
      'If you own a burr grinder, we always recommend whole bean. If you don’t, select your brewer (V60, Kalita Wave, AeroPress, French Press, or Espresso) at checkout and we will grind your bag on our Mahlkönig EK43S less than ten minutes before nitrogen-flushing and heat-sealing.',
  },
];

function CheckIcon() {
  return (
    <svg
      className="check-icon"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="10"
        cy="10"
        r="9"
        fill="var(--color-accent-soft)"
        stroke="var(--color-accent)"
        strokeWidth="1.25"
      />
      <path
        d="M6.2 10.3L8.8 12.8L13.8 7.5"
        stroke="var(--color-accent)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CoffeeHeroIllustration() {
  return (
    <svg
      className="hero-svg"
      viewBox="0 0 460 420"
      fill="none"
      role="img"
      aria-labelledby="hero-illustration-title hero-illustration-desc"
    >
      <title id="hero-illustration-title">
        Larkspur Coffee Co. freshly roasted valve bag and steaming ceramic pour-over cup
      </title>
      <desc id="hero-illustration-desc">
        An illustrated kraft coffee bag stamped Lot 042 Huehuetenango beside a stoneware cup with rising warm steam wisps and whole roasted coffee beans.
      </desc>

      {/* Subtle architectural background arch & measuring grid */}
      <rect
        x="24"
        y="20"
        width="412"
        height="376"
        rx="20"
        fill="var(--color-surface-alt)"
        stroke="var(--color-border)"
        strokeWidth="1.5"
      />
      <path
        d="M72 340 H388"
        stroke="var(--color-border-strong)"
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
      <circle
        cx="236"
        cy="192"
        r="128"
        fill="var(--color-surface)"
        stroke="var(--color-border)"
        strokeWidth="1.25"
      />

      {/* Ground shadow under bag and cup */}
      <ellipse
        cx="228"
        cy="342"
        rx="136"
        ry="14"
        fill="var(--color-illustration-shadow)"
      />

      {/* Kraft Gusseted Coffee Bag */}
      <g className="illustration-bag">
        {/* Side gusset shadow */}
        <path
          d="M112 108 L130 92 L254 92 L268 108 L260 334 L106 334 Z"
          fill="var(--color-illustration-bag-side)"
          stroke="var(--color-text)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Front face of coffee bag */}
        <path
          d="M104 110 C104 104 108 100 114 100 H246 C252 100 256 104 256 110 L262 330 C262 335 258 338 253 338 H107 C102 338 98 335 98 330 L104 110 Z"
          fill="var(--color-illustration-bag)"
          stroke="var(--color-text)"
          strokeWidth="2"
        />
        {/* Top tin-tie crimp fold */}
        <rect
          x="100"
          y="88"
          width="160"
          height="16"
          rx="4"
          fill="var(--color-illustration-crimp)"
          stroke="var(--color-text)"
          strokeWidth="2"
        />
        <line
          x1="112"
          y1="96"
          x2="248"
          y2="96"
          stroke="var(--color-text)"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />

        {/* One-way degassing valve */}
        <circle
          cx="180"
          cy="128"
          r="9"
          fill="var(--color-surface)"
          stroke="var(--color-text)"
          strokeWidth="1.5"
        />
        <circle cx="180" cy="128" r="2.2" fill="var(--color-accent)" />
        <circle cx="176" cy="128" r="1.2" fill="var(--color-text-muted)" />
        <circle cx="184" cy="128" r="1.2" fill="var(--color-text-muted)" />

        {/* Apothecary Stamped Lot Label on Bag */}
        <rect
          x="118"
          y="150"
          width="124"
          height="156"
          rx="6"
          fill="var(--color-illustration-label)"
          stroke="var(--color-text)"
          strokeWidth="1.75"
        />
        {/* Terracotta top band on label */}
        <path
          d="M119 156 C119 152.5 121.5 151 124 151 H236 C238.5 151 241 152.5 241 156 V176 H119 V156 Z"
          fill="var(--color-accent)"
        />
        <text
          x="180"
          y="167"
          textAnchor="middle"
          fill="var(--color-accent-contrast)"
          fontSize="9"
          fontWeight="700"
          letterSpacing="1.6"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          LOT № 042 · WASHED
        </text>
        <text
          x="180"
          y="201"
          textAnchor="middle"
          fill="var(--color-text)"
          fontSize="15"
          fontWeight="700"
          fontFamily="Georgia, serif"
        >
          LARKSPUR
        </text>
        <text
          x="180"
          y="217"
          textAnchor="middle"
          fill="var(--color-text-muted)"
          fontSize="9.5"
          letterSpacing="1.2"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          HUEHUETENANGO
        </text>
        <line
          x1="134"
          y1="229"
          x2="226"
          y2="229"
          stroke="var(--color-border-strong)"
          strokeWidth="1.2"
        />
        {/* Tasting bar meters inside bag label */}
        <rect
          x="134"
          y="240"
          width="58"
          height="6"
          rx="3"
          fill="var(--color-accent)"
        />
        <rect
          x="196"
          y="240"
          width="30"
          height="6"
          rx="3"
          fill="var(--color-surface-alt)"
        />
        <rect
          x="134"
          y="254"
          width="74"
          height="6"
          rx="3"
          fill="var(--color-illustration-crema)"
        />
        <rect
          x="212"
          y="254"
          width="14"
          height="6"
          rx="3"
          fill="var(--color-surface-alt)"
        />
        <text
          x="180"
          y="284"
          textAnchor="middle"
          fill="var(--color-text)"
          fontSize="8.5"
          fontWeight="600"
          letterSpacing="0.8"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          1,880 MASL · 250G NET
        </text>
      </g>

      {/* Rising Steam Wisps above Ceramic Cup */}
      <g className="steam-group">
        <path
          className="steam-wisp steam-wisp-1"
          d="M312 198 C298 176 326 154 312 130 C300 110 318 92 314 74"
          stroke="var(--color-accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          className="steam-wisp steam-wisp-2"
          d="M338 190 C326 166 354 144 340 118 C328 96 346 80 342 62"
          stroke="var(--color-illustration-crema)"
          strokeWidth="2.25"
          strokeLinecap="round"
        />
        <path
          className="steam-wisp steam-wisp-3"
          d="M364 198 C354 178 376 160 364 138"
          stroke="var(--color-text-muted)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>

      {/* Hand-thrown Stoneware Cup & Saucer */}
      <g className="illustration-cup">
        {/* Saucer */}
        <path
          d="M266 330 H406 C402 341 386 346 336 346 C286 346 270 341 266 330 Z"
          fill="var(--color-illustration-bag)"
          stroke="var(--color-text)"
          strokeWidth="2"
        />
        {/* Cup Handle */}
        <path
          d="M384 242 H402 C415 242 424 252 424 266 C424 280 415 290 402 290 H380"
          fill="none"
          stroke="var(--color-text)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M384 242 H402 C415 242 424 252 424 266 C424 280 415 290 402 290 H380"
          fill="none"
          stroke="var(--color-illustration-label)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Cup Body */}
        <path
          d="M278 222 H394 L384 304 C381 320 367 330 348 330 H324 C305 330 291 320 288 304 L278 222 Z"
          fill="var(--color-illustration-label)"
          stroke="var(--color-text)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Terracotta stoneware glaze dip base */}
        <path
          d="M286 292 H386 L384 304 C381 320 367 330 348 330 H324 C305 330 291 320 288 304 L286 292 Z"
          fill="var(--color-accent)"
          stroke="var(--color-text)"
          strokeWidth="2"
        />
        {/* Top Coffee Surface & Crema Rim */}
        <ellipse
          cx="336"
          cy="222"
          rx="58"
          ry="13"
          fill="var(--color-illustration-roast)"
          stroke="var(--color-text)"
          strokeWidth="2"
        />
        <ellipse
          cx="336"
          cy="222"
          rx="46"
          ry="8"
          fill="var(--color-illustration-crema)"
        />
        <path
          d="M312 222 C322 218 346 218 358 223"
          stroke="var(--color-illustration-label)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>

      {/* Whole Roasted Coffee Beans in Foreground */}
      <g className="illustration-beans">
        <g transform="translate(78 326) rotate(-22)">
          <ellipse
            cx="14"
            cy="9"
            rx="13"
            ry="8.5"
            fill="var(--color-illustration-roast)"
            stroke="var(--color-text)"
            strokeWidth="1.75"
          />
          <path
            d="M4 9 C9 6 19 12 24 9"
            stroke="var(--color-illustration-crema)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </g>
        <g transform="translate(242 332) rotate(16)">
          <ellipse
            cx="13"
            cy="8"
            rx="12"
            ry="7.5"
            fill="var(--color-illustration-roast)"
            stroke="var(--color-text)"
            strokeWidth="1.75"
          />
          <path
            d="M4 8 C8 5 18 11 22 8"
            stroke="var(--color-illustration-crema)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </g>
      </g>
    </svg>
  );
}

function StickyNav() {
  return (
    <header className="site-header">
      <div className="container nav-inner">
        <a href="#top" className="brand-wordmark" aria-label="Larkspur Coffee Co. home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 28 28" fill="none">
              <rect
                x="1.5"
                y="1.5"
                width="25"
                height="25"
                rx="7"
                fill="var(--color-accent)"
                stroke="var(--color-text)"
                strokeWidth="1.5"
              />
              <path
                d="M14 5.5C10.2 8.6 9 12.6 10.6 16.5C11.8 19.5 13.5 21.2 14 22.8C14.5 21.2 16.2 19.5 17.4 16.5C19 12.6 17.8 8.6 14 5.5Z"
                fill="var(--color-accent-contrast)"
              />
              <path
                d="M14 7.5C13.2 11.8 13.2 16.5 14 21"
                stroke="var(--color-accent)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="brand-text">
            <span className="brand-name">Larkspur Coffee Co.</span>
            <span className="brand-sub">Portland · Micro-Lot Roasters</span>
          </span>
        </a>

        <nav className="primary-nav" aria-label="Primary navigation">
          <a href="#how-it-works" className="nav-link">
            How it works
          </a>
          <a href="#origins" className="nav-link">
            Current lots
          </a>
          <a href="#pricing" className="nav-link">
            Pricing
          </a>
          <a href="#faq" className="nav-link">
            FAQ
          </a>
        </nav>

        <div className="nav-actions">
          {/* Theme toggle slot */}
          <a href="#pricing" className="btn btn-primary btn-nav">
            Start subscription
          </a>
        </div>
      </div>
    </header>
  );
}

function HeroSection() {
  return (
    <section id="top" className="hero-section">
      <div className="container hero-grid">
        <div className="hero-copy">
          <div className="roast-dispatch-pill">
            <span className="status-dot" aria-hidden="true" />
            <span>NEXT ROAST LOG: TUESDAY 06:00 PST · 42 BAGS REMAINING</span>
          </div>

          <h1 className="hero-headline">
            Single-origin coffee roasted on Tuesday, on your counter by Friday.
          </h1>

          <p className="hero-subcopy">
            We source high-elevation micro-lots directly from partner mills in
            Guatemala, Ethiopia, and Colombia, roast them to order in 12 kg
            batches, and dispatch within 18 hours of the cooling tray.
          </p>

          <div className="hero-cta-group">
            <a href="#pricing" className="btn btn-primary btn-lg">
              Start subscription
            </a>
            <a href="#origins" className="btn btn-secondary btn-lg">
              Explore this week’s lots
            </a>
          </div>

          <dl className="hero-ledger" aria-label="Roastery guarantees">
            <div className="ledger-item">
              <dt>Roast-to-ship window</dt>
              <dd>&lt; 18 hours</dd>
            </div>
            <div className="ledger-item">
              <dt>Farm-gate premium</dt>
              <dd>$4.85 / lb avg FOB</dd>
            </div>
            <div className="ledger-item">
              <dt>Cupping score floor</dt>
              <dd>87.5+ SCA points</dd>
            </div>
          </dl>
        </div>

        <div className="hero-visual-card">
          <div className="visual-card-header">
            <span className="mono-tag">DISPATCH SPECIMEN · SPRING HARVEST</span>
            <span className="mono-tag accent-tag">AGTRON 65 · LIGHT</span>
          </div>
          <CoffeeHeroIllustration />
          <div className="visual-card-footer">
            <div>
              <p className="visual-lot-title">Finquita La Loma · Washed Caturra</p>
              <p className="visual-lot-sub">
                Notes of brown butter, blood orange zest, and toasted marcona almond
              </p>
            </div>
            <span className="visual-price-badge">From $18/mo</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustStrip() {
  return (
    <section className="trust-strip" aria-label="Partner mills and estates">
      <div className="container trust-inner">
        <p className="trust-eyebrow">
          DIRECT-TRADE HARVEST CONTRACTS WITH INDEPENDENT PARTNER MILLS
        </p>
        <ul className="trust-logos">
          {PARTNER_ROASTERS.map((partner) => (
            <li key={partner.name} className="trust-logo-item">
              <span className="partner-wordmark">{partner.name}</span>
              <span className="partner-meta">{partner.location}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="section how-section">
      <div className="container">
        <div className="section-header">
          <p className="section-eyebrow">FROM MILL TO MORNING POUR</p>
          <h2 className="section-title">How it works</h2>
          <p className="section-subtitle">
            Supermarket coffee sits in distribution warehouses for four months.
            Larkspur operates on a strict weekly roast clock so every bag reaches
            your grinder at peak aromatics.
          </p>
        </div>

        <div className="steps-grid">
          {HOW_IT_WORKS_STEPS.map((item) => (
            <article key={item.step} className="step-card">
              <div className="step-top">
                <span className="step-number">{item.step}</span>
                <span className="step-phase">{item.phase}</span>
              </div>
              <h3 className="step-title">{item.title}</h3>
              <p className="step-description">{item.description}</p>
              <p className="step-metric">{item.metric}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturedOriginsSection() {
  return (
    <section id="origins" className="section origins-section">
      <div className="container">
        <div className="section-header">
          <p className="section-eyebrow">CURRENT TUESDAY ROAST MENU</p>
          <h2 className="section-title">Featured single-origin lots</h2>
          <p className="section-subtitle">
            Each shipment rotates through freshly landed seasonal harvests. Here
            are the three lots on our Loring S15 Falcon roaster this month.
          </p>
        </div>

        <div className="origins-grid">
          {FEATURED_ORIGINS.map((lot) => (
            <article key={lot.lotNumber} className="origin-card">
              <div className="origin-card-meta">
                <span className="lot-pill">{lot.lotNumber}</span>
                <span className="altitude-pill">{lot.altitude}</span>
              </div>

              <p className="origin-country">
                {lot.country} · {lot.region}
              </p>
              <h3 className="origin-name">{lot.name}</h3>
              <p className="origin-story">{lot.story}</p>

              <div className="tasting-notes" aria-label="Tasting notes">
                {lot.notes.map((note) => (
                  <span key={note} className="tasting-chip">
                    {note}
                  </span>
                ))}
              </div>

              <dl className="origin-specs">
                <div>
                  <dt>Process</dt>
                  <dd>{lot.process}</dd>
                </div>
                <div>
                  <dt>Cultivar</dt>
                  <dd>{lot.cultivar}</dd>
                </div>
                <div>
                  <dt>Roast profile</dt>
                  <dd>{lot.roastLevel}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  const [selectedGrind, setSelectedGrind] = useState<string>('Whole Bean');
  const [selectedTier, setSelectedTier] = useState<string>('regular');

  const grindOptions = ['Whole Bean', 'Pour-Over (V60 / Chemex)', 'Espresso Fine'];

  return (
    <section id="pricing" className="section pricing-section">
      <div className="container">
        <div className="section-header">
          <p className="section-eyebrow">SIMPLE MONTHLY CADENCE</p>
          <h2 className="section-title">Transparent roast subscriptions</h2>
          <p className="section-subtitle">
            Every tier includes traceable single-origin lots, printed brew
            recipes, and zero lock-in. Skip a month or cancel in two clicks.
          </p>

          <div
            className="grind-selector"
            role="group"
            aria-label="Select your preferred grind preparation"
          >
            <span className="grind-label">Preparation:</span>
            <div className="grind-pills">
              {grindOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={
                    selectedGrind === option
                      ? 'grind-pill grind-pill-active'
                      : 'grind-pill'
                  }
                  aria-pressed={selectedGrind === option}
                  onClick={() => setSelectedGrind(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pricing-grid">
          {PRICING_TIERS.map((tier) => {
            const isSelected = selectedTier === tier.id;
            return (
              <article
                key={tier.id}
                className={
                  tier.popular
                    ? 'pricing-card pricing-card-popular'
                    : 'pricing-card'
                }
                aria-label={`${tier.name} subscription tier`}
              >
                {tier.popular && (
                  <div className="popular-badge">Most popular</div>
                )}

                <div className="pricing-card-head">
                  <h3 className="pricing-tier-name">{tier.name}</h3>
                  <div className="pricing-price-row">
                    <span className="pricing-price">{tier.price}</span>
                  </div>
                  <p className="pricing-cadence">{tier.cadenceLabel}</p>
                </div>

                <p className="pricing-description">{tier.description}</p>

                <ul className="pricing-features">
                  {tier.features.map((feature) => (
                    <li key={feature} className="pricing-feature-item">
                      <CheckIcon />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="pricing-card-foot">
                  <button
                    type="button"
                    className={
                      tier.popular || isSelected
                        ? 'btn btn-primary btn-block'
                        : 'btn btn-secondary btn-block'
                    }
                    onClick={() => setSelectedTier(tier.id)}
                  >
                    {tier.ctaLabel}
                  </button>
                  <p className="pricing-prep-note">
                    Ships as <strong>{selectedGrind}</strong> · Cancel anytime
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TestimonialSection() {
  return (
    <section className="section testimonial-section" aria-label="Subscriber reviews">
      <div className="container">
        <div className="testimonial-banner">
          <div className="testimonial-main">
            <p className="section-eyebrow">IN THE CUP</p>
            <blockquote className="testimonial-quote">
              “I used to bounce between three local cafés trying to find bags
              roasted within the last two weeks. Larkspur’s Tuesday roast clock
              changed my mornings—every V60 blooms like crazy, and the printed
              ratio card means I never waste half a bag dialing in.”
            </blockquote>
            <div className="testimonial-author">
              <div className="author-avatar" aria-hidden="true">
                MR
              </div>
              <div>
                <p className="author-name">Maya R. — Architectural Designer, Seattle</p>
                <p className="author-meta">
                  Regular Plan subscriber (14 months) · Brews on Hario V60 02
                </p>
              </div>
            </div>
          </div>

          <div className="testimonial-side-cards">
            <article className="mini-review">
              <p className="mini-review-text">
                “The Worka Sakaro natural smelled like jasmine and ripe peach
                the second I opened the mailer. Easily rivals $28 boutique café
                boxes.”
              </p>
              <p className="mini-review-byline">
                — Jonas K., Chicago · Café Plan
              </p>
            </article>
            <article className="mini-review">
              <p className="mini-review-text">
                “Being able to skip a shipment from the Friday reminder email
                without logging into a clunky portal is how every subscription
                should work.”
              </p>
              <p className="mini-review-byline">
                — Elena V., Austin · Regular Plan
              </p>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section id="faq" className="section faq-section">
      <div className="container faq-container">
        <div className="section-header">
          <p className="section-eyebrow">QUESTIONS & PROVENANCE</p>
          <h2 className="section-title">Frequently asked questions</h2>
          <p className="section-subtitle">
            Everything you need to know about our Tuesday roast schedule, grind
            calibration, and direct-trade sourcing.
          </p>
        </div>

        <div className="faq-list">
          {FAQ_ITEMS.map((item, idx) => (
            <details
              key={item.question}
              className="faq-item"
              open={idx === 0}
            >
              <summary className="faq-summary">
                <span>{item.question}</span>
                <span className="faq-indicator" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="faq-answer">
                <p>{item.answer}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function NewsletterSection() {
  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setSubmittedEmail(trimmed);
    setEmail('');
  };

  return (
    <section className="section newsletter-section" aria-labelledby="newsletter-heading">
      <div className="container">
        <div className="newsletter-card">
          <div className="newsletter-copy">
            <p className="section-eyebrow">FIELD DISPATCH & CUPPING LOG</p>
            <h2 id="newsletter-heading" className="newsletter-title">
              Receive the Tuesday Roast Dispatch
            </h2>
            <p className="newsletter-description">
              One concise letter every Tuesday morning with harvest arrival
              notes, water-mineral targets, and early reservations on 30-bag
              micro-lots. Never shared, unsubscribed in one click.
            </p>
          </div>

          <div className="newsletter-form-wrap">
            <form className="newsletter-form" onSubmit={handleSubmit}>
              <label htmlFor="newsletter-email" className="sr-only">
                Email address
              </label>
              <input
                id="newsletter-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="newsletter-input"
                autoComplete="email"
              />
              <button type="submit" className="btn btn-primary">
                Join the dispatch
              </button>
            </form>
            {submittedEmail ? (
              <p className="newsletter-feedback" role="status">
                You’re on the list ({submittedEmail}). Look for Lot № 045 notes
                this Tuesday at 6:00 AM PST.
              </p>
            ) : (
              <p className="newsletter-fineprint">
                Sent Tuesdays at 06:00 PST · Includes a $6 credit toward your
                first tasting box.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <p className="footer-title">Larkspur Coffee Co.</p>
          <p className="footer-blurb">
            Small-batch single-origin coffee roasted every Tuesday on SE
            Alder Street in Portland, Oregon. Traceable to the farm gate.
          </p>
          <p className="footer-address">
            842 SE Alder St, Suite B · Portland, OR 97214
          </p>
        </div>

        <div className="footer-col">
          <h3 className="footer-heading">Subscription</h3>
          <ul className="footer-links">
            <li>
              <a href="#how-it-works">How Tuesday roasting works</a>
            </li>
            <li>
              <a href="#origins">Current single-origin menu</a>
            </li>
            <li>
              <a href="#pricing">Taster, Regular & Café plans</a>
            </li>
            <li>
              <a href="#faq">Grind & shipping FAQ</a>
            </li>
          </ul>
        </div>

        <div className="footer-col">
          <h3 className="footer-heading">Transparency</h3>
          <ul className="footer-links">
            <li>
              <a href="#origins">2026 Farm Gate Price Ledger</a>
            </li>
            <li>
              <a href="#how-it-works">Loring S15 roast telemetry</a>
            </li>
            <li>
              <a href="#faq">Compostable valve packaging</a>
            </li>
          </ul>
        </div>

        <div className="footer-col">
          <h3 className="footer-heading">Roastery Hours</h3>
          <p className="footer-schedule">
            <strong>Production Roast:</strong> Tue 06:00–14:00 PST
          </p>
          <p className="footer-schedule">
            <strong>Public Cupping Table:</strong> Fri 10:00–12:00 PST
          </p>
          <p className="footer-schedule">
            <strong>Dispatch Inquiries:</strong> hello@larkspurcoffee.co
          </p>
        </div>
      </div>

      <div className="container footer-bottom">
        <p>© 2026 Larkspur Coffee Co. All rights reserved.</p>
        <p>100% Specialty Arabica · Certified B-Corp Roastery</p>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="page-shell">
      <StickyNav />
      <main>
        <HeroSection />
        <TrustStrip />
        <HowItWorksSection />
        <FeaturedOriginsSection />
        <PricingSection />
        <TestimonialSection />
        <FaqSection />
        <NewsletterSection />
      </main>
      <SiteFooter />
    </div>
  );
}
