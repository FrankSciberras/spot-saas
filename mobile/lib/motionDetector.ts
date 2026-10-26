import { Platform } from 'react-native';
import { DeviceMotion, type DeviceMotionMeasurement } from 'expo-sensors';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Harsh-driving detection, entirely on-device (v2, app 1.0.4).
 *
 * While tracking is on we sample the motion sensor at ~10 Hz:
 *
 *  1. Only HORIZONTAL force counts. The OS separates gravity from the phone's
 *     own acceleration, so we know which way is "down" whatever the phone's
 *     angle, and drop the vertical part — potholes and speed bumps no longer
 *     look like harsh driving.
 *  2. A harsh event is a SUSTAINED burst above the threshold (≥ 400 ms). If the
 *     phone itself tilted a lot during the burst it was picked up / dropped,
 *     not the car — those are discarded.
 *  3. The gyroscope's spin around the vertical axis is the car's turn rate,
 *     which tells sharp cornering apart from braking/accelerating.
 *  4. Right after an event we take precise 1-second GPS fixes for a few
 *     seconds: exact location, speed after, and a short trail for the map.
 *  5. Direction of the force: the phone learns which way is "forward" in its
 *     mount by comparing its own acceleration with GPS speed changes during
 *     normal driving. Once it knows, a forward force = acceleration, backward
 *     = braking, sideways = cornering — no matter how stale GPS speed is.
 *     The learning resets by itself when the phone is moved to another angle.
 *
 * Detected events go into a small AsyncStorage queue; the location task
 * uploads them with its next fix. Only small event rows (plus a handful of
 * GPS points) ever leave the phone — never raw sensor streams.
 *
 * Runs while the app process is alive (during tracking Android keeps it alive
 * via the location foreground service; on iOS detection may pause when the
 * app is fully backgrounded — accepted limitation).
 *
 * THRESHOLDS ARE A STARTING POINT — expect to tune with real driving data.
 */

const SAMPLE_MS = 100;              // ~10 Hz
const THRESHOLD_MS2 = 3.2;          // sustained horizontal force ≈ 0.33 g
const SUSTAIN_SAMPLES = 4;          // ≥ 400 ms above threshold
const END_QUIET_SAMPLES = 2;        // burst ends after 200 ms below threshold
const MAX_BURST_MS = 8_000;
const EVENT_COOLDOWN_MS = 10_000;   // one event max per 10 s
const MAX_PLAUSIBLE_MS2 = 14;       // > 1.4 g sideways: the phone fell, not the car
const HANDLED_TILT_DEG = 25;        // phone tilted this much mid-burst → picked up
const TURN_RATE_DEG_S = 12;         // average turn rate that counts as cornering
const CAPTURE_MS = 8_000;           // precise GPS after an event
const MAX_QUEUE = 20;               // bound storage if uploads are failing

// Learning "forward" from normal driving (see 5. above).
const CAL_MIN_SPEED_CHANGE = 3;     // m/s between two GPS fixes
const CAL_MAX_HEADING_CHANGE = 20;  // degrees — window must be roughly straight
const CAL_SAME_MOUNT_DEG = 15;      // gravity within this angle = same phone position
const CAL_CONFIDENT = 3;            // agreeing samples before the direction is trusted
const CAL_MAX_AGE_MS = 12 * 3600_000;

const QUEUE_KEY = 'rovora.motionEvents';
const CAL_KEY = 'rovora.motionCalibration';
export const LAST_SPEED_KEY = 'rovora.lastGpsSpeed';
export const RECENT_FIXES_KEY = 'rovora.recentFixes';

type Vec = [number, number, number];
export type HarshKind = 'harsh_brake' | 'harsh_accel' | 'harsh_turn';

export interface TrailPoint {
  lat: number;
  lng: number;
  s: number | null; // km/h
  dt: number;       // seconds relative to the event (negative = before)
}

