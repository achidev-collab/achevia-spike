/**
 * Qwen-Omni-Realtime relay.
 *
 * Why this exists: DashScope realtime has no ephemeral-token mechanism —
 * both its WebSocket and WebRTC modes authenticate with
 * `Authorization: Bearer DASHSCOPE_API_KEY`, the real key. A browser
 * connecting directly would therefore have to carry the real key, which is
 * publicly readable. So the browser connects here instead, and this process
 * holds the key and talks upstream.
 *
 * It also cannot run on Vercel: serverless functions are request/response
 * and cannot hold a long-lived bidirectional socket. Deploy this on a host
 * that keeps a process alive (Fly.io, Railway, Render).
 *
 * Two responsibilities beyond piping bytes:
 *  1. The session instructions (the content manifest) are injected HERE, not
 *     accepted from the client, so a browser cannot widen the guest's remit
 *     by editing a payload.
 *  2. Client frames are allowlisted by event type, so a browser cannot drive
 *     arbitrary upstream API surface with the server's credentials.
 */

import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT ?? 8080);
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const MODEL = process.env.QWEN_REALTIME_MODEL ?? 'qwen3-omni-flash-realtime';
const REALTIME_URL = 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime';

/** Comma-separated list of allowed browser origins. */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (!DASHSCOPE_API_KEY) {
  console.error('DASHSCOPE_API_KEY is not set. Refusing to start.');
  process.exit(1);
}

/**
 * The content manifest, injected server-side. Kept in sync with
 * lib/live/manifest.ts by hand — this process is deployed separately from
 * the Next app and cannot import from it.
 */
const GUEST_INSTRUCTIONS = `Tu joues un CLIENT dans un hôtel français. Tu es un client de passage, sans réservation, dans un hall calme en milieu d'après-midi. Le stagiaire qui te parle est le réceptionniste.

Réponds UNIQUEMENT en français, une ou deux phrases courtes, ton calme et poli.

Sujets autorisés : salutations, réservation ou absence de réservation, disponibilité, nombre de nuits (1 à 3), nombre de personnes (1 ou 2), chambre simple ou double, petit-déjeuner (horaires seulement, 7h à 10h), wifi, ascenseur, bagages, clôture polie.

Interdit : prix, tarifs, paiement, carte bancaire, facture, surclassement, fidélité, animaux, allergies, réclamations, room service, restaurant, spa, annulation, pièce d'identité, passeport. Ne parle jamais anglais.`;

/**
 * Event types a browser may send upstream. Everything else is dropped and
 * reported back, so the client cannot reconfigure the session or reach parts
 * of the API it has no business reaching.
 */
const CLIENT_ALLOWED = new Set([
  'input_audio_buffer.append',
  'input_audio_buffer.commit',
  'input_audio_buffer.clear',
  'response.create',
  'response.cancel',
]);

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, model: MODEL }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server, path: '/live' });

wss.on('connection', (client, request) => {
  const origin = request.headers.origin ?? '';
  if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    client.close(4403, 'origin not allowed');
    return;
  }

  const startedAt = Date.now();
  let upstreamReady = false;
  const queued = [];

  const upstream = new WebSocket(`${REALTIME_URL}?model=${encodeURIComponent(MODEL)}`, {
    headers: { Authorization: `Bearer ${DASHSCOPE_API_KEY}` },
    perMessageDeflate: false,
  });

  const toClient = (payload) => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(payload));
  };

  upstream.on('message', (data) => {
    let event;
    try {
      event = JSON.parse(data.toString());
    } catch {
      return;
    }

    // Configure the session ourselves the moment it exists. The client never
    // gets to set instructions.
    if (event.type === 'session.created') {
      upstream.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: GUEST_INSTRUCTIONS,
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm24',
            turn_detection: {
              type: 'semantic_vad',
              threshold: 0.5,
              silence_duration_ms: 800,
            },
          },
        }),
      );
    }

    if (event.type === 'session.updated' && !upstreamReady) {
      upstreamReady = true;
      for (const frame of queued.splice(0)) upstream.send(frame);
      toClient({ type: 'relay.ready', elapsedMs: Date.now() - startedAt });
    }

    // Everything from upstream goes straight through, including audio and
    // transcript deltas, so the browser can play and audit as it streams.
    if (client.readyState === WebSocket.OPEN) client.send(data.toString());
  });

  upstream.on('unexpected-response', (_req, res) => {
    toClient({
      type: 'relay.error',
      error: `Upstream handshake rejected: HTTP ${res.statusCode}`,
    });
    client.close(4502, 'upstream handshake rejected');
  });

  upstream.on('error', (cause) => {
    toClient({ type: 'relay.error', error: `Upstream error: ${cause.message}` });
    client.close(4502, 'upstream error');
  });

  upstream.on('close', (code) => {
    toClient({ type: 'relay.closed', code });
    if (client.readyState === WebSocket.OPEN) client.close(1000, 'upstream closed');
  });

  client.on('message', (data) => {
    let event;
    try {
      event = JSON.parse(data.toString());
    } catch {
      toClient({ type: 'relay.error', error: 'Frame was not valid JSON.' });
      return;
    }
    const type = String(event.type ?? '');
    if (!CLIENT_ALLOWED.has(type)) {
      toClient({ type: 'relay.rejected', eventType: type });
      return;
    }
    const frame = JSON.stringify(event);
    if (upstreamReady) upstream.send(frame);
    else queued.push(frame);
  });

  client.on('close', () => {
    if (
      upstream.readyState === WebSocket.OPEN ||
      upstream.readyState === WebSocket.CONNECTING
    ) {
      upstream.close();
    }
  });
});

server.listen(PORT, () => {
  console.log(`relay listening on :${PORT} (model ${MODEL})`);
  console.log(
    ALLOWED_ORIGINS.length > 0
      ? `allowed origins: ${ALLOWED_ORIGINS.join(', ')}`
      : 'allowed origins: ANY (set ALLOWED_ORIGINS before exposing publicly)',
  );
});
