// Registry of GPS provider adapters (server only — adapters handle secrets).
// Adding a platform = one new file in this folder + one line here + a tile in
// lib/gps/catalog.ts. No database change needed.

import type { GpsProviderAdapter } from '../types';
import { traccar } from './traccar';
import { flespi } from './flespi';
import { wialon } from './wialon';
import { navixy } from './navixy';
import { samsara } from './samsara';
import { geotab } from './geotab';
import { mapon } from './mapon';
import { rovora } from './rovora';

const ADAPTERS: Record<string, GpsProviderAdapter> = {
  traccar,
  flespi,
  wialon,
  navixy,
  samsara,
  geotab,
  mapon,
  rovora,
};

export function getGpsProvider(key: string | null | undefined): GpsProviderAdapter | null {
  return (key && ADAPTERS[key]) || null;
}
