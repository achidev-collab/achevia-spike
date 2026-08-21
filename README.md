# Achevia API spike

A technical spike, not a product. It proves the API pipelines work end to end
with real calls, puts round-trip latency on screen, and tests whether an AI
guest can improvise inside a fixed syllabus.

There is no navigation, no auth, no dashboard and no other pathway screen. The
root path is deliberately not built. Go straight to:

- `/roleplay-spike` — single exchange, English, mic and typed fallback
- `/pms-spike` — spoken PMS field entry, English
- `/roleplay-multiturn-spike` — follow-on timing rig, see
  [below](#multi-turn-timing-spike-roleplay-multiturn-spike)
- `/roleplay-live` — multi-turn off-script **French** roleplay with a
  containment check, see
  [below](#live-off-script-french-roleplay-roleplay-live)

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

**Qwen scoring — working, after the key was fixed.**
- First run failed: HTTP 401 from Alibaba Cloud Model Studio, `"Incorrect
  API key provided."` The original `DASHSCOPE_API_KEY` value was invalid —
  a key problem, not a code problem, and the no-fallback design surfaced it
  correctly (provider name and reason shown on screen, nothing faked).
- After the key was replaced: HTTP 200 in ~2.3–2.7 s model time, correct
  JSON shape, `qwen3-omni-flash` as the responding model. No free-tier
  limit hit yet.

**Both providers compared side by side, same input.** The same typed reply
("Good afternoon, of course. May I take your name so I can check what we
have free for two nights?") sent to both providers in the same request,
mirroring what the `/roleplay-spike` toggle does with one recording:

| Provider | Band | Emotion | Model time |
| --- | --- | --- | --- |
| Qwen (`qwen3-omni-flash`) | Good | 80 | ~2.7 s |
| Gemini (`gemini-3.6-flash`) | Best | 100 | ~4.3 s |

Same cited moment, different bands and different reasoning — Qwen flagged
that guest count and stay length weren't explicitly confirmed back, Gemini
scored the same reply as fully sufficient. That disagreement is the actual
value of running both; a spike that only tested one provider wouldn't have
surfaced it.

**Microphone path — tested on a real device, working.** A real recording
(77 KB, mobile Safari) of a deliberately bad reply — declining to help and
pointing the guest to a competitor hotel — scored `Poor`/40 on both
providers, with each citing the actual moment and explaining what was wrong.
Confirms both the recording pipeline and that a genuinely poor reply is
recognized as such, not just a good one.

| Provider | Band | Emotion | Upload | Model response | Total round trip |
| --- | --- | --- | --- | --- | --- |
| Qwen | Poor | 40 | 280 ms | 3.28 s | 3.56 s |
| Gemini | Poor | 40 | 370 ms | 14.65 s | 15.02 s |

Guest line to scored feedback (TTS + slowest provider): 18.05 s.

Worth flagging: Gemini took roughly 3× longer scoring real audio (14.65 s)
than it did on typed text earlier in testing (~5 s on a similar-length
reply). Qwen's audio and text timings stayed close (3.28 s vs ~2.7 s). If
Gemini stays in the mix for a 5-guest simulation, its audio-scoring latency
is the number to budget against, not its text latency.

## Multi-turn timing spike (`/roleplay-multiturn-spike`)

A follow-on to the question the two screens above were built to answer: how
much wall-clock latency does a *multi-turn* guest exchange add per guest,
ahead of committing to a real scripted-branch build for the 5-guest
simulation. Not part of the original two-screen deliverable — added after
those were confirmed working, to size the next piece of work before it gets
built.

**Scope, deliberately narrow:**
- **Placeholder guest content only.** The scenario brief supplied exactly one
  guest line, nothing for a second or third turn. Inventing "real" Achevia
  dialogue for this would break the same content rule that governs the other
  two screens, so `lib/multiturnSpikeContent.ts` holds three visibly-labeled
  placeholder lines, and the screen banners this outright. Not scored
  against any real rubric — the final score call runs on the real system
  prompt from the actual walk-in scenario, so a placeholder reply like
  "Check-in is at three PM" correctly comes back `Poor` (it doesn't answer
  the real guest's question). That's expected: the score's *content* is
  meaningless here, only the score call's *latency* is the point.
- **Fixed sequence, not branching.** The guest's next line never depends on
  what the student says. Isolates pure turn-loop cost (TTS → record → upload
  → repeat) from the extra cost a real branch-classification step would add.
- **New, isolated routes only** — `/api/spike-multiturn/tts` and
  `/api/spike-multiturn/turn`. The two production screens and `/api/tts` /
  `/api/score` are untouched.

**A real bug found and fixed during live testing:** the final-score button
originally sent turn 3's reply under the `audio` form field even when it had
been typed, not spoken — a `text/plain` Blob dressed up as an audio file.
Qwen correctly rejected it: `HTTP 400
InternalError.Algo.InvalidParameter: The audio is empty`. Gemini, worse,
silently tolerated the garbage bytes and returned a coherent-looking score
anyway. Fixed by tracking whether the last turn was audio or text and
sending the matching field — the same discipline the two production screens
already follow.

**Clean per-guest latency**, from direct API calls (not the in-browser
click-through, which carries manual-testing overhead):

| Step | Time |
| --- | --- |
| 3× guest TTS (placeholder lines) | 4.03 s |
| 3× reply upload (typed, real network round trip) | 0.69 s |
| Final score — Qwen | 2.44 s |
| Final score — Gemini | 5.32 s |
| **Per guest, Qwen path** | **7.16 s** |
| **Per guest, Gemini path** | **10.04 s** |

**The actual finding:** projected across 5 guests, pure API latency is
**~36 s on Qwen, ~50 s on Gemini** — nowhere near the bottleneck for a timed
simulation. The 5-guest simulation's time budget will be dominated by how
long a student actually takes to think, speak or type each of the 15 turns
(3 turns × 5 guests), not by the API pipeline. That's a materially different
risk than the one this spike set out to check — worth knowing before scoping
further build work around latency that isn't actually the constraint.

Not yet tested: the same sequence with real recorded audio for all three
turns (this run used the typed fallback throughout), and the true
branch-classification variant, which adds one model call per turn and would
change this math.

## Live off-script French roleplay (`/roleplay-live`)

A third screen, and a different question from the first two. Those asked
whether the API plumbing works. This one asks whether an AI guest can
**improvise inside a syllabus** — vary phrasing, order and emotion freely
while never introducing vocabulary, procedures, facts or task types the
chapter has not taught. Ingredients locked, recipe free.

One guest, five turns maximum, all in French. The guest's line is generated
each turn rather than scripted, spoken by a French Deepgram voice, and the
student answers by voice. Generation only between turns; scoring runs once
at the end on all five audio clips. The hint box is collapsed by default and
holds one Communication tip.

> Placeholder content. The manifest in `lib/live/manifest.ts` is written
> against the Content Framework's Chapter 1 scope, not the authored chapter
> manifest. Do not treat it as canonical.

### The containment check

Every generated line passes two gates before it can be shown or spoken:

1. **Lexical.** A deny-list over the explicitly out-of-syllabus list, plus an
   English-marker check. Pure and total — it cannot fail, time out, or cost a
   call, so a banned topic can never slip through because a check errored.
2. **Semantic.** The same provider is asked whether the line stays inside the
   manifest, answering `CONFORME` or `HORS-SUJET: <raison>` in **plain text,
   deliberately not JSON** — so a model that is bad at JSON cannot break the
   containment check itself.

A rejected line is never displayed or spoken. It is logged in full with turn
number, attempt, reason, which gate caught it and the exact matched token,
then regenerated, up to three attempts before the turn fails outright. The
counter is on screen throughout and the full log is on the results screen.
`/api/live/tts` re-runs the lexical gate before speaking, **ahead of even
reading the API key**, so a banned line cannot be spoken even if it reached
the client another way.

**Gate verified directly:** 5/5 in-syllabus French lines pass; 10/10
out-of-syllabus lines are blocked with the correct category and matched
token — `prix`, `carte bancaire`, `surclassement`, `chien`, `annuler`,
`passeport`, `restaurant`, `inacceptable`, `euros`, and an English line
caught on `you`.

### What the containment check caught, per provider

**Zero rejections on both providers, across eight generated turns.** Neither
model tried to introduce a price, an upgrade, a pet, a cancellation or a
passport unprompted. On the narrow question the check was built to answer —
does the guest wander out of the syllabus — both models held.

That result is only meaningful next to what the check does *not* measure,
because the same runs surfaced three quality failures that stayed
technically inside the manifest:

| Finding | Provider | What happened |
| --- | --- | --- |
| Emoji in generated speech | Gemini | Produced `« une chambre simple pour deux 💬 nuits »`. In syllabus, and about to be sent to a TTS engine. Neither gate looks for emoji. |
| Verbatim repetition | Qwen | Turns 3, 4 and 5 came back as the *same sentence*, word for word. It stayed in syllabus by ceasing to improvise at all. |
| Role confusion | Qwen | The guest began speaking as the receptionist — `« Bon séjour, je reste à votre disposition »` is staff phrasing from the manifest's own closing vocabulary, said by the customer. |

The honest read: a containment check scoped to *topic* passes a line that is
repetitive, mis-attributed, or carrying an emoji into a speech synthesiser.
Topic containment is necessary and is not sufficient.

### Provider comparison

| | Qwen (`qwen3-omni-flash`) | Gemini (`gemini-3.6-flash`) |
| --- | --- | --- |
| Guest line generation | ~1.0–1.5 s | ~3.2–17.6 s |
| Semantic containment check | ~0.4–0.9 s | ~2.3–12.1 s |
| Mood-trigger intent check | ~1.4 s | ~2.4 s |
| Completed 5 turns | Yes | **No — quota exhausted at turn 3** |
| End-of-exchange scoring | **No — structurally impossible** | Yes, 22.8 s |
| French quality | Natural at first, then repeats verbatim | Natural throughout, one emoji artifact |

**Two blocking findings, one per provider.**

**Qwen cannot do end-of-exchange scoring at all.** Sending all five turns'
audio in one request returns `HTTP 400 InternalError.Algo.InvalidParameter:
Multiple inputs of the same modality or mixed modality inputs are currently
not applicable to the omni model.` End-of-exchange scoring is *defined* as
sending every turn's audio at once, so this is not a transient error and
will not pass on a retry. Nothing is faked in its place and no single-turn
subset is scored instead — scoring part of the exchange would silently
answer a different question. The screen names the limitation explicitly.
Note also that a true Omni-**Realtime** variant would need Alibaba's
WebSocket realtime API, not the `chat/completions` endpoint used here; the
non-realtime omni model is what actually works for per-turn generation.

**Gemini runs out of free tier fast.** It hit `HTTP 429 — You exceeded your
current quota` at turn 3 of the first full exchange. Each turn costs up to
four model calls (intent check, generation, containment check, plus a retry
if containment rejects), so a five-turn exchange is ~15–20 calls before
scoring. On the free tier that is roughly one and a half exchanges.

Gemini's scoring itself was strong when it ran: valid JSON first time, all
five criteria in French, and cited moments that genuinely quoted the
student — `« Puis-je avoir votre nom s'il vous plaît ? »`,
`« Combien de personnes et combien de nuits ? »` — rather than generic
filler.

**Combined, there is currently no single provider that can run this screen
end to end**: Qwen generates well and cannot score, Gemini scores well and
cannot afford to generate. That is the finding.

### JSON handling

Scoring parses strictly: the text must already be a JSON object. No fence
stripping, no bracket hunting, no repair. When a provider fails that bar the
raw output is rendered verbatim on screen with the parse error, because a
parsing hack would hide exactly the finding this screen exists to produce.
(Generated *dialogue* is tidied of quote marks and speaker labels before
display — that is presentation, on a different path from scoring.)

### The French voice

The voice name could not be guessed. Deepgram answers a well-formed but
unavailable model name with `403 project does not have access`, not `404`,
so every plausible candidate looked equally real. `/api/live/voices` lists
what `GET /v1/models` actually sells this project: exactly two French
Aura-2 voices, `aura-2-agathe-fr` and `aura-2-hector-fr`. Both return real
audio in ~2.2–2.4 s. Default is agathe.

### Not yet tested

The five turns were driven with synthesised French student audio rather than
a real microphone, because this environment has no microphone. Recording
capture on this screen uses the same `MediaRecorder` path already confirmed
working on `/roleplay-spike`, but the live screen's own record-and-advance
loop has not been exercised by a human voice. The mood shift to
`légèrement pressé` did fire correctly on Qwen at turn 3, from the intent
check reading real audio.
