// =============================================================================
// ROVORA GPS — the GPS server Rovora runs itself (Traccar at gps.rovora.eu)
// =============================================================================
// Fleets buy a tracker (Teltonika FMC920 / FMC130 / FMC003), text it the server
// address, and add its IMEI in Rovora. Rovora's Traccar server decodes the
// tracker's data; Rovora reads it back through the normal Traccar adapter.
//
// Switched on by environment variables (Coolify → Rovora app → Environment):
//   ROVORA_GPS_URL             https://gps.rovora.eu          (Traccar web/API)
//   ROVORA_GPS_ADMIN_EMAIL     the Traccar admin login
//   ROVORA_GPS_ADMIN_PASSWORD  its password
//   ROVORA_GPS_DEVICE_HOST     optional — host trackers send to (default: URL's host)
//   ROVORA_GPS_DEVICE_PORT     optional — default 5027 (Traccar's Teltonika port)
//   ROVORA_GPS_PRICE_EUR       optional — monthly price per tracker, default 3
// Without the first three, the "Rovora GPS" option simply isn't shown.
//
// SERVER ONLY (reads secrets).
// =============================================================================

export interface HostedGpsConfig {
  apiUrl: string;
  adminEmail: string;
  adminPassword: string;
  deviceHost: string;
  devicePort: number;
  priceEur: number;
}

/** Shown to the browser — no secrets. */
export interface HostedGpsPublicInfo {
  deviceHost: string;
  devicePort: number;
  priceEur: number;
}

export function hostedGpsConfig(): HostedGpsConfig | null {
  const rawUrl = process.env.ROVORA_GPS_URL?.trim();
  const adminEmail = process.env.ROVORA_GPS_ADMIN_EMAIL?.trim();
  const adminPassword = process.env.ROVORA_GPS_ADMIN_PASSWORD;
  if (!rawUrl || !adminEmail || !adminPassword) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    console.error('ROVORA_GPS_URL is not a valid address:', rawUrl);
    return null;
  }
  const port = Number(process.env.ROVORA_GPS_DEVICE_PORT || 5027);
  const price = Number(process.env.ROVORA_GPS_PRICE_EUR || 3);
  return {
    apiUrl: `${url.origin}${url.pathname.replace(/\/+$/, '')}`,
    adminEmail,
    adminPassword,
    deviceHost: process.env.ROVORA_GPS_DEVICE_HOST?.trim() || url.hostname,
    devicePort: Number.isInteger(port) && port > 0 ? port : 5027,
    priceEur: Number.isFinite(price) && price >= 0 ? price : 3,
  };
}

export function hostedGpsPublicInfo(): HostedGpsPublicInfo | null {
  const c = hostedGpsConfig();
  return c ? { deviceHost: c.deviceHost, devicePort: c.devicePort, priceEur: c.priceEur } : null;
}

/** Trackers report with their IMEI: 15 digits whose last one is a Luhn check digit. */
export function isValidImei(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(imei[14 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
