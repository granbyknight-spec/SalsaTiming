import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAppStore } from '../store/appStore';
import { setMode as setSequencerMode } from '../engine/sequencer';
import { MODE_LABELS, TimingMode } from '../constants/timing';

// Ordered list of modes for tab rendering
const MODES: TimingMode[] = ['on1', 'on2_son', 'on2_soft_mambo', 'on2_hard_mambo'];

// ---------------------------------------------------------------------------
// ModeSelector -- horizontal tab-style mode picker
// ---------------------------------------------------------------------------
const ModeSelector: React.FC = () => {
  const currentMode = useAppStore((s) => s.mode);
  const storeSetMode = useAppStore((s) => s.setMode);

  const handleSelect = useCallback(
    (mode: TimingMode) => {
      storeSetMode(mode);
      setSequencerMode(mode);
    },
    [storeSetMode],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Mode</Text>
      <View style={styles.row}>
        {MODES.map((mode) => {
          const isActive = mode === currentMode;
          return (
            <TouchableOpacity
              key={mode}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => handleSelect(mode)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {MODE_LABELS[mode]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
  },
  heading: {
    color: '#8899aa',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: '#e94560',
  },
  tabText: {
    color: '#8899aa',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#ffffff',
  },
});

export default ModeSelector;
