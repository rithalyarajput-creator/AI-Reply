// Small stroke icon set (24x24). No external library.
const PATHS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  chat: 'M4 5h16v11H9l-5 4z',
  chart: 'M4 20V10M10 20V4M16 20v-7M2 20h20',
  template: 'M5 3h14v18H5zM8 8h8M8 12h8M8 16h5',
  megaphone: 'M3 11v3l12 5V6zM15 9a3 3 0 0 1 0 6M7 14v5',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  flow: 'M5 4h5v5H5zM14 15h5v5h-5zM7.5 9v3a3 3 0 0 0 3 3H14',
  plug: 'M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5',
  workflow: 'M4 4h6v6H4zM14 14h6v6h-6zM10 7h4a3 3 0 0 1 3 3v4',
  users: 'M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM4 20a7 7 0 0 1 14 0M18 9a3 3 0 0 1 0 5',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-3v3M17 14h2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2L10 21h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  building: 'M4 21V5l8-2v18M12 9h8v12M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2',
  signal: 'M5 12a10 10 0 0 1 14 0M8 15a6 6 0 0 1 8 0M12 19h.01',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
  card: 'M3 6h18v12H3zM3 10h18',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  briefcase: 'M3 8h18v12H3zM9 8V5h6v3M3 13h18',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  key: 'M15 7a4 4 0 1 1-3 6.5L4 21v-3l3-3M16 8h.01',
  logout: 'M9 4H4v16h5M16 8l4 4-4 4M20 12H9',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  menu: 'M4 6h16M4 12h16M4 18h16',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  history: 'M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4M12 8v4l3 2',
  filter: 'M3 5h18l-7 8v6l-4-2v-4z',
  check: 'M5 12l5 5 9-10',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  send: 'M3 11l18-8-8 18-2-8z',
  note: 'M5 3h14v18l-4-3H5zM8 8h8M8 12h5',
  bot: 'M5 8h14v10H5zM12 4v4M9 13h.01M15 13h.01M9 21v-3M15 21v-3',
  dot: 'M12 12h.01',
};

export default function Icon({ name, size = 20, className = '' }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] || PATHS.dot} />
    </svg>
  );
}
