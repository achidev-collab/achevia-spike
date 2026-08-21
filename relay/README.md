# Achevia realtime relay

A small always-on WebSocket process that sits between the browser and
Qwen-Omni-Realtime.

## Why it exists

DashScope realtime has **no ephemeral-token mechanism**. Both its WebSocket
and WebRTC modes authenticate with `Authorization: Bearer DASHSCOPE_API_KEY`
— the real key. A browser connecting directly would have to ship that key to
every visitor, where it is publicly readable. So the browser connects here,
and this process holds the key.

It also cannot live on Vercel. Serverless functions are request/response and
cannot hold a long-lived bidirectional socket; a probe run inside one got
`session.created` and then had every outbound frame silently dropped.

## What it does beyond piping bytes

1. **Injects the content manifest server-side.** Session instructions are set
   here, never accepted from the client, so a browser cannot widen the
   guest's remit by editing a payload.
2. **Allowlists client event types.** Only `input_audio_buffer.*`,
   `response.create` and `response.cancel` go upstream. Anything else is
   dropped and reported back as `relay.rejected`, so the browser cannot drive
   arbitrary API surface with the server's credentials.

## Verify French before deploying anything

The open question is whether Qwen-Omni-Realtime actually speaks and
understands natural French in a hospitality register. Answer it locally
first, for free:

```bash
cd .. && node relay/probe-french.mjs
```

Reads `DASHSCOPE_API_KEY` and `DEEPGRAM_API_KEY` from the gitignored
`.env.local`. It synthesises a French line, streams it in as 16 kHz PCM,
prints what the model heard and said, and writes the reply to
`relay/probe-reply.wav` so the French can actually be listened to.

## Environment

| Variable | Purpose |
| --- | --- |
| `DASHSCOPE_API_KEY` | Required. Never leaves this process. |
| `QWEN_REALTIME_MODEL` | Optional, defaults to `qwen3-omni-flash-realtime`. |
| `ALLOWED_ORIGINS` | Comma-separated browser origins. **Set this before exposing publicly** — unset means any origin may connect and spend your quota. |
| `PORT` | Defaults to 8080. |

## Deploying

Any host that keeps a process alive works. The `Dockerfile` is plain Node 20.

- **Fly.io** — `fly launch --no-deploy`, then `fly secrets set DASHSCOPE_API_KEY=…`, then `fly deploy`.
- **Railway** — new project from this directory, set the same variables.
- **Render** — new Web Service, Docker runtime, same variables.

All three now require a payment method even on their smallest tier.

## Audio format

Upstream expects **16 kHz mono PCM in, 24 kHz PCM out** — confirmed from the
server's own `session.created` defaults (`input_audio_format: pcm16`,
`output_audio_format: pcm24`), which differ from the docs example. The
browser therefore needs AudioWorklet capture, not `MediaRecorder`, which is a
different and more finicky client path than the other screens use.
