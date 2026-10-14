import Icon from '../../components/Icon.jsx';
import { CtaBand, PageHero, SiteLayout } from './SiteLayout.jsx';

const SECTIONS = [
  {
    id: 'inbox', icon: 'chat', title: 'Team inbox',
    text: 'One inbox for every WhatsApp conversation. Assign chats, transfer them between agents and keep internal notes the customer never sees.',
    points: ['Live and history views with search', 'Assign and transfer between agents', 'Quick replies for common answers', '24-hour window handled for you, with a template fallback'],
  },
  {
    id: 'campaigns', icon: 'megaphone', title: 'Campaigns and templates',
    text: 'Create message templates, send them to Meta for approval, and run campaigns to a label or your full contact list.',
    points: ['Variables and buttons in templates', 'Wallet check before a campaign starts', 'Sent, delivered, seen and failed per contact', 'Download a report for every campaign'],
  },
  {
    id: 'automation', icon: 'bolt', title: 'Automations and flows',
    text: 'Let the routine work run itself and keep your agents for the conversations that need a person.',
    points: ['Welcome and out-of-office messages', 'Keyword replies', 'Tap-to-choose button menus', 'Auto assignment by round robin or percentage', 'Opt-out keywords that protect your number'],
  },
  {
    id: 'ai', icon: 'bot', title: 'AI assistant',
    text: 'An assistant answers common questions using the business information you give it. It does not invent facts, and it hands over to a person when it cannot help.',
    points: ['Uses only your business information', 'Hands over to an agent on request', 'Turns off for a chat as soon as an agent replies', 'Bot report shows what it handled'],
  },
  {
    id: 'leads', icon: 'users', title: 'Leads, labels and reports',
    text: 'Keep every contact organised and see what is working.',
    points: ['Import and download contacts as CSV', 'Labels and agent assignment', 'Delivery funnel and daily message charts', 'Short links with click tracking'],
  },
  {
    id: 'api', icon: 'plug', title: 'API and webhooks',
    text: 'Connect your own website or CRM. Send a template from your system, and receive every customer message on your own server.',
    points: ['API key with history and one-click regenerate', 'Send a template to one number', 'Contacts and campaign status endpoints', 'Incoming message webhook'],
  },
];

export default function Platform() {
  return (
    <SiteLayout>
      <PageHero
        eyebrow="Platform"
        title="One platform for every WhatsApp conversation"
        text="From the first reply to a full campaign, your team works in the same place."
      />
      {SECTIONS.map((s, i) => (
        <section className={i % 2 ? 'alt section' : 'section'} id={s.id} key={s.id}>
          <div className="site-wrap two-col">
            <div className={i % 2 ? 'order-2' : ''}>
              <span className="f-icon"><Icon name={s.icon} size={24} /></span>
              <h2>{s.title}</h2>
              <p className="muted">{s.text}</p>
            </div>
            <ul className="tick-list">
              {s.points.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </div>
        </section>
      ))}
      <CtaBand />
    </SiteLayout>
  );
}
