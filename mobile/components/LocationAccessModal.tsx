import { useRef } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ALWAYS_LABEL, PRECISE_LABEL, type LocationProblem } from '../lib/locationAccess';
import { colors } from '../lib/theme';

const IOS = Platform.OS === 'ios';

/** A location-access problem, or 'sharing_off': on shift, access is fine, but sharing isn't running. */
export type ModalReason = LocationProblem | 'sharing_off';

const COPY: Record<ModalReason, { title: string; body: string; button: string; hint: string | null }> = {
  sharing_off: {
    title: 'Location sharing is off',
    body: "You're on shift, but your fleet can't see you on the live map.",
    button: 'Turn on sharing',
    hint: null,
  },
  services_off: {
    title: 'Turn on location',
    body: "Location is switched off on this phone, so your fleet can't see you on the live map.",
    button: IOS ? 'Open Settings' : 'Turn on location',
    hint: IOS ? 'In Settings, go to Privacy & Security → Location Services and switch it on.' : null,
  },
  no_permission: {
    title: 'Allow location access',
    body: "Rovora isn't allowed to use your location, so your fleet can't see you on the live map.",
    button: 'Allow location',
    hint: IOS
      ? `If Settings opens, tap Location and choose "${ALWAYS_LABEL}".`
      : `If Settings opens, tap Permissions → Location and choose "${ALWAYS_LABEL}".`,
  },
  not_always: {
    title: `Set location to "${ALWAYS_LABEL}"`,
    body:
      'Rovora can only see your location while the app is open on screen. ' +
      'Your fleet loses you as soon as you switch apps or lock the phone.',
    button: IOS ? 'Open Settings' : 'Open location settings',
    hint: IOS
      ? `In Settings, tap Location and choose "${ALWAYS_LABEL}".`
      : `Choose "${ALWAYS_LABEL}". If App info opens instead, tap Permissions → Location first.`,
  },
  approximate: {
    title: `Turn on ${PRECISE_LABEL}`,
    body: 'Rovora only has your approximate location, so your position on the live map can be off by kilometres.',
    button: IOS ? 'Open Settings' : 'Open location settings',
    hint: IOS
      ? `In Settings, tap Location and switch on "${PRECISE_LABEL}".`
      : `Tap Permissions → Location and switch on "${PRECISE_LABEL}".`,
  },
};

interface Props {
  /** null hides the modal. */
  reason: ModalReason | null;
  fixing: boolean;
  onFix: () => void;
  onDismiss: () => void;
}

/**
 * Shown when the driver starts sharing (going online starts it) but the phone
 * isn't set up for background tracking, and again while they're on shift
 * without sharing. Doubles as the prominent disclosure Google Play / the App
 * Store require before asking for background location.
 */
export default function LocationAccessModal({ reason, fixing, onFix, onDismiss }: Props) {
  // Keep the last content on screen while the modal fades out.
  const lastRef = useRef<ModalReason>('no_permission');
  if (reason) lastRef.current = reason;
  const shown = reason ?? lastRef.current;
  const copy = COPY[shown];

  return (
    <Modal visible={reason !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>

          {shown !== 'sharing_off' && (
            <View style={styles.checklist}>
              <Text style={styles.checklistHead}>Needed for live tracking</Text>
              {shown === 'services_off' ? (
                <Text style={styles.checkItem}>• Location: On</Text>
              ) : (
                <>
                  <Text style={styles.checkItem}>• Location: {ALWAYS_LABEL}</Text>
                  <Text style={styles.checkItem}>• {PRECISE_LABEL}: On</Text>
                </>
              )}
            </View>
          )}

          {copy.hint && <Text style={styles.hint}>{copy.hint}</Text>}

          <TouchableOpacity style={styles.button} onPress={onFix} disabled={fixing}>
            {fixing ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{copy.button}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={onDismiss} disabled={fixing}>
            <Text style={styles.secondaryText}>Not now</Text>
          </TouchableOpacity>

          <Text style={styles.disclosure}>
            Rovora collects your location, including in the background when the app is closed or not in
            use, to share your live position with your fleet operator while sharing is on. You can stop at
            any time.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 16,
    padding: 22,
  },
  title: { color: colors.text, fontSize: 19, fontWeight: '700' },
  body: { color: colors.textDim, fontSize: 14.5, lineHeight: 20, marginTop: 8 },
  checklist: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
  },
  checklistHead: { color: colors.textDim, fontSize: 12, fontWeight: '600', marginBottom: 4 },
  checkItem: { color: colors.text, fontSize: 14.5, marginTop: 2 },
  hint: { color: colors.warn, fontSize: 13, lineHeight: 18, marginTop: 12 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 18,
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  secondary: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  secondaryText: { color: colors.textDim, fontSize: 14.5, fontWeight: '600' },
  disclosure: { color: colors.textDim, fontSize: 11.5, lineHeight: 16, marginTop: 8, textAlign: 'center' },
});
