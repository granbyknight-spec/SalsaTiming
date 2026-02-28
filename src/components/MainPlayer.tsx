import React from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar } from 'react-native';

import BeatIndicator from './BeatIndicator';
import BPMControl from './BPMControl';
import PlayButton from './PlayButton';
import ModeSelector from './ModeSelector';
import TrackMixer from './TrackMixer';
import VoiceSettings from './VoiceSettings';

// ---------------------------------------------------------------------------
// MainPlayer — top-level screen assembling all player components
// ---------------------------------------------------------------------------
const MainPlayer: React.FC = () => {

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* App title */}
        <View style={styles.header}>
          <Text style={styles.title}>Salsa Timing</Text>
          <Text style={styles.subtitle}>Rhythm Trainer</Text>
        </View>

        {/* Beat position indicator */}
        <BeatIndicator />

        {/* Divider */}
        <View style={styles.divider} />

        {/* BPM display + slider + tap tempo */}
        <BPMControl />

        {/* Large play/stop button */}
        <PlayButton />

        {/* Mode selector tabs */}
        <ModeSelector />

        {/* Volume mixer */}
        <TrackMixer />

        {/* Divider */}
        <View style={styles.divider} />

        {/* ElevenLabs voice generation */}
        <VoiceSettings />

        {/* Bottom spacer for safe area */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 13,
    color: '#8899aa',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#16213e',
    marginVertical: 4,
  },
  bottomSpacer: {
    height: 40,
  },
});

export default MainPlayer;
