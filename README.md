# Achevia API spike

A technical spike, not a product. Two screens that prove two API pipelines work
end to end with real calls, and put the round-trip latency on screen so the
timed five-guest simulation can be judged as viable or not.

There is no navigation, no auth, no dashboard and no other pathway screen. The
root path is deliberately not built. Go straight to:

- `/roleplay-spike`
- `/pms-spike`

## Which calls hit what

| Call | Route | Provider | Notes |
| --- | --- | --- | --- |
| Guest opening line, spoken | `POST /api/tts` | **Deepgram** TTS (`aura-2-thalia-en` by default) | `/roleplay-spike`, autoplayed on load |
| Guest spoken-information script | `POST /api/tts` | **Deepgram** TTS | `/pms-spike`, autoplayed on load, replay unlimited |
| Scoring the student's turn | `POST /api/score` | **Qwen** or **Gemini** | Raw audio goes straight to the model. There is no transcript step |
| Typed fallback scoring | `POST /api/score` | **Qwen** or **Gemini** | Same prompt, text instead of audio, so the prompt can be tested without Deepgram |

The student's audio is never transcribed before scoring. It is posted as a blob
to `/api/score`, base64-encoded server side, and handed to the model as audio.

## Where the keys are read from

Every key is read **only inside a Next.js API route**, from `process.env`. No
key is bundled into client code, none is prefixed `NEXT_PUBLIC_`, and no client
fetch carries one. The client sends at most a provider *name* (`qwen` or
`gemini`), which is not a secret.

| Variable | Read in | Required |
| --- | --- | --- |
| `DEEPGRAM_API_KEY` | `app/api/tts/route.ts` | Yes |
| `DEEPGRAM_TTS_MODEL` | `app/api/tts/route.ts` | No, defaults to `aura-2-thalia-en` |
| `SCORING_PROVIDER` | `lib/scoring/provider.ts` | Yes, unless the screen names a provider |
| `DASHSCOPE_API_KEY` | `lib/scoring/qwen.ts` | Yes, to use Qwen |
| `QWEN_MODEL` | `lib/scoring/qwen.ts` | No, defaults to `qwen3-omni-flash` |
| `QWEN_BASE_URL` | `lib/scoring/qwen.ts` | No, defaults to the international endpoint |
| `GEMINI_API_KEY` | `lib/scoring/gemini.ts` | Yes, to use Gemini |
| `GEMINI_MODEL` | `lib/scoring/gemini.ts` | No, defaults to `gemini-3.6-flash` |

`.env.example` lists every one of these with blank values. Real values go in
Vercel project environment variables and in a gitignored `.env.local` for local
work. `.gitignore` covers `.env`, `.env.local` and `.env*.local`.

## Swapping the scoring model

`SCORING_PROVIDER=qwen|gemini` picks the default. Both providers implement the
same `ScoringProvider` interface in `lib/scoring/types.ts`, take the same audio
and the same prompt (`lib/scoring/prompt.ts`), and return the same JSON shape:

```json
{
  "band": "Poor | Good | Best",
  "cited_moment": "string",
  "what_went_wrong": "string",
  "how_to_improve": "string",
  "emotion_band": 0
}
```

`/roleplay-spike` has a provider toggle. Selecting both runs the *same*
recording through each and renders the two bands, cited moments and latencies
side by side. That comparison is the point of the spike, so neither model is
hardcoded.

**There is no mock and no fallback score.** If a key is missing, a free tier is
exhausted, or a model returns something that is not valid JSON in the shape
above, the screen shows the provider name and the reason and nothing else. A
fake score would make the spike worthless.

## Vercel constraints handled

- `export const maxDuration = 60` is set in both `app/api/tts/route.ts` and
  `app/api/score/route.ts`, because the default serverless timeout is too short
  for audio scoring.
- Audio is recorded as `audio/webm;codecs=opus` at 32 kbps, so a normal reply
  is a few tens of kilobytes.
- `/api/score` rejects anything over 4 MB with an explicit on-screen message
  naming the size, rather than failing silently against the platform body
  limit.

## Latency on screen

Both screens show numbers on screen, not only in the console.

`/roleplay-spike` shows, per provider run:

- Deepgram TTS time for the guest opening line
- upload and response transfer time (round trip minus the time the route
  measured for itself)
