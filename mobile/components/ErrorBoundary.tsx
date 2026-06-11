import { Component, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors } from '../lib/theme';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Shows the error on screen instead of crashing to the home screen. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>
          Please screenshot this and send it to support:
        </Text>
        <Text style={styles.detail}>
          {this.state.error.message}
          {'\n\n'}
          {this.state.error.stack?.slice(0, 1500)}
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => this.setState({ error: null })}>
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingTop: 80 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  message: { color: colors.textDim, fontSize: 14, marginTop: 8 },
  detail: {
    color: colors.warn,
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 16,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
