import type { SVGProps } from 'react';

// A small, consistent inline-SVG icon set for the feature pages. 1.8 stroke,
// rounded — matches the landing-page feature icons. currentColor for theming.
const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export const Icon = {
  coins: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><ellipse cx="9" cy="6" rx="6" ry="3" /><path d="M3 6v6c0 1.7 2.7 3 6 3s6-1.3 6-3V6" /><path d="M3 12v6c0 1.7 2.7 3 6 3 1.4 0 2.7-.2 3.7-.6" /><circle cx="17" cy="16" r="4" /><path d="M17 14.5v3M15.7 16h2.6" /></svg>
  ),
  split: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M4 4v4a4 4 0 0 0 4 4h8a4 4 0 0 1 4 4v4" /><path d="M17 9l3-3-3-3" /><path d="M7 15l-3 3 3 3" /></svg>
  ),
  sliders: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
  ),
  percent: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M19 5 5 19" /><circle cx="7.5" cy="7.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" /></svg>
  ),
  plusCircle: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>
  ),
  minusCircle: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></svg>
  ),
  pulse: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M3 12h4l2 6 4-14 2 8h6" /></svg>
  ),
  clock: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  ),
  calendar: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
  ),
  send: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" /></svg>
  ),
  wrench: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8 6.2 21l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.7 2.7-2.3-.4-.4-2.3 2.4-2.7Z" /></svg>
  ),
  car: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M5 17h14M6.5 17l-1.2-4.8A2 2 0 0 1 7.2 9.7l.4-.1M9 6h6l1.4 3.6m-8.8 0h8.8m0 0 .4.1a2 2 0 0 1 1.9 2.5L17.5 17" /><circle cx="7.5" cy="17.5" r="1.5" /><circle cx="16.5" cy="17.5" r="1.5" /></svg>
  ),
  gauge: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 18l4-5" /><circle cx="12" cy="18" r="1.2" /></svg>
  ),
  bell: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9Z" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
  ),
  shield: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" /><path d="M9 12l2 2 4-4" /></svg>
  ),
  file: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v4h4M9 13h6M9 17h6" /></svg>
  ),
  users: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.5a3 3 0 0 1 0 5.5M17 20a6 6 0 0 0-2-4.6" /></svg>
  ),
  user: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a7 7 0 0 1 14 0v1" /></svg>
  ),
  chart: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M3 3v18h18" /><path d="M7 14l3-4 3 3 4-6" /></svg>
  ),
  phone: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M11 18h2" /></svg>
  ),
  check: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} strokeWidth={2.4}><path d="M20 6 9 17l-5-5" /></svg>
  ),
  bolt: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" /></svg>
  ),
  camera: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" /><circle cx="12" cy="12.5" r="3.5" /></svg>
  ),
  repeat: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M4 7h12a4 4 0 0 1 4 4M20 17H8a4 4 0 0 1-4-4" /><path d="M16 3l4 4-4 4M8 21l-4-4 4-4" /></svg>
  ),
};

export type IconName = keyof typeof Icon;
