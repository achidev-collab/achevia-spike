'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ErrorNotice } from '@/components/ErrorNotice';
import { GuestPanel, formatClock } from '@/components/GuestPanel';
import {
  AlertIcon,
  ChevronDownIcon,
  HintIcon,
  InfoIcon,
  MicIcon,
  RecordingMicIcon,
} from '@/components/Icons';
import { LiveFeedbackPanel } from '@/components/LiveFeedbackPanel';
import { LatencyPanel, formatMs, type LatencyRow } from '@/components/LatencyPanel';
import { GlassPill, MetalCard, Screen, SectionLabel } from '@/components/Screen';
import {
  attentionChip,
  confirmSurface,
  fieldIncorrect,
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
import { MANIFEST, MOOD_LABEL, type Mood } from '@/lib/live/manifest';
import { COMMUNICATION_HINT } from '@/lib/live/prompts';
import type { ContainmentRejection, LiveScoreOutcome } from '@/lib/live/types';
import type { ProviderId } from '@/lib/scoring/types';

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'qwen', label: 'Qwen' },
  { id: 'gemini', label: 'Gemini' },
];

interface TurnRecord {
  turnNumber: number;
  guestLine: string;
  mood: Mood;
  moodShiftedThisTurn: boolean;
  rejections: ContainmentRejection[];
  intentMs: number | null;
  generateMs: number;
  containmentMs: number;
  turnRoundTripMs: number;
  ttsMs: number | null;
  replyBytes: number | null;
}

interface CompletedRun {
  provider: ProviderId;
  providerLabel: string;
  turns: TurnRecord[];
  rejections: ContainmentRejection[];
  scoreOutcome: LiveScoreOutcome | null;
  scoreModel: string;
  scoreModelMs: number;
  scoreError: string | null;
  totalMs: number;
}

type Phase =
  | 'idle'
  | 'guest-thinking'
  | 'guest-speaking'
  | 'student-turn'
  | 'scoring'
  | 'done';

