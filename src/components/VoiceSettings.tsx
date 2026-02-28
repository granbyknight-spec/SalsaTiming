import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  generateAndCacheVoices,
  getCachedVoiceUrls,
  clearVoiceCache,
} from '../audio/voiceCache';
import { loadVoiceFromUrls } from '../engine/sequencer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Status = 'idle' | 'checking' | 'generating' | 'cached' | 'error';

// ---------------------------------------------------------------------------
// VoiceSettings
// ---------------------------------------------------------------------------

const VoiceSettings: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // ---- On mount: check if voices are already cached -----------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setStatus('checking');
      try {
        const urls = await getCachedVoiceUrls();
        if (cancelled) return;

        if (urls && urls.size > 0) {
          await loadVoiceFromUrls(urls);
          if (!cancelled) {
            setStatus('cached');
          }
        } else {
          setStatus('idle');
        }
      } catch {
        if (!cancelled) setStatus('idle');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Generate handler ---------------------------------------------------
  const handleGenerate = useCallback(async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setErrorMsg('Please enter an API key.');
      setStatus('error');
      return;
    }

    setStatus('generating');
    setErrorMsg('');
    setProgress('Starting...');

    try {
      const urls = await generateAndCacheVoices(
        trimmed,
        (current, total, label) => {
          setProgress(`Generating ${current}/${total}: ${label}...`);
        },
      );

      // Load the generated voices into the sequencer.
      await loadVoiceFromUrls(urls);

      setStatus('cached');
      setProgress('');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An unknown error occurred.';
      setErrorMsg(message);
      setStatus('error');
      setProgress('');
    }
  }, [apiKey]);

  // ---- Clear cache handler ------------------------------------------------
  const handleClear = useCallback(async () => {
    await clearVoiceCache();
    setStatus('idle');
    setProgress('');
    setErrorMsg('');
  }, []);

  // ---- Render -------------------------------------------------------------
  const isBusy = status === 'generating' || status === 'checking';

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Voice Generation</Text>
      <View style={styles.card}>
        {/* Status indicator */}
        {status === 'cached' && (
          <View style={styles.statusRow}>
            <View style={styles.greenDot} />
            <Text style={styles.statusText}>Voices cached and loaded</Text>
          </View>
        )}

        {status === 'checking' && (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color="#e94560" />
            <Text style={styles.statusText}>Checking cache...</Text>
          </View>
        )}

        {/* API key input */}
        <Text style={styles.label}>ElevenLabs API Key</Text>
        <TextInput
          style={styles.input}
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="Paste your API key here"
          placeholderTextColor="#556677"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isBusy}
        />

        {/* Progress */}
        {status === 'generating' && (
          <View style={styles.progressRow}>
            <ActivityIndicator size="small" color="#e94560" />
            <Text style={styles.progressText}>{progress}</Text>
          </View>
        )}

        {/* Error message */}
        {status === 'error' && errorMsg ? (
          <Text style={styles.errorText}>{errorMsg}</Text>
        ) : null}

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[
              styles.button,
              styles.generateButton,
              isBusy && styles.buttonDisabled,
            ]}
            onPress={handleGenerate}
            disabled={isBusy}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonText}>
              {status === 'generating' ? 'Generating...' : 'Generate Voices'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              styles.clearButton,
              isBusy && styles.buttonDisabled,
            ]}
            onPress={handleClear}
            disabled={isBusy}
            activeOpacity={0.7}
          >
            <Text style={styles.clearButtonText}>Clear Cache</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles — matches the dark theme used by TrackMixer and the rest of the app
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
  label: {
    color: '#8899aa',
    fontSize: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: '#0d1b2a',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#1a2a44',
    marginBottom: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  greenDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
    marginRight: 8,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  progressText: {
    color: '#8899aa',
    fontSize: 13,
    marginLeft: 10,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    marginBottom: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateButton: {
    backgroundColor: '#e94560',
  },
  clearButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#334466',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  clearButtonText: {
    color: '#8899aa',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default VoiceSettings;
