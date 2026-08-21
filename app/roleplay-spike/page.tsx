'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ErrorNotice } from '@/components/ErrorNotice';
import { FeedbackPanel } from '@/components/FeedbackPanel';
import { GuestPanel, formatClock } from '@/components/GuestPanel';
import { LockIcon, MicIcon, RecordingMicIcon } from '@/components/Icons';
import { LatencyPanel, type LatencyRow } from '@/components/LatencyPanel';
import { GlassPill, MetalCard, Screen, SectionLabel } from '@/components/Screen';
import {
  fieldActive,
  font,
  glassSurface,
  inactiveChip,
  ink,
  metalStrip,
  orangeButton,
  orangeDisc,
  recordingDisc,
  tealButton,
  type as t,
} from '@/lib/design';
import { SCENARIO } from '@/lib/scenario';
import type { ProviderId, ScoreResult } from '@/lib/scoring/types';
import { useGuestAudio } from '@/lib/useGuestAudio';

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'qwen', label: 'Qwen' },
  { id: 'gemini', label: 'Gemini' },
];

interface Run {
  provider: ProviderId;
  providerLabel: string;
  model: string;
  result: ScoreResult;
  /** Full client-observed round trip for POST /api/score. */
  roundTripMs: number;
  /** Time inside the provider HTTP call, reported by the route. */
  modelMs: number;
  /** Round trip minus everything the route measured. Upload plus response. */
  transferMs: number;
  serverReceiveMs: number;
}

interface RunError {
  provider: ProviderId;
  providerLabel: string;
  message: string;
}

