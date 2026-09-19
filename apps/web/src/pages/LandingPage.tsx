import { Link } from 'react-router'
import '../App.css'

const githubUrl = 'https://github.com/Anna-Vida/Nexflow'
const profileUrl = 'https://github.com/Anna-Vida'

const stack = [
  'React',
  'NestJS',
  'PostgreSQL',
  'Redis',
  'BullMQ',
  'Socket.IO',
]

const capabilities = [
  {
    icon: '⚡',
    title: 'Get more done',
    body: 'Build workflows visually, trigger them from webhooks or schedules, and move work automatically.',
  },
  {
    icon: '◫',
    title: 'See every run',
    body: 'Live execution status, retry history, node events, and persisted execution details stay visible.',
  },
  {
    icon: '◎',
    title: 'Recover safely',
    body: 'Leases, heartbeats, idempotent HTTP checkpoints, and crash reconciliation protect side effects.',
  },
  {
    icon: '⌾',
    title: 'Built for real systems',
    body: 'Authentication, workflow ownership, queues, PostgreSQL history, and scheduled execution are built in.',
  },
]

const integrations = [
  ['↗', 'Webhook'],
  ['{ }', 'HTTP API'],
  ['◷', 'Schedule'],
  ['◇', 'Condition'],
  ['PG', 'PostgreSQL'],
  ['R', 'Redis'],
  ['Q', 'BullMQ'],
  ['◉', 'Socket.IO'],
  ['P', 'Prisma'],
  ['GH', 'GitHub'],
]

const faq = [
  [
    'What is NexFlow?',
    'NexFlow is a visual workflow automation engine for designing, executing, scheduling, and monitoring backend workflows.',
  ],
  [
    'Can NexFlow run real HTTP actions?',
    'Yes. HTTP actions execute through the backend with SSRF protections, retries, persisted checkpoints, and recovery rules.',
  ],
  [
    'What happens if a worker crashes?',
    'NexFlow uses worker leases, heartbeats, durable HTTP action state, and crash reconciliation to resume only when recovery is safe.',
  ],
  [
    'Can workflows run on a schedule?',
    'Yes. Saved workflows can use interval or cron schedules with an explicit timezone and PostgreSQL-backed tick history.',
  ],
  [
    'Does NexFlow have user accounts?',
    'Yes. Accounts use scrypt password hashing, HttpOnly sessions, workflow ownership, and protected execution subscriptions.',
  ],
]

function BrandMark() {
  return (
    <span className="nexa-brand-mark" aria-hidden="true">
      <i />
      <i />
    </span>
  )
}

function HeroAutomation() {
  return (
    <div className="nexa-hero-art" aria-label="Visual automation diagram">
      <div className="nexa-hero-grid" />
      <div className="nexa-orbit nexa-orbit-a" />
      <div className="nexa-orbit nexa-orbit-b" />

      <div className="nexa-core-cube">
        <div className="nexa-core-top">NF</div>
        <div className="nexa-core-front">FLOW</div>
        <div className="nexa-core-side">01</div>
        <span className="nexa-core-glow" />
      </div>

      <div className="nexa-agent nexa-agent-one">
        <span className="nexa-agent-face">••</span>
      </div>
      <div className="nexa-agent nexa-agent-two">
        <span className="nexa-agent-face">••</span>
      </div>
      <div className="nexa-agent nexa-agent-three">
        <span className="nexa-agent-face">••</span>
      </div>

      <div className="nexa-line nexa-line-one" />
      <div className="nexa-line nexa-line-two" />
      <div className="nexa-line nexa-line-three" />
      <div className="nexa-line nexa-line-four" />

      <div className="nexa-float-node nexa-node-webhook">
        <span className="nexa-node-icon">↗</span>
        <div>
          <small>TRIGGER</small>
          <strong>Webhook</strong>
          <p>Receive requests</p>
        </div>
      </div>

      <div className="nexa-float-node nexa-node-condition">
        <span className="nexa-node-icon">◇</span>
        <div>
          <small>LOGIC</small>
          <strong>Condition</strong>
          <p>Route the workflow</p>
        </div>
      </div>

      <div className="nexa-float-node nexa-node-action">
        <span className="nexa-node-icon">⚡</span>
        <div>
          <small>ACTION</small>
          <strong>HTTP request</strong>
          <p>Execute real work</p>
        </div>
      </div>

      <div className="nexa-float-node nexa-node-schedule">
        <span className="nexa-node-icon">◷</span>
        <div>
          <small>TRIGGER</small>
          <strong>Schedule</strong>
          <p>Run on time</p>
        </div>
      </div>

      <div className="nexa-art-note">
        Your workflow engine
        <br />
        always observable
        <span>↙</span>
      </div>
    </div>
  )
}

