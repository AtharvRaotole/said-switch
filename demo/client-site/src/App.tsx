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
  { name: 'FINCA EL INJERTO', location: 'Huehuetenango, since 1900' },
  { name: 'SUKE QUTO MILL', location: 'Guji Highlands, 2,150 m' },
  { name: 'COOP KIANJOKOMA', location: 'Embu slopes, Kenya' },
  { name: 'LA PALMA & EL TUCÁN', location: 'Zipacón, Colombia' },
  { name: 'MOUNT TOTUMO', location: 'Santa Ana, El Salvador' },
];

const HOW_IT_WORKS_STEPS = [
  {
    step: '01',
    phase: 'You choose',
    title: 'Tell us how you brew',
    description:
      'Tell us how you make coffee at home, like a V60, Chemex, AeroPress, or espresso, and how many cups you drink each week. We ship whole beans, or we grind them for your brewer a few minutes before we seal the bag.',
    metric: 'Whole bean, or ground for your brewer',
  },
  {
    step: '02',
    phase: 'We roast',
    title: 'Tuesday morning in Portland',
    description:
      'We do not keep roasted coffee on a shelf. Every Tuesday at 6:00 AM we roast only the bags people ordered, in 12 kilogram batches, so it still tastes like the farm.',
    metric: 'Roasted only after you order',
  },
  {
    step: '03',
    phase: 'We ship',
    title: 'Out the door within 18 hours',
    description:
      'We seal each bag before the evening pickup. The coffee rests on the way to you and arrives 4 to 6 days after roasting, with a recipe card for that exact lot.',
    metric: 'Arrives 4 to 6 days after roasting',
  },
];

const FEATURED_ORIGINS: OriginLot[] = [
  {
    lotNumber: 'Lot 042',
    name: 'Finquita La Loma',
    region: 'San Pedro Necta, Huehuetenango',
    country: 'Guatemala',
    process: 'Washed in spring water',
    cultivar: 'Caturra and Pache',
    altitude: '1,880 m',
    harvest: 'Feb 2026',
    roastLevel: 'Light-medium',
    notes: ['Brown butter', 'Blood orange', 'Toasted almond'],
    story:
      'The fruit sat in water for 28 hours, then dried slowly on raised beds in a cool canyon wind.',
  },
  {
    lotNumber: 'Lot 043',
    name: 'Worka Sakaro Station',
    region: 'Gedeb, Gedeo Zone',
    country: 'Ethiopia',
    process: 'Natural, sealed for 72 hours',
    cultivar: '74110 and 74112',
    altitude: '2,140 m',
    harvest: 'Jan 2026',
    roastLevel: 'Light, for filter',
    notes: ['Bergamot', 'White peach', 'Wildflower honey'],
    story:
      'Thirty-eight families hand-sorted the ripest cherries. The cup is silky and tea-like, and it stays floral after you swallow.',
  },
  {
    lotNumber: 'Lot 044',
    name: 'El Mirador Pink Bourbon',
    region: 'Palestina, southern Huila',
    country: 'Colombia',
    process: 'Semi-washed, thermal shock',
    cultivar: 'Pink Bourbon',
    altitude: '1,960 m',
    harvest: 'Mar 2026',
    roastLevel: 'Light, for filter or espresso',
    notes: ['Blackberry jam', 'Cane sugar', 'Cacao nib'],
    story:
      'Bright fruit up front, then a steady cane-sugar sweetness. It works in a pour-over and as espresso.',
  },
];