- model response time (measured around the provider HTTP call, inside the
  route)
- total round trip
- guest line to scored feedback, which is TTS plus the slowest provider

`/pms-spike` shows the Deepgram TTS time and the replay count.

## Screens

### `/roleplay-spike`

One exchange from the calm walk-in scenario. On load the guest's opening line
is spoken by Deepgram. The mic button records, presses again to stop, and shows
a recording indicator with elapsed time while active. The clip is posted to
`/api/score` and the returned JSON is rendered in the feedback panel. A typed
fallback runs the same prompt without touching Deepgram.

### `/pms-spike`

The guest speaks her details once, via Deepgram. Replay is unlimited and never
capped; each press replays the same audio and increments a visible counter.
Replay never changes the result, it costs visible time only. The five fields
start empty and are typed by hand — there is no speech to text on this screen.
A two minute countdown is visible but is **not** wired to scoring: whether time
expired is noted on submit and correctness is graded independently of it.
Matching is binary per field, with the case, spacing and currency rules from
the scenario applied.

## Scenario content

All guest lines, field labels and expected values live in `lib/scenario.ts`,
verbatim from the brief. Nothing is invented or extended. That file carries the
brief's own warning: the content is structurally correct per the Achevia
Content Framework but is placeholder, not the authored chapter.

## Styling

Every colour, gradient, shadow, radius, type size and spacing value comes from
`Achevia Metallic Study.dc.html` in the Claude Design handoff bundle. The
tokens are transcribed in `lib/design.ts` with the source artboard noted
against each group. Source artboards used:

- `16b` Practice · Roleplay, one exchange, guest speaking
- `17b` Practice · Interactive test, Task 1 spoken entry, and its calm guest panel
- `16e` Scoring in progress, for the step and latency row treatment
- `15e` Technical listen and enter, for the incorrect-field treatment
- `15f` After the section, feedback Good band, for the result panel
- `06b` Onboarding microphone test, for the recording state

Nothing is styled from any other source. Where the design file does not cover
something, it is left unstyled rather than guessed at.

## Running locally

```bash
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev
```

Microphone access needs HTTPS or `localhost`.

## Errors and rate limits encountered during testing

Tested live against the deployed Vercel environment on 2026-08-21, hitting
`/api/tts` and `/api/score` directly (text fallback, no microphone).

**Deepgram TTS — working.**
- Guest opening line (`/roleplay-spike`): 200, ~2.5 s, returned a real
  `audio/mpeg` clip (~29 KB).
- Spoken-information script (`/pms-spike`, the longer line spelling out the
  name, phone and email): 200, ~13 s, ~169 KB. This is the slowest call in
  either pipeline — worth watching once this becomes a 5-guest simulation,
  since five of these back to back is over a minute of TTS alone.

**Gemini scoring — working, after one fix.**
- First run failed: HTTP 404, `"This model models/gemini-2.5-flash is no
  longer available to new users. Please update your code to use
  models/gemini-3.6-flash for the latest features and improvements."` The
  default model name in `lib/scoring/gemini.ts` was stale. Updated the
  default to `gemini-3.6-flash` and redeployed.
- After the fix: HTTP 200 in ~6.8 s model time on a short typed reply,
  correct JSON shape, sensible `Best` band with an accurately cited moment
  and a specific, non-generic improvement note. No free-tier limit hit.

**Qwen scoring — blocked on the key, not the code.**
- Every attempt returns HTTP 401 from Alibaba Cloud Model Studio:
  `"Incorrect API key provided."` This is the exact failure mode the spike
  is meant to surface — no fallback, no mock score, the provider name and
  reason shown on screen. The `DASHSCOPE_API_KEY` value in Vercel needs to
  be regenerated or re-checked against the Model Studio console
  (international endpoint, `https://dashscope-intl.aliyuncs.com`) before
  the Qwen side of the comparison can be judged.
- Not yet reached: whether Qwen's free tier is sufficient for a 5-guest
  simulation, since no request has authenticated yet.

**Not yet tested:** the microphone-based path end to end (recording capture,
upload, and scoring on real audio rather than the typed fallback), and the
two-provider side-by-side comparison on `/roleplay-spike` with a working
Qwen key.
