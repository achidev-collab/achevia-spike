import { NextResponse } from 'next/server';
import WebSocket from 'ws';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * FRENCH VERIFICATION PROBE for Qwen-Omni-Realtime.
 *
 * Answers one question before any live screen gets built on this model: does
 * it understand spoken French and answer in natural French, as a hotel guest?
 *
 * Runs entirely server-side. DashScope realtime has no ephemeral token, so
 * the key must never reach a browser — the real screen will relay audio
 * through a WebSocket host for the same reason. This is the single-shot
 * version of that relay.
 *
 * STATUS: does not work from Vercel. The wss handshake succeeds and the
 * server sends session.created, then every client frame is ignored — no
 * session.updated, no transcription, no response, and no error either.
 * Reproduced four ways: session.update on open, no session.update at all,
 * strict wait-for-session.created ordering, and with permessage-deflate
 * disabled. Identical result each time.
 *
 * The asymmetry (server→client works, client→server is silently dropped)
 * points at Vercel's serverless runtime rather than at the model: these
 * functions are request/response and are not built to hold a long-lived
 * bidirectional socket. That is the same reason the live screen was already
 * going to need a dedicated WebSocket host, so this probe should be re-run
 * there before drawing any conclusion about Qwen's French.
 *
 * Kept in the repo because it is the working basis for that relay: the
 * protocol sequencing, PCM framing and event handling here are all reusable.
 */

const REALTIME_URL = 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime';
const DEFAULT_MODEL = 'qwen3-omni-flash-realtime';

const GUEST_INSTRUCTIONS = `Tu joues un CLIENT dans un hôtel français. Tu es un client de passage, sans réservation, dans un hall calme en milieu d'après-midi. Le stagiaire qui te parle est le réceptionniste.

Réponds UNIQUEMENT en français, une ou deux phrases courtes, ton calme et poli.

Sujets autorisés : salutations, réservation ou absence de réservation, disponibilité, nombre de nuits (1 à 3), nombre de personnes (1 ou 2), chambre simple ou double, petit-déjeuner (horaires seulement, 7h à 10h), wifi, ascenseur, bagages, clôture polie.

Interdit : prix, tarifs, paiement, carte bancaire, facture, surclassement, fidélité, animaux, allergies, réclamations, room service, restaurant, spa, annulation, pièce d'identité, passeport. Ne parle jamais anglais.`;

export async function POST(request: Request) {
  const dashscopeKey = process.env.DASHSCOPE_API_KEY;
  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  if (!dashscopeKey || !deepgramKey) {
    return NextResponse.json(
      {
        error: `${!dashscopeKey ? 'DASHSCOPE_API_KEY' : 'DEEPGRAM_API_KEY'} is not set on the server.`,
      },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    model?: string;
    voice?: string;
  };
  const studentLine =
    body.text ?? 'Bonjour madame, bienvenue. Avez-vous une réservation ?';
  const model = body.model ?? DEFAULT_MODEL;

  // Synthesise the student's French line as 16 kHz mono PCM, the input
  // format the realtime model expects.
  const ttsStartedAt = Date.now();
  const ttsResponse = await fetch(
    'https://api.deepgram.com/v1/speak?model=aura-2-hector-fr&encoding=linear16&sample_rate=16000',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${deepgramKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: studentLine }),
    },
  );
  if (!ttsResponse.ok) {
    const detail = await ttsResponse.text().catch(() => '');
    return NextResponse.json(
      {
        error: `Deepgram PCM synthesis failed: HTTP ${ttsResponse.status}. ${detail.slice(0, 200)}`,
      },
      { status: 502 },
    );
  }
  const pcm = Buffer.from(await ttsResponse.arrayBuffer());
  const ttsMs = Date.now() - ttsStartedAt;

  try {
    const result = await runProbe({
      apiKey: dashscopeKey,
      model,
      voice: body.voice,
      pcm,
    });
    return NextResponse.json({
      model,
      studentLineSent: studentLine,
      ttsMs,
      pcmBytes: pcm.byteLength,
      ...result,
    });
  } catch (cause) {
    return NextResponse.json(
      { model, error: (cause as Error).message },
      { status: 502 },
    );
  }
}

interface ProbeResult {
  connected: boolean;
  sessionDefaults: unknown;
  heardFromStudent: string | null;
  guestReplyText: string | null;
  guestAudioBytes: number;
  firstAudioMs: number | null;
  totalMs: number;
  events: string[];
  rawEvents: string[];
  serverErrors: unknown[];
}

