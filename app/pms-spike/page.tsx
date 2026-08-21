'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ErrorNotice } from '@/components/ErrorNotice';
import { GuestPanel, formatClock } from '@/components/GuestPanel';
import { AlertIcon, CheckIcon, ClockIcon, InfoIcon } from '@/components/Icons';
import { LatencyPanel, type LatencyRow } from '@/components/LatencyPanel';
import { GlassPill, MetalCard, Screen, SectionLabel } from '@/components/Screen';
import {
  confirmSurface,
  fieldActive,
  fieldIdle,
  fieldIncorrect,
  font,
  glassSurface,
  ink,
  orangeButton,
  tealButton,
  type as t,
} from '@/lib/design';
import {
  PMS_FIELDS,
  SCENARIO,
  isFieldCorrect,
  type PmsFieldKey,
} from '@/lib/scenario';
import { useGuestAudio } from '@/lib/useGuestAudio';

const COUNTDOWN_SECONDS = 120;

type Entries = Record<PmsFieldKey, string>;

const EMPTY_ENTRIES: Entries = {
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  room_rate: '',
};

interface Marking {
  correct: Record<PmsFieldKey, boolean>;
  correctCount: number;
  /** Recorded on submit. Never used to grade. */
  timeExpired: boolean;
  secondsUsed: number;
}