export default function RoleplayLivePage() {
  const [provider, setProvider] = useState<ProviderId>('gemini');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<{ provider?: string; message: string } | null>(null);

  const [turns, setTurns] = useState<TurnRecord[]>([]);
  const [rejections, setRejections] = useState<ContainmentRejection[]>([]);
  const [mood, setMood] = useState<Mood>('calme');
  const [turnsWithoutIntent, setTurnsWithoutIntent] = useState(0);

  const [currentLine, setCurrentLine] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);

  const [hintOpen, setHintOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const [scoreOutcome, setScoreOutcome] = useState<LiveScoreOutcome | null>(null);
  const [scoreModel, setScoreModel] = useState('');
  const [scoreModelMs, setScoreModelMs] = useState(0);

  const [completedRuns, setCompletedRuns] = useState<CompletedRun[]>([]);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);

  const clipsRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const turnNumber = turns.length + 1;

  /** Fetch and play one guest line. Returns the TTS latency. */
  const speak = useCallback(async (line: string): Promise<number | null> => {
    const startedAt = performance.now();
    try {
      const response = await fetch('/api/live/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: line }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error ?? `Deepgram HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const ms = performance.now() - startedAt;

      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.addEventListener('loadedmetadata', () =>
        setDuration(Number.isFinite(audio.duration) ? audio.duration : 0),
      );
      audio.addEventListener('timeupdate', () => setElapsed(audio.currentTime));
      audio.addEventListener('play', () => setIsPlaying(true));
      audio.addEventListener('pause', () => setIsPlaying(false));
      audio.addEventListener('ended', () => setIsPlaying(false));

      void audio.play().catch(() => undefined);
      return ms;
    } catch (cause) {
      setError({ provider: 'Deepgram', message: (cause as Error).message });
      return null;
    }
  }, []);

  /** Ask for the next guest line, containment-checked, then speak it. */
  const runGuestTurn = useCallback(
    async (nextTurnNumber: number, studentClip: Blob | null) => {
      setPhase('guest-thinking');
      setError(null);
      setHintOpen(false);

      const body = new FormData();
      body.set('provider', provider);
      body.set('turnNumber', String(nextTurnNumber));
      body.set('mood', mood);
      body.set('turnsWithoutIntent', String(turnsWithoutIntent));
      body.set('history', JSON.stringify(turns.map((turn) => ({ guest: turn.guestLine }))));
      if (studentClip) {
        body.set('audio', studentClip, `tour${nextTurnNumber - 1}.webm`);
      }

      const startedAt = performance.now();
      let payload: Record<string, unknown> | null = null;
      try {
        const response = await fetch('/api/live/turn', { method: 'POST', body });
        payload = await response.json().catch(() => null);
        const turnRoundTripMs = performance.now() - startedAt;

        // Rejections are logged even when the turn ultimately failed.
        const turnRejections = (payload?.rejections as ContainmentRejection[]) ?? [];
        if (turnRejections.length > 0) {
          setRejections((prev) => [...prev, ...turnRejections]);
        }

        if (!response.ok || typeof payload?.guestLine !== 'string') {
          setError({
            provider: (payload?.providerLabel as string) ?? undefined,
            message:
              (payload?.error as string) ??
              `La génération du tour a échoué (HTTP ${response.status}).`,
          });
          setPhase('idle');
          return;
        }

        const line = payload.guestLine as string;
        const nextMood = (payload.mood as Mood) ?? mood;
        setMood(nextMood);
        setTurnsWithoutIntent(Number(payload.turnsWithoutIntent ?? turnsWithoutIntent));
        setCurrentLine(line);

        setPhase('guest-speaking');
        const ttsMs = await speak(line);

        const timings = (payload.timings ?? {}) as Record<string, number | null>;
        setTurns((prev) => [
          ...prev,
          {
            turnNumber: nextTurnNumber,
            guestLine: line,
            mood: nextMood,
            moodShiftedThisTurn: Boolean(payload?.moodShiftedThisTurn),
            rejections: turnRejections,
            intentMs: timings.intentMs ?? null,
            generateMs: timings.generateMs ?? 0,
            containmentMs: timings.containmentMs ?? 0,
            turnRoundTripMs,
            ttsMs,
            replyBytes: null,
          },
        ]);
        setPhase('student-turn');
      } catch (cause) {
        setError({ message: (cause as Error).message });
        setPhase('idle');
      }
    },
    [mood, provider, speak, turns, turnsWithoutIntent],
  );

  const start = useCallback(() => {
    clipsRef.current = [];
    setTurns([]);
    setRejections([]);
    setMood('calme');
    setTurnsWithoutIntent(0);
    setScoreOutcome(null);
    setScoreModel('');
    setScoreModelMs(0);
    setCurrentLine(null);
    setError(null);
    setRunStartedAt(performance.now());
    void runGuestTurn(1, null);
    // runGuestTurn reads `turns` from closure; it is empty here by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const score = useCallback(async () => {
    setPhase('scoring');
    setError(null);
    const body = new FormData();
    body.set('provider', provider);
    clipsRef.current.forEach((clip, index) => {
      body.append('audio', clip, `tour${index + 1}.webm`);
    });

    try {
      const response = await fetch('/api/live/score', { method: 'POST', body });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.outcome) {
        const base =
          (payload?.error as string) ??
          `La notation a échoué (HTTP ${response.status}).`;
        const structural = payload?.structuralLimit as string | undefined;
        const message = structural ? `${base}\n\n${structural}` : base;
        setError({ provider: payload?.providerLabel as string, message });
        setPhase('done');
        finishRun(null, '', 0, message);
        return;
      }

      const outcome = payload.outcome as LiveScoreOutcome;
      const model = (payload.model as string) ?? '';
      const modelMs = Number(payload.timings?.modelMs ?? 0);
      setScoreOutcome(outcome);
      setScoreModel(model);
      setScoreModelMs(modelMs);
      setPhase('done');
      finishRun(outcome, model, modelMs, null);
    } catch (cause) {
      const message = (cause as Error).message;
      setError({ message });
      setPhase('done');
      finishRun(null, '', 0, message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, turns, rejections, runStartedAt]);

  function finishRun(
    outcome: LiveScoreOutcome | null,
    model: string,
    modelMs: number,
    scoreError: string | null,
  ) {
    const label = provider === 'qwen' ? 'Qwen' : 'Gemini';
    setCompletedRuns((prev) => [
      ...prev.filter((run) => run.provider !== provider),
      {
        provider,
        providerLabel: label,
        turns,
        rejections,
        scoreOutcome: outcome,
        scoreModel: model,
        scoreModelMs: modelMs,
        scoreError,
        totalMs: runStartedAt ? performance.now() - runStartedAt : 0,
      },
    ]);
  }

  const startRecording = useCallback(async () => {
    setError(null);
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
        clipsRef.current = [...clipsRef.current, blob];
        setTurns((prev) =>
          prev.map((turn, index) =>
            index === prev.length - 1 ? { ...turn, replyBytes: blob.size } : turn,
          ),
        );
        stream.getTracks().forEach((track) => track.stop());

        const completed = clipsRef.current.length;
        if (completed >= MANIFEST.maxTurns) {
          void score();
        } else {
          void runGuestTurn(completed + 1, blob);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setRecordSeconds(0);
      tickRef.current = setInterval(() => setRecordSeconds((v) => v + 1), 1000);
    } catch (cause) {
      setError({
        message: `Le microphone n’a pas pu être ouvert : ${(cause as Error).message}. Cet écran est parlé uniquement, il n’y a pas de solution de repli au clavier.`,
      });
    }
  }, [runGuestTurn, score]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    setIsRecording(false);
    audioRef.current?.pause();
  }, []);

  const replay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, []);

  const running = phase !== 'idle' && phase !== 'done';

  return (
    <Screen
      eyebrow="Practice · Roleplay en direct"
      title="Arrivée à la réception"
      headerRight={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <TurnDots current={turns.length} total={MANIFEST.maxTurns} />
          <span style={t.meta}>
            {phase === 'done'
              ? 'Échange terminé'
              : `Tour ${Math.min(turnNumber, MANIFEST.maxTurns)} sur ${MANIFEST.maxTurns}`}
          </span>
          <ContainmentCounter count={rejections.length} />
          <GlassPill>Niveau {MANIFEST.level}</GlassPill>
        </div>
      }
    >
      <ManifestBanner />

      <MetalCard style={{ gap: 12 }}>
        <SectionLabel>Fournisseur du modèle</SectionLabel>
        <span style={t.bodyTextLg}>
          Le fournisseur sélectionné produit les répliques du client, exécute
          le contrôle de conformité et note l’échange à la fin. Lancez
          l’échange complet sur l’un, puis relancez-le sur l’autre pour
          comparer.
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {PROVIDERS.map(({ id, label }) => {
            const active = provider === id;
            return (
              <button
                key={id}
                type="button"
                disabled={running}
                onClick={() => setProvider(id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  height: 32,
                  padding: '0 14px',
                  borderRadius: 16,
                  font: active ? `600 14px ${font.body}` : `500 14px ${font.body}`,
                  opacity: running ? 0.5 : 1,
                  ...(active ? tealButton : inactiveChip),
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        {phase === 'idle' || phase === 'done' ? (
          <button
            type="button"
            onClick={start}
            style={{
              alignSelf: 'flex-start',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 54,
              padding: '0 32px',
              borderRadius: 27,
              font: `600 14.5px ${font.body}`,
              ...orangeButton,
            }}
          >
            {phase === 'done'
              ? `Relancer l’échange sur ${provider === 'qwen' ? 'Qwen' : 'Gemini'}`
              : 'Commencer l’échange'}
          </button>
        ) : null}
      </MetalCard>

      {error ? <ErrorNotice provider={error.provider} message={error.message} /> : null}

      {currentLine && phase !== 'idle' ? (
        <GuestPanel
          initials="CP"
          name="Client de passage"
          moodLabel={MOOD_LABEL[mood]}
          status={isPlaying ? 'parle' : phase === 'student-turn' ? 'a parlé' : undefined}
          progress={duration ? elapsed / duration : 0}
          elapsedSeconds={elapsed}
          durationSeconds={duration}
          isPlaying={isPlaying}
          onReplay={replay}
          replayDisabled={!audioRef.current}
          footer={
            <span style={{ font: `400 14px/1.5 ${font.body}`, color: ink.onDarkMuted }}>
              « {currentLine} »
            </span>
          }
        />
      ) : null}

      {turns.some((turn) => turn.moodShiftedThisTurn) && mood === 'presse' ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '11px 14px',
            borderRadius: 12,
            font: `600 14px ${font.body}`,
            ...attentionChip,
          }}
        >
          <AlertIcon size={15} color="#B4600F" />
          L’humeur du client est passée à « Légèrement pressé »
        </div>
      ) : null}

      {phase === 'guest-thinking' ? (
        <MetalCard style={{ alignItems: 'center', gap: 10, minHeight: 140, justifyContent: 'center' }}>
          <SectionLabel>Le client réfléchit</SectionLabel>
          <span style={t.bodyTextLg}>
            Génération de la réplique, puis contrôle de conformité au
            manifeste avant qu’elle ne soit affichée ou prononcée.
          </span>
        </MetalCard>
      ) : null}

      {phase === 'scoring' ? (
        <MetalCard style={{ alignItems: 'center', gap: 10, minHeight: 140, justifyContent: 'center' }}>
          <SectionLabel>Notation en cours</SectionLabel>
          <span style={t.bodyTextLg}>
            L’audio de vos {MANIFEST.maxTurns} tours est envoyé au modèle. Rien
            n’est transcrit.
          </span>
        </MetalCard>
      ) : null}

      {phase === 'student-turn' ? (
        <>
          <MetalCard
            style={{ minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 14 }}
          >
            <SectionLabel>À vous</SectionLabel>
            <span style={t.cardHeading}>Répondez au client, en français</span>
            {isRecording ? (
              <>
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
                  aria-label="Arrêter l’enregistrement"
                >
                  <RecordingMicIcon size={31} color="#FFFFFF" />
                </button>
                <span style={{ font: `500 14px ${font.body}`, color: ink.orange }}>
                  Enregistrement {formatClock(recordSeconds)}
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
                  {turns.length >= MANIFEST.maxTurns
                    ? 'Terminer et noter'
                    : 'Arrêter et envoyer'}
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
                  aria-label="Commencer l’enregistrement"
                >
                  <MicIcon size={38} color={ink.dark} />
                </button>
                <span style={{ font: `500 13.5px ${font.body}`, color: ink.body }}>
                  Appuyez pour parler
                </span>
              </>
            )}
          </MetalCard>

          <HintBar open={hintOpen} onToggle={() => setHintOpen((v) => !v)} />
        </>
      ) : null}

      {turns.length > 0 ? (
        <MetalCard style={{ gap: 10 }}>
          <SectionLabel>Répliques du client, tour par tour</SectionLabel>
          {turns.map((turn) => (
            <div
              key={turn.turnNumber}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 16,
                padding: '12px 14px',
                borderRadius: 12,
                ...glassSurface,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    font: `600 12.5px ${font.body}`,
                    ...tealButton,
                  }}
                >
                  {turn.turnNumber}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ font: `400 14px/1.45 ${font.body}`, color: ink.body }}>
                    « {turn.guestLine} »
                  </span>
                  <span style={t.metaSmall}>
                    {MOOD_LABEL[turn.mood]}
                    {turn.rejections.length > 0
                      ? ` · ${turn.rejections.length} rejet${turn.rejections.length > 1 ? 's' : ''}`
                      : ''}
                  </span>
                </div>
              </div>
              <span style={{ ...t.metaSmall, flexShrink: 0, textAlign: 'right' }}>
                {turn.intentMs !== null ? `intention ${formatMs(turn.intentMs)} · ` : ''}
                génération {formatMs(turn.generateMs)} · conformité{' '}
                {formatMs(turn.containmentMs)}
                {turn.ttsMs !== null ? ` · TTS ${formatMs(turn.ttsMs)}` : ''}
              </span>
            </div>
          ))}
        </MetalCard>
      ) : null}

      {rejections.length > 0 ? <RejectionLog rejections={rejections} /> : null}

      {scoreOutcome ? (
        <LiveFeedbackPanel
          providerLabel={provider === 'qwen' ? 'Qwen' : 'Gemini'}
          model={scoreModel}
          outcome={scoreOutcome}
          modelMs={scoreModelMs}
        />
      ) : null}

      {turns.length > 0 ? <LatencyPanel title="Latence" rows={latencyRows(turns, scoreModelMs)} /> : null}

      {completedRuns.length > 1 ? <RunComparison runs={completedRuns} /> : null}
    </Screen>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────── */

