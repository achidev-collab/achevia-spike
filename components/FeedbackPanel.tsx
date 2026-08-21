'use client';

import { CheckIcon } from '@/components/Icons';
import { MetalCard, SectionLabel } from '@/components/Screen';
import {
  confirmSurfaceStrong,
  criticalSurface,
  darkTile,
  deepTealPanel,
  font,
  glassSurface,
  ink,
  tealButton,
  type as t,
} from '@/lib/design';
import type { Band, ScoreResult } from '@/lib/scoring/types';

const BANDS: Band[] = ['Poor', 'Good', 'Best'];

/**
 * The returned JSON, rendered with the result treatment from artboard 15f:
 * headline figure, band chip, pass-line meter, then numbered findings.
 */
export function FeedbackPanel({
  providerLabel,
  model,
  result,
}: {
  providerLabel: string;
  model: string;
  result: ScoreResult;
}) {
  const passed = result.emotion_band >= 80;

  return (
    <MetalCard style={{ gap: 16, padding: '20px 24px', borderRadius: 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <SectionLabel>{providerLabel}</SectionLabel>
        <span style={t.scaleNote}>{model}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={t.bigNumber}>{result.emotion_band}</span>
          <span style={t.bigNumberUnit}>/100</span>
        </div>
        <div style={{ width: 1, height: 56, background: 'rgba(40,58,53,.12)' }} />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BandChip band={result.band} />
            <span style={t.bandName}>Emotion {result.emotion_band}</span>
          </div>
          <span style={t.bodyTextLg}>
            Communication band across the five criteria. Emotion is the
            Interpersonal sub-dimension, scored separately.
          </span>
        </div>
        <div
          style={{
            width: 210,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div
            style={{
              height: 8,
              borderRadius: 4,
              position: 'relative',
              background: 'rgba(40,58,53,.11)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${result.emotion_band}%`,
                borderRadius: 4,
                background: passed
                  ? 'linear-gradient(90deg,#2D6A6A,#4E8F86)'
                  : 'linear-gradient(90deg,#A8352B,#C4512F)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: '80%',
                top: -4,
                bottom: -4,
                width: 2,
                background: ink.heading,
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={t.scaleNote}>Pass line 80</span>
            <span style={t.scaleNote}>100</span>
          </div>
        </div>
      </div>

      <Finding index={1} title="Cited moment" tone="teal">
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 13,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            ...deepTealPanel,
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,.18),0 12px 26px rgba(19,45,42,.24)',
          }}
        >
          <span
            style={{
              font: `600 12px ${font.body}`,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: ink.tealLight,
            }}
          >
            From what you said
          </span>
          <span
            style={{
              font: `400 14.5px/1.6 ${font.body}`,
              color: ink.onDarkPure,
            }}
          >
            {result.cited_moment}
          </span>
        </div>
      </Finding>

      <Finding index={2} title="What went wrong" tone="teal">
        <span style={{ ...t.bodyText, textWrap: 'pretty' } as React.CSSProperties}>
          {result.what_went_wrong}
        </span>
      </Finding>

      <Finding index={3} title="How to improve" tone="orange">
        <span style={{ ...t.bodyText, textWrap: 'pretty' } as React.CSSProperties}>
          {result.how_to_improve}
        </span>
      </Finding>

      <BandScale band={result.band} />
    </MetalCard>
  );
}

function Finding({
  index,
  title,
  tone,
  children,
}: {
  index: number;
  title: string;
  tone: 'teal' | 'orange';
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          font: `600 14.5px ${font.body}`,
          ...(tone === 'teal'
            ? { ...darkTile, color: '#F7FBFA' }
            : {
                background: 'linear-gradient(180deg,#F59D4C,#D2701A)',
                color: ink.dark,
              }),
        }}
      >
        {index}
      </span>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
        }}
      >
        <span style={t.itemHeading}>{title}</span>
        {children}
      </div>
    </div>
  );
}

function BandChip({ band }: { band: Band }) {
  if (band === 'Poor') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: 30,
          padding: '0 13px',
          borderRadius: 15,
          font: `600 14.5px ${font.body}`,
          color: ink.criticalText,
          ...criticalSurface,
        }}
      >
        Poor
      </span>
    );
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        height: 30,
        padding: '0 13px',
        borderRadius: 15,
        font: `600 14.5px ${font.body}`,
        ...tealButton,
      }}
    >
      <CheckIcon size={13} />
      {band}
    </span>
  );
}

function BandScale({ band }: { band: Band }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SectionLabel>Where this band sits</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {BANDS.map((entry) => {
          const isCurrent = entry === band;
          if (isCurrent && entry === 'Poor') {
            return (
              <div key={entry} style={{ ...rowStyle, ...criticalSurface }}>
                <span
                  style={{ font: `600 14.5px ${font.body}`, color: ink.criticalText }}
                >
                  Poor · you are here
                </span>
                <span style={{ font: `400 14px ${font.body}`, color: ink.muted }}>
                  Intent not detected
                </span>
              </div>
            );
          }
          if (isCurrent) {
            return (
              <div key={entry} style={{ ...rowStyle, ...confirmSurfaceStrong }}>
                <span style={{ font: `600 14.5px ${font.body}`, color: ink.heading }}>
                  {entry} · you are here
                </span>
                <span style={{ font: `500 14px ${font.body}`, color: ink.teal }}>
                  {DESCRIPTION[entry]}
                </span>
              </div>
            );
          }
          return (
            <div key={entry} style={{ ...rowStyle, ...glassSurface }}>
              <span style={{ font: `500 13.5px ${font.body}`, color: ink.body }}>
                {entry}
              </span>
              <span style={{ font: `400 14px ${font.body}`, color: ink.muted }}>
                {DESCRIPTION[entry]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DESCRIPTION: Record<Band, string> = {
  Poor: 'Intent not detected',
  Good: 'Intent detected',
  Best: 'Intent detected, richer phrasing',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  padding: '11px 13px',
  borderRadius: 11,
};
