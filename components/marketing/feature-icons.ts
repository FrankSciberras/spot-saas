import type { IconName } from './feature/icons';

/**
 * Which icon represents each feature page. Kept in a plain module (not in the
 * 'use client' FeaturesMenu) so server components can read it too.
 */
export const FEATURE_ICONS: Record<string, IconName> = {
  vehicles: 'car',
  maintenance: 'wrench',
  damage: 'camera',
  'live-tracking': 'pulse',
  rosters: 'calendar',
  settlements: 'coins',
  'flexible-pay': 'sliders',
  adjustments: 'plusCircle',
  messages: 'send',
  'driver-app': 'phone',
  safety: 'shield',
  bolt: 'bolt',
  bookkeeping: 'chart',
};
