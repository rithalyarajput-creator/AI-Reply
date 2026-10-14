import { CtaBand, PageHero, SiteLayout } from './SiteLayout.jsx';

const VALUES = [
  ['Respect the customer', 'Messages should be wanted, relevant and easy to stop.'],
  ['Be straight about limits', 'We tell you what WhatsApp allows and what it does not, before you build on it.'],
  ['Keep your data yours', 'Each business sees only its own data, and every sensitive action is logged.'],
  ['Make it simple', 'A small team should be able to run WhatsApp without a technical background.'],
];

export default function About() {
  return (
    <SiteLayout>
      <PageHero eyebrow="Company" title="About AI Reply"
        text="We build software that helps businesses have better conversations with their customers on WhatsApp." />
      <section className="site-wrap section narrow">
        <h2>What we do</h2>
        <p className="muted">
          AI Reply gives businesses a shared team inbox, template campaigns and automatic replies on the official
          WhatsApp Business API, with an agency panel for partners who manage several businesses.
        </p>
        <h2>What we stand for</h2>
        <div className="feature-grid">
          {VALUES.map(([t, d]) => <div className="feature" key={t}><h3>{t}</h3><p>{d}</p></div>)}
        </div>
      </section>
      <CtaBand title="Let's talk" text="Tell us what you want to achieve with WhatsApp." />
    </SiteLayout>
  );
}