export default function PmsSpikePage() {
  const guest = useGuestAudio('pms_information', { autoplay: true });

  const [entries, setEntries] = useState<Entries>(EMPTY_ENTRIES);
  const [focused, setFocused] = useState<PmsFieldKey | null>(null);
  const [marking, setMarking] = useState<Marking | null>(null);
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);

  const startedAtRef = useRef<number>(Date.now());
  const submittedRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => {
      if (submittedRef.current) return;
      setRemaining((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const submit = useCallback(() => {
    submittedRef.current = true;
    const correct = {} as Record<PmsFieldKey, boolean>;
    let correctCount = 0;
    for (const field of PMS_FIELDS) {
      const ok = isFieldCorrect(field.key, entries[field.key]);
      correct[field.key] = ok;
      if (ok) correctCount += 1;
    }
    setMarking({
      correct,
      correctCount,
      // Noted on submit. Correctness is graded independently of it.
      timeExpired: remaining <= 0,
      secondsUsed: Math.round((Date.now() - startedAtRef.current) / 1000),
    });
  }, [entries, remaining]);

  const reset = useCallback(() => {
    submittedRef.current = false;
    setMarking(null);
    setEntries(EMPTY_ENTRIES);
    setRemaining(COUNTDOWN_SECONDS);
    startedAtRef.current = Date.now();
  }, []);

  const rows = useMemo<LatencyRow[]>(
    () => [
      {
        label: 'Deepgram TTS, spoken information script',
        ms: guest.ttsMs,
        note: 'client to /api/tts to Deepgram',
        emphasis: true,
      },
      {
        label: 'Replays requested',
        ms: null,
        value: String(guest.replays),
        note: 'unlimited, costs visible time only',
      },
    ],
    [guest.replays, guest.ttsMs],
  );

  return (
    <Screen
      eyebrow="Practice · Interactive test"
      title="Task 1 · spoken entry"
      headerRight={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={t.meta}>Guest 1 of 1</span>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 34,
              padding: '0 14px',
              borderRadius: 17,
              font: `600 14px ${font.body}`,
              ...tealButton,
            }}
          >
            <ClockIcon size={14} />
            {formatClock(remaining)} left
          </div>
          <GlassPill>Level {SCENARIO.level}</GlassPill>
        </div>
      }
    >
      <GuestPanel
        initials="CF"
        name="Claire Fontaine"
        moodLabel="Spelling her details"
        status={guest.isPlaying ? 'is speaking' : 'has spoken'}
        progress={guest.progress}
        elapsedSeconds={guest.elapsed}
        durationSeconds={guest.duration}
        isPlaying={guest.isPlaying}
        onReplay={guest.replay}
        replayDisabled={guest.status !== 'ready'}
        footer={
          <span style={{ font: `400 14px ${font.body}`, color: ink.onDarkMuted }}>
            Replays {guest.replays} · unlimited
          </span>
        }
      />

      {guest.status === 'error' && guest.error ? (
        <ErrorNotice provider="Deepgram" message={guest.error} />
      ) : null}

      {/* PMS field set — 17b */}
      <MetalCard style={{ padding: '16px 24px', gap: 12 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <SectionLabel>New reservation · guest 1</SectionLabel>
          <span style={{ font: `400 14px ${font.body}`, color: ink.muted }}>
            Fill the empty fields while she speaks
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 14,
          }}
        >
          {PMS_FIELDS.map((field) => {
            const value = entries[field.key];
            const mark = marking?.correct[field.key];
            const style =
              mark === false
                ? fieldIncorrect
                : mark === true
                  ? confirmSurface
                  : focused === field.key
                    ? fieldActive
                    : value !== ''
                      ? { ...fieldIdle, background: 'rgba(255,255,255,.72)' }
                      : fieldIdle;

            return (
              <div
                key={field.key}
                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <span style={t.fieldLabel}>{field.label}</span>
                <div
                  style={{
                    height: 46,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '0 14px',
                    ...style,
                  }}
                >
                  <input
                    value={value}
                    onChange={(event) =>
                      setEntries((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                    onFocus={() => setFocused(field.key)}
                    onBlur={() => setFocused(null)}
                    readOnly={marking !== null}
                    placeholder="Empty"
                    autoComplete="off"
                    spellCheck={false}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      font:
                        value === ''
                          ? `400 14px ${font.body}`
                          : `500 14px ${font.body}`,
                      color: ink.heading,
                    }}
                  />
                  {mark === true ? (
                    <CheckIcon size={16} color={ink.teal} />
                  ) : null}
                  {mark === false ? (
                    <AlertIcon size={16} color={ink.criticalStroke} />
                  ) : null}
                </div>
                {mark === false ? (
                  <span
                    style={{ font: `400 14px ${font.body}`, color: ink.criticalText }}
                  >
                    Incorrect
                  </span>
                ) : null}
                {mark === true ? (
                  <span style={{ font: `400 14px ${font.body}`, color: ink.teal }}>
                    Correct
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '11px 14px',
            borderRadius: 12,
            ...confirmSurface,
          }}
        >
          <CheckIcon size={16} color={ink.teal} />
          <span style={{ font: `400 13.5px/1.4 ${font.body}`, color: ink.body }}>
            Spacing, dots, dashes and parentheses are not marked on the phone
            number, and case is not marked on any field. Wrong data is marked
            wrong.
          </span>
        </div>
      </MetalCard>

      {/* Timer note — the countdown is visible but not wired to scoring */}
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
          The two minute countdown is shown but it is not wired to scoring. If
          it runs out, that is noted on submit and your fields are still marked
          the same way.
        </span>
      </div>

      {marking === null ? (
        <button
          type="button"
          onClick={submit}
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
          Submit the reservation
        </button>
      ) : (
        <MetalCard style={{ gap: 14, padding: '20px 24px', borderRadius: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={t.bigNumber}>{marking.correctCount}</span>
              <span style={t.bigNumberUnit}>/{PMS_FIELDS.length}</span>
            </div>
            <div
              style={{ width: 1, height: 56, background: 'rgba(40,58,53,.12)' }}
            />
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <span style={t.bandName}>Fields correct</span>
              <span style={t.bodyTextLg}>
                Binary per field. No partial credit and no negative marking.
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14 }}>
            <Stat
              label="Time used"
              value={formatClock(marking.secondsUsed)}
              suffix=" of 2:00"
            />
            <Stat
              label="Time expired"
              value={marking.timeExpired ? 'Yes' : 'No'}
              suffix=" · not graded"
            />
            <Stat label="Replays" value={String(guest.replays)} suffix="" />
          </div>

          <button
            type="button"
            onClick={reset}
            style={{
              alignSelf: 'flex-start',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 48,
              padding: '0 24px',
              borderRadius: 24,
              font: `500 14px ${font.body}`,
              color: ink.body,
              ...glassSurface,
            }}
          >
            Clear and enter again
          </button>
        </MetalCard>
      )}

      <LatencyPanel title="Round trip" rows={rows} />
    </Screen>
  );
}

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        padding: '13px 16px',
        borderRadius: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        ...glassSurface,
      }}
    >
      <span style={{ font: `500 13.5px ${font.body}`, color: ink.body }}>
        {label}
      </span>
      <span style={{ font: `600 20px ${font.display}`, color: ink.heading }}>
        {value}
        <span style={{ font: `400 14px ${font.body}`, color: ink.muted }}>
          {suffix}
        </span>
      </span>
    </div>
  );
}
