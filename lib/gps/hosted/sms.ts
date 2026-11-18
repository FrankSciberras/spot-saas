// =============================================================================
// Teltonika setup text message (client-safe — no secrets)
// =============================================================================
// FMC920 / FMC130 / FMC003 accept configuration by SMS. With no SMS login or
// password set (factory default) the message starts with TWO spaces, then
//   setparam 2001:<APN>;2002:<APN user>;2003:<APN password>;
//            2004:<server domain>;2005:<port>;2006:<0 = TCP>
// FMC003 defaults to UDP, so 2006:0 is always sent. Source:
// https://wiki.teltonika-gps.com/view/FMC003_First_Start (same IDs on FMC920/FMC130).
// =============================================================================

export interface SimChoice {
  key: string;
  label: string;
  apn: string;
}

/** SIMs that work in Malta, with their data APN (from each operator's own page). */
export const SIM_CHOICES: SimChoice[] = [
  { key: 'go', label: 'GO', apn: 'gointernet' },
  { key: 'melita', label: 'Melita', apn: 'web.melita' },
  { key: 'epic', label: 'Epic', apn: 'internet' },
  { key: 'melita-io', label: 'melita.io (IoT SIM)', apn: 'iot.melita.io' },
  { key: '1nce', label: '1NCE (IoT SIM)', apn: 'iot.1nce.net' },
  { key: 'other', label: 'Another SIM — I’ll type the APN', apn: '' },
];

export function teltonikaSetupSms(opts: { apn: string; host: string; port: number }): string {
  const apn = opts.apn.trim().replace(/[;:\s]/g, '');
  return `  setparam 2001:${apn};2002:;2003:;2004:${opts.host};2005:${opts.port};2006:0`;
}
