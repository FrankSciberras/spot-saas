// =============================================================================
// GPS PLATFORMS — display info (client-safe; no adapters / secrets in here)
// =============================================================================
// The connect page, the integrations marketplace and the Live Map all show the
// same tiles. The real adapters live in lib/gps/providers (server only).
// =============================================================================

import type { GpsProviderKey } from './types';

export interface GpsProviderInfo {
  key: GpsProviderKey;
  name: string;
  /** Short text mark — used when there is no `logoSrc` (Rovora GPS). */
  mark: string;
  /** The platform's own logo (public/integrations), drawn on a white tile. */
  logoSrc?: string;
  bg: string;
  fg: string;
  /** One line: who it's for. */
  desc: string;
}

export const GPS_PROVIDERS: GpsProviderInfo[] = [
  {
    key: 'traccar',
    name: 'Traccar',
    mark: 'T',
    logoSrc: '/integrations/traccar.svg',
    bg: '#2f6fed',
    fg: '#ffffff',
    desc: 'Open-source GPS server — self-hosted or a Traccar plan.',
  },
  {
    key: 'flespi',
    name: 'flespi',
    mark: 'f',
    logoSrc: '/integrations/flespi.png',
    bg: '#12b886',
    fg: '#ffffff',
    desc: 'Telematics hub for Teltonika, Queclink, Ruptela & more.',
  },
  {
    key: 'wialon',
    name: 'Wialon',
    mark: 'W',
    logoSrc: '/integrations/wialon.svg',
    bg: '#f26722',
    fg: '#ffffff',
    desc: 'Wialon Hosting or Wialon Local, used by most GPS installers.',
  },
  {
    key: 'navixy',
    name: 'Navixy',
    mark: 'N',
    logoSrc: '/integrations/navixy.svg',
    bg: '#1e88e5',
    fg: '#ffffff',
    desc: 'Navixy and the many tracking brands built on it.',
  },
  {
    key: 'samsara',
    name: 'Samsara',
    mark: 'S',
    logoSrc: '/integrations/samsara.svg',
    bg: '#0b2a4a',
    fg: '#ffffff',
    desc: 'Samsara vehicle gateways and OBD trackers.',
  },
  {
    key: 'geotab',
    name: 'Geotab',
    mark: 'G',
    logoSrc: '/integrations/geotab.svg',
    bg: '#25477b',
    fg: '#ffffff',
    desc: 'MyGeotab GO devices.',
  },
  {
    key: 'mapon',
    name: 'Mapon',
    mark: 'M',
    logoSrc: '/integrations/mapon.png',
    bg: '#e53935',
    fg: '#ffffff',
    desc: 'Mapon fleet tracking units.',
  },
];

/** Rovora's own GPS server — not in the connect grid (trackers are added by IMEI). */
export const ROVORA_GPS_INFO: GpsProviderInfo = {
  key: 'rovora',
  name: 'Rovora GPS',
  mark: 'R',
  bg: '#2bbd7e',
  fg: '#ffffff',
  desc: 'Plug-and-play Teltonika trackers on Rovora’s own GPS server.',
};

export function gpsProviderInfo(key: string): GpsProviderInfo | undefined {
  return key === 'rovora' ? ROVORA_GPS_INFO : GPS_PROVIDERS.find((p) => p.key === key);
}
