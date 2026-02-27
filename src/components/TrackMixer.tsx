import React, { useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  GestureResponderEvent,
  LayoutChangeEvent,
} from 'react-native';
import { useAppStore } from '../store/appStore';
import { updateVolumes } from '../engine/sequencer';

// ---------------------------------------------------------------------------
// Track volume configuration
// ---------------------------------------------------------------------------
interface TrackConfig {
  key: 'conga' | 'cowbell' | 'voice';
  label: string;
  color: string;
}

const TRACKS: TrackConfig[] = [
  { key: 'conga', label: 'Conga', color: '#e94560' },
  { key: 'cowbell', label: 'Cowbell', color: '#f5a623' },
  { key: 'voice', label: 'Voice', color: '#0f9b8e' },
];

// ---------------------------------------------------------------------------
// Custom horizontal volume slider (inline, no external deps)
// ---------------------------------------------------------------------------
interface VolumeSliderProps {
  value: number; // 0-1
  onValueChange: (v: number) => void;
  activeColor: string;
}

const VolumeSlider: React.FC<VolumeSliderProps> = ({
  value,
  onValueChange,
  activeColor,
}) => {
  const trackRef = useRef<View>(null);
  const trackWidth = useRef(0);
  const trackX = useRef(0);

  const fraction = Math.max(0, Math.min(1, value));

  const valueFromX = (pageX: number): number => {
    if (trackWidth.current === 0) return value;
    const ratio = Math.max(0, Math.min(1, (pageX - trackX.current) / trackWidth.current));
    return Math.round(ratio * 100) / 100; // two decimal places
  };

  const onLayout = (_e: LayoutChangeEvent) => {
    trackRef.current?.measureInWindow((x, _y, w) => {
      trackX.current = x;
      trackWidth.current = w;
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        onValueChange(valueFromX(evt.nativeEvent.pageX));
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        onValueChange(valueFromX(evt.nativeEvent.pageX));
      },
    }),
  ).current;

  return (
    <View
      ref={trackRef}
      onLayout={onLayout}
      style={sliderStyles.trackOuter}
      {...panResponder.panHandlers}
    >
      {/* Background track */}
      <View style={sliderStyles.track} />
      {/* Active (filled) track */}
      <View
        style={[
          sliderStyles.trackActive,
          { backgroundColor: activeColor, width: `${fraction * 100}%` as any },
        ]}
      />
      {/* Thumb */}
      <View
        style={[
          sliderStyles.thumb,
          {
            backgroundColor: activeColor,
            left: `${fraction * 100}%` as any,
          },
        ]}
      />
    </View>
  );
};

const sliderStyles = StyleSheet.create({
  trackOuter: {
    height: 36,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    height: 6,
    borderRadius: 3,
    width: '100%',
    position: 'absolute',
    backgroundColor: '#0d1b2a',
  },
  trackActive: {
    height: 6,
    borderRadius: 3,
    position: 'absolute',
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    position: 'absolute',
    marginLeft: -10,
    borderWidth: 2,
    borderColor: '#ffffff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
});

// ---------------------------------------------------------------------------
// Single track row
// ---------------------------------------------------------------------------
interface TrackRowProps {
  config: TrackConfig;
  value: number;
  onValueChange: (v: number) => void;
}

const TrackRow: React.FC<TrackRowProps> = ({ config, value, onValueChange }) => {
  const percentage = Math.round(value * 100);

  return (
    <View style={styles.trackRow}>
      <View style={styles.labelRow}>
        <Text style={styles.trackLabel}>{config.label}</Text>
        <Text style={[styles.trackPercent, { color: config.color }]}>
          {percentage}%
        </Text>
      </View>
      <VolumeSlider
        value={value}
        onValueChange={onValueChange}
        activeColor={config.color}
      />
    </View>
  );
};

// ---------------------------------------------------------------------------
// TrackMixer
// ---------------------------------------------------------------------------
const TrackMixer: React.FC = () => {
  const volumes = useAppStore((s) => s.volumes);
  const setVolume = useAppStore((s) => s.setVolume);

  const handleVolumeChange = useCallback(
    (track: 'conga' | 'cowbell' | 'voice', value: number) => {
      setVolume(track, value);
      updateVolumes({ [track]: value });
    },
    [setVolume],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Mix</Text>
      <View style={styles.card}>
        {TRACKS.map((track) => (
          <TrackRow
            key={track.key}
            config={track}
            value={volumes[track.key]}
            onValueChange={(v) => handleVolumeChange(track.key, v)}
          />
        ))}
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
  card: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
  },
  trackRow: {
    marginBottom: 12,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  trackLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  trackPercent: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});

export default TrackMixer;
