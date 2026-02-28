import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { getDiagLog, getDebugState } from '../engine/sequencer';
import * as Tone from 'tone';

// ---------------------------------------------------------------------------
// DebugPanel — on-screen diagnostic display for debugging audio issues
// on devices without console access (iPhone Safari).
// ---------------------------------------------------------------------------
const DebugPanel: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [log, setLog] = useState<readonly string[]>([]);
  const [state, setState] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState('');

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

  /**
   * iOS Safari silent-mode workaround:
   * Play a tiny silent <audio> element to switch the audio session
   * from "ambient" (respects silent switch) to "playback" (ignores it).
   * Then play a test tone through raw Web Audio API, bypassing Tone.js entirely.
   */
  const playTestTone = useCallback(async () => {
    setTestResult('Starting test...');
    try {
      // Step 1: iOS silent-mode workaround — play a tiny audio element
      if (Platform.OS === 'web') {
        try {
          // Create a tiny silent WAV as a data URI
          // This is a valid 44-byte WAV header + 2 bytes of silence
          const silentWav = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGFkYQAAAAA=';
          const audio = new Audio(silentWav);
          audio.volume = 0.01;
          await audio.play().catch(() => {});
          setTestResult('Step 1: HTML Audio played (silent mode bypass)');
        } catch {
          setTestResult('Step 1: HTML Audio failed (ok, continuing)');
        }
      }

      // Step 2: Ensure Tone.js AudioContext is running
      await Tone.start();
      const ctxState = Tone.getContext().state;
      setTestResult(`Step 2: Tone.start() done. Context: ${ctxState}`);

      // Step 3: Play a raw Web Audio API oscillator (bypasses Tone.js entirely)
      const ctx = Tone.getContext().rawContext;
      if (ctx) {
        const osc = (ctx as AudioContext).createOscillator();
        const gain = (ctx as AudioContext).createGain();
        osc.frequency.value = 440; // A4 note
        osc.type = 'sine';
        gain.gain.value = 0.5;
        osc.connect(gain);
        gain.connect((ctx as AudioContext).destination);
        osc.start();
        osc.stop((ctx as AudioContext).currentTime + 0.3);
        setTestResult(prev =>
          prev + '\nStep 3: Raw 440Hz oscillator → destination (0.3s)'
        );
      }

      // Step 4: Also play a Tone.js synth directly to destination
      const synth = new Tone.Synth({ volume: 0 }).toDestination();
      synth.triggerAttackRelease('C5', '8n');
      setTestResult(prev =>
        prev + '\nStep 4: Tone.Synth C5 → toDestination()'
      );

      // Step 5: Play via MetalSynth through gain (same as our cowbell)
      const metal = new Tone.MetalSynth({
        frequency: 800,
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4000,
        octaves: 1.5,
        volume: 0,
      }).toDestination();
      setTimeout(() => {
        metal.triggerAttackRelease('8n');
        setTestResult(prev =>
          prev + '\nStep 5: MetalSynth → toDestination() (delayed 500ms)'
        );
      }, 500);

    } catch (err) {
      setTestResult(`ERROR: ${err}`);
    }
  }, []);

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

      {/* Test Tone button */}
      <TouchableOpacity style={styles.testBtn} onPress={playTestTone}>
        <Text style={styles.testBtnText}>Play Test Tone (tap here first!)</Text>
      </TouchableOpacity>
      {testResult ? (
        <Text style={styles.testResult}>{testResult}</Text>
      ) : null}

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
    maxHeight: 500,
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
  testBtn: {
    backgroundColor: '#1a6b3a',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  testBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  testResult: {
    color: '#c9d1d9',
    fontSize: 11,
    fontFamily: 'monospace',
    backgroundColor: '#161b22',
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
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