export default function RoleplaySpikePage() {
  const guest = useGuestAudio('opening', { autoplay: true });

  const [mode, setMode] = useState<'speak' | 'type'>('speak');
  const [typed, setTyped] = useState('');
  const [selected, setSelected] = useState<ProviderId[]>(['qwen']);

  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [clip, setClip] = useState<{ blob: Blob; bytes: number; type: string } | null>(
    null,
  );
  const [micError, setMicError] = useState<string | null>(null);

  const [isScoring, setIsScoring] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [errors, setErrors] = useState<RunError[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (tickRef.current) clearInterval(tickRef.current);
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

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
        const blob = new Blob(chunksRef.current, { type });
        setClip({ blob, bytes: blob.size, type });
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setRecordSeconds(0);
      tickRef.current = setInterval(
        () => setRecordSeconds((value) => value + 1),
        1000,
      );
    } catch (cause) {
      setMicError(
        `The microphone could not be opened: ${(cause as Error).message}. Use the typed fallback below to test the scoring prompt on its own.`,
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

  const score = useCallback(async () => {
    if (selected.length === 0) return;
    if (mode === 'speak' && !clip) return;
    if (mode === 'type' && typed.trim() === '') return;

    setIsScoring(true);
    setRuns([]);
    setErrors([]);

    const outcomes = await Promise.all(
      selected.map(async (provider) => {
        const body = new FormData();
        body.set('provider', provider);
        if (mode === 'speak' && clip) {
          body.set('audio', clip.blob, `attempt.${extensionFor(clip.type)}`);
        } else {
          body.set('text', typed.trim());
        }

        const startedAt = performance.now();
        try {
          const response = await fetch('/api/score', { method: 'POST', body });
          const roundTripMs = performance.now() - startedAt;
          const payload = await response.json().catch(() => null);

          if (!response.ok || !payload?.result) {
            return {
              kind: 'error' as const,
              error: {
                provider,
                providerLabel:
                  payload?.providerLabel ?? labelFor(provider),
                message:
                  payload?.error ??
                  `The scoring request failed with HTTP ${response.status}.`,
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
              serverReceiveMs: payload.timings?.serverReceiveMs ?? 0,
              transferMs: Math.max(0, roundTripMs - serverTotalMs),
            },
          };
        } catch (cause) {
          return {
            kind: 'error' as const,
            error: {
              provider,
              providerLabel: labelFor(provider),
              message: `The scoring request never completed: ${(cause as Error).message}`,
            },
          };
        }
      }),
    );

    setRuns(outcomes.flatMap((o) => (o.kind === 'run' ? [o.run] : [])));
    setErrors(outcomes.flatMap((o) => (o.kind === 'error' ? [o.error] : [])));
    setIsScoring(false);
  }, [clip, mode, selected, typed]);

  const canScore =
    !isScoring &&
    selected.length > 0 &&
    (mode === 'speak' ? clip !== null : typed.trim() !== '');

  return (
    <Screen
      eyebrow="Practice · Roleplay"
      title="Front desk arrivals"
      headerRight={
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={t.meta}>Guest 1 of 1 · one exchange</span>
          <GlassPill>Level {SCENARIO.level}</GlassPill>
        </div>
      }
    >
      {/* Guest information — 16b */}
      <div
        style={{
          width: '100%',
          boxSizing: 'border-box',
          borderRadius: 18,
          padding: '16px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          ...metalStrip,
        }}
      >
        <span style={t.eyebrow}>Guest information</span>
        <span style={{ font: `400 13.5px/1.45 ${font.body}`, color: ink.body }}>
          {SCENARIO.description}
        </span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
          <Tag>{SCENARIO.department}</Tag>
          <Tag>
            {SCENARIO.module} · {SCENARIO.chapter}
          </Tag>
          <Tag>{SCENARIO.set}</Tag>
          <Tag>Study language · {SCENARIO.studyLanguage}</Tag>
          <Tag muted>
            <LockIcon size={11} />
            From the PMS, not editable
          </Tag>
        </div>
      </div>

      {/* Guest speaking — 17b calm treatment */}
      <GuestPanel
        initials="CF"
        name="Claire Fontaine"
        moodLabel="Calm"
        status={guest.isPlaying ? 'is speaking' : 'has spoken'}
        progress={guest.progress}
        elapsedSeconds={guest.elapsed}
        durationSeconds={guest.duration}
        isPlaying={guest.isPlaying}
        onReplay={guest.replay}
        replayDisabled={guest.status !== 'ready'}
      />

      {guest.status === 'error' && guest.error ? (
        <ErrorNotice provider="Deepgram" message={guest.error} />
      ) : null}

      {/* Your turn — 16b */}
      <MetalCard
        style={{
          minHeight: 344,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <SectionLabel>Your turn</SectionLabel>
        <span style={t.cardHeading}>Answer the guest</span>

        {mode === 'speak' ? (
          isRecording ? (
            <>
              <RecordingWaveform />
              <button
                type="button"
                onClick={stopRecording}
                style={{
                  width: 78,
                  height: 78,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...recordingDisc,
                }}
                aria-label="Stop recording"
              >
                <RecordingMicIcon size={31} color="#FFFFFF" />
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
                  height: 54,
                  padding: '0 32px',
                  borderRadius: 27,
                  font: `500 14.5px ${font.body}`,
                  ...orangeButton,
                }}
              >
                Stop and submit
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={startRecording}
                style={{
                  width: 104,
                  height: 104,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...orangeDisc,
                }}
                aria-label="Start recording"
              >
                <MicIcon size={38} color={ink.dark} />
              </button>
              <span style={{ font: `500 13.5px ${font.body}`, color: ink.body }}>
                {clip
                  ? `Recorded ${(clip.bytes / 1024).toFixed(0)} KB. Press again to record over it.`
                  : 'Tap to speak'}
              </span>
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
                Type my answer instead
              </button>
            </>
          )
        ) : (
          <>
            <textarea
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              rows={5}
              placeholder="Type what you would say to the guest."
              style={{
                width: '100%',
                resize: 'vertical',
                borderRadius: 14,
                padding: '16px 18px',
                font: `400 14px/1.75 ${font.body}`,
                color: ink.heading,
                ...fieldActive,
              }}
            />
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
              Speak my answer instead
            </button>
          </>
        )}

        {micError ? <ErrorNotice message={micError} /> : null}
      </MetalCard>

      {/* Provider comparison */}
      <MetalCard style={{ gap: 12 }}>
        <SectionLabel>Scoring provider</SectionLabel>
        <span style={t.bodyTextLg}>
          Both providers take the same audio and the same prompt. Select both to
          run one recording through each and compare the bands, the cited
          moments and the latencies side by side.
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
                  font: active
                    ? `600 14px ${font.body}`
                    : `500 14px ${font.body}`,
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
          onClick={score}
          disabled={!canScore}
          style={{
            alignSelf: 'flex-start',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 54,
            padding: '0 32px',
            borderRadius: 27,
            font: `600 14.5px ${font.body}`,
            opacity: canScore ? 1 : 0.45,
            ...orangeButton,
          }}
        >
          {isScoring
            ? 'Scoring'
            : selected.length > 1
              ? 'Score with both providers'
              : 'Score this attempt'}
        </button>
      </MetalCard>

      {errors.map((error) => (
        <ErrorNotice
          key={error.provider}
          provider={error.providerLabel}
          message={error.message}
        />
      ))}

      {runs.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: runs.length > 1 ? '1fr 1fr' : '1fr',
            gap: 14,
            alignItems: 'start',
          }}
        >
          {runs.map((run) => (
            <FeedbackPanel
              key={run.provider}
              providerLabel={run.providerLabel}
              model={run.model}
              result={run.result}
            />
          ))}
        </div>
      ) : null}

      <LatencyPanel title="Round trip" rows={latencyRows(guest.ttsMs, clip, runs)} />
    </Screen>
  );
}