/** A GPS fix the location task remembers for the detector. */
export interface RecentFix {
  lat: number;
  lng: number;
  speed: number | null;   // m/s
  heading: number | null; // degrees
  t: number;              // epoch ms
}

export interface PendingMotionEvent {
  t: number;                  // epoch ms of the event start
  magnitude: number;          // peak horizontal force during the burst, m/s²
  speedBefore: number | null; // GPS speed (m/s) shortly before the event
  // Added in app 1.0.4 — absent on events queued by older versions.
  speedAfter?: number | null; // fresh GPS speed (m/s) right after the event
  durationMs?: number;
  kind?: HarshKind | null;    // null = undecided; the uploader falls back to GPS
  classifiedBy?: 'sensor' | 'gps' | 'turn' | null;
  turnRate?: number | null;   // °/s
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  heading?: number | null;
  trail?: TrailPoint[] | null;
}

interface Calibration {
  g: Vec;     // gravity direction (phone frame) when learned
  brake: Vec; // unit horizontal direction of a braking force (phone frame)
  n: number;  // agreeing samples
  at: number;
}

interface Burst {
  start: number;
  count: number;
  quiet: number;
  peak: number;
  sum: Vec;
  yawSum: number;
  yawN: number;
  gStart: Vec;
  maxTilt: number;
}

// ── vector helpers ───────────────────────────────────────────────────────────
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec): number => Math.sqrt(dot(a, a));
const unit = (a: Vec): Vec => {
  const n = norm(a);
  return n > 1e-6 ? scale(a, 1 / n) : [0, 0, 0];
};
const angleDeg = (a: Vec, b: Vec): number =>
  (Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) * 180) / Math.PI;
const headingDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

// ── state ────────────────────────────────────────────────────────────────────
let subscription: { remove: () => void } | null = null;
let gravity: Vec | null = null;     // smoothed "down" direction, phone frame
let bias: Vec = [0, 0, 0];          // slow drift of the horizontal sensor reading
let burst: Burst | null = null;
let lastEventAt = 0;
let calibration: Calibration | null = null;
let sampleCount = 0;

// Integration window between two GPS fixes, for learning "forward".
let win: { sum: Vec; g: Vec; maxTilt: number; last: number } | null = null;
let lastFix: RecentFix | null = null;
let checkingFix = false;

async function pushEvent(event: PendingMotionEvent): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue = raw ? (JSON.parse(raw) as PendingMotionEvent[]) : [];
    queue.push(event);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
  } catch {
    // storage hiccup — drop the event rather than disturb tracking
  }
}

/** Read and clear the pending queue (called by the location task per fix). */
export async function drainMotionEvents(): Promise<PendingMotionEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    await AsyncStorage.removeItem(QUEUE_KEY);
    return JSON.parse(raw) as PendingMotionEvent[];
  } catch {
    return [];
  }
}

// ── learning which way is forward ────────────────────────────────────────────
function usableCalibration(): Calibration | null {
  if (!calibration || !gravity) return null;
  if (Date.now() - calibration.at > CAL_MAX_AGE_MS) return null;
  if (angleDeg(calibration.g, gravity) > CAL_SAME_MOUNT_DEG) return null;
  return calibration;
}

/** Feed one observation of "this is what braking looks like" (unit, horizontal). */
function learnBrakeDirection(candidate: Vec): void {
  if (!gravity || norm(candidate) < 0.5) return;
  const cal = usableCalibration();
  if (!cal) {
    calibration = { g: gravity, brake: candidate, n: 1, at: Date.now() };
  } else {
    const agree = dot(cal.brake, candidate);
    if (agree >= 0.8) {
      // Running average, capped so the phone can still adapt.
      const w = Math.min(cal.n, 8);
      calibration = {
        g: gravity,
        brake: unit(add(scale(cal.brake, w), candidate)),
        n: cal.n + 1,
        at: Date.now(),
      };
    } else if (agree < 0.3) {
      // Disagreement: lose confidence, and start over when it's gone.
      calibration = cal.n <= 1
        ? { g: gravity, brake: candidate, n: 1, at: Date.now() }
        : { ...cal, n: cal.n - 1 };
    }
  }
  void AsyncStorage.setItem(CAL_KEY, JSON.stringify(calibration)).catch(() => {});
}