const PRICING_TIERS: PricingTier[] = [
  {
    id: 'taster',
    name: 'Taster',
    price: '$18/mo',
    cadenceLabel: 'One 250 g bag a month, about 16 cups',
    weightSummary: '250 g of one origin',
    description:
      'For one person, or for weekends when you want to taste a new farm.',
    ctaLabel: 'Choose Taster, $18/mo',
    features: [
      'One 250 g bag, roasted the first Tuesday of the month',
      'A card about the farm, the elevation, and a pour-over recipe',
      'Whole bean, or ground for your brewer',
      'Skip, pause, or swap a coffee whenever you want',
    ],
  },
  {
    id: 'regular',
    name: 'Regular',
    price: '$32/mo',
    cadenceLabel: 'Two 250 g bags a month, about 32 cups',
    weightSummary: '500 g, two different origins',
    description:
      'The household bag: one familiar washed coffee, and one more surprising lot.',
    popular: true,
    ctaLabel: 'Start Regular, $32/mo',
    features: [
      'Two different 250 g bags every month',
      'Free tracked shipping on every Tuesday order',
      'First chance at small Pink Bourbon and Pacamara lots',
      'Notes on water and how to brew that coffee',
      'Pause, gift a box, or change the date whenever you want',
    ],
  },
  {
    id: 'cafe',
    name: 'Cafe',
    price: '$58/mo',
    cadenceLabel: 'Four 250 g bags a month, about 64 cups',
    weightSummary: '1,000 g, a full month of coffees',
    description:
      'For a house that drinks coffee all day, or a studio that never wants the hopper empty.',
    ctaLabel: 'Choose Cafe, $58/mo',
    features: [
      'Four 250g bags, or two deliveries of 500g',
      'A rare lot each season, sometimes a Geisha',
      'Faster 2-day shipping',
      'A text on roast day, and help if a shot tastes off',
      '15% off extra bags',
    ],
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'When is my first bag roasted and shipped?',
    answer:
      'We roast every Tuesday starting at 6:00 AM Pacific. Order before Monday at 8:00 PM and you are in that week. The bag ships Wednesday morning and arrives 4 to 6 days after roasting, when the flavor is at its best.',
  },
  {
    question: 'Can I pause if I travel or still have beans?',
    answer:
      'Yes. Every Friday before roast day we email you a link. One click skips a week, moves the date, or sends that box to a friend. You do not have to call anyone.',
  },
  {
    question: 'How dark is the roast, and can I use it for espresso?',
    answer:
      'We roast light to medium. The coffee stays sweet, and you can still taste the fruit and flowers. Regular and Cafe plans always include one bag that works well for espresso.',
  },
  {
    question: 'How much are the farmers paid?',
    answer:
      'Every bag says what we paid. In 2025 and 2026 we paid farmers about $4.85 per pound, more than double the Fair Trade minimum, on contracts that last more than one year.',
  },
  {
    question: 'Should I order whole bean or pre-ground?',
    answer:
      'If you have a grinder, choose whole bean. If you do not, pick your brewer at checkout: V60, Kalita Wave, AeroPress, French press, or espresso. We grind the bag less than ten minutes before we seal it.',
  },
];

