#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SAMPLES_DIR = path.join(__dirname, '..', 'assets', 'samples');

const REQUIRED_SAMPLES = [
  { filename: 'conga_slap.wav', query: 'conga slap' },
  { filename: 'conga_open.wav', query: 'conga open tone' },
  { filename: 'conga_mute.wav', query: 'conga muted' },
  { filename: 'cowbell.wav', query: 'cowbell hit' },
];

// WAV parameters for placeholder generation
const SAMPLE_RATE = 44100;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;
const DURATION_SECONDS = 1;
const NUM_SAMPLES = SAMPLE_RATE * DURATION_SECONDS;

// ---------------------------------------------------------------------------
// WAV placeholder generator
// ---------------------------------------------------------------------------

/**
 * Generate a valid WAV file containing silence.
 *
 * Layout (44-byte header + PCM data):
 *   Bytes  0- 3  "RIFF"
 *   Bytes  4- 7  File size minus 8 (little-endian uint32)
 *   Bytes  8-11  "WAVE"
 *   Bytes 12-15  "fmt "
 *   Bytes 16-19  Sub-chunk 1 size = 16 (PCM)
 *   Bytes 20-21  Audio format = 1 (PCM)
 *   Bytes 22-23  Number of channels
 *   Bytes 24-27  Sample rate
 *   Bytes 28-31  Byte rate  (SampleRate * NumChannels * BitsPerSample / 8)
 *   Bytes 32-33  Block align (NumChannels * BitsPerSample / 8)
 *   Bytes 34-35  Bits per sample
 *   Bytes 36-39  "data"
 *   Bytes 40-43  Sub-chunk 2 size (NumSamples * NumChannels * BitsPerSample / 8)
 *   Bytes 44-..  PCM sample data (all zeros = silence)
 */
function generateSilentWav() {
  const byteRate = SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE / 8);
  const blockAlign = NUM_CHANNELS * (BITS_PER_SAMPLE / 8);
  const dataSize = NUM_SAMPLES * NUM_CHANNELS * (BITS_PER_SAMPLE / 8); // 88200
  const headerSize = 44;
  const fileSize = headerSize + dataSize;

  const buffer = Buffer.alloc(fileSize, 0); // all zeros by default (silence)

  let offset = 0;

  // -- RIFF header --
  buffer.write('RIFF', offset);
  offset += 4;
  buffer.writeUInt32LE(fileSize - 8, offset); // ChunkSize
  offset += 4;
  buffer.write('WAVE', offset);
  offset += 4;

  // -- fmt sub-chunk --
  buffer.write('fmt ', offset);
  offset += 4;
  buffer.writeUInt32LE(16, offset); // Subchunk1Size (16 for PCM)
  offset += 4;
  buffer.writeUInt16LE(1, offset); // AudioFormat (1 = PCM)
  offset += 2;
  buffer.writeUInt16LE(NUM_CHANNELS, offset); // NumChannels
  offset += 2;
  buffer.writeUInt32LE(SAMPLE_RATE, offset); // SampleRate
  offset += 4;
  buffer.writeUInt32LE(byteRate, offset); // ByteRate
  offset += 4;
  buffer.writeUInt16LE(blockAlign, offset); // BlockAlign
  offset += 2;
  buffer.writeUInt16LE(BITS_PER_SAMPLE, offset); // BitsPerSample
  offset += 2;

  // -- data sub-chunk --
  buffer.write('data', offset);
  offset += 4;
  buffer.writeUInt32LE(dataSize, offset); // Subchunk2Size
  // offset += 4;
  // Remaining bytes are already zero (silence).

  return buffer;
}

// ---------------------------------------------------------------------------
// HTTPS helpers
// ---------------------------------------------------------------------------

/**
 * Perform an HTTPS GET request and return the response body as a string.
 * Follows up to 5 redirects.
 */