/** Called every ~2 s: when the location task has stored a new fix, compare
 *  the phone's integrated horizontal acceleration with the GPS speed change. */
async function checkForNewFix(): Promise<void> {
  if (checkingFix) return;
  checkingFix = true;
  try {
    const raw = await AsyncStorage.getItem(LAST_SPEED_KEY);
    if (!raw) return;
    const fix = JSON.parse(raw) as RecentFix;
    if (lastFix && fix.t === lastFix.t) return;

    const prev = lastFix;
    const w = win;
    lastFix = fix;
    win = gravity ? { sum: [0, 0, 0], g: gravity, maxTilt: 0, last: Date.now() } : null;
    if (!prev || !w || prev.speed == null || fix.speed == null) return;

    const seconds = (fix.t - prev.t) / 1000;
    const dv = fix.speed - prev.speed;
    if (seconds < 8 || seconds > 45 || Math.abs(dv) < CAL_MIN_SPEED_CHANGE) return;
    if (w.maxTilt > 10) return; // phone moved during the window
    if (prev.heading != null && fix.heading != null && headingDiff(prev.heading, fix.heading) > CAL_MAX_HEADING_CHANGE) return;

    // ∫a dt should roughly equal the GPS speed change; if not, the sensor
    // drifted or the window didn't line up — skip rather than learn noise.
    const integrated = norm(w.sum);
    if (integrated < Math.abs(dv) * 0.5 || integrated > Math.abs(dv) * 2) return;

    // Speeding up: the integral points forward, so braking is the opposite.
    learnBrakeDirection(dv > 0 ? scale(unit(w.sum), -1) : unit(w.sum));
  } catch {
    // learning is best effort
  } finally {
    checkingFix = false;
  }
}

// ── event capture ────────────────────────────────────────────────────────────
async function readRecentFixes(): Promise<RecentFix[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_FIXES_KEY);
    return raw ? (JSON.parse(raw) as RecentFix[]) : [];
  } catch {
    return [];
  }
}

/** Precise 1-second GPS fixes for a few seconds right after an event. */
async function captureGpsAfter(): Promise<Location.LocationObject[]> {
  const points: Location.LocationObject[] = [];
  let sub: Location.LocationSubscription | null = null;
  try {
    sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
      (loc) => {
        points.push(loc);
      }
    );
    await new Promise((resolve) => setTimeout(resolve, CAPTURE_MS));
  } catch {
    // no precise GPS right now — the uploader falls back to the next normal fix
  } finally {
    try {
      sub?.remove();
    } catch {
      // already gone
    }
  }
  return points;
}

const validSpeed = (s: number | null | undefined): number | null => (s != null && s >= 0 ? s : null);
const kmh = (s: number | null): number | null => (s == null ? null : Math.round(s * 3.6));

interface Classified {
  kind: HarshKind | null;
  by: 'sensor' | 'gps' | 'turn' | null;
}

