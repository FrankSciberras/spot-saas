// =============================================================================
// FLEET LOCAL TIME for Bolt data (pure, no I/O)
// =============================================================================
// Ride times are stored as absolute instants. To show "15:21" or to work out
// the busiest hour of the day we need the fleet's own clock. Bolt tells us the
// company's country, so for countries with a single timezone we use the real
// zone (which handles summer time correctly for old rides too). Anywhere else
// we fall back to the fixed UTC offset read from Bolt's latest timestamps.
// =============================================================================

/** ISO 3166-1 alpha-3 → IANA zone, for single-timezone countries Bolt operates in. */
const COUNTRY_ZONE: Record<string, string> = {
  MLT: 'Europe/Malta',
  EST: 'Europe/Tallinn',
  LVA: 'Europe/Riga',
  LTU: 'Europe/Vilnius',
  FIN: 'Europe/Helsinki',
  SWE: 'Europe/Stockholm',
  NOR: 'Europe/Oslo',
  DNK: 'Europe/Copenhagen',
  POL: 'Europe/Warsaw',
  CZE: 'Europe/Prague',
  SVK: 'Europe/Bratislava',
  HUN: 'Europe/Budapest',
  ROU: 'Europe/Bucharest',
  BGR: 'Europe/Sofia',
  HRV: 'Europe/Zagreb',
  SVN: 'Europe/Ljubljana',
  AUT: 'Europe/Vienna',
  DEU: 'Europe/Berlin',
  NLD: 'Europe/Amsterdam',
  BEL: 'Europe/Brussels',
  FRA: 'Europe/Paris',
  CHE: 'Europe/Zurich',
  ITA: 'Europe/Rome',
  GRC: 'Europe/Athens',
  CYP: 'Asia/Nicosia',
  IRL: 'Europe/Dublin',
  GBR: 'Europe/London',
  UKR: 'Europe/Kyiv',
  GEO: 'Asia/Tbilisi',
  AZE: 'Asia/Baku',
  ZAF: 'Africa/Johannesburg',
  NGA: 'Africa/Lagos',
  KEN: 'Africa/Nairobi',
  GHA: 'Africa/Accra',
  TZA: 'Africa/Dar_es_Salaam',
  UGA: 'Africa/Kampala',
  TUN: 'Africa/Tunis',
  ZMB: 'Africa/Lusaka',
  THA: 'Asia/Bangkok',
  MYS: 'Asia/Kuala_Lumpur',
  PRY: 'America/Asuncion',
};

export interface FleetClock {
  /** Hour of the day (0–23) on the fleet's clock. */
  hour(iso: string): number;
  /** "15:21" */
  time(iso: string): string;
  /** "Tue 10 Nov" */
  day(iso: string): string;
}

/** Builds a clock for a fleet from its Bolt country code, else a fixed UTC offset. */
export function fleetClock(countryCode: string | null, utcOffsetMinutes: number | null): FleetClock {
  const zone = countryCode ? COUNTRY_ZONE[countryCode.toUpperCase()] : undefined;
  const offsetMs = (utcOffsetMinutes ?? 0) * 60_000;

  // With a real zone, format the instant itself. Without one, shift the
  // instant by the fixed offset and format that as if it were UTC.
  const timeZone = zone ?? 'UTC';
  const at = (iso: string) => (zone ? new Date(iso) : new Date(new Date(iso).getTime() + offsetMs));

  const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' });
  const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' });

  return {
    hour: (iso) => Number(hourFmt.format(at(iso))) % 24,
    time: (iso) => timeFmt.format(at(iso)),
    day: (iso) => dayFmt.format(at(iso)).replace(',', ''),
  };
}