function ManifestBanner() {
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
        Contenu de substitution. Écrit d’après le périmètre du chapitre 1 du
        Achevia Content Framework, ce n’est pas le manifeste du chapitre
        rédigé. Les répliques du client sont générées à chaque tour, en
        français, puis vérifiées contre le manifeste avant d’être affichées ou
        prononcées.
      </span>
    </div>
  );
}

function ContainmentCounter({ count }: { count: number }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 34,
        padding: '0 14px',
        borderRadius: 17,
        font: `600 14px ${font.body}`,
        ...(count > 0
          ? { ...fieldIncorrect, color: ink.criticalText }
          : { ...confirmSurface, color: ink.teal }),
      }}
    >
      Containment rejections: {count}
    </div>
  );
}

function TurnDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {Array.from({ length: total }, (_, index) => {
        if (index < current) {
          return (
            <span
              key={index}
              style={{ width: 9, height: 9, borderRadius: '50%', background: ink.teal }}
            />
          );
        }
        if (index === current) {
          return (
            <span
              key={index}
              style={{
                width: 11,
                height: 11,
                borderRadius: '50%',
                background: 'linear-gradient(180deg,#F59D4C,#D2701A)',
                boxShadow: '0 0 0 4px rgba(234,132,41,.18)',
              }}
            />
          );
        }
        return (
          <span
            key={index}
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: 'rgba(40,58,53,.16)',
            }}
          />
        );
      })}
    </div>
  );
}