function classify(
  dir: Vec,
  turnRate: number | null,
  speedBefore: number | null,
  speedAfter: number | null,
  beforeAgeMs: number | null
): Classified {
  const delta = speedBefore != null && speedAfter != null ? speedAfter - speedBefore : null;
  const gpsKind: HarshKind | null =
    delta == null ? null : delta <= -1.4 ? 'harsh_brake' : delta >= 1.4 ? 'harsh_accel' : null;

  // 1. Direction of the force, once the phone has learned its mount.
  const cal = usableCalibration();
  if (cal && cal.n >= CAL_CONFIDENT) {
    const cos = dot(dir, cal.brake);
    let sensorKind: HarshKind | null = null;
    if (cos >= 0.6) sensorKind = 'harsh_brake';
    else if (cos <= -0.6) sensorKind = 'harsh_accel';
    else if (Math.abs(cos) <= 0.45) sensorKind = 'harsh_turn';

    // A fresh, clearly opposite GPS reading beats the sensor (and means the
    // learned direction is off — e.g. the phone was turned in its holder).
    const freshOpposite =
      gpsKind && sensorKind && sensorKind !== 'harsh_turn' && gpsKind !== sensorKind &&
      beforeAgeMs != null && beforeAgeMs <= 8_000 && Math.abs(delta!) >= 4;
    if (freshOpposite) {
      learnBrakeDirection(gpsKind === 'harsh_brake' ? dir : scale(dir, -1));
      return { kind: gpsKind, by: 'gps' };
    }
    if (sensorKind) return { kind: sensorKind, by: 'sensor' };
  }

  // 2. GPS speed change around the event.
  if (gpsKind) {
    // A clear, straight-line event also teaches the phone which way is forward.
    if (Math.abs(delta!) >= 2.5 && (turnRate == null || turnRate < 8)) {
      learnBrakeDirection(gpsKind === 'harsh_brake' ? dir : scale(dir, -1));
    }
    return { kind: gpsKind, by: 'gps' };
  }

  // 3. Turning fast with no clear speed change = cornering.
  if (turnRate != null && turnRate >= TURN_RATE_DEG_S) return { kind: 'harsh_turn', by: 'turn' };

  return { kind: null, by: null };
}

async function captureEvent(b: Burst, endedAt: number): Promise<void> {
  try {
    const dir = unit(b.sum);
    const turnRate = b.yawN > 0 ? Math.round((b.yawSum / b.yawN) * 10) / 10 : null;

    const recent = await readRecentFixes();
    const before = [...recent].reverse().find((f) => f.t <= b.start && b.start - f.t <= 30_000) || null;
    const speedBefore = validSpeed(before?.speed);
    const beforeAgeMs = before ? b.start - before.t : null;

    const after = await captureGpsAfter();
    const firstWithSpeed = after.find((p) => validSpeed(p.coords.speed) != null) || null;
    const speedAfter = validSpeed(firstWithSpeed?.coords.speed);
    const at = after[0] || null;

    const { kind, by } = classify(dir, turnRate, speedBefore, speedAfter, beforeAgeMs);

    const trail: TrailPoint[] = [
      ...recent
        .filter((f) => f.t <= b.start && b.start - f.t <= 90_000)
        .map((f) => ({ lat: f.lat, lng: f.lng, s: kmh(validSpeed(f.speed)), dt: Math.round((f.t - b.start) / 1000) })),
      ...after
        .filter((_, i) => i % 2 === 0) // ~every 2 s is plenty for the map
        .map((p) => ({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          s: kmh(validSpeed(p.coords.speed)),
          dt: Math.round((p.timestamp - b.start) / 1000),
        })),
    ];

    await pushEvent({
      t: b.start,
      magnitude: Math.round(b.peak * 100) / 100,
      durationMs: endedAt - b.start,
      speedBefore,
      // An empty capture leaves speedAfter undefined so the uploader can
      // still classify with its own next fix (pre-1.0.4 behaviour).
      speedAfter: after.length > 0 ? speedAfter : undefined,
      kind,
      classifiedBy: by,
      turnRate,
      latitude: at?.coords.latitude ?? null,
      longitude: at?.coords.longitude ?? null,
      accuracy: at?.coords.accuracy != null ? Math.round(at.coords.accuracy) : null,
      heading: at?.coords.heading != null && at.coords.heading >= 0 ? Math.round(at.coords.heading) : null,
      trail: trail.length > 0 ? trail : null,
    });
  } catch {
    // never let capture disturb tracking
  }
}

function finishBurst(now: number): void {
  const b = burst;
  burst = null;
  if (!b || b.count < SUSTAIN_SAMPLES) return;
  if (b.start - lastEventAt < EVENT_COOLDOWN_MS) return;
  // Phone handled or dropped — not the car.
  if (b.peak > MAX_PLAUSIBLE_MS2 || b.maxTilt > HANDLED_TILT_DEG) return;
  lastEventAt = b.start;
  void captureEvent(b, now);
}

