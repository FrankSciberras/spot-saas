# Rovora GPS — server setup (one-time, ~30 minutes)

Rovora GPS lets a fleet buy a Teltonika tracker, add its IMEI in Rovora, send it
one text message, and see the car on the Live Map. The trackers report to
**Traccar** (free, open-source GPS server) running on your Hetzner server.
Until the steps below are done, the "Rovora GPS" option is simply hidden.

> **Done on 2026-11-17:** Traccar runs on its **own small server**, `rovora-gps`
> (Hetzner CX23, Nuremberg, **2.31.183.155**, €7.07/month), managed by the same
> Coolify. The plan was to give the app server 8 GB instead, but Hetzner had no
> CX33 available in Nuremberg. A separate server also means GPS can never slow
> down rovora.eu, and app updates never interrupt the trackers.

---

## 1. A server for GPS (Hetzner) — done

- `rovora-gps` (CX23, Ubuntu 24.04) was created with Coolify's public SSH key
  (Coolify → Keys & Tokens → "localhost's key"), then added in Coolify →
  **Servers** → **+ Add** (IP 2.31.183.155, user root, localhost's key) →
  **Validate Server & Install Docker Engine**.
- Want it on the app server later instead? Rescale `rovora-dashboard` to CX33
  when Hetzner has stock, move the Traccar service there, point the `gps` DNS
  record back at 91.98.141.100, and delete `rovora-gps`.

## 2. Open the tracker port (Hetzner)

Trackers talk to the server on port **5027**. There is no Hetzner firewall on
the project, so all ports are already open. If you ever add a firewall, allow
**TCP 5027** and **UDP 5027** from anywhere (plus 22, 80, 443).

## 3. The address (GoDaddy) — done

A record **gps** → **2.31.183.155**.

## 4. Install Traccar (Coolify)

1. Open Coolify (http://91.98.141.100:8000) → your project → **+ New** → **Services** → search **Traccar** → choose it, and pick the **rovora-gps** server.
2. In the service settings, set the **Domain** for Traccar to `https://gps.rovora.eu`.
3. Click **Edit Compose File**. Under the `traccar:` service, add these lines (same indentation as `image:`):

   ```yaml
       ports:
         - "5027:5027"
         - "5027:5027/udp"
   ```

   (Coolify's proxy only handles websites; these lines let trackers reach Traccar directly.)
4. **Save** → **Deploy**. Wait until it shows "Running" (2–3 minutes).

## 5. Create the Traccar admin account

1. Open **https://gps.rovora.eu** — the Traccar login page appears.
2. Click **Register** and create an account with an email (e.g. `gps-admin@rovora.eu`) and a **long random password** (20+ characters). The first account is automatically the administrator.
3. Log in → gear icon → **Server** → untick **Registration** → **Save**. (Stops anyone else creating accounts.)

## 6. Tell Rovora about it (Coolify → Rovora app)

Coolify → the Rovora app → **Environment Variables** → add:

| Name | Value |
|---|---|
| `ROVORA_GPS_URL` | `https://gps.rovora.eu` |
| `ROVORA_GPS_ADMIN_EMAIL` | the email from step 5 |
| `ROVORA_GPS_ADMIN_PASSWORD` | the password from step 5 |

Optional: `ROVORA_GPS_PRICE_EUR` (default **3**).

Then **Redeploy** the Rovora app. "Rovora GPS — plug-and-play trackers" now appears at the top of **GPS Trackers** (`/fleet/gps`).

## 7. Clean up old positions (Coolify scheduled task)

Traccar keeps every position forever (Rovora keeps its own 90-day copy). Delete Traccar's after 30 days:

1. Coolify → the Traccar service → **Scheduled Tasks** → **+ Add**.
2. Name: `clear old positions` · Frequency: `30 3 * * *` (every night 03:30) · Container: the **postgres** one.
3. Command:

   ```sh
   psql -U <PostgreSQL user shown on the Traccar service page> traccar -c "DELETE FROM tc_positions WHERE fixtime<now()-make_interval(days=>30) AND id NOT IN (SELECT positionid FROM tc_devices WHERE positionid>0);DELETE FROM tc_events WHERE eventtime<now()-make_interval(days=>30)"
   ```

   (Coolify stores at most 255 characters per command and runs it without a
   shell, so: no `$VARIABLES`, no single quotes, keep it short. Set up and
   tested 2026-11-17.)

4. Save, then press **Execute now** once — it should finish without an error.

## 8. Test with one tracker

1. In Rovora → **GPS Trackers** → **+ Add a tracker** → type the IMEI from the tracker's label → pick the car → **Add tracker**.
2. Put the SIM in the tracker, power it (wire it in / plug into OBD).
3. From your phone, text the message Rovora shows to the **tracker's SIM number** (two spaces at the start!).
4. Within a few minutes the tracker shows **Live** and the car is on the Live Map.

If it stays on "Waiting for first signal": check the SIM has data and SMS, the APN is right for that SIM, and the car is outdoors.

---

### How it fits together (for later reference)

- Each fleet gets a hidden, **read-only** Traccar user (created by Rovora; can't add devices). Its random password is stored encrypted in `gps_connections` (provider `rovora`), and positions are read with the normal Traccar adapter — so the GPS server itself keeps fleets apart.
- Only Rovora's admin login creates trackers and links them to a fleet. Traccar ignores trackers it doesn't know.
- Billing: `rovora_gps_trackers` subscription item, quantity = trackers (`lib/billing/gps-billing.ts`).
- Privacy: `organizations.gps_hide_off_shift` (on by default) — cars only show, and their route is only kept, while a driver is on shift in them.
- Code: `lib/gps/hosted/*`, `lib/gps/providers/rovora.ts`, `app/fleet/gps/RovoraGpsPanel.tsx`.
