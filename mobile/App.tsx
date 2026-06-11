import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearLastCrash, getLastCrash, installCrashLogger, type CrashReport } from './lib/crashLog';
import PortalScreen from './screens/PortalScreen';
import ErrorBoundary from './components/ErrorBoundary';
import { colors } from './lib/theme';

// Capture fatal JS errors to storage so the next launch can show them.
installCrashLogger();

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <StatusBar style="light" />
        <Main />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

function Main() {
  const [crash, setCrash] = useState<CrashReport | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    getLastCrash().then((c) => {
      setCrash(c);
      setChecked(true);
    });
  }, []);

  if (!checked) return null;

  if (crash) {
    return (
      <CrashScreen
        crash={crash}
        onContinue={async () => {
          await clearLastCrash();
          setCrash(null);
        }}
      />
    );
  }

  return <PortalScreen />;
}

function CrashScreen({ crash, onContinue }: { crash: CrashReport; onContinue: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.crashPage}
      contentContainerStyle={[styles.crashWrap, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
    >
      <Text style={styles.crashTitle}>The app crashed last time</Text>
      <Text style={styles.crashSub}>Please screenshot this screen and send it to support.</Text>
      <Text style={styles.crashDetail}>
        {crash.at}
        {'\n\n'}
        {crash.message}
        {'\n\n'}
        {crash.stack.slice(0, 1500)}
      </Text>
      <TouchableOpacity style={styles.crashBtn} onPress={onContinue}>
        <Text style={styles.crashBtnText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  crashPage: { flex: 1, backgroundColor: colors.bg },
  crashWrap: { padding: 24 },
  crashTitle: { color: colors.text, fontSize: 19, fontWeight: '700' },
  crashSub: { color: colors.textDim, fontSize: 13.5, marginTop: 6 },
  crashDetail: {
    color: colors.warn,
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 16,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
  },
  crashBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 20,
  },
  crashBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
