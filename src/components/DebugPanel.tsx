import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { getDiagLog, getDebugState } from '../engine/sequencer';

// ---------------------------------------------------------------------------
// DebugPanel — on-screen diagnostic display for debugging audio issues
// on devices without console access (iPhone Safari).
// ---------------------------------------------------------------------------
const DebugPanel: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [log, setLog] = useState<readonly string[]>([]);
  const [state, setState] = useState<Record<string, string>>({});

  const refresh = useCallback(() => {
    setLog([...getDiagLog()]);
    setState({ ...getDebugState() });
  }, []);

  const toggle = useCallback(() => {
    setVisible((v) => {
      if (!v) refresh(); // refresh when opening
      return !v;
    });
  }, [refresh]);

  if (!visible) {
    return (
      <TouchableOpacity style={styles.toggleBtn} onPress={toggle}>
        <Text style={styles.toggleText}>Show Debug</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Audio Debug</Text>
        <TouchableOpacity onPress={refresh} style={styles.refreshBtn}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggle} style={styles.closeBtn}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      {/* State table */}
      <View style={styles.stateSection}>
        {Object.entries(state).map(([key, val]) => (
          <View key={key} style={styles.stateRow}>
            <Text style={styles.stateKey}>{key}</Text>
            <Text style={[
              styles.stateVal,
              val === 'running' && styles.green,
              val === 'suspended' && styles.red,
              val === 'null' && styles.red,
              val === 'false' && styles.yellow,
            ]}>
              {val}
            </Text>
          </View>
        ))}
      </View>

      {/* Log */}
      <ScrollView style={styles.logScroll}>
        {log.length === 0 ? (
          <Text style={styles.logEmpty}>No log entries yet. Press Play then Refresh.</Text>
        ) : (
          log.map((entry, i) => (
            <Text key={i} style={styles.logLine}>{entry}</Text>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  toggleBtn: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#16213e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334466',
    marginTop: 12,
  },
  toggleText: {
    color: '#8899aa',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  container: {
    backgroundColor: '#0d1117',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334466',
    marginTop: 12,
    padding: 12,
    maxHeight: 400,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    color: '#e94560',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  refreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#1a3050',
    borderRadius: 4,
    marginRight: 8,
  },
  refreshText: { color: '#4da6ff', fontSize: 12 },
  closeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#3a1020',
    borderRadius: 4,
  },
  closeText: { color: '#e94560', fontSize: 12 },
  stateSection: {
    backgroundColor: '#161b22',
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
  },
  stateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  stateKey: { color: '#8899aa', fontSize: 11, fontFamily: 'monospace' },
  stateVal: { color: '#ffffff', fontSize: 11, fontFamily: 'monospace', fontWeight: '600' },
  green: { color: '#3fb950' },
  red: { color: '#f85149' },
  yellow: { color: '#d29922' },
  logScroll: {
    maxHeight: 200,
  },
  logEmpty: { color: '#555', fontSize: 11, fontStyle: 'italic' },
  logLine: { color: '#c9d1d9', fontSize: 10, fontFamily: 'monospace', lineHeight: 16 },
});

export default DebugPanel;
