// Rovora GPS — trackers that report to Rovora's own Traccar server.
// Each fleet's connection holds the login of its hidden, read-only Traccar
// user (see lib/gps/hosted/traccar-admin.ts); reading positions is exactly the
// Traccar adapter, pointed at the server from the environment.

import { hostedGpsConfig } from '../hosted/config';
import { GpsProviderError, type GpsProviderAdapter } from '../types';
import { traccar } from './traccar';

export const rovora: GpsProviderAdapter = {
  key: 'rovora',
  name: 'Rovora GPS',
  // Not connected through the form — fleets add trackers by IMEI instead.
  fields: [],
  steps: [],
  accountLabel() {
    return 'Plug-and-play trackers';
  },
  async fetchDevices(c) {
    const cfg = hostedGpsConfig();
    if (!cfg) throw new GpsProviderError('network', 'Rovora GPS isn’t switched on on this server yet.');
    return traccar.fetchDevices({ server_url: cfg.apiUrl, email: c.email ?? '', password: c.password ?? '' });
  },
};
