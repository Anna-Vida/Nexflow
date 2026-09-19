import { Link } from 'react-router'
import '../App.css'

const githubUrl = 'https://github.com/Anna-Vida/Nexflow'
const profileUrl = 'https://github.com/Anna-Vida'

function WorkflowPreview() {
  return (
    <div className="nex-workflow-shell" aria-label="NexFlow workflow preview">
      <div className="nex-window-bar">
        <div className="nex-window-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className="nex-window-title">payment-alert.flow</span>
        <div className="nex-live-chip">
          <span />
          live
        </div>
      </div>

      <div className="nex-canvas">
        <div className="nex-canvas-grid" />

        <div className="nex-node nex-node-webhook">
          <div className="nex-node-head">
            <span className="nex-node-type">TRIGGER</span>
            <span className="nex-node-ok">✓</span>
          </div>
          <strong>Webhook received</strong>
          <small>POST /payments/created</small>
          <div className="nex-node-output">200 · 18 ms</div>
        </div>

        <div className="nex-flow-line nex-flow-line-one">
          <span />
        </div>

        <div className="nex-node nex-node-condition">
          <div className="nex-node-head">
            <span className="nex-node-type">LOGIC</span>
            <span className="nex-node-ok">✓</span>
          </div>
          <strong>High value?</strong>
          <small>amount &gt; 10,000</small>
          <div className="nex-node-output">true</div>
        </div>

        <div className="nex-flow-line nex-flow-line-two">
          <span />
        </div>

        <div className="nex-node nex-node-http">
          <div className="nex-node-head">
            <span className="nex-node-type">ACTION</span>
            <span className="nex-spinner" />
          </div>
          <strong>Notify finance</strong>
          <small>POST /api/notify</small>
          <div className="nex-node-output nex-node-output-running">running</div>
        </div>

        <div className="nex-execution-card">
          <div className="nex-execution-row">
            <span>execution</span>
            <strong>#4f91a2</strong>
          </div>
          <div className="nex-execution-row">
            <span>attempt</span>
            <strong>1 / 3</strong>
          </div>
          <div className="nex-execution-progress">
            <span />
          </div>
          <div className="nex-execution-foot">
            <span className="nex-pulse-dot" />
            processing workflow
          </div>
        </div>
      </div>
    </div>
  )
}

function DeveloperFolder() {
  return (
    <div className="nex-folder-stage" aria-label="Developer profile">
      <div className="nex-folder-shadow" />
      <div className="nex-folder">
        <div className="nex-folder-back">
          <div className="nex-folder-tab">DEVELOPER</div>
        </div>

        <div className="nex-folder-paper nex-folder-paper-back">
          <span>01</span>
          <strong>systems</strong>
          <small>workflow orchestration</small>
        </div>

        <div className="nex-folder-paper nex-folder-paper-front">
          <div className="nex-profile-kicker">PROFILE / 2026</div>
          <strong>Anna Patricia B. Vida</strong>
          <p>Full-stack developer building practical, reliable software.</p>
          <div className="nex-profile-tags">
            <span>React</span>
            <span>NestJS</span>
            <span>PostgreSQL</span>
          </div>
        </div>

        <div className="nex-folder-front">
          <span>NEXFLOW / DEV</span>
          <span>AV</span>
        </div>
      </div>
    </div>
  )
}

