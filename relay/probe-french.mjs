/**
 * Standalone French verification probe for Qwen-Omni-Realtime.
 *
 * Runs as an ordinary long-lived Node process, which is the point: the same
 * probe inside a Vercel serverless function got session.created and then had
 * every outbound frame silently dropped. This version has no such constraint,
 * so it separates "Vercel cannot hold the socket" from "the model cannot do
 * French".
 *
 * Usage, from the repo root:
 *   node relay/probe-french.mjs
 *   node relay/probe-french.mjs "Bonjour, avez-vous une chambre libre ?"
 *
 * Reads DASHSCOPE_API_KEY and DEEPGRAM_API_KEY from .env.local. Neither key
 * is printed, logged, or sent anywhere except its own provider.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import WebSocket from 'ws';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

function loadEnvLocal() {
  const env = {};
  try {
    const raw = readFileSync(resolve(repoRoot, '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value !== '') env[key] = value;
    }
  } catch {
    // No .env.local — fall through to process.env.
  }
  return { ...env, ...process.env };
}

const env = loadEnvLocal();
const DASHSCOPE_API_KEY = env.DASHSCOPE_API_KEY;
const DEEPGRAM_API_KEY = env.DEEPGRAM_API_KEY;

const REALTIME_URL = 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime';
const MODEL = env.QWEN_REALTIME_MODEL || 'qwen3-omni-flash-realtime';

const GUEST_INSTRUCTIONS = `Tu joues un CLIENT dans un hôtel français. Tu es un client de passage, sans réservation, dans un hall calme en milieu d'après-midi. Le stagiaire qui te parle est le réceptionniste.

Réponds UNIQUEMENT en français, une ou deux phrases courtes, ton calme et poli.

Sujets autorisés : salutations, réservation ou absence de réservation, disponibilité, nombre de nuits (1 à 3), nombre de personnes (1 ou 2), chambre simple ou double, petit-déjeuner (horaires seulement, 7h à 10h), wifi, ascenseur, bagages, clôture polie.

Interdit : prix, tarifs, paiement, carte bancaire, facture, surclassement, fidélité, animaux, allergies, réclamations, room service, restaurant, spa, annulation, pièce d'identité, passeport. Ne parle jamais anglais.`;

const studentLine =
  process.argv[2] ?? 'Bonjour madame, bienvenue à la réception. Avez-vous une réservation ?';

function die(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

if (!DASHSCOPE_API_KEY) {
  die(
    'DASHSCOPE_API_KEY is not set.\n  Add it to .env.local (gitignored) or export it, then re-run.',
  );
}
if (!DEEPGRAM_API_KEY) {
  die('DEEPGRAM_API_KEY is not set. It is needed to synthesise the French test audio.');
}

/** Synthesise the student's French line as 16 kHz mono PCM. */
async function synthesise(text) {
  const startedAt = Date.now();
  const response = await fetch(
    'https://api.deepgram.com/v1/speak?model=aura-2-hector-fr&encoding=linear16&sample_rate=16000',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    },
  );
  if (!response.ok) {
    die(`Deepgram PCM synthesis failed: HTTP ${response.status} ${await response.text()}`);
  }
  const pcm = Buffer.from(await response.arrayBuffer());
  return { pcm, ms: Date.now() - startedAt };
}

