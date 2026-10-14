import { CtaBand, PageHero, SiteLayout } from './SiteLayout.jsx';

const INDUSTRIES = [
  {
    id: 'retail', title: 'E-commerce and retail',
    uses: ['Order confirmation and delivery updates', 'Abandoned cart and back-in-stock reminders', 'Support chats with a shared team inbox', 'Festival and offer campaigns to opted-in customers'],
  },
  {
    id: 'finance', title: 'Finance and collections',
    uses: ['Due date and payment reminders', 'Statement and document requests', 'Customer queries answered from one inbox', 'Opt-out handling so reminders stay respectful'],
    note: 'Financial messaging has regulatory requirements. Check what applies to your business before sending.',
  },
  {
    id: 'education', title: 'Education',
    uses: ['Admission enquiry follow-up', 'Fee and exam reminders', 'Class and event announcements', 'Parent communication in one place'],
  },
  {
    id: 'healthcare', title: 'Healthcare and clinics',
    uses: ['Appointment confirmations and reminders', 'Report ready notifications', 'Follow-up check-ins', 'Simple FAQ answers on timings and location'],
    note: 'Do not send sensitive medical details over chat. Keep messages to reminders and general information.',
  },
  {
    id: 'realestate', title: 'Real estate',
    uses: ['Instant reply to portal and ad enquiries', 'Site visit scheduling and reminders', 'Share brochures and project updates', 'Assign leads to the right sales agent'],
  },
  {
    id: 'services', title: 'Services and local business',
    uses: ['Booking confirmations', 'Quotation follow-up', 'Feedback requests after a job', 'A single number for the whole team'],
  },
];

export default function Solutions() {
  return (
    <SiteLayout>
      <PageHero
        eyebrow="Solutions"
        title="WhatsApp for the way your business works"
        text="The same platform, set up for the messages your industry sends every day."
      />
      {INDUSTRIES.map((s, i) => (
        <section className={i % 2 ? 'alt section' : 'section'} id={s.id} key={s.id}>
          <div className="site-wrap two-col">
            <div>
              <h2>{s.title}</h2>
              {s.note && <p className="muted small">{s.note}</p>}
            </div>
            <ul className="tick-list">
              {s.uses.map((u) => <li key={u}>{u}</li>)}
            </ul>
          </div>
        </section>
      ))}
      <CtaBand title="Do not see your industry?" text="Tell us what you want to send and we will tell you honestly whether it fits." />
    </SiteLayout>
  );
}