function onMeasurement(m: DeviceMotionMeasurement): void {
  const a = m.acceleration;
  const ag = m.accelerationIncludingGravity;
  if (!a || !ag) return;
  const now = Date.now();

  const acc: Vec = [a.x, a.y, a.z];
  const g: Vec = [ag.x - a.x, ag.y - a.y, ag.z - a.z];
  const gLen = norm(g);
  if (gLen < 6 || gLen > 14) return; // not a usable gravity reading
  const down = scale(g, 1 / gLen);
  const prevGravity = gravity || down;
  gravity = unit(add(scale(prevGravity, 0.9), scale(down, 0.1)));

  // Horizontal part of the phone's acceleration = what the car did.
  const h = sub(acc, scale(down, dot(acc, down)));
  const hMag = norm(h);

  // Car's turn rate = spin around the vertical axis (alpha↔z, beta↔x, gamma↔y).
  const rr = m.rotationRate;
  const yaw = rr ? Math.abs(rr.beta * down[0] + rr.gamma * down[1] + rr.alpha * down[2]) : null;

  // Learning window: integrate drift-corrected horizontal acceleration.
  bias = add(scale(bias, 0.9997), scale(h, 0.0003)); // ~5 min average
  if (win) {
    const dt = Math.min(0.5, (now - win.last) / 1000);
    win.sum = add(win.sum, scale(sub(h, bias), dt));
    win.last = now;
    win.maxTilt = Math.max(win.maxTilt, angleDeg(win.g, down));
  }
  if (++sampleCount % 20 === 0) void checkForNewFix();

  if (hMag >= THRESHOLD_MS2) {
    if (!burst) {
      burst = { start: now, count: 0, quiet: 0, peak: 0, sum: [0, 0, 0], yawSum: 0, yawN: 0, gStart: prevGravity, maxTilt: 0 };
    }
    burst.count++;
    burst.quiet = 0;
    if (hMag > burst.peak) burst.peak = hMag;
    burst.sum = add(burst.sum, h);
    if (yaw != null) {
      burst.yawSum += yaw;
      burst.yawN++;
    }
  } else if (burst) {
    burst.quiet++;
  }

  if (burst) {
    burst.maxTilt = Math.max(burst.maxTilt, angleDeg(burst.gStart, down));
    if (burst.quiet >= END_QUIET_SAMPLES || now - burst.start > MAX_BURST_MS) finishBurst(now);
  }
}

function resetState(): void {
  gravity = null;
  bias = [0, 0, 0];
  burst = null;
  win = null;
  lastFix = null;
  sampleCount = 0;
}

export async function startMotionDetection(): Promise<void> {
  try {
    if (subscription) return;
    if (!(await DeviceMotion.isAvailableAsync())) return;
    // On Android, expo-sensors asks for ACTIVITY_RECOGNITION ("physical
    // activity") here, but the sensors DeviceMotion reads (accelerometer,
    // gyroscope) need no permission. That permission makes Google Play treat
    // the app as a health app, so it's removed from the manifest
    // (app.json blockedPermissions) and the request is skipped on Android.
    if (Platform.OS !== 'android') {
      const { status } = await DeviceMotion.requestPermissionsAsync();
      if (status !== 'granted') return;
    }
    try {
      const raw = await AsyncStorage.getItem(CAL_KEY);
      calibration = raw ? (JSON.parse(raw) as Calibration) : null;
    } catch {
      calibration = null;
    }
    DeviceMotion.setUpdateInterval(SAMPLE_MS);
    resetState();
    subscription = DeviceMotion.addListener(onMeasurement);
  } catch {
    // sensors unavailable — tracking works fine without behaviour detection
  }
}

export function stopMotionDetection(): void {
  try {
    subscription?.remove();
  } catch {
    // already gone
  }
  subscription = null;
  resetState();
}