function httpsGet(url, maxRedirects) {
  if (maxRedirects === undefined) maxRedirects = 5;

  return new Promise(function (resolve, reject) {
    https
      .get(url, function (res) {
        // Handle redirects
        if (
          (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307) &&
          res.headers.location
        ) {
          if (maxRedirects <= 0) {
            reject(new Error('Too many redirects'));
            return;
          }
          var redirectUrl = res.headers.location;
          // Handle relative redirects
          if (redirectUrl.startsWith('/')) {
            var parsed = new URL(url);
            redirectUrl = parsed.origin + redirectUrl;
          }
          resolve(httpsGet(redirectUrl, maxRedirects - 1));
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
          res.resume(); // consume response to free memory
          return;
        }

        var chunks = [];
        res.on('data', function (chunk) {
          chunks.push(chunk);
        });
        res.on('end', function () {
          resolve(Buffer.concat(chunks));
        });
      })
      .on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Freesound API helpers
// ---------------------------------------------------------------------------

/**
 * Search Freesound for a query and return the first CC0-licensed result.
 * Returns { name, download } or null.
 */
async function freesoundSearch(query, apiKey) {
  var searchUrl =
    'https://freesound.org/apiv2/search/text/?' +
    'query=' +
    encodeURIComponent(query) +
    '&filter=license:%22Creative+Commons+0%22' +
    '&fields=id,name,previews' +
    '&page_size=1' +
    '&token=' +
    apiKey;

  var body = await httpsGet(searchUrl);
  var json = JSON.parse(body.toString('utf8'));

  if (!json.results || json.results.length === 0) {
    return null;
  }

  var result = json.results[0];

  // The previews object contains several quality levels.  We prefer the
  // high-quality WAV preview when available, otherwise fall back to
  // preview-hq-ogg or preview-lq-mp3.  The actual original download
  // requires OAuth, so previews are more practical.
  var downloadUrl = null;
  if (result.previews) {
    downloadUrl =
      result.previews['preview-hq-mp3'] ||
      result.previews['preview-lq-mp3'] ||
      null;
  }

  if (!downloadUrl) {
    return null;
  }

  return { name: result.name, downloadUrl: downloadUrl };
}

/**
 * Download a file from a URL and save it to disk.
 */
async function downloadFile(url, destPath) {
  var data = await httpsGet(url);
  fs.writeFileSync(destPath, data);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== SalsaTiming Sample Fetcher ===\n');

  // 1. Ensure the samples directory exists
  if (!fs.existsSync(SAMPLES_DIR)) {
    fs.mkdirSync(SAMPLES_DIR, { recursive: true });
    console.log('Created directory: ' + SAMPLES_DIR);
  } else {
    console.log('Samples directory exists: ' + SAMPLES_DIR);
  }

  console.log('');

  var apiKey = process.env.FREESOUND_API_KEY || '';
  var useFreesound = apiKey.length > 0;

  if (useFreesound) {
    console.log('Freesound API key detected. Will attempt to fetch real samples.\n');
  } else {
    console.log(
      'No FREESOUND_API_KEY found in environment.\n' +
        'Silent placeholder WAV files will be generated so the app can run\n' +
        'without crashing during development.\n'
    );
  }

  var summary = [];

  for (var i = 0; i < REQUIRED_SAMPLES.length; i++) {
    var sample = REQUIRED_SAMPLES[i];
    var filePath = path.join(SAMPLES_DIR, sample.filename);

    // 2. Skip if the file already exists
    if (fs.existsSync(filePath)) {
      console.log('[SKIP]  ' + sample.filename + ' already exists.');
      summary.push({ filename: sample.filename, status: 'already exists' });
      continue;
    }

    // 3. Try Freesound API
    var fetched = false;
    if (useFreesound) {
      try {
        console.log('[FETCH] Searching Freesound for "' + sample.query + '"...');
        var result = await freesoundSearch(sample.query, apiKey);
        if (result) {
          console.log('        Found: ' + result.name);
          console.log('        Downloading...');
          await downloadFile(result.downloadUrl, filePath);
          console.log('        Saved real sample -> ' + sample.filename);
          summary.push({ filename: sample.filename, status: 'real sample (Freesound)' });
          fetched = true;
        } else {
          console.log('        No CC0 result found on Freesound.');
        }
      } catch (err) {
        console.log('        Freesound API error: ' + err.message);
      }
    }

    // 4. Generate silent placeholder if Freesound was not available or failed
    if (!fetched) {
      console.log('[GEN]   Generating silent placeholder -> ' + sample.filename);
      var wavData = generateSilentWav();
      fs.writeFileSync(filePath, wavData);
      console.log(
        '        Created valid WAV (' +
          SAMPLE_RATE +
          ' Hz, ' +
          BITS_PER_SAMPLE +
          '-bit, mono, ' +
          DURATION_SECONDS +
          's silence)'
      );
      summary.push({ filename: sample.filename, status: 'silent placeholder' });
    }

    console.log('');
  }

  // 6. Print summary
  console.log('=== Summary ===\n');
  var maxLen = 0;
  for (var j = 0; j < summary.length; j++) {
    if (summary[j].filename.length > maxLen) {
      maxLen = summary[j].filename.length;
    }
  }
  for (var k = 0; k < summary.length; k++) {
    var entry = summary[k];
    var padding = ' '.repeat(maxLen - entry.filename.length + 2);
    console.log('  ' + entry.filename + padding + entry.status);
  }

  console.log('\nDone. All ' + REQUIRED_SAMPLES.length + ' sample files are ready.');
}

main().catch(function (err) {
  console.error('Fatal error:', err);
  process.exit(1);
});