function LandingPage() {
  return (
    <div className="nexa-page">
      <div className="nexa-bg-orb nexa-bg-orb-one" />
      <div className="nexa-bg-orb nexa-bg-orb-two" />

      <header className="nexa-header">
        <nav className="nexa-nav">
          <a className="nexa-brand" href="/">
            <BrandMark />
            <span>NexFlow</span>
          </a>

          <div className="nexa-nav-links">
            <a href="#product">Product</a>
            <a href="#features">Features</a>
            <a href="#integrations">Integrations</a>
            <a href="#plans">Plans</a>
            <a href="#faq">FAQ</a>
          </div>

          <div className="nexa-nav-actions">
            <Link className="nexa-nav-signin" to="/login">
              Sign in
            </Link>
            <Link className="nexa-button nexa-button-sm nexa-button-primary" to="/dashboard">
              Open workspace <span>→</span>
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="nexa-hero" id="product">
          <div className="nexa-hero-copy">
            <div className="nexa-pill">
              <span className="nexa-pill-dot" />
              VISUAL AUTOMATION FOR REAL WORK
            </div>

            <h1>
              Automate work.
              <span>Multiply what&apos;s possible.</span>
            </h1>

            <p>
              NexFlow gives you a visual way to design, run, schedule, monitor,
              and recover real backend workflows — from one reliable workspace.
            </p>

            <div className="nexa-hero-actions">
              <Link className="nexa-button nexa-button-primary" to="/workspace">
                Start building free <span>→</span>
              </Link>
              <a className="nexa-button nexa-button-ghost" href={githubUrl} target="_blank" rel="noreferrer">
                <span className="nexa-play">⌘</span>
                View source
              </a>
            </div>

            <div className="nexa-proof-row">
              <span>✓ No credit card</span>
              <span>✓ Real backend</span>
              <span>✓ Open source</span>
            </div>
          </div>

          <div className="nexa-hero-visual">
            <HeroAutomation />
          </div>
        </section>

        <section className="nexa-trust-strip">
          <p>BUILT WITH A MODERN FULL-STACK TOOLCHAIN</p>
          <div className="nexa-trust-logos">
            {stack.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>

        <section className="nexa-section" id="features">
          <div className="nexa-section-heading nexa-centered">
            <div className="nexa-pill nexa-pill-subtle">WHY NEXFLOW</div>
            <h2>From repetitive work to reliable automation</h2>
            <p>Everything needed to build and observe workflows without hiding what the system is doing.</p>
          </div>

          <div className="nexa-feature-grid">
            {capabilities.map((feature) => (
              <article className="nexa-feature-card" key={feature.title}>
                <span className="nexa-feature-icon">{feature.icon}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="nexa-section nexa-integrations" id="integrations">
          <div className="nexa-integrations-copy">
            <div className="nexa-pill nexa-pill-subtle">CONNECT YOUR FLOW</div>
            <h2>Works where your workflow works</h2>
            <p>
              Trigger from HTTP, schedule jobs, branch logic, persist state,
              stream execution updates, and run background work through one engine.
            </p>
            <Link className="nexa-outline-link" to="/workspace">
              Open the builder <span>→</span>
            </Link>
          </div>

          <div className="nexa-integration-grid">
            {integrations.map(([icon, label]) => (
              <div className="nexa-integration-card" key={label}>
                <span>{icon}</span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="nexa-section nexa-plans" id="plans">
          <div className="nexa-section-heading nexa-centered">
            <div className="nexa-pill nexa-pill-subtle">SIMPLE BY DESIGN</div>
            <h2>Run NexFlow your way</h2>
            <p>The project is open source and designed to stay understandable from local development to production.</p>
          </div>

          <div className="nexa-plan-grid">
            <article className="nexa-plan-card">
              <span className="nexa-plan-name">Local</span>
              <p>For building and testing workflows on your own machine.</p>
              <div className="nexa-price">$0 <small>/ open source</small></div>
              <ul>
                <li>✓ Visual workflow builder</li>
                <li>✓ Manual execution</li>
                <li>✓ Webhook triggers</li>
                <li>✓ PostgreSQL history</li>
              </ul>
              <Link className="nexa-plan-button" to="/workspace">Start building</Link>
            </article>

            <article className="nexa-plan-card nexa-plan-card-featured">
              <span className="nexa-plan-badge">FULL STACK</span>
              <span className="nexa-plan-name">Self-hosted</span>
              <p>For running the full API, database, Redis queue, scheduler, and worker.</p>
              <div className="nexa-price">$0 <small>/ your infrastructure</small></div>
              <ul>
                <li>✓ BullMQ background worker</li>
                <li>✓ Automatic retries</li>
                <li>✓ Crash reconciliation</li>
                <li>✓ Scheduled workflows</li>
                <li>✓ User authentication</li>
              </ul>
              <a className="nexa-plan-button nexa-plan-button-primary" href={githubUrl} target="_blank" rel="noreferrer">
                View repository
              </a>
            </article>

            <article className="nexa-plan-card">
              <span className="nexa-plan-name">Production</span>
              <p>For deployment behind a real domain with managed PostgreSQL and Redis.</p>
              <div className="nexa-price">Custom <small>deployment</small></div>
              <ul>
                <li>✓ API + separate worker</li>
                <li>✓ Durable persistence</li>
                <li>✓ Health endpoint</li>
                <li>✓ Deployment guide</li>
              </ul>
              <a className="nexa-plan-button" href={githubUrl} target="_blank" rel="noreferrer">Read deployment docs</a>
            </article>
          </div>
        </section>

        <section className="nexa-section nexa-faq-section" id="faq">
          <div className="nexa-faq-copy">
            <div className="nexa-pill nexa-pill-subtle">COMMON QUESTIONS</div>
            <h2>Frequently asked questions</h2>
            <p>Everything you need to know about how NexFlow works.</p>
            <div className="nexa-hand-note">
              Built to be understood,
              <br />
              not treated like magic.
              <span>↗</span>
            </div>
          </div>

          <div className="nexa-faq-list">
            {faq.map(([question, answer]) => (
              <details className="nexa-faq-item" key={question}>
                <summary>
                  <span>{question}</span>
                  <i>+</i>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="nexa-final-cta">
          <div className="nexa-final-wave nexa-final-wave-one" />
          <div className="nexa-final-wave nexa-final-wave-two" />
          <BrandMark />
          <span className="nexa-final-kicker">READY TO BUILD A BETTER WORKFLOW?</span>
          <h2>
            Let NexFlow handle the execution.
            <br />
            You focus on the system.
          </h2>
          <div className="nexa-final-actions">
            <Link className="nexa-button nexa-button-primary" to="/workspace">
              Start building free <span>→</span>
            </Link>
            <a className="nexa-button nexa-button-ghost" href={profileUrl} target="_blank" rel="noreferrer">
              Developer profile
            </a>
          </div>
        </section>
      </main>

      <footer className="nexa-footer">
        <a className="nexa-brand" href="/">
          <BrandMark />
          <span>NexFlow</span>
        </a>
        <div className="nexa-footer-links">
          <a href="#product">Product</a>
          <a href="#features">Features</a>
          <a href="#integrations">Integrations</a>
          <a href="#plans">Plans</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="nexa-footer-meta">
          <a href={githubUrl} target="_blank" rel="noreferrer">GitHub</a>
          <span>© 2026 NexFlow</span>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
