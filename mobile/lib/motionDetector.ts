import { DeviceMotion, type DeviceMotionMeasurement } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Harsh-driving detection, entirely on-device.
 *
 * While tracking is on we sample gravity-free acceleration at ~10 Hz. A harsh
 * event is a SUSTAINED burst above the threshold (several consecutive samples),
 * which filters out potholes, door slams and phone handling. Detected events
 * go into a small AsyncStorage queue; the location task drains the queue on
 * the next GPS fix, classifies each event as braking or acceleration by
 * comparing GPS speed before/after, and uploads it. Only tiny event rows ever
 * leave the phone — never raw sensor streams.
 *
 * Runs while the app process is alive (during tracking Android keeps it alive
 * via the location foreground service; on iOS detection may pause when the
 * app is fully backgrounded — accepted v1 limitation).
 *
 * THRESHOLDS ARE A STARTING POINT — expect to tune with real driving data.
 */

const SAMPLE_MS = 100;             // ~10 Hz
const THRESHOLD_MS2 = 3.2;         // sustained horizontal g-force ≈ 0.33 g
const SUSTAIN_SAMPLES = 4;         // ≥ 400 ms above threshold
const EVENT_COOLDOWN_MS = 10_000;  // one event max per 10 s
const MAX_QUEUE = 20;              // bound storage if uploads are failing

const QUEUE_KEY = 'rovora.motionEvents';
export const LAST_SPEED_KEY = 'rovora.lastGpsSpeed';

export interface PendingMotionEvent {
  t: number;                  // epoch ms of the event
  magnitude: number;          // peak acceleration during the burst, m/s²
  speedBefore: number | null; // last GPS speed (m/s) seen before the event
}

let subscription: { remove: () => void } | null = null;
let overCount = 0;
let peak = 0;
let lastEventAt = 0;

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

function onMeasurement(m: DeviceMotionMeasurement): void {
  const a = m.acceleration;
  if (!a) return;
  const magnitude = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);

  if (magnitude >= THRESHOLD_MS2) {
    overCount++;
    if (magnitude > peak) peak = magnitude;
    if (overCount === SUSTAIN_SAMPLES && Date.now() - lastEventAt >= EVENT_COOLDOWN_MS) {
      lastEventAt = Date.now();
      const eventPeak = peak;
      void (async () => {
        let speedBefore: number | null = null;
        try {
          const raw = await AsyncStorage.getItem(LAST_SPEED_KEY);
          if (raw) {
            const last = JSON.parse(raw) as { speed: number | null; t: number };
            // Only trust a speed from the last 45 s.
            if (last.speed != null && Date.now() - last.t <= 45_000) speedBefore = last.speed;
          }
        } catch {
          // no usable prior speed
        }
        await pushEvent({ t: Date.now(), magnitude: Math.round(eventPeak * 100) / 100, speedBefore });
      })();
    }
  } else {
    overCount = 0;
    peak = 0;
  }
}

export async function startMotionDetection(): Promise<void> {
  try {
    if (subscription) return;
    if (!(await DeviceMotion.isAvailableAsync())) return;
    const { status } = await DeviceMotion.requestPermissionsAsync();
    if (status !== 'granted') return;
    DeviceMotion.setUpdateInterval(SAMPLE_MS);
    overCount = 0;
    peak = 0;
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
  overCount = 0;
  peak = 0;
}
