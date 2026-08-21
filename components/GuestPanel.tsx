'use client';

import type { ReactNode } from 'react';

import { PauseIcon, ReplayIcon } from '@/components/Icons';
import {
  WAVEFORM_HEIGHTS,
  deepTealPanel,
  font,
  ink,
  onDarkChip,
  tealAvatar,
} from '@/lib/design';

/**
 * The calm guest panel from artboards 17b and 15e: deep teal metal, teal
 * avatar, waveform, elapsed time and a replay control.
 */
export function GuestPanel({
  initials,
  name,
  moodLabel,
  status,
  progress,
  elapsedSeconds,
  durationSeconds,
  isPlaying,
  onReplay,
  replayDisabled,
  footer,
}: {
  initials: string;
  name: string;
  moodLabel: string;
  status?: string;
  /** 0 to 1. */
  progress: number;
  elapsedSeconds: number;
  durationSeconds: number;
  isPlaying: boolean;
  onReplay: () => void;
  replayDisabled?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div
      style={{
        width: '100%',
        boxSizing: 'border-box',
        borderRadius: 22,
        padding: '24px 26px',
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        minHeight: 167,
        ...deepTealPanel,
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...tealAvatar,
        }}
      >
        <span style={{ font: `600 30px ${font.display}`, color: ink.onDark }}>
          {initials}
        </span>
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ font: `600 17px ${font.display}`, color: ink.onDarkPure }}>
            {name}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 26,
              padding: '0 11px',
              borderRadius: 13,
              font: `600 12px ${font.body}`,
              color: ink.dark,
              background: ink.tealLight,
            }}
          >
            {moodLabel}
          </span>
          {status ? (
            <span style={{ font: `400 14px ${font.body}`, color: ink.onDarkMuted }}>
              {status}
            </span>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#FFFFFF',
              boxShadow: '0 10px 22px rgba(0,0,0,.32)',
              opacity: isPlaying ? 1 : 0.55,
            }}
          >
            <PauseIcon size={20} />
          </div>

          <Waveform progress={progress} />

          <span
            style={{
              font: `500 14px ${font.body}`,
              color: ink.onDarkStrongMuted,
              flexShrink: 0,
            }}
          >
            {formatClock(elapsedSeconds)} / {formatClock(durationSeconds)}
          </span>

          <button
            type="button"
            onClick={onReplay}
            disabled={replayDisabled}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 42,
              padding: '0 18px',
              borderRadius: 21,
              flexShrink: 0,
              font: `600 14.5px ${font.body}`,
              opacity: replayDisabled ? 0.5 : 1,
              ...onDarkChip,
            }}
          >
            <ReplayIcon size={15} />
            Replay
          </button>
        </div>

        {footer}
      </div>
    </div>
  );
}

const BAR_COUNT = 72;

function Waveform({ progress }: { progress: number }) {
  const played = Math.round(BAR_COUNT * clamp01(progress));
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        height: 44,
        display: 'flex',
        alignItems: 'flex-end',
        gap: 3,
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <span
          key={index}
          style={{
            width: 3,
            height: `${WAVEFORM_HEIGHTS[index % WAVEFORM_HEIGHTS.length]}%`,
            borderRadius: 2,
            flexShrink: 0,
            background:
              index < played
                ? 'rgba(122,191,178,.85)'
                : 'rgba(122,191,178,.26)',
          }}
        />
      ))}
    </div>
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function formatClock(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