function runProbe({
  apiKey,
  model,
  voice,
  pcm,
}: {
  apiKey: string;
  model: string;
  voice?: string;
  pcm: Buffer;
}): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const ws = new WebSocket(`${REALTIME_URL}?model=${encodeURIComponent(model)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      // Some gateways negotiate permessage-deflate and then silently drop
      // compressed client frames. Disabled so outbound events are plain.
      perMessageDeflate: false,
    });

    const events: string[] = [];
    const rawEvents: string[] = [];
    const serverErrors: unknown[] = [];
    let sessionDefaults: unknown = null;
    let heardFromStudent: string | null = null;
    let guestReplyText = '';
    let guestAudioBytes = 0;
    let firstAudioMs: number | null = null;
    let settled = false;
    let audioSent = false;

    const finish = (ok: boolean, message?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* already closing */
      }
      if (ok) {
        resolve({
          connected: true,
          sessionDefaults,
          heardFromStudent,
          guestReplyText: guestReplyText || null,
          guestAudioBytes,
          firstAudioMs,
          totalMs: Date.now() - startedAt,
          events: dedupe(events),
          rawEvents,
          serverErrors,
        });
      } else {
        reject(new Error(message ?? 'probe failed'));
      }
    };

    const timer = setTimeout(() => finish(true), 30_000);

    /** Stream the student's audio, then ask for one reply. */
    const sendAudio = () => {
      if (audioSent) return;
      audioSent = true;
      const CHUNK = 3200 * 2; // 100 ms of 16 kHz mono 16-bit
      for (let offset = 0; offset < pcm.length; offset += CHUNK) {
        ws.send(
          JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: pcm.subarray(offset, offset + CHUNK).toString('base64'),
          }),
        );
      }
      ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      ws.send(JSON.stringify({ type: 'response.create' }));
    };

    ws.on('message', (data) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(data.toString());
      } catch {
        return;
      }
      const type = String(event.type ?? '');
      events.push(type);
      if (rawEvents.length < 25 && !type.endsWith('.delta')) {
        rawEvents.push(JSON.stringify(event).slice(0, 1200));
      }

      switch (type) {
        case 'session.created': {
          sessionDefaults = event.session ?? null;
          const session: Record<string, unknown> = {
            modalities: ['text', 'audio'],
            instructions: GUEST_INSTRUCTIONS,
          };
          if (voice) session.voice = voice;
          ws.send(JSON.stringify({ type: 'session.update', session }));
          // If the server never acknowledges the update, go anyway rather
          // than stalling the whole probe on it.
          setTimeout(sendAudio, 1500);
          break;
        }
        case 'session.updated':
          sendAudio();
          break;
        case 'conversation.item.input_audio_transcription.completed':
          heardFromStudent = (event.transcript as string) ?? heardFromStudent;
          break;
        case 'response.audio_transcript.delta':
          guestReplyText += (event.delta as string) ?? '';
          break;
        case 'response.audio_transcript.done':
          if (typeof event.transcript === 'string') guestReplyText = event.transcript;
          break;
        case 'response.text.delta':
          guestReplyText += (event.delta as string) ?? '';
          break;
        case 'response.audio.delta': {
          const delta = event.delta as string | undefined;
          if (delta) {
            guestAudioBytes += Buffer.from(delta, 'base64').byteLength;
            if (firstAudioMs === null) firstAudioMs = Date.now() - startedAt;
          }
          break;
        }
        case 'error':
          serverErrors.push(event.error ?? event);
          break;
        case 'response.done':
          finish(true);
          break;
        default:
          break;
      }
    });

    ws.on('error', (cause) => finish(false, `WebSocket error: ${(cause as Error).message}`));
    ws.on('unexpected-response', (_req, res) =>
      finish(false, `Handshake rejected: HTTP ${res.statusCode} ${res.statusMessage ?? ''}`.trim()),
    );
    ws.on('close', (code, reason) => {
      if (!settled && guestReplyText === '' && guestAudioBytes === 0) {
        finish(false, `Closed before any reply: code ${code} ${reason.toString().slice(0, 200)}`);
      } else {
        finish(true);
      }
    });
  });
}

function dedupe(events: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const event of events) {
    if (!seen.has(event)) {
      seen.add(event);
      out.push(event);
    }
  }
  return out;
}
