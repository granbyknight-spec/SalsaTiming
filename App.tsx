import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MainPlayer from './src/components/MainPlayer';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={ebStyles.container}>
          <Text style={ebStyles.title}>Something went wrong</Text>
          <Text style={ebStyles.message}>{this.state.error.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const ebStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '700', color: '#e94560', marginBottom: 12 },
  message: { fontSize: 14, color: '#8899aa', textAlign: 'center' },
});

export default function App() {
  return (
    <ErrorBoundary>
      <MainPlayer />
    </ErrorBoundary>
  );
}
