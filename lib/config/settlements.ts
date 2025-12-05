// =============================================================================
// Settlement Configuration
// =============================================================================
// This file contains all configurable values for the driver settlement system.
// Modify these values to change defaults without touching business logic.

/**
 * Platform/Service configuration
 * Add new platforms here - the system will automatically include them
 */
export interface PlatformConfig {
  id: string;
  name: string;
  defaultFeePercent: number;
  icon: string;
  color: string;
}

export const PLATFORMS: PlatformConfig[] = [
  { 
    id: 'bolt', 
    name: 'Bolt', 
    defaultFeePercent: 20, 
    icon: '⚡', 
    color: '#34D186' 
  },
  { 
    id: 'uber', 
    name: 'Uber', 
    defaultFeePercent: 20, 
    icon: '🚗', 
    color: '#000000' 
  },
  { 
    id: 'ecabs', 
    name: 'Ecabs', 
    defaultFeePercent: 20, 
    icon: '🚕', 
    color: '#FFB800' 
  },
];

/**
 * Default FSS/Tax amount (can be overridden per driver or per settlement)
 */
export const DEFAULT_FSS_TAX = 22.00;

/**
 * Get default FSS/Tax amount
 * This could be extended to pull from driver profile in future
 */
export function getDefaultFssTax(): number {
  return DEFAULT_FSS_TAX;
}

/**
 * Get platform config by ID
 */
export function getPlatformConfig(platformId: string): PlatformConfig | undefined {
  return PLATFORMS.find(p => p.id === platformId);
}

/**
 * Currency configuration
 */
export const CURRENCY = {
  symbol: '€',
  code: 'EUR',
  locale: 'en-MT',
};

/**
 * Driver share percentage (50%)
 */
export const DRIVER_SHARE_PERCENT = 50;