/** Collapsed by default, opened manually. One Communication tip. */
function HintBar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div
      style={{
        width: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '14px 22px',
        borderRadius: 16,
        background: 'rgba(255,255,255,.5)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,1),inset 0 0 0 1px rgba(45,106,106,.2)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <HintIcon size={18} color={ink.teal} />
          <span style={{ font: `600 14px ${font.body}`, color: ink.heading }}>
            {COMMUNICATION_HINT.title}
          </span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            height: 38,
            padding: '0 17px',
            borderRadius: 19,
            font: `600 14.5px ${font.body}`,
            ...tealButton,
          }}
        >
          {open ? 'Fermer le conseil' : 'Ouvrir le conseil'}
          <ChevronDownIcon
            size={13}
            style={open ? { transform: 'rotate(180deg)' } : undefined}
          />
        </button>
      </div>
      {open ? (
        <span style={{ font: `400 13.5px/1.55 ${font.body}`, color: ink.body }}>
          {COMMUNICATION_HINT.body}
        </span>
      ) : null}
    </div>
  );
}

function RejectionLog({ rejections }: { rejections: ContainmentRejection[] }) {
  return (
    <MetalCard style={{ gap: 10 }}>
      <SectionLabel>
        Journal des rejets de conformité ({rejections.length})
      </SectionLabel>
      <span style={t.bodyTextLg}>
        Chaque réplique rejetée est consignée en entier. Un taux de rejet
        élevé est un résultat, pas un défaut à masquer.
      </span>
      {rejections.map((rejection, index) => (
        <div
          key={`${rejection.turnNumber}-${rejection.attempt}-${index}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '12px 14px',
            borderRadius: 12,
            ...fieldIncorrect,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertIcon size={15} color={ink.criticalStroke} />
            <span style={{ font: `600 13.5px ${font.body}`, color: ink.heading }}>
              Tour {rejection.turnNumber} · tentative {rejection.attempt} ·{' '}
              {rejection.caughtBy === 'deterministic'
                ? 'filtre lexical'
                : 'vérificateur du modèle'}
            </span>
          </div>
          <span style={{ font: `400 13.5px/1.5 ${font.body}`, color: ink.criticalText }}>
            {rejection.reason}
            {rejection.matched ? ` — « ${rejection.matched} »` : ''}
          </span>
          <span style={{ font: `400 13.5px/1.5 ${font.body}`, color: ink.body }}>
            « {rejection.line} »
          </span>
        </div>
      ))}
    </MetalCard>
  );
}

function RunComparison({ runs }: { runs: CompletedRun[] }) {
  return (
    <MetalCard style={{ gap: 12 }}>
      <SectionLabel>Comparaison des fournisseurs</SectionLabel>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${runs.length}, minmax(0, 1fr))`,
          gap: 14,
        }}
      >
        {runs.map((run) => {
          const band = run.scoreOutcome?.ok
            ? run.scoreOutcome.result.overall_band
            : run.scoreOutcome
              ? 'JSON invalide'
              : 'échec';
          const generateTotal = run.turns.reduce((sum, turn) => sum + turn.generateMs, 0);
          return (
            <div
              key={run.provider}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '14px 16px',
                borderRadius: 13,
                ...glassSurface,
              }}
            >
              <span style={{ font: `600 15px ${font.display}`, color: ink.heading }}>
                {run.providerLabel}
              </span>
              <Row label="Rejets de conformité" value={String(run.rejections.length)} />
              <Row label="Bande globale" value={band} />
              <Row label="Génération, total" value={formatMs(generateTotal)} />
              <Row label="Notation" value={formatMs(run.scoreModelMs)} />
              <Row label="Échange complet" value={formatMs(run.totalMs)} />
              {run.scoreError ? (
                <span style={{ font: `400 13px/1.45 ${font.body}`, color: ink.criticalText }}>
                  {run.scoreError}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </MetalCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ font: `400 13.5px ${font.body}`, color: ink.muted }}>{label}</span>
      <span style={{ font: `600 13.5px ${font.body}`, color: ink.heading }}>{value}</span>
    </div>
  );
}

function latencyRows(turns: TurnRecord[], scoreModelMs: number): LatencyRow[] {
  const rows: LatencyRow[] = [];
  for (const turn of turns) {
    rows.push({
      label: `Tour ${turn.turnNumber} · génération et conformité`,
      ms: turn.turnRoundTripMs,
      note: `${turn.rejections.length} rejet${turn.rejections.length === 1 ? '' : 's'}`,
    });
    if (turn.ttsMs !== null) {
      rows.push({ label: `Tour ${turn.turnNumber} · TTS français`, ms: turn.ttsMs });
    }
  }
  rows.push({
    label: 'Notation de fin d’échange',
    ms: scoreModelMs > 0 ? scoreModelMs : null,
    emphasis: true,
  });
  return rows;
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
