import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
} from 'react-native';
import { useAppStore } from '../store/appStore';
import { updateBPM } from '../engine/sequencer';
import { BPM_MIN, BPM_MAX } from '../constants/timing';

// ---------------------------------------------------------------------------
// Custom horizontal slider (works on web + native without external libs)
// ---------------------------------------------------------------------------
interface CustomSliderProps {
  value: number;
  min: number;
  max: number;
  onValueChange: (v: number) => void;
  trackColor?: string;
  activeTrackColor?: string;
  thumbColor?: string;
}

const CustomSlider: React.FC<CustomSliderProps> = ({
  value,
  min,
  max,
  onValueChange,
  trackColor = '#16213e',
  activeTrackColor = '#e94560',
  thumbColor = '#ffffff',
}) => {
  const trackRef = useRef<View>(null);
  const trackWidth = useRef(0);
  const trackX = useRef(0);

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const fraction = (value - min) / (max - min);

  const valueFromX = (pageX: number) => {
    const ratio = Math.max(0, Math.min(1, (pageX - trackX.current) / trackWidth.current));
    return clamp(Math.round(min + ratio * (max - min)));
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
      <View style={[sliderStyles.track, { backgroundColor: trackColor }]} />
      {/* Active (filled) track */}
      <View
        style={[
          sliderStyles.trackActive,
          { backgroundColor: activeTrackColor, width: `${fraction * 100}%` as any },
        ]}
      />
      {/* Thumb */}
      <View
        style={[
          sliderStyles.thumb,
          {
            backgroundColor: thumbColor,
            left: `${fraction * 100}%` as any,
          },
        ]}
      />
    </View>
  );
};

const sliderStyles = StyleSheet.create({
  trackOuter: {
    height: 40,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    height: 6,
    borderRadius: 3,
    width: '100%',
    position: 'absolute',
  },
  trackActive: {
    height: 6,
    borderRadius: 3,
    position: 'absolute',
  },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    position: 'absolute',
    marginLeft: -12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
});

// ---------------------------------------------------------------------------
// BPMControl
// ---------------------------------------------------------------------------
const TAP_RESET_MS = 2000; // reset tap history after 2 s gap

const BPMControl: React.FC = () => {
  const bpm = useAppStore((s) => s.bpm);
  const setBpm = useAppStore((s) => s.setBpm);

  const tapTimestamps = useRef<number[]>([]);
  const [tapLabel, setTapLabel] = useState('Tap Tempo');

  // Unified setter: updates both store and sequencer
  const changeBpm = useCallback(
    (next: number) => {
      const clamped = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(next)));
      setBpm(clamped);
      updateBPM(clamped);
    },
    [setBpm],
  );

  const handleTap = useCallback(() => {
    const now = Date.now();
    const taps = tapTimestamps.current;

    // Reset if gap is too large
    if (taps.length > 0 && now - taps[taps.length - 1] > TAP_RESET_MS) {
      tapTimestamps.current = [];
    }

    tapTimestamps.current.push(now);

    // Keep at most 5 timestamps (= 4 intervals)
    if (tapTimestamps.current.length > 5) {
      tapTimestamps.current = tapTimestamps.current.slice(-5);
    }

    const t = tapTimestamps.current;
    if (t.length >= 2) {
      const intervals = t.slice(1).map((ts, i) => ts - t[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const detected = Math.round(60000 / avg);
      changeBpm(detected);
      setTapLabel(`Tap (${detected})`);
    } else {
      setTapLabel('Tap...');
    }
  }, [changeBpm]);

  return (
    <View style={styles.container}>
      {/* Large BPM display */}
      <View style={styles.bpmDisplay}>
        <Text style={styles.bpmNumber}>{bpm}</Text>
        <Text style={styles.bpmLabel}>BPM</Text>
      </View>

      {/* Slider with +/- buttons */}
      <View style={styles.sliderRow}>
        <TouchableOpacity
          style={styles.incButton}
          onPress={() => changeBpm(bpm - 1)}
          activeOpacity={0.7}
        >
          <Text style={styles.incButtonText}>-</Text>
        </TouchableOpacity>

        <View style={styles.sliderContainer}>
          <CustomSlider
            value={bpm}
            min={BPM_MIN}
            max={BPM_MAX}
            onValueChange={changeBpm}
            trackColor="#16213e"
            activeTrackColor="#e94560"
            thumbColor="#ffffff"
          />
        </View>

        <TouchableOpacity
          style={styles.incButton}
          onPress={() => changeBpm(bpm + 1)}
          activeOpacity={0.7}
        >
          <Text style={styles.incButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Tap Tempo */}
      <TouchableOpacity style={styles.tapButton} onPress={handleTap} activeOpacity={0.7}>
        <Text style={styles.tapButtonText}>{tapLabel}</Text>
      </TouchableOpacity>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  bpmDisplay: {
    alignItems: 'center',
    marginBottom: 8,
  },
  bpmNumber: {
    fontSize: 64,
    fontWeight: '700',
    color: '#ffffff',
    fontVariant: ['tabular-nums'],
  },
  bpmLabel: {
    fontSize: 14,
    color: '#8899aa',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: -6,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  sliderContainer: {
    flex: 1,
    marginHorizontal: 8,
  },
  incButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#16213e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  incButtonText: {
    fontSize: 24,
    color: '#ffffff',
    fontWeight: '600',
  },
  tapButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#f5a623',
  },
  tapButtonText: {
    color: '#f5a623',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default BPMControl;
