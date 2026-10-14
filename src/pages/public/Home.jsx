import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { CtaBand, SiteLayout } from './SiteLayout.jsx';

const FEATURES = [
  ['chat', 'Shared team inbox', 'Your whole team replies to WhatsApp customers from one screen, with chat assignment and internal notes.'],
  ['megaphone', 'Template campaigns', 'Send approved WhatsApp templates to your contact lists and track sent, delivered, seen and failed.'],
  ['bolt', 'Auto replies', 'Welcome messages, keyword replies, out-of-office replies and opt-out handling that run on their own.'],
  ['bot', 'AI assistant', 'Let an AI answer common questions from your business information, and hand over to a person when needed.'],
  ['flow', 'Button flows', 'Build tap-to-choose menus so customers get answers without typing.'],
  ['users', 'Leads and labels', 'Import contacts, tag them, assign them to agents and download your lists any time.'],
  ['chart', 'Reports', 'Delivery funnel, agent activity, failure reasons and link click tracking.'],
  ['plug', 'API and webhooks', 'Connect your website or CRM with an API key and receive customer messages on your own server.'],
];

const STEPS = [
  ['Tell us about your business', 'We create your company account and your admin login.'],
  ['Connect your WhatsApp number', 'Connect a number that is on the official WhatsApp Business API.'],
  ['Get your templates approved', 'Create message templates and send them to Meta for approval.'],
  ['Start talking to customers', 'Reply from the inbox, run campaigns and switch on automations.'],
];

const USES = [
  ['Order and delivery updates', 'Keep customers informed without a call centre.'],
  ['Payment and renewal reminders', 'Send a reminder with a link, track who saw it.'],
  ['Appointment confirmations', 'Reduce no-shows with a confirmation and a reminder.'],
  ['Lead follow-up', 'Reply to enquiries within minutes and keep every chat in one place.'],
];

function ProductCard() {
  return (
    <div className="mock">
      <div className="mock-bar"><i /><i /><i /><span>Dashboard</span></div>
      <div className="mock-kpis">
        <div><small>Messages</small><b>1,284</b></div>
        <div><small>Live chats</small><b>18</b></div>
        <div><small>Avg reply</small><b>2.4 min</b></div>
      </div>
      <div className="mock-chat">
        <div className="m-in">Hi, is my order shipped?</div>
        <div className="m-out">Yes! It ships today. Track it here: ...</div>
        <div className="m-in">Thanks!</div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <SiteLayout>
      <section className="hero" id="top">
        <div className="site-wrap hero-grid">
          <div>
            <div className="pill">Built on the official WhatsApp Business API</div>
            <h1>Talk to your customers on WhatsApp, as a team.</h1>
            <p className="lead">
              Shared inbox, approved-template campaigns and automatic replies in one place.
              Built for businesses that message customers every day.
            </p>
            <div className="row">
              <Link to="/contact" className="btn big-btn">Book a demo</Link>
              <Link to="/platform" className="btn ghost big-btn">See the platform</Link>
            </div>
          </div>
          <ProductCard />
        </div>
      </section>

      <section className="site-wrap section" id="features">
        <h2>Everything your team needs in one place</h2>
        <div className="feature-grid">
          {FEATURES.map(([icon, t, d]) => (
            <div className="feature" key={t}>
              <span className="f-icon"><Icon name={icon} size={22} /></span>
              <h3>{t}</h3><p>{d}</p>
            </div>
          ))}
        </div>
        <p><Link to="/platform">Explore every feature</Link></p>
      </section>

      <section className="alt section" id="how">
        <div className="site-wrap">
          <h2>How it works</h2>
          <div className="steps-grid">
            {STEPS.map(([t, d], i) => (
              <div className="feature" key={t}><div className="num">{i + 1}</div><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="site-wrap section">
        <h2>What businesses use it for</h2>
        <div className="feature-grid">
          {USES.map(([t, d]) => <div className="feature" key={t}><h3>{t}</h3><p>{d}</p></div>)}
        </div>
        <p><Link to="/solutions">See solutions by industry</Link></p>
      </section>

      <section className="alt section">
        <div className="site-wrap two-col">
          <div>
            <h2>Responsible by design</h2>
            <p className="muted">
              Your number's reputation is your most valuable asset. AI Reply is built around opt-in contacts,
              Meta-approved templates, automatic opt-out handling and quality monitoring, so you grow without putting
              your number at risk.
            </p>
          </div>
          <ul className="tick-list">
            <li>Opt-out keywords handled automatically</li>
            <li>Failed messages refunded to your wallet</li>
            <li>Every sensitive action written to an audit log</li>
            <li>Role-based access for your team</li>
          </ul>
        </div>
      </section>

      <CtaBand />
    </SiteLayout>
  );
}