function LandingPage() {
  return (
    <div className="nex-landing">
      <div className="nex-noise" aria-hidden="true" />

      <nav className="nex-nav">
        <a className="nex-brand" href="/">
          <span className="nex-brand-mark" aria-hidden="true">
            <i />
            <i />
          </span>
          <span>NexFlow</span>
        </a>

        <div className="nex-nav-links">
          <a href="#product">Product</a>
          <a href="#architecture">Architecture</a>
          <a href="#reliability">Reliability</a>
          <a href="#developer">Developer</a>
        </div>

        <div className="nex-nav-actions">
          <Link className="nex-text-link" to="/login">
            Sign in
          </Link>
          <Link className="nex-nav-cta" to="/dashboard">
            Open workspace
          </Link>
        </div>
      </nav>

      <main>
        <section className="nex-hero" id="product">
          <div className="nex-hero-copy">
            <div className="nex-kicker">
              <span className="nex-kicker-light" />
              Workflow infrastructure, made visible
            </div>

            <h1>
              Build the flow.
              <br />
              <span>See everything move.</span>
            </h1>

            <p className="nex-hero-lede">
              NexFlow is a visual automation engine for designing, scheduling,
              running, and recovering real workflows without hiding the system
              behind a black box.
            </p>

            <div className="nex-hero-actions">
              <Link className="nex-primary-cta" to="/workspace">
                Build a workflow
                <span>↗</span>
              </Link>
              <a className="nex-secondary-cta" href={githubUrl} target="_blank" rel="noreferrer">
                View source
              </a>
            </div>

            <div className="nex-stack-row" aria-label="Core technology">
              <span>React</span>
              <span>NestJS</span>
              <span>PostgreSQL</span>
              <span>Redis</span>
              <span>BullMQ</span>
            </div>
          </div>

          <div className="nex-hero-visual">
            <div className="nex-orbit nex-orbit-one" />
            <div className="nex-orbit nex-orbit-two" />
            <WorkflowPreview />
            <div className="nex-float-card nex-float-card-top">
              <span className="nex-float-label">QUEUE</span>
              <strong>03 waiting</strong>
            </div>
            <div className="nex-float-card nex-float-card-bottom">
              <span className="nex-pulse-dot" />
              worker healthy
            </div>
          </div>
        </section>

        <section className="nex-signal-strip" aria-label="NexFlow capabilities">
          <div>
            <span>01</span>
            <strong>Visual DAG engine</strong>
          </div>
          <div>
            <span>02</span>
            <strong>Live execution</strong>
          </div>
          <div>
            <span>03</span>
            <strong>Crash recovery</strong>
          </div>
          <div>
            <span>04</span>
            <strong>Scheduled runs</strong>
          </div>
          <div className="nex-signal-status">
            <i />
            system ready
          </div>
        </section>

        <section className="nex-section nex-architecture" id="architecture">
          <div className="nex-section-copy">
            <span className="nex-section-index">01 / ARCHITECTURE</span>
            <h2>Not a mock automation UI. A working execution system.</h2>
            <p>
              The canvas is only the front door. Every saved workflow is versioned,
              queued, executed, observed, and recorded through a real backend.
            </p>
          </div>

          <div className="nex-system-map">
            <div className="nex-system-column">
              <span className="nex-system-label">CLIENT</span>
              <div className="nex-system-card">
                <strong>React workspace</strong>
                <small>Visual graph + live status</small>
              </div>
            </div>

            <div className="nex-system-arrow">→</div>

            <div className="nex-system-column">
              <span className="nex-system-label">CONTROL</span>
              <div className="nex-system-card">
                <strong>NestJS API</strong>
                <small>Auth · webhooks · schedules</small>
              </div>
            </div>

            <div className="nex-system-arrow">→</div>

            <div className="nex-system-column">
              <span className="nex-system-label">RUNTIME</span>
              <div className="nex-system-card">
                <strong>BullMQ worker</strong>
                <small>Retries · leases · recovery</small>
              </div>
            </div>

            <div className="nex-system-storage">
              <div>
                <span>PostgreSQL</span>
                <small>durable state</small>
              </div>
              <div>
                <span>Redis</span>
                <small>job delivery</small>
              </div>
            </div>
          </div>
        </section>

        <section className="nex-section nex-reliability" id="reliability">
          <div className="nex-reliability-panel">
            <div className="nex-terminal-head">
              <span>execution/recovery.log</span>
              <span>● ● ●</span>
            </div>
            <div className="nex-terminal-lines">
              <p><span>12:41:08</span> HTTP action checkpoint committed</p>
              <p><span>12:41:13</span> worker heartbeat updated</p>
              <p><span>12:41:44</span> stale lease detected</p>
              <p><span>12:41:44</span> persisted response found — safe to recover</p>
              <p className="nex-terminal-success"><span>12:41:45</span> execution resumed without resend ✓</p>
            </div>
          </div>

          <div className="nex-section-copy nex-reliability-copy">
            <span className="nex-section-index">02 / RELIABILITY</span>
            <h2>Failure is part of the workflow.</h2>
            <p>
              NexFlow persists external-action checkpoints, fences workers with
              leases, and avoids blindly repeating uncertain side effects after a
              crash.
            </p>
            <div className="nex-proof-grid">
              <div>
                <strong>3×</strong>
                <span>automatic attempts</span>
              </div>
              <div>
                <strong>5s</strong>
                <span>worker heartbeat</span>
              </div>
              <div>
                <strong>0</strong>
                <span>blind stalled replays</span>
              </div>
            </div>
          </div>
        </section>

        <section className="nex-section nex-developer" id="developer">
          <div className="nex-developer-copy">
            <span className="nex-section-index">03 / DEVELOPER</span>
            <h2>The person behind the system.</h2>
            <p>
              NexFlow was designed and built end-to-end by Anna Patricia B. Vida,
              from the visual editor and API to queue reliability, persistence,
              authentication, and recovery behavior.
            </p>

            <div className="nex-dev-details">
              <div>
                <span>FOCUS</span>
                <strong>Full-stack systems</strong>
              </div>
              <div>
                <span>PROJECT</span>
                <strong>NexFlow v1.0.0</strong>
              </div>
              <div>
                <span>STATUS</span>
                <strong className="nex-available">Portfolio release</strong>
              </div>
            </div>

            <a className="nex-profile-link" href={profileUrl} target="_blank" rel="noreferrer">
              Open developer profile
              <span>↗</span>
            </a>
          </div>

          <DeveloperFolder />
        </section>

        <section className="nex-final-cta">
          <div>
            <span className="nex-section-index">READY WHEN YOU ARE</span>
            <h2>Turn a process into a workflow.</h2>
          </div>
          <Link className="nex-primary-cta" to="/workspace">
            Open NexFlow
            <span>→</span>
          </Link>
        </section>
      </main>

      <footer className="nex-footer">
        <a className="nex-brand" href="/">
          <span className="nex-brand-mark" aria-hidden="true">
            <i />
            <i />
          </span>
          <span>NexFlow</span>
        </a>
        <p>Visual workflow infrastructure built from the ground up.</p>
        <div className="nex-footer-links">
          <a href={githubUrl} target="_blank" rel="noreferrer">GitHub</a>
          <a href="#developer">Developer</a>
          <span>© 2026</span>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
