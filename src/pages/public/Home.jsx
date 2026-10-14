import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const FEATURES = [
  ['Shared team inbox', 'Your whole team replies to WhatsApp customers from one screen, with chat assignment and internal notes.'],
  ['Template campaigns', 'Send approved WhatsApp templates to your contact lists and track sent, delivered, seen and failed.'],
  ['Auto replies', 'Welcome messages, keyword replies, out-of-office replies and opt-out handling that run on their own.'],
  ['AI assistant', 'Let an AI answer common questions from your business information, and hand over to a person when needed.'],
  ['Button flows', 'Build tap-to-choose menus so customers get answers without typing.'],
  ['Leads and labels', 'Import contacts, tag them, assign them to agents and download your lists any time.'],
  ['Reports', 'Delivery funnel, agent activity, failure reasons and link click tracking.'],
  ['API and webhooks', 'Connect your website or CRM with an API key and receive customer messages on your own server.'],
];

const STEPS = [
  ['Tell us about your business', 'We create your company account and your admin login.'],
  ['Connect your WhatsApp number', 'Connect a number that is on the official WhatsApp Business API.'],
  ['Get your templates approved', 'Create message templates and send them to Meta for approval.'],
  ['Start talking to customers', 'Reply from the inbox, run campaigns and switch on automations.'],
];

const FAQ = [
  ['What is the WhatsApp Business API?', 'It is the official way for companies to use WhatsApp at scale. Messages go through Meta\'s own system instead of a phone app, which is what makes team inboxes, bulk templates and automation possible.'],
  ['Will my number get blocked?', 'Using the official API removes the risk that comes with unofficial tools. Your number\'s quality still depends on how you use it: message only people who agreed to hear from you, use approved templates, and honour opt-outs. We build these protections in.'],
  ['Can I keep using my current WhatsApp number?', 'A number on the API cannot also run on the normal WhatsApp app at the same time. Many businesses use a fresh number for the API. We help you plan this.'],
  ['What do I need to get started?', 'A registered business or proof of your business, a number that is not on the WhatsApp app, and a Meta Business account. We guide you through each step.'],
  ['How is pricing worked out?', 'There is a platform fee for your plan, and WhatsApp charges per message depending on the message type. Contact us for a quote that fits your volume.'],
];

function Contact() {
  const [f, setF] = useState({ name: '', email: '', phone: '', company: '', message: '', website: '' });
  const [state, setState] = useState({ busy: false, done: false, error: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, done: false, error: '' });
    try {
      const res = await fetch('/api/public/lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not send. Please try again.');
      setState({ busy: false, done: true, error: '' });
    } catch (err) { setState({ busy: false, done: false, error: err.message }); }
  };
  if (state.done) return <div className="ok">Thank you. We will contact you shortly.</div>;
  return (
    <form className="site-form" onSubmit={submit}>
      <input aria-label="Name" placeholder="Your name" value={f.name} onChange={set('name')} required />
      <input aria-label="Email" type="email" placeholder="Email" value={f.email} onChange={set('email')} />
      <input aria-label="Phone" placeholder="Phone / WhatsApp number" value={f.phone} onChange={set('phone')} />
      <input aria-label="Company" placeholder="Company" value={f.company} onChange={set('company')} />
      <textarea aria-label="Message" rows="4" placeholder="What would you like to do with WhatsApp?" value={f.message} onChange={set('message')} />
      <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={f.website} onChange={set('website')} />
      {state.error && <div className="error">{state.error}</div>}
      <button className="btn big-btn" disabled={state.busy}>{state.busy ? 'Sending...' : 'Request a demo'}</button>
      <p className="muted small">Share an email or a phone number so we can reach you.</p>
    </form>
  );
}

export default function Home() {
  const [plans, setPlans] = useState(null);
  useEffect(() => {
    fetch('/api/public/plans').then((r) => r.json()).then((d) => setPlans(d.plans || [])).catch(() => setPlans([]));
  }, []);

  return (
    <div className="site">
      <header className="site-nav">
        <div className="site-wrap nav-in">
          <a href="#top" className="logo">AI Reply</a>
          <nav>
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <a href="#contact">Contact</a>
            <Link to="/login" className="btn small">Login</Link>
          </nav>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="site-wrap">
          <h1>Talk to your customers on WhatsApp, as a team.</h1>
          <p className="lead">
            Shared inbox, approved-template campaigns and automatic replies on the official WhatsApp Business API.
            Built for businesses that message customers every day.
          </p>
          <div className="row">
            <a href="#contact" className="btn big-btn">Request a demo</a>
            <Link to="/login" className="btn ghost big-btn">Client login</Link>
          </div>
        </div>
      </section>

      <section className="site-wrap section" id="features">
        <h2>Everything your team needs in one place</h2>
        <div className="feature-grid">
          {FEATURES.map(([t, d]) => (
            <div className="feature" key={t}><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
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

      <section className="site-wrap section" id="pricing">
        <h2>Pricing</h2>
        <p className="muted">WhatsApp charges per message by message type. Your plan covers the platform and your team seats.</p>
        {plans && plans.length > 0 ? (
          <div className="feature-grid">
            {plans.map((p) => (
              <div className="feature" key={p.id}>
                <h3>{p.name}</h3>
                <div className="price">₹{Number(p.monthly_fee).toLocaleString('en-IN')}<small> / month</small></div>
                <p>{p.included_agents} agent logins included</p>
                <a href="#contact" className="btn small">Talk to us</a>
              </div>
            ))}
          </div>
        ) : (
          <div className="feature"><h3>Custom quote</h3><p>Tell us your expected monthly messages and team size and we will send you a quote.</p><a href="#contact" className="btn small">Get a quote</a></div>
        )}
      </section>

      <section className="alt section" id="faq">
        <div className="site-wrap narrow">
          <h2>Questions</h2>
          {FAQ.map(([q, a]) => (
            <details key={q}><summary>{q}</summary><p>{a}</p></details>
          ))}
        </div>
      </section>

      <section className="site-wrap section narrow" id="contact">
        <h2>Request a demo</h2>
        <Contact />
      </section>

      <footer className="site-foot">
        <div className="site-wrap foot-in">
          <span>AI Reply</span>
          <span><Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link> · <Link to="/login">Login</Link></span>
        </div>
      </footer>
    </div>
  );
}
