import { Link } from 'react-router'
import '../App.css'

function WorkflowPreview() {
  return (
    <div className="workflow-preview">
      <div className="canvas-grid" />

      <div className="workflow-node webhook-node">
        <div className="node-icon">↗</div>
        <div>
          <span className="node-label">TRIGGER</span>
          <strong>Webhook</strong>
          <small>Request received</small>
        </div>
        <span className="node-status success">✓</span>
      </div>

      <div className="connector connector-one" />

      <div className="workflow-node condition-node">
        <div className="node-icon">◇</div>
        <div>
          <span className="node-label">LOGIC</span>
          <strong>Condition</strong>
          <small>amount &gt; 10,000</small>
        </div>
        <span className="node-status success">✓</span>
      </div>

      <div className="connector connector-two" />

      <div className="workflow-node api-node">
        <div className="node-icon">{'{ }'}</div>
        <div>
          <span className="node-label">ACTION</span>
          <strong>HTTP Request</strong>
          <small>POST /api/notify</small>
        </div>
        <span className="node-status running" />
      </div>

      <div className="execution-pill">
        <span className="execution-dot" />
        Workflow running
      </div>
    </div>
  )
}

function LandingPage() {
  return (
    <div className="app">
      <nav className="navbar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <span />
            <span />
          </span>
          <span>NexFlow</span>
        </a>

        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a
            href="https://github.com/Anna-Vida/Nexflow"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>

        <Link className="nav-button nav-button-link nav-button-secondary" to="/login">
          Sign in
        </Link>


        <Link className="nav-button nav-button-link" to="/dashboard">
  Open workspace
</Link>
      </nav>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-dot" />
              Visual workflow automation
            </div>

            <h1>
              Automate work.
              <span> Visually.</span>
            </h1>

            <p className="hero-description">
              Design, connect, and execute powerful workflows from one visual
              workspace. No repetitive work. Just flow.
            </p>

            <div className="hero-actions">
              <Link className="primary-button" to="/workspace">
  Start building
  <span>→</span>
</Link>

              <a
                className="secondary-button"
                href="https://github.com/Anna-Vida/Nexflow"
                target="_blank"
                rel="noreferrer"
              >
                View on GitHub
              </a>
            </div>

            <div className="hero-meta">
              <div>
                <span className="meta-check">✓</span>
                Open source
              </div>
              <div>
                <span className="meta-check">✓</span>
                Built with TypeScript
              </div>
              <div>
                <span className="meta-check">✓</span>
                Free to use
              </div>
            </div>
          </div>

          <div className="hero-visual">
            <div className="visual-glow" />
            <WorkflowPreview />
          </div>
        </section>

        <section className="stats-strip">
          <div className="stat">
            <strong>Visual</strong>
            <span>Node-based builder</span>
          </div>

          <div className="stat-divider" />

          <div className="stat">
            <strong>Real-time</strong>
            <span>Live execution</span>
          </div>

          <div className="stat-divider" />

          <div className="stat">
            <strong>Flexible</strong>
            <span>API integrations</span>
          </div>

          <div className="stat-divider" />

          <div className="stat">
            <strong>Reliable</strong>
            <span>Retries & queues</span>
          </div>
        </section>

        <section className="features-section" id="features">
          <div className="section-heading">
            <div className="eyebrow">BUILT FOR AUTOMATION</div>
            <h2>From an idea to an automated workflow.</h2>
            <p>
              NexFlow will connect triggers, logic, APIs, and actions into
              workflows that execute automatically.
            </p>
          </div>

          <div className="feature-grid">
            <article className="feature-card">
              <span className="feature-number">01</span>
              <div className="feature-icon">⌁</div>
              <h3>Visual builder</h3>
              <p>
                Build automation flows by connecting nodes instead of writing
                every integration from scratch.
              </p>
            </article>

            <article className="feature-card">
              <span className="feature-number">02</span>
              <div className="feature-icon">⚡</div>
              <h3>Real-time execution</h3>
              <p>
                Watch every workflow step execute live and immediately see what
                succeeds or fails.
              </p>
            </article>

            <article className="feature-card">
              <span className="feature-number">03</span>
              <div className="feature-icon">↗</div>
              <h3>API integrations</h3>
              <p>
                Connect external services with HTTP requests, webhooks, and
                reusable workflow variables.
              </p>
            </article>
          </div>
        </section>
      </main>

      <footer>
        <a className="brand footer-brand" href="/">
          <span className="brand-mark">
            <span />
            <span />
          </span>
          <span>NexFlow</span>
        </a>

        <p>Visual automation engine built from the ground up.</p>

        <span>© 2026 NexFlow</span>
      </footer>
    </div>
  )
}

export default LandingPage
