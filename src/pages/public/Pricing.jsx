import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CtaBand, PageHero, SiteLayout } from './SiteLayout.jsx';

const CATS = [
  ['Marketing', 'Promotions, offers and announcements.'],
  ['Utility', 'Order, payment and appointment updates a customer expects.'],
  ['Authentication', 'One-time passwords and login codes.'],
  ['Service', 'Replies inside the 24-hour window after a customer messages you.'],
];

const FAQ = [
  ['What do I pay for?', 'A plan fee for the platform and team seats, plus a per-message charge for each WhatsApp message by type. Your wallet is prepaid and each message is charged when it is sent.'],
  ['Are failed messages charged?', 'Failed messages are refunded to your wallet automatically.'],
  ['Why is there a separate message charge?', 'WhatsApp charges for messages by category and country. Those rates change over time, so we show your current rate in your wallet.'],
  ['Is there a free trial?', 'New accounts start on a trial. Ask us for the current trial terms.'],
];

export default function Pricing() {
  const [plans, setPlans] = useState(null);
  useEffect(() => {
    fetch('/api/public/plans').then((r) => r.json()).then((d) => setPlans(d.plans || [])).catch(() => setPlans([]));
  }, []);
  return (
    <SiteLayout>
      <PageHero eyebrow="Pricing" title="Simple plans, honest message pricing"
        text="A platform plan for your team, and pay-as-you-go messages from a prepaid wallet." />
      <section className="site-wrap section">
        <h2>Plans</h2>
        {plans && plans.length > 0 ? (
          <div className="feature-grid">
            {plans.map((p) => (
              <div className="feature" key={p.id}>
                <h3>{p.name}</h3>
                <div className="price">₹{Number(p.monthly_fee).toLocaleString('en-IN')}<small> / month</small></div>
                <p>{p.included_agents} agent logins included</p>
                <Link to="/contact" className="btn small">Talk to us</Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="feature"><h3>Custom quote</h3>
            <p>Tell us your expected monthly messages and team size and we will send you a quote.</p>
            <Link to="/contact" className="btn small">Get a quote</Link></div>
        )}
      </section>
      <section className="alt section">
        <div className="site-wrap">
          <h2>How messages are priced</h2>
          <div className="feature-grid">
            {CATS.map(([t, d]) => <div className="feature" key={t}><h3>{t}</h3><p>{d}</p></div>)}
          </div>
          <p className="muted small">Rates depend on your plan and on WhatsApp's current pricing. They are shown in your wallet after you sign up.</p>
        </div>
      </section>
      <section className="site-wrap section narrow">
        <h2>Questions</h2>
        {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
      </section>
      <CtaBand />
    </SiteLayout>
  );
}
