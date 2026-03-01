import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppStore } from '../store/appStore';
import { VISUAL_BEATS } from '../engine/patterns';

// ---------------------------------------------------------------------------
// Beat grid layout
// ---------------------------------------------------------------------------
// 16-step grid: positions 0-15
// Even indices (0, 2, 4, 6, 8, 10, 12, 14) are main beats (1-8)
// Odd indices  (1, 3, 5, 7, 9, 11, 13, 15) are "&" subdivisions
// ---------------------------------------------------------------------------

/** Labels for each of the 16 steps */
const STEP_LABELS: string[] = [
  '1', '&', '2', '&', '3', '&', '4', '&',
  '5', '&', '6', '&', '7', '&', '8', '&',
];

// ---------------------------------------------------------------------------
// BeatIndicator
// ---------------------------------------------------------------------------
const BeatIndicator: React.FC = () => {
  const currentStep = useAppStore((s) => s.currentStep);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const mode = useAppStore((s) => s.mode);

  const visualBeats = VISUAL_BEATS[mode] ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {STEP_LABELS.map((label, index) => {
          const isMainBeat = index % 2 === 0;
          const isCurrent = isPlaying && currentStep === index;
          const isCountBeat = isCurrent && visualBeats.includes(index);

          return (
            <View key={index} style={styles.stepWrapper}>
              {/* Fixed-size container prevents layout shift when dot size changes */}
              <View style={styles.dotContainer}>
                <View
                  style={[
                    styles.dot,
                    isMainBeat ? styles.dotMain : styles.dotSub,
                    isCurrent && !isCountBeat && (isMainBeat ? styles.dotCurrentMain : styles.dotCurrentSub),
                    isCountBeat && styles.dotCountBeat,
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.label,
                  isMainBeat ? styles.labelMain : styles.labelSub,
                  isCurrent && styles.labelCurrent,
                  isCountBeat && styles.labelCountBeat,
                ]}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const DOT_MAIN = 14;
const DOT_SUB = 8;
const DOT_COUNT_BEAT = 22;

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepWrapper: {
    alignItems: 'center',
    flex: 1,
  },

  // Fixed-size wrapper so the layout never shifts when dots resize
  dotContainer: {
    width: DOT_COUNT_BEAT,
    height: DOT_COUNT_BEAT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },

  // Dot base
  dot: {
    borderRadius: 100,
  },

  // Main beat dot (larger)
  dotMain: {
    width: DOT_MAIN,
    height: DOT_MAIN,
    backgroundColor: '#2a3a5e',
  },

  // Subdivision dot (smaller)
  dotSub: {
    width: DOT_SUB,
    height: DOT_SUB,
    backgroundColor: '#1e2d4d',
  },

  // Active main beat (bright red/pink)
  dotCurrentMain: {
    backgroundColor: '#e94560',
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },

  // Active subdivision (warm orange)
  dotCurrentSub: {
    backgroundColor: '#f5a623',
    shadowColor: '#f5a623',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 6,
  },

  // Count beat — big bright flash for steps where the dancer counts
  dotCountBeat: {
    width: DOT_COUNT_BEAT,
    height: DOT_COUNT_BEAT,
    backgroundColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1.0,
    shadowRadius: 14,
  },

  // Label base
  label: {
    fontSize: 10,
    fontWeight: '500',
  },

  // Main beat label
  labelMain: {
    color: '#5a6a8a',
    fontSize: 11,
    fontWeight: '700',
  },

  // Subdivision label
  labelSub: {
    color: '#3a4a6a',
    fontSize: 9,
  },

  // Active step label
  labelCurrent: {
    color: '#ffffff',
  },

  // Count beat label — bold white
  labelCountBeat: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
});

export default BeatIndicator;
