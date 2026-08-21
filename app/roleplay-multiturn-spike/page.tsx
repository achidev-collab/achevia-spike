'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ErrorNotice } from '@/components/ErrorNotice';
import { FeedbackPanel } from '@/components/FeedbackPanel';
import { GuestPanel, formatClock } from '@/components/GuestPanel';
import { InfoIcon, MicIcon, RecordingMicIcon } from '@/components/Icons';
import { LatencyPanel, formatMs, type LatencyRow } from '@/components/LatencyPanel';
import { GlassPill, MetalCard, Screen, SectionLabel } from '@/components/Screen';
import {
  fieldActive,
  font,
  glassSurface,
  inactiveChip,
  ink,
  orangeButton,
  orangeDisc,
  recordingDisc,
  tealButton,
  type as t,
} from '@/lib/design';
import { SPIKE_TURNS } from '@/lib/multiturnSpikeContent';
import type { ProviderId, ScoreResult } from '@/lib/scoring/types';

/**
 * TIMING RIG — not a product screen. Answers one question: how much
 * wall-clock latency does a fixed three-turn guest exchange add per guest,
 * ahead of committing to a real scripted-branch multi-turn build. Guest
 * lines here are placeholder (see lib/multiturnSpikeContent.ts) — the two
 * production screens' scenario content had nothing for a second or third
 * turn, and inventing "real" dialogue would break the same content rule
 * that governs those screens. The sequence is fixed, not branching: the
 * guest's next line never depends on what the student said, isolating pure
 * turn-loop latency from the extra cost a branch-classification step would
 * add.
 */

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'qwen', label: 'Qwen' },
  { id: 'gemini', label: 'Gemini' },
];

interface TurnResult {
  turnNumber: number;
  ttsMs: number;
  uploadMs: number;
  bytes: number;
  kind: 'audio' | 'text';
}

interface FinalRun {
  provider: ProviderId;
  providerLabel: string;
  model: string;
  result: ScoreResult;
  roundTripMs: number;
  modelMs: number;
  transferMs: number;
}

