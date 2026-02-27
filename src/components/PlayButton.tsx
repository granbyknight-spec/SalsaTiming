import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAppStore } from '../store/appStore';
import { startSequencer, stopSequencer } from '../engine/sequencer';

// ---------------------------------------------------------------------------
// PlayButton -- large circular play/stop toggle
// ---------------------------------------------------------------------------
const PlayButton: React.FC = () => {
  const isPlaying = useAppStore((s) => s.isPlaying);
  const setPlaying = useAppStore((s) => s.setPlaying);

  const handlePress = useCallback(() => {
    if (isPlaying) {
      stopSequencer();
      setPlaying(false);
    } else {
      startSequencer();
      setPlaying(true);
    }
  }, [isPlaying, setPlaying]);

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={[styles.button, isPlaying && styles.buttonPlaying]}
        onPress={handlePress}
        activeOpacity={0.75}
      >
        {isPlaying ? (
          // Stop icon (filled square)
          <View style={styles.stopIcon} />
        ) : (
          // Play icon (triangle via borders)
          <View style={styles.playIcon} />
        )}
      </TouchableOpacity>
      <Text style={styles.label}>{isPlaying ? 'Stop' : 'Play'}</Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const BUTTON_SIZE = 96;

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: '#e94560',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
  },
  buttonPlaying: {
    backgroundColor: '#c0392b',
  },
  // Play triangle – drawn with transparent borders
  playIcon: {
    width: 0,
    height: 0,
    borderLeftWidth: 30,
    borderTopWidth: 20,
    borderBottomWidth: 20,
    borderLeftColor: '#ffffff',
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    marginLeft: 6, // optical centre adjustment
  },
  // Stop square
  stopIcon: {
    width: 30,
    height: 30,
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  label: {
    color: '#8899aa',
    fontSize: 13,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
});

export default PlayButton;
