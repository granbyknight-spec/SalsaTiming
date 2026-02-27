import { create } from 'zustand';
import { TimingMode, BPM_DEFAULT, DEFAULT_VOLUMES } from '../constants/timing';

interface Volumes {
  conga: number;
  cowbell: number;
  voice: number;
}

interface AppState {
  isPlaying: boolean;
  bpm: number;
  mode: TimingMode;
  voiceStyle: 'male' | 'female';
  volumes: Volumes;
  currentStep: number;
  voiceCacheReady: boolean;

  // Actions
  setPlaying: (playing: boolean) => void;
  setBpm: (bpm: number) => void;
  setMode: (mode: TimingMode) => void;
  setVoiceStyle: (style: 'male' | 'female') => void;
  setVolume: (track: keyof Volumes, value: number) => void;
  setCurrentStep: (step: number) => void;
  setVoiceCacheReady: (ready: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // State defaults
  isPlaying: false,
  bpm: BPM_DEFAULT,
  mode: 'on2_soft_mambo',
  voiceStyle: 'male',
  volumes: { ...DEFAULT_VOLUMES },
  currentStep: 0,
  voiceCacheReady: false,

  // Actions
  setPlaying: (playing: boolean) =>
    set({ isPlaying: playing }),

  setBpm: (bpm: number) =>
    set({ bpm }),

  setMode: (mode: TimingMode) =>
    set({ mode }),

  setVoiceStyle: (style: 'male' | 'female') =>
    set({ voiceStyle: style }),

  setVolume: (track: keyof Volumes, value: number) =>
    set((state) => ({
      volumes: { ...state.volumes, [track]: value },
    })),

  setCurrentStep: (step: number) =>
    set({ currentStep: step }),

  setVoiceCacheReady: (ready: boolean) =>
    set({ voiceCacheReady: ready }),
}));

/**
 * Raw store reference for non-React access (e.g., audio engine, timers).
 * Use appStore.getState() to read and appStore.setState() to write outside of React.
 */
export const appStore = useAppStore;