export default function RoleplayMultiturnSpikePage() {
  const [turnIndex, setTurnIndex] = useState(0);
  const [turnResults, setTurnResults] = useState<TurnResult[]>([]);
  const [lastAudio, setLastAudio] = useState<{ blob: Blob; type: string } | null>(null);

  const [startedAt] = useState(() => performance.now());
  const [stopwatch, setStopwatch] = useState(0);
  const [finished, setFinished] = useState(false);

  const [selected, setSelected] = useState<ProviderId[]>([]);
  const [isScoring, setIsScoring] = useState(false);
  const [finalRuns, setFinalRuns] = useState<FinalRun[]>([]);
  const [finalErrors, setFinalErrors] = useState<{ provider: ProviderId; providerLabel: string; message: string }[]>([]);

  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => setStopwatch(performance.now() - startedAt), 100);
    return () => clearInterval(id);
  }, [finished, startedAt]);

  const currentTurn = turnIndex < SPIKE_TURNS.length ? SPIKE_TURNS[turnIndex] : null;
  const allTurnsDone = turnIndex >= SPIKE_TURNS.length;

  return (
    <Screen
      eyebrow="Timing spike · multi-turn"
      title="3-turn scripted sequence"
      headerRight={
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={t.meta}>
            {allTurnsDone ? 'All turns captured' : `Turn ${currentTurn?.turnNumber} of ${SPIKE_TURNS.length}`}
          </span>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 34,
              padding: '0 14px',
              borderRadius: 17,
              font: `600 14px ${font.body}`,
              ...tealButton,
            }}
          >
            Elapsed {formatMs(stopwatch)}
          </div>
          <GlassPill>Level B1</GlassPill>
        </div>
      }
    >
      <PlaceholderBanner />

      {SPIKE_TURNS.map((turn, index) =>
        index < turnIndex ? (
          <CompletedTurnRow key={turn.id} turn={turn} result={turnResults[index]} />
        ) : index === turnIndex ? (
          <ActiveTurn
            key={turn.id}
            turn={turn}
            turnNumber={turn.turnNumber}
            totalTurns={SPIKE_TURNS.length}
            onComplete={(result, audio) => {
              setTurnResults((prev) => [...prev, result]);
              setLastAudio(audio);
              setTurnIndex((prev) => prev + 1);
            }}
          />
        ) : null,
      )}

      {allTurnsDone ? (
        <MetalCard style={{ gap: 12 }}>
          <SectionLabel>Final score, after the sequence</SectionLabel>
          <span style={t.bodyTextLg}>
            Matches the design file&apos;s own pattern: scoring runs once, on
            the last turn&apos;s reply, after the exchange ends — not after
            every turn.
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {PROVIDERS.map(({ id, label }) => {
              const active = selected.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    setSelected((current) =>
                      current.includes(id)
                        ? current.filter((entry) => entry !== id)
                        : [...current, id],
                    )
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    height: 32,
                    padding: '0 14px',
                    borderRadius: 16,
                    font: active ? `600 14px ${font.body}` : `500 14px ${font.body}`,
                    ...(active ? tealButton : inactiveChip),
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={selected.length === 0 || isScoring || !lastAudio || finished}
            onClick={async () => {
              if (!lastAudio) return;
              setIsScoring(true);
              setFinalRuns([]);
              setFinalErrors([]);

              const outcomes = await Promise.all(
                selected.map(async (provider) => {
                  const body = new FormData();
                  body.set('provider', provider);
                  body.set('audio', lastAudio.blob, `turn3.${extensionFor(lastAudio.type)}`);
                  const t0 = performance.now();
                  try {
                    const response = await fetch('/api/score', { method: 'POST', body });
                    const roundTripMs = performance.now() - t0;
                    const payload = await response.json().catch(() => null);
                    if (!response.ok || !payload?.result) {
                      return {
                        kind: 'error' as const,
                        error: {
                          provider,
                          providerLabel: payload?.providerLabel ?? labelFor(provider),
                          message: payload?.error ?? `HTTP ${response.status}`,
                        },
                      };
                    }
                    const serverTotalMs = payload.timings?.serverTotalMs ?? 0;
                    return {
                      kind: 'run' as const,
                      run: {
                        provider,
                        providerLabel: payload.providerLabel ?? labelFor(provider),
                        model: payload.model ?? 'unknown',
                        result: payload.result as ScoreResult,
                        roundTripMs,
                        modelMs: payload.timings?.modelMs ?? 0,
                        transferMs: Math.max(0, roundTripMs - serverTotalMs),
                      },
                    };
                  } catch (cause) {
                    return {
                      kind: 'error' as const,
                      error: {
                        provider,
                        providerLabel: labelFor(provider),
                        message: (cause as Error).message,
                      },
                    };
                  }
                }),
              );

              setFinalRuns(outcomes.flatMap((o) => (o.kind === 'run' ? [o.run] : [])));
              setFinalErrors(outcomes.flatMap((o) => (o.kind === 'error' ? [o.error] : [])));
              setIsScoring(false);
              setFinished(true);
            }}
            style={{
              alignSelf: 'flex-start',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 54,
              padding: '0 32px',
              borderRadius: 27,
              font: `600 14.5px ${font.body}`,
              opacity: selected.length === 0 || isScoring || finished ? 0.45 : 1,
              ...orangeButton,
            }}
          >
            {isScoring ? 'Scoring' : finished ? 'Sequence complete' : 'Get final score and stop the clock'}
          </button>
        </MetalCard>
      ) : null}

      {finalErrors.map((error) => (
        <ErrorNotice key={error.provider} provider={error.providerLabel} message={error.message} />
      ))}

      {finalRuns.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: finalRuns.length > 1 ? '1fr 1fr' : '1fr',
            gap: 14,
          }}
        >
          {finalRuns.map((run) => (
            <FeedbackPanel key={run.provider} providerLabel={run.providerLabel} model={run.model} result={run.result} />
          ))}
        </div>
      ) : null}

      {finished ? <SummaryPanel turnResults={turnResults} finalRuns={finalRuns} totalMs={stopwatch} /> : null}
    </Screen>
  );
}

function PlaceholderBanner() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 18px',
        borderRadius: 16,
        ...glassSurface,
      }}
    >
      <InfoIcon size={17} color={ink.teal} style={{ marginTop: 1 }} />
      <span style={{ font: `400 13.5px/1.5 ${font.body}`, color: ink.body }}>
        Timing rig, not a product screen. The three guest lines below are
        placeholder text, not real Achevia content — the scenario brief only
        supplied one guest line, and this measures multi-turn latency ahead
        of authoring a real branch script. The sequence is fixed: the
        guest&apos;s next line never depends on what you say.
      </span>
    </div>
  );
}

function CompletedTurnRow({
  turn,
  result,
}: {
  turn: (typeof SPIKE_TURNS)[number];
  result?: TurnResult;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '14px 22px',
        borderRadius: 16,
        ...glassSurface,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            font: `600 13px ${font.body}`,
            color: '#F7FBFA',
            ...tealButton,
          }}
        >
          {turn.turnNumber}
        </span>
        <span style={{ font: `400 14px ${font.body}`, color: ink.body }}>
          &ldquo;{turn.guestLine}&rdquo;
        </span>
      </div>
      {result ? (
        <span style={t.metaSmall}>
          TTS {formatMs(result.ttsMs)} · upload {formatMs(result.uploadMs)}
        </span>
      ) : null}
    </div>
  );
}