function CheckIcon() {
  return (
    <svg className="check-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
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

function LarkspurMark() {
  return (
    <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <path className="mark-stem" d="M18 33.5C18.3 26 17.7 16 18 4.5" />
      <ellipse className="mark-bud" cx="18" cy="3.6" rx="2.2" ry="3.1" />
      <ellipse
        className="mark-petal"
        cx="24.6"
        cy="9.2"
        rx="4.3"
        ry="2.5"
        transform="rotate(-32 24.6 9.2)"
      />
      <ellipse
        className="mark-petal-deep"
        cx="11.2"
        cy="13.8"
        rx="4.1"
        ry="2.4"
        transform="rotate(30 11.2 13.8)"
      />
      <ellipse
        className="mark-petal"
        cx="25"
        cy="18.6"
        rx="4.5"
        ry="2.6"
        transform="rotate(-26 25 18.6)"
      />
      <ellipse
        className="mark-petal-deep"
        cx="11"
        cy="23.2"
        rx="4.2"
        ry="2.5"
        transform="rotate(26 11 23.2)"
      />
      <ellipse
        className="mark-petal"
        cx="23.8"
        cy="27.6"
        rx="3.7"
        ry="2.2"
        transform="rotate(-22 23.8 27.6)"
      />
    </svg>
  );
}

function Floret({
  x,
  y,
  scale = 1,
  flip = false,
  variant = 'a',
}: {
  x: number;
  y: number;
  scale?: number;
  flip?: boolean;
  variant?: 'a' | 'b' | 'c';
}) {
  const sx = flip ? -scale : scale;
  return (
    <g className={`floret floret-${variant}`} transform={`translate(${x} ${y}) scale(${sx} ${scale})`}>
      <path className="floret-spur" d="M1 4 C 14 -7, 26 -2, 32 6" />
      <ellipse className="floret-petal-a" cx="48" cy="-3" rx="16" ry="10" transform="rotate(-28 48 -3)" />
      <ellipse className="floret-petal-b" cx="46" cy="12" rx="14" ry="9" transform="rotate(22 46 12)" />
      <ellipse className="floret-petal-c" cx="38" cy="4" rx="11" ry="9" />
      <circle className="floret-eye" cx="40" cy="3" r="2.5" />
    </g>
  );
}

function Leaf({
  x,
  y,
  flip = false,
  scale = 1,
}: {
  x: number;
  y: number;
  flip?: boolean;
  scale?: number;
}) {
  const sx = flip ? -scale : scale;
  return (
    <g transform={`translate(${x} ${y}) scale(${sx} ${scale})`}>
      <path className="leaf-blade" d="M0 6 C -26 0, -58 -14, -80 -36 C -48 -16, -20 -2, 0 8 Z" />
      <path className="leaf-vein" d="M-2 6 C -28 0, -56 -12, -74 -28" />
    </g>
  );
}

function CoffeeHeroIllustration() {
  return (
    <svg
      className="hero-svg"
      viewBox="0 0 560 580"
      fill="none"
      role="img"
      aria-labelledby="larkspur-hero-title larkspur-hero-desc"
    >
      <title id="larkspur-hero-title">Larkspur spike beside a stoneware cup</title>
      <desc id="larkspur-hero-desc">
        A delphinium flower spike and a celadon cup with a cobalt rim, on a porcelain plate, with a tag for Lot 042 from Huehuetenango.
      </desc>

      <ellipse cx="318" cy="300" rx="208" ry="248" fill="var(--color-surface)" />
      <ellipse
        cx="318"
        cy="300"
        rx="208"
        ry="248"
        stroke="var(--color-border-strong)"
        strokeWidth="1.25"
      />
      <ellipse
        cx="318"
        cy="300"
        rx="190"
        ry="228"
        stroke="var(--color-border)"
        strokeWidth="1"
      />

      <ellipse cx="340" cy="518" rx="168" ry="12" fill="var(--color-illustration-shadow)" />

      <path
        d="M248 132 C 190 146, 96 162, 48 184"
        stroke="var(--color-text-muted)"
        strokeWidth="1.15"
      />
      <rect
        x="28"
        y="168"
        width="136"
        height="112"
        rx="2"
        fill="var(--color-illustration-label)"
        stroke="var(--color-text)"
        strokeWidth="1.4"
      />
      <circle
        cx="48"
        cy="184"
        r="5"
        fill="none"
        stroke="var(--color-illustration-crimp)"
        strokeWidth="1.6"
      />
      <circle cx="48" cy="184" r="1.8" fill="var(--color-illustration-crimp)" />
      <text className="tag-kicker" x="44" y="210">
        LOT 042
      </text>
      <text className="tag-name" x="44" y="236">
        La Loma
      </text>
      <text className="tag-meta" x="44" y="256">
        Washed Caturra
      </text>
      <text className="tag-meta" x="44" y="272">
        1,880 meters
      </text>

      <path className="spike-stem" d="M248 508 C 250 390, 246 250, 248 74" />
      <Leaf x={248} y={214} scale={0.95} />
      <Leaf x={248} y={332} scale={0.72} flip />

      <ellipse cx="248" cy="70" rx="8" ry="13" fill="var(--color-accent)" />
      <ellipse cx="248" cy="68" rx="3" ry="5.5" fill="var(--color-accent-soft)" />
      <Floret x={248} y={118} scale={0.62} variant="c" />
      <Floret x={248} y={172} scale={0.8} flip variant="b" />
      <Floret x={248} y={236} scale={0.98} variant="a" />
      <Floret x={248} y={304} scale={1.05} flip variant="a" />
      <Floret x={248} y={368} scale={0.78} variant="b" />

      <ellipse
        cx="412"
        cy="486"
        rx="84"
        ry="15"
        fill="var(--color-illustration-bag-side)"
        stroke="var(--color-text)"
        strokeWidth="1.5"
      />
      <path
        d="M354 412 H470 L458 470 C452 488 434 496 412 496 C390 496 372 488 366 470 Z"
        fill="var(--color-illustration-bag)"
        stroke="var(--color-text)"
        strokeWidth="1.6"
      />
      <path
        d="M354 412 H470 L466 434 H358 Z"
        fill="var(--color-accent)"
        stroke="var(--color-text)"
        strokeWidth="1.6"
      />
      <ellipse
        cx="412"
        cy="412"
        rx="58"
        ry="13"
        fill="var(--color-illustration-roast)"
        stroke="var(--color-text)"
        strokeWidth="1.6"
      />
      <ellipse cx="412" cy="410" rx="40" ry="7" fill="var(--color-illustration-crema)" />
      <path
        d="M470 428 C 506 426, 508 474, 466 482"
        stroke="var(--color-text)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M470 428 C 506 426, 508 474, 466 482"
        stroke="var(--color-illustration-bag)"
        strokeWidth="3.4"
        strokeLinecap="round"
      />

      <g className="steam-group">
        <path className="steam-wisp steam-wisp-1" d="M386 392 C 372 370, 400 350, 384 326 C 372 308, 392 292, 386 272" />
        <path className="steam-wisp steam-wisp-2" d="M412 388 C 426 364, 398 344, 414 320 C 426 302, 408 286, 416 266" />
        <path className="steam-wisp steam-wisp-3" d="M436 394 C 448 374, 430 358, 440 340" />
      </g>

      <g transform="translate(318 504) rotate(-20)">
        <ellipse
          cx="0"
          cy="0"
          rx="12"
          ry="7.5"
          fill="var(--color-illustration-roast)"
          stroke="var(--color-text)"
          strokeWidth="1.2"
        />
        <path
          d="M-8 0 C -2 -2.2, 5 2.2, 8 0"
          stroke="var(--color-illustration-crema)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </g>
      <g transform="translate(492 498) rotate(16)">
        <ellipse
          cx="0"
          cy="0"
          rx="10"
          ry="6.5"
          fill="var(--color-illustration-roast)"
          stroke="var(--color-text)"
          strokeWidth="1.2"
        />
        <path
          d="M-6 0 C -1 -2, 4 2, 7 0"
          stroke="var(--color-illustration-crema)"
          strokeWidth="1.15"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

function StickyNav() {
  return (
    <header className="site-header">
      <div className="container nav-inner">
        <a href="#top" className="brand-wordmark" aria-label="Larkspur Coffee Co. home">
          <span className="brand-mark">
            <LarkspurMark />
          </span>
          <span className="brand-text">
            <span className="brand-name">Larkspur</span>
            <span className="brand-sub">Coffee Co. · Portland</span>
          </span>
        </a>

        <nav className="primary-nav" aria-label="Primary">
          <a href="#how-it-works" className="nav-link">
            How it works
          </a>
          <a href="#origins" className="nav-link">
            Lots
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
            <span>Next roast: Tuesday, 6:00 AM Pacific. 42 bags left.</span>
          </div>

          <h1 className="hero-headline">
            <span className="hero-line">
              <span className="hero-break">Coffee roasted</span>
              <span className="hero-break">on Tuesday.</span>
            </span>
            <span className="hero-line hero-line-italic">
              <span className="hero-break">On your counter</span>
              <span className="hero-break">by Friday.</span>
            </span>
          </h1>

          <p className="hero-subcopy">
            Small lots from Guatemala, Ethiopia, and Colombia. We roast them in
            Portland only after you order, then ship within 18 hours.
          </p>

          <div className="hero-cta-group">
            <a href="#pricing" className="btn btn-primary btn-lg">
              Start a subscription
            </a>
            <a href="#origins" className="btn btn-secondary btn-lg">
              See this week&apos;s lots
            </a>
          </div>

          <dl className="hero-ledger" aria-label="Roastery promises">
            <div className="ledger-item">
              <dt>Roast to mailbox</dt>
              <dd>18 hours</dd>
            </div>
            <div className="ledger-item">
              <dt>Paid to farmers</dt>
              <dd>$4.85 / lb</dd>
            </div>
            <div className="ledger-item">
              <dt>Tasting score</dt>
              <dd>87.5 and up</dd>
            </div>
          </dl>
        </div>

        <div className="hero-visual">
          <CoffeeHeroIllustration />
          <div className="visual-caption">
            <div>
              <p className="visual-lot-title">Finquita La Loma</p>
              <p className="visual-lot-sub">
                Washed Caturra. Brown butter, blood orange zest, toasted almond.
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
    <section className="trust-strip" aria-label="Farms we buy from">
      <div className="container trust-inner">
        <p className="trust-eyebrow">Farms and mills we buy from directly</p>
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
      <div className="container how-layout">
        <div className="section-header">
          <p className="section-eyebrow">Three steps</p>
          <h2 className="section-title">How the Tuesday roast works</h2>
          <p className="section-subtitle">
            Supermarket coffee can sit in a warehouse for months. We roast on
            Tuesday and ship the same day, so the bag is still fresh when you
            open it.
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
          <p className="section-eyebrow">On the roaster this month</p>
          <h2 className="section-title">Three lots, three farms</h2>
          <p className="section-subtitle">
            Each box changes with the harvest. These are the coffees we are
            roasting in Portland right now. Every lot has a place, and a story.
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
                {lot.country}, {lot.region}
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
                  <dt>Variety</dt>
                  <dd>{lot.cultivar}</dd>
                </div>
                <div>
                  <dt>Roast</dt>
                  <dd>{lot.roastLevel}</dd>
                </div>
                <div>
                  <dt>Harvest</dt>
                  <dd>{lot.harvest}</dd>
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
  const [selectedGrind, setSelectedGrind] = useState<string>('Whole bean');
  const [selectedTier, setSelectedTier] = useState<string>('regular');

  const grindOptions = ['Whole bean', 'Pour-over', 'Espresso'];

  return (
    <section id="pricing" className="section pricing-section">
      <div className="container">
        <div className="section-header">
          <p className="section-eyebrow">Monthly, no lock-in</p>
          <h2 className="section-title">Pick how much coffee you drink</h2>
          <p className="section-subtitle">
            Every plan is single-origin coffee with a recipe card. Skip a month
            or cancel whenever you want. No phone call.
          </p>

          <div className="grind-selector" role="group" aria-label="How should we grind it?">
            <span className="grind-label">Grind</span>
            <div className="grind-pills">
              {grindOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={selectedGrind === option ? 'grind-pill grind-pill-active' : 'grind-pill'}
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
            const slash = tier.price.indexOf('/');
            const amount = slash === -1 ? tier.price : tier.price.slice(0, slash);
            const per = slash === -1 ? '' : `/${tier.price.slice(slash + 1)}`;
            return (
              <article
                key={tier.id}
                className={tier.popular ? 'pricing-card pricing-card-popular' : 'pricing-card'}
                aria-label={`${tier.name} subscription`}
                data-selected={isSelected}
              >
                <div className="pricing-card-head">
                  {tier.popular ? <p className="popular-flag">Household favorite</p> : null}
                  <h3 className="pricing-tier-name">{tier.name}</h3>
                  <div className="pricing-price-row">
                    <span className="pricing-price">{amount}</span>
                    {per ? <span className="pricing-per">{per}</span> : null}
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
                      tier.popular || isSelected ? 'btn btn-primary btn-block' : 'btn btn-secondary btn-block'
                    }
                    aria-pressed={isSelected}
                    onClick={() => setSelectedTier(tier.id)}
                  >
                    {tier.ctaLabel}
                  </button>
                  <p className="pricing-prep-note">
                    Ships as <strong>{selectedGrind}</strong>. Cancel anytime.
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
    <section className="section testimonial-section" aria-label="What subscribers say">
      <div className="container">
        <div className="testimonial-banner">
          <div className="testimonial-main">
            <p className="section-eyebrow">In the cup</p>
            <blockquote className="testimonial-quote">
              I used to check three cafes to find coffee roasted in the last two
              weeks. Larkspur roasts every Tuesday. The pour-over smells big and
              sweet, and the recipe card means I do not waste half a bag figuring
              it out.
            </blockquote>
            <div className="testimonial-author">
              <p className="author-name">Maya R.</p>
              <p className="author-meta">
                Architectural designer in Seattle. Regular plan for 14 months. Brews on a Hario V60.
              </p>
            </div>
          </div>

          <div className="testimonial-side-cards">
            <article className="mini-review">
              <p className="mini-review-text">
                The Worka Sakaro bag smelled like jasmine and ripe peach the
                second I opened the mail. It tastes as good as the $28 boxes
                from fancy cafes.
              </p>
              <p className="mini-review-byline">Jonas K., Chicago, Cafe plan</p>
            </article>
            <article className="mini-review">
              <p className="mini-review-text">
                I can skip a shipment from the Friday email. I do not have to
                log into a clunky website. That is how a subscription should
                work.
              </p>
              <p className="mini-review-byline">Elena V., Austin, Regular plan</p>
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
          <p className="section-eyebrow">Questions</p>
          <h2 className="section-title">Before you subscribe</h2>
          <p className="section-subtitle">
            Roast day, grind, shipping, and what the farmers are paid.
          </p>
        </div>

        <div className="faq-list">
          {FAQ_ITEMS.map((item, idx) => (
            <details key={item.question} className="faq-item" open={idx === 0}>
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
        <div className="newsletter-layout">
          <div className="newsletter-copy">
            <p className="section-eyebrow">Tuesday letter</p>
            <h2 id="newsletter-heading" className="newsletter-title">
              A short note on roast morning
            </h2>
            <p className="newsletter-description">
              Which farms arrived, how to brew them, and first chance at lots we
              only have 30 bags of. We never share your email. Unsubscribe in
              one click.
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
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@domain.com"
                className="newsletter-input"
                autoComplete="email"
              />
              <button type="submit" className="btn btn-primary">
                Send me the letter
              </button>
            </form>
            {submittedEmail ? (
              <p className="newsletter-feedback" role="status">
                You are on the list ({submittedEmail}). Look for Lot 045 notes
                this Tuesday at 6:00 AM Pacific.
              </p>
            ) : (
              <p className="newsletter-fineprint">
                Tuesdays at 6:00 AM Pacific. Includes $6 toward your first box.
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
          <p className="footer-title">
            <em>Larkspur</em> Coffee Co.
          </p>
          <p className="footer-blurb">
            Small-batch coffee roasted every Tuesday on SE Alder Street in
            Portland, Oregon. You can trace every bag back to the farm.
          </p>
          <p className="footer-address">842 SE Alder St, Suite B, Portland, OR 97214</p>
        </div>

        <div className="footer-col">
          <h3 className="footer-heading">Subscription</h3>
          <ul className="footer-links">
            <li>
              <a href="#how-it-works">How Tuesday roasting works</a>
            </li>
            <li>
              <a href="#origins">This month&apos;s lots</a>
            </li>
            <li>
              <a href="#pricing">Taster, Regular, and Cafe</a>
            </li>
            <li>
              <a href="#faq">Grind and shipping</a>
            </li>
          </ul>
        </div>

        <div className="footer-col">
          <h3 className="footer-heading">Transparency</h3>
          <ul className="footer-links">
            <li>
              <a href="#origins">2026 farm price list</a>
            </li>
            <li>
              <a href="#how-it-works">Tuesday roast log</a>
            </li>
            <li>
              <a href="#faq">Valve bags you can compost</a>
            </li>
          </ul>
        </div>

        <div className="footer-col">
          <h3 className="footer-heading">Roastery hours</h3>
          <p className="footer-schedule">
            <strong>Roast day</strong>
            Tuesday, 6:00 AM to 2:00 PM Pacific
          </p>
          <p className="footer-schedule">
            <strong>Public tasting</strong>
            Friday, 10:00 AM to 12:00 PM Pacific
          </p>
          <p className="footer-schedule">
            <strong>Email</strong>
            hello@larkspurcoffee.co
          </p>
        </div>
      </div>

      <div className="container footer-bottom">
        <p>© 2026 Larkspur Coffee Co. All rights reserved.</p>
        <p>100% specialty arabica. Certified B Corp roastery.</p>
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