function latencyRows(
  ttsMs: number | null,
  clip: { bytes: number } | null,
  runs: Run[],
): LatencyRow[] {
  const rows: LatencyRow[] = [
    {
      label: 'Deepgram TTS, guest opening line',
      ms: ttsMs,
      note: 'client to /api/tts to Deepgram',
    },
  ];

  for (const run of runs) {
    rows.push({
      label: `${run.providerLabel} · upload and response transfer`,
      ms: run.transferMs,
      note: clip ? `${(clip.bytes / 1024).toFixed(0)} KB clip` : 'typed input',
    });
    rows.push({
      label: `${run.providerLabel} · model response`,
      ms: run.modelMs,
      note: run.model,
    });
    rows.push({
      label: `${run.providerLabel} · total round trip`,
      ms: run.roundTripMs,
      emphasis: true,
    });
  }

  if (runs.length === 0) {
    rows.push({ label: 'Upload and response transfer', ms: null });
    rows.push({ label: 'Model response', ms: null });
    rows.push({ label: 'Total round trip', ms: null, emphasis: true });
  }

  if (ttsMs !== null && runs.length > 0) {
    const slowest = Math.max(...runs.map((run) => run.roundTripMs));
    rows.push({
      label: 'Guest line to scored feedback',
      ms: ttsMs + slowest,
      note: 'TTS plus the slowest provider',
      emphasis: true,
    });
  }

  return rows;
}

function Tag({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 26,
        padding: '0 11px',
        borderRadius: 13,
        font: `500 13.5px ${font.body}`,
        color: muted ? ink.disabled : ink.muted,
        background: 'rgba(40,58,53,.06)',
      }}
    >
      {children}
    </span>
  );
}

/** Recording waveform from the microphone-test screen (06b). */
function RecordingWaveform() {
  const heights = [34, 62, 96, 48, 74, 55, 88, 40, 66];
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 520,
        height: 44,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 3,
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: 60 }, (_, index) => (
        <div
          key={index}
          style={{
            width: 3,
            borderRadius: 2,
            background: ink.orange,
            opacity: 0.85,
            height: `${heights[index % heights.length]}%`,
            animation: `achRecordPulse 1.1s ease-in-out ${(index % 9) * 0.08}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
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