function ActiveTurn({
  turn,
  turnNumber,
  totalTurns,
  onComplete,
}: {
  turn: (typeof SPIKE_TURNS)[number];
  turnNumber: number;
  totalTurns: number;
  onComplete: (result: TurnResult, audio: { blob: Blob; type: string }) => void;
}) {
  const [ttsStatus, setTtsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [ttsMs, setTtsMs] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);

  const [mode, setMode] = useState<'speak' | 'type'>('speak');
  const [typed, setTyped] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [clip, setClip] = useState<{ blob: Blob; type: string } | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTtsStatus('loading');
    setTtsError(null);
    const startedAt = performance.now();

    (async () => {
      try {
        const response = await fetch('/api/spike-multiturn/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ turn: turn.id }),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => null);
          throw new Error(detail?.error ?? `HTTP ${response.status}`);
        }
        const blob = await response.blob();
        if (cancelled) return;
        const ms = performance.now() - startedAt;

        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;

        audio.addEventListener('loadedmetadata', () => {
          setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
        });
        audio.addEventListener('timeupdate', () => setElapsed(audio.currentTime));
        audio.addEventListener('play', () => setIsPlaying(true));
        audio.addEventListener('pause', () => setIsPlaying(false));
        audio.addEventListener('ended', () => setIsPlaying(false));

        setTtsMs(ms);
        setTtsStatus('ready');
        void audio.play().catch(() => undefined);
      } catch (cause) {
        if (!cancelled) {
          setTtsError((cause as Error).message);
          setTtsStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, [turn.id]);

  const replay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, []);

  const startRecording = useCallback(async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 },
      );
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm';
        setClip({ blob: new Blob(chunksRef.current, { type }), type });
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setRecordSeconds(0);
      tickRef.current = setInterval(() => setRecordSeconds((v) => v + 1), 1000);
    } catch (cause) {
      setMicError(
        `The microphone could not be opened: ${(cause as Error).message}. Use the typed fallback below.`,
      );
    }
  }, []);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    setIsRecording(false);
  }, []);

  const submit = useCallback(async () => {
    if (mode === 'speak' && !clip) return;
    if (mode === 'type' && typed.trim() === '') return;

    setIsSubmitting(true);
    const body = new FormData();
    body.set('turn', turn.id);
    if (mode === 'speak' && clip) {
      body.set('audio', clip.blob, `turn.${extensionFor(clip.type)}`);
    } else {
      body.set('text', typed.trim());
    }

    const t0 = performance.now();
    try {
      const response = await fetch('/api/spike-multiturn/turn', { method: 'POST', body });
      const uploadMs = performance.now() - t0;
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }
      onComplete(
        {
          turnNumber,
          ttsMs: ttsMs ?? 0,
          uploadMs,
          bytes: payload.bytes ?? 0,
          kind: mode === 'speak' ? 'audio' : 'text',
        },
        mode === 'speak' && clip ? { blob: clip.blob, type: clip.type } : { blob: new Blob([typed], { type: 'text/plain' }), type: 'text/plain' },
      );
    } catch (cause) {
      setMicError(`The turn could not be submitted: ${(cause as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [clip, mode, onComplete, ttsMs, turn.id, turnNumber, typed]);

  return (
    <>
      <GuestPanel
        initials={`G${turnNumber}`}
        name={`Guest reply, turn ${turnNumber} of ${totalTurns}`}
        moodLabel="Placeholder"
        status={isPlaying ? 'is speaking' : ttsStatus === 'ready' ? 'has spoken' : undefined}
        progress={duration ? elapsed / duration : 0}
        elapsedSeconds={elapsed}
        durationSeconds={duration}
        isPlaying={isPlaying}
        onReplay={replay}
        replayDisabled={ttsStatus !== 'ready'}
        footer={
          <span style={{ font: `400 14px ${font.body}`, color: ink.onDarkMuted }}>
            &ldquo;{turn.guestLine}&rdquo;
          </span>
        }
      />

      {ttsStatus === 'error' && ttsError ? <ErrorNotice provider="Deepgram" message={ttsError} /> : null}

      <MetalCard style={{ alignItems: 'center', justifyContent: 'center', gap: 14, minHeight: 260 }}>
        <SectionLabel>Your turn</SectionLabel>
        <span style={t.cardHeading}>Reply to the guest</span>

        {mode === 'speak' ? (
          isRecording ? (
            <>
              <button
                type="button"
                onClick={stopRecording}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...recordingDisc,
                }}
                aria-label="Stop recording"
              >
                <RecordingMicIcon size={28} color="#FFFFFF" />
              </button>
              <span style={{ font: `500 14px ${font.body}`, color: ink.orange }}>
                Recording {formatClock(recordSeconds)}
              </span>
              <button
                type="button"
                onClick={stopRecording}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 48,
                  padding: '0 28px',
                  borderRadius: 24,
                  font: `500 14.5px ${font.body}`,
                  ...orangeButton,
                }}
              >
                Stop
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={startRecording}
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...orangeDisc,
                }}
                aria-label="Start recording"
              >
                <MicIcon size={32} color={ink.dark} />
              </button>
              <span style={{ font: `500 13.5px ${font.body}`, color: ink.body }}>
                {clip ? `Recorded. Press again to record over it.` : 'Tap to speak'}
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setMode('type')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: 36,
                    padding: '0 16px',
                    borderRadius: 18,
                    font: `500 13.5px ${font.body}`,
                    color: ink.teal,
                    ...glassSurface,
                  }}
                >
                  Type instead
                </button>
                {clip ? (
                  <button
                    type="button"
                    onClick={submit}
                    disabled={isSubmitting}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      height: 36,
                      padding: '0 20px',
                      borderRadius: 18,
                      font: `600 13.5px ${font.body}`,
                      opacity: isSubmitting ? 0.6 : 1,
                      ...tealButton,
                    }}
                  >
                    {isSubmitting ? 'Submitting' : 'Submit this turn'}
                  </button>
                ) : null}
              </div>
            </>
          )
        ) : (
          <>
            <textarea
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              rows={3}
              placeholder="Type your reply for this turn."
              style={{
                width: '100%',
                resize: 'vertical',
                borderRadius: 14,
                padding: '14px 16px',
                font: `400 14px/1.6 ${font.body}`,
                color: ink.heading,
                ...fieldActive,
              }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setMode('speak')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 36,
                  padding: '0 16px',
                  borderRadius: 18,
                  font: `500 13.5px ${font.body}`,
                  color: ink.teal,
                  ...glassSurface,
                }}
              >
                Speak instead
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={isSubmitting || typed.trim() === ''}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 36,
                  padding: '0 20px',
                  borderRadius: 18,
                  font: `600 13.5px ${font.body}`,
                  opacity: isSubmitting || typed.trim() === '' ? 0.5 : 1,
                  ...tealButton,
                }}
              >
                {isSubmitting ? 'Submitting' : 'Submit this turn'}
              </button>
            </div>
          </>
        )}

        {micError ? <ErrorNotice message={micError} /> : null}
      </MetalCard>
    </>
  );
}

function SummaryPanel({
  turnResults,
  finalRuns,
  totalMs,
}: {
  turnResults: TurnResult[];
  finalRuns: FinalRun[];
  totalMs: number;
}) {
  const rows: LatencyRow[] = [
    ...turnResults.flatMap((r) => [
      { label: `Turn ${r.turnNumber} · guest TTS`, ms: r.ttsMs },
      { label: `Turn ${r.turnNumber} · reply captured`, ms: r.uploadMs, note: r.kind },
    ]),
    ...finalRuns.flatMap((r) => [
      { label: `${r.providerLabel} · final score, transfer`, ms: r.transferMs },
      { label: `${r.providerLabel} · final score, model`, ms: r.modelMs, note: r.model },
      { label: `${r.providerLabel} · final score, total`, ms: r.roundTripMs, emphasis: true },
    ]),
    { label: 'Grand total, this guest', ms: totalMs, emphasis: true },
  ];

  const slowestFinal = finalRuns.length > 0 ? Math.max(...finalRuns.map((r) => r.roundTripMs)) : 0;
  const projectedFive = totalMs * 5;

  return (
    <>
      <LatencyPanel title="Full breakdown, this guest" rows={rows} />
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '16px 20px',
          borderRadius: 16,
          ...glassSurface,
        }}
      >
        <InfoIcon size={17} color={ink.teal} style={{ marginTop: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ font: `600 14px ${font.body}`, color: ink.heading }}>
            Rough 5-guest projection: {formatMs(projectedFive)}
          </span>
          <span style={{ font: `400 13.5px/1.5 ${font.body}`, color: ink.body }}>
            This guest&apos;s total ({formatMs(totalMs)}) × 5, naively. It
            includes the time you personally took to record each reply, so
            it is not a pure API-latency number — it is closer to what one
            live run of five guests would actually take at this pace. Slowest
            single final-score call this run: {formatMs(slowestFinal)}.
            Compare against whatever the real time budget for a 5-guest
            simulation turns out to be.
          </span>
        </div>
      </div>
    </>
  );
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function extensionFor(mimeType: string): string {
  const base = mimeType.split(';')[0];
  if (base === 'audio/webm') return 'webm';
  if (base === 'audio/ogg') return 'ogg';
  if (base === 'audio/mp4') return 'm4a';
  return 'bin';
}

function labelFor(provider: ProviderId): string {
  return provider === 'qwen' ? 'Qwen' : 'Gemini';
}