function probe(pcm) {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now();
    const ws = new WebSocket(`${REALTIME_URL}?model=${encodeURIComponent(MODEL)}`, {
      headers: { Authorization: `Bearer ${DASHSCOPE_API_KEY}` },
      perMessageDeflate: false,
    });

    const seen = [];
    const serverErrors = [];
    let sessionDefaults = null;
    let heard = null;
    let reply = '';
    let audioBytes = 0;
    let firstAudioMs = null;
    let audioSent = false;
    let settled = false;
    const outAudio = [];

    const done = (note) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* closing */
      }
      resolvePromise({
        note,
        sessionDefaults,
        heard,
        reply: reply || null,
        audioBytes,
        firstAudioMs,
        totalMs: Date.now() - startedAt,
        events: [...new Set(seen)],
        serverErrors,
        outAudio: Buffer.concat(outAudio),
      });
    };

    const timer = setTimeout(() => done('timed out after 45s'), 45_000);

    const sendAudio = () => {
      if (audioSent) return;
      audioSent = true;
      const CHUNK = 3200 * 2; // 100 ms of 16 kHz mono 16-bit
      let offset = 0;
      // Paced roughly like a live microphone rather than dumped at once.
      const pump = setInterval(() => {
        if (offset >= pcm.length) {
          clearInterval(pump);
          ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
          ws.send(JSON.stringify({ type: 'response.create' }));
          return;
        }
        ws.send(
          JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: pcm.subarray(offset, offset + CHUNK).toString('base64'),
          }),
        );
        offset += CHUNK;
      }, 20);
    };

    ws.on('open', () => console.log('  · socket open'));

    ws.on('message', (data) => {
      let event;
      try {
        event = JSON.parse(data.toString());
      } catch {
        return;
      }
      const type = String(event.type ?? '');
      seen.push(type);
      if (!type.endsWith('.delta')) console.log(`  · ${type}`);

      switch (type) {
        case 'session.created': {
          sessionDefaults = event.session ?? null;
          ws.send(
            JSON.stringify({
              type: 'session.update',
              session: {
                modalities: ['text', 'audio'],
                instructions: GUEST_INSTRUCTIONS,
                input_audio_format: 'pcm16',
                output_audio_format: 'pcm24',
              },
            }),
          );
          setTimeout(sendAudio, 1500);
          break;
        }
        case 'session.updated':
          sendAudio();
          break;
        case 'conversation.item.input_audio_transcription.completed':
          heard = event.transcript ?? heard;
          break;
        case 'response.audio_transcript.delta':
          reply += event.delta ?? '';
          break;
        case 'response.audio_transcript.done':
          if (typeof event.transcript === 'string') reply = event.transcript;
          break;
        case 'response.text.delta':
          reply += event.delta ?? '';
          break;
        case 'response.audio.delta': {
          if (event.delta) {
            const buf = Buffer.from(event.delta, 'base64');
            outAudio.push(buf);
            audioBytes += buf.byteLength;
            if (firstAudioMs === null) firstAudioMs = Date.now() - startedAt;
          }
          break;
        }
        case 'error':
          serverErrors.push(event.error ?? event);
          console.log('  ! server error:', JSON.stringify(event.error ?? event).slice(0, 300));
          break;
        case 'response.done':
          done('response.done');
          break;
        default:
          break;
      }
    });

    ws.on('unexpected-response', (_req, res) =>
      done(`handshake rejected: HTTP ${res.statusCode} ${res.statusMessage ?? ''}`),
    );
    ws.on('error', (cause) => done(`socket error: ${cause.message}`));
    ws.on('close', (code) => done(`closed (code ${code})`));
  });
}

/** Wrap raw PCM as a .wav so the result can actually be listened to. */
function toWav(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

console.log(`\nQwen-Omni-Realtime French probe`);
console.log(`  model : ${MODEL}`);
console.log(`  saying: « ${studentLine} »\n`);

const { pcm, ms } = await synthesise(studentLine);
console.log(`  · synthesised ${pcm.length} bytes of 16 kHz PCM in ${ms} ms`);

const result = await probe(pcm);

console.log('\n─────────── RESULT ───────────');
console.log(`outcome        : ${result.note}`);
console.log(`events         : ${result.events.join(', ') || '(none)'}`);
console.log(`heard from you : ${result.heard ?? '(nothing transcribed)'}`);
console.log(`guest replied  : ${result.reply ?? '(no reply)'}`);
console.log(`reply audio    : ${result.audioBytes} bytes`);
console.log(`first audio in : ${result.firstAudioMs ?? '—'} ms`);
console.log(`total          : ${result.totalMs} ms`);
if (result.serverErrors.length) {
  console.log(`server errors  : ${JSON.stringify(result.serverErrors).slice(0, 500)}`);
}
if (result.sessionDefaults) {
  console.log(`session default: ${JSON.stringify(result.sessionDefaults).slice(0, 300)}`);
}

if (result.outAudio.length > 0) {
  const out = resolve(repoRoot, 'relay', 'probe-reply.wav');
  writeFileSync(out, toWav(result.outAudio, 24000));
  console.log(`\n▸ Reply audio written to relay/probe-reply.wav — listen to judge the French.`);
}
console.log('');
