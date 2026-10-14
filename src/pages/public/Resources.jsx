import { CtaBand, PageHero, SiteLayout } from './SiteLayout.jsx';

const ARTICLES = [
  {
    title: 'WhatsApp Business app vs WhatsApp Business API',
    body: [
      'The WhatsApp Business app is a phone app for a small team of one or two people. It has simple tools like a catalogue and quick replies.',
      'The WhatsApp Business API is the official connection for companies that need several agents on one number, bulk messages with approved templates, automation and integration with other software. It has no app of its own; you use it through a platform like AI Reply.',
      'A number that is on the API cannot also run on the normal WhatsApp app at the same time, so most companies keep a separate number for the API.',
    ],
  },
  {
    title: 'What is a message template, and why is approval needed?',
    body: [
      'WhatsApp lets a business start a conversation only with a pre-approved message called a template. The template can have variables such as a name or an order number.',
      'Meta reviews each template before it can be used. Clear, honest, useful messages are approved faster. Templates that look like spam can be rejected.',
      'Inside the 24 hours after a customer messages you, you can reply with normal free text. After that window, you need a template again.',
    ],
  },
  {
    title: 'Opt-in: the rule that protects your number',
    body: [
      'Send messages only to people who agreed to hear from you on WhatsApp. This is both a WhatsApp policy and plain good practice.',
      'When people block or report your messages, your number\'s quality rating drops, and WhatsApp may lower how many people you can message each day.',
      'Make it easy to stop. A simple STOP reply that unsubscribes the person, as AI Reply handles automatically, keeps your audience happy and your number healthy.',
    ],
  },
];

export default function Resources() {
  return (
    <SiteLayout>
      <PageHero eyebrow="Resources" title="Plain-language guides" text="Short explainers for teams starting with WhatsApp for business." />
      <section className="site-wrap section narrow">
        {ARTICLES.map((a) => (
          <article className="article" key={a.title}>
            <h2>{a.title}</h2>
            {a.body.map((p) => <p key={p}>{p}</p>)}
          </article>
        ))}
        <p className="muted small">These guides are general information. WhatsApp's rules and prices change, so check Meta's current documentation before you plan.</p>
      </section>
      <CtaBand />
    </SiteLayout>
  );
}
