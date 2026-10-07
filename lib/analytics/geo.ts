// =============================================================================
// Where a visit is from — without sending anyone's IP address anywhere.
// =============================================================================
// 1. A CDN in front of the site (Cloudflare, Vercel, CloudFront…) already knows
//    the visitor's country — and with Cloudflare's "visitor location headers"
//    managed transform, region and city too. Use that when it's there.
// 2. Otherwise fall back to the device's own time zone, which the OS sets from
//    the device's real location: accurate to country level, unaffected by
//    VPNs, and needs no IP lookup or third party.
// =============================================================================

import { TIMEZONE_COUNTRY } from './timezone-countries';

export interface Geo {
  country: string | null;
  region: string | null;
  city: string | null;
}

const decode = (v: string | null): string | null => {
  if (!v) return null;
  try {
    const t = decodeURIComponent(v).trim();
    return t ? t.slice(0, 80) : null;
  } catch {
    return v.trim().slice(0, 80) || null;
  }
};

const isCountry = (v: string | null): v is string => !!v && /^[A-Z]{2}$/.test(v) && v !== 'XX' && v !== 'T1';

export function resolveGeo(headers: Headers, timeZone: string | null | undefined): Geo {
  const headerCountry = (
    headers.get('cf-ipcountry') ??
    headers.get('x-vercel-ip-country') ??
    headers.get('cloudfront-viewer-country') ??
    headers.get('x-country-code') ??
    ''
  ).toUpperCase();

  if (isCountry(headerCountry)) {
    return {
      country: headerCountry,
      region: decode(
        headers.get('cf-region') ??
          headers.get('x-vercel-ip-country-region') ??
          headers.get('cloudfront-viewer-country-region-name'),
      ),
      city: decode(headers.get('cf-ipcity') ?? headers.get('x-vercel-ip-city') ?? headers.get('cloudfront-viewer-city')),
    };
  }

  const tzCountry = timeZone ? TIMEZONE_COUNTRY[timeZone] : undefined;
  return { country: tzCountry ?? null, region: null, city: null };
}
