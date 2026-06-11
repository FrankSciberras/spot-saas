import type { CSSProperties } from 'react';

interface IconProps {
  name: string;
  size?: number;
  stroke?: number;
  className?: string;
  style?: CSSProperties;
}

/** Minimal stroke icons — ported 1:1 from the standalone Rovora mockup. */
export default function FleetIcon({ name, size = 18, stroke = 1.6, className = '', style = {} }: IconProps) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    style,
  };
  switch (name) {
    case 'dashboard':
      return <svg {...props}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>;
    case 'staff':
      return <svg {...props}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.7-3.5 3.4-5.5 6.5-5.5s5.8 2 6.5 5.5" /><circle cx="17" cy="7" r="2.5" /><path d="M16 13.5c2.4.2 4.2 1.8 5 4.5" /></svg>;
    case 'driver':
      return <svg {...props}><circle cx="12" cy="8" r="4" /><path d="M4 20c1-4 4-6 8-6s7 2 8 6" /></svg>;
    case 'vehicle':
      return <svg {...props}><path d="M3 14l1.5-5A2 2 0 0 1 6.4 7.5h11.2a2 2 0 0 1 1.9 1.5L21 14" /><rect x="3" y="14" width="18" height="4.5" rx="1.5" /><circle cx="7" cy="18.5" r="1.2" fill="currentColor" /><circle cx="17" cy="18.5" r="1.2" fill="currentColor" /></svg>;
    case 'roster':
      return <svg {...props}><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>;
    case 'shift':
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case 'wrench':
      return <svg {...props}><path d="M14.5 3a5 5 0 0 0-4.2 7.6l-7.1 7.1a1.5 1.5 0 0 0 2.1 2.1l7.1-7.1A5 5 0 1 0 14.5 3z" /></svg>;
    case 'damage':
      return <svg {...props}><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17v.5" /></svg>;
    case 'book':
      return <svg {...props}><path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z" /><path d="M4 17a3 3 0 0 1 3-3h11" /></svg>;
    case 'chart':
      return <svg {...props}><path d="M3 20h18" /><path d="M6 16V10M11 16V6M16 16v-4M20 16V8" /></svg>;
    case 'settle':
      return <svg {...props}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></svg>;
    case 'adjust':
      return <svg {...props}><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h14M18 18h2" /><circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="16" cy="18" r="2" /></svg>;
    case 'bell':
      return <svg {...props}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>;
    case 'audit':
      return <svg {...props}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M8 13h8M8 17h5" /></svg>;
    case 'search':
      return <svg {...props}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>;
    case 'sun':
      return <svg {...props}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>;
    case 'moon':
      return <svg {...props}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>;
    case 'plus':
      return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
    case 'arrow-up':
      return <svg {...props}><path d="M12 19V5M6 11l6-6 6 6" /></svg>;
    case 'arrow-down':
      return <svg {...props}><path d="M12 5v14M6 13l6 6 6-6" /></svg>;
    case 'arrow-right':
      return <svg {...props}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case 'chevron-down':
      return <svg {...props}><path d="M6 9l6 6 6-6" /></svg>;
    case 'chevron-right':
      return <svg {...props}><path d="M9 6l6 6-6 6" /></svg>;
    case 'check':
      return <svg {...props}><path d="M5 12l4 4 10-10" /></svg>;
    case 'warning':
      return <svg {...props}><path d="M10.3 3.7L2.4 17a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17v.5" /></svg>;
    case 'doc':
      return <svg {...props}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>;
    case 'map':
      return <svg {...props}><path d="M9 4L3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z" /><path d="M9 4v13M15 6.5v13" /></svg>;
    case 'pin':
      return <svg {...props}><path d="M12 21v-7" /><path d="M8 7l-1 7h10l-1-7M9 3h6v4H9z" /></svg>;
    case 'fuel':
      return <svg {...props}><rect x="4" y="3" width="10" height="18" rx="1.5" /><path d="M4 10h10M14 8l3 3v7a2 2 0 0 0 2 2 2 2 0 0 0 2-2v-9l-3-3" /></svg>;
    case 'dots':
      return <svg {...props}><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" /></svg>;
    case 'filter':
      return <svg {...props}><path d="M3 5h18l-7 9v6l-4-2v-4z" /></svg>;
    case 'logout':
      return <svg {...props}><path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5" /><path d="M10 17l-5-5 5-5M5 12h11" /></svg>;
    case 'live':
      return <svg {...props}><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="6" opacity="0.4" /><circle cx="12" cy="12" r="9" opacity="0.15" /></svg>;
    case 'play':
      return <svg {...props}><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>;
    case 'phone':
      return <svg {...props}><path d="M5 4h3l2 5-2 1a12 12 0 0 0 6 6l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>;
    case 'menu':
      return <svg {...props}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
    case 'close':
      return <svg {...props}><path d="M18 6L6 18M6 6l12 12" /></svg>;
    case 'logo':
      return (
        <svg viewBox="0 0 64 24" fill="none" width={size * 2.5} height={size} className={className} style={style}>
          <text x="0" y="18" fontFamily="Geist, sans-serif" fontSize="20" fontWeight="700" fill="currentColor" letterSpacing="-0.5">Sp</text>
          <circle cx="33" cy="11.5" r="5.5" stroke="currentColor" strokeWidth="2.2" fill="none" />
          <circle cx="33" cy="11.5" r="1.6" fill="currentColor" />
          <text x="42" y="18" fontFamily="Geist, sans-serif" fontSize="20" fontWeight="700" fill="currentColor" letterSpacing="-0.5">t</text>
        </svg>
      );
    default:
      return null;
  }
}
