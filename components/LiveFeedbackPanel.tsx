'use client';

import { CheckIcon } from '@/components/Icons';
import { MetalCard, SectionLabel } from '@/components/Screen';
import {
  confirmSurface,
  criticalSurface,
  darkTile,
  deepTealPanel,
  fieldIncorrect,
  font,
  glassSurface,
  ink,
  tealButton,
  type as t,
} from '@/lib/design';
import type { LiveScoreOutcome } from '@/lib/live/types';
import type { Band } from '@/lib/scoring/types';

/**
 * End-of-exchange result, styled from artboard 15f. When the provider failed
 * to return usable JSON the raw output is shown in full instead — that is
 * the finding, not an error to hide.
 */
export function LiveFeedbackPanel({
  providerLabel,
  model,
  outcome,
  modelMs,
}: {
  providerLabel: string;
  model: string;
  outcome: LiveScoreOutcome;
  modelMs: number;
}) {
  if (!outcome.ok) {
    return (
      <MetalCard style={{ gap: 14, padding: '20px 24px', borderRadius: 20 }}>
        <Header providerLabel={providerLabel} model={model} modelMs={modelMs} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '14px 16px',
            borderRadius: 13,
            ...fieldIncorrect,
          }}
        >
          <span style={{ font: `600 14px ${font.body}`, color: ink.heading }}>
            {providerLabel} n’a pas renvoyé de JSON exploitable
          </span>
          <span style={{ font: `400 14px/1.5 ${font.body}`, color: ink.criticalText }}>
            {outcome.parseError}
          </span>
          <span style={{ font: `400 13.5px/1.5 ${font.body}`, color: ink.body }}>
            La sortie brute est affichée telle quelle. Elle n’a été ni réparée
            ni reformatée, pour que le modèle puisse être jugé sur ce qu’il
            produit réellement.
          </span>
        </div>
        <SectionLabel>Sortie brute</SectionLabel>
        <pre
          style={{
            margin: 0,
            maxHeight: 320,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            padding: '14px 16px',
            borderRadius: 13,
            font: `400 12.5px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace`,
            color: ink.body,
            ...glassSurface,
          }}
        >
          {outcome.raw === '' ? '(vide)' : outcome.raw}
        </pre>
      </MetalCard>
    );
  }

  const { result } = outcome;
  const passed = result.emotion_band >= 80;

  return (
    <MetalCard style={{ gap: 16, padding: '20px 24px', borderRadius: 20 }}>
      <Header providerLabel={providerLabel} model={model} modelMs={modelMs} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={t.bigNumber}>{result.emotion_band}</span>
          <span style={t.bigNumberUnit}>/100</span>
        </div>
        <div style={{ width: 1, height: 56, background: 'rgba(40,58,53,.12)' }} />
        <div
          style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BandChip band={result.overall_band} />
            <span style={t.bandName}>Émotion {result.emotion_band}</span>
          </div>
          <span style={t.bodyTextLg}>
            Bande globale sur les cinq critères de Communication. L’Émotion est
            la sous-dimension Interpersonnel, notée séparément.
          </span>
        </div>
        <div
          style={{ width: 210, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
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
            <span style={t.scaleNote}>Seuil de réussite 80</span>
            <span style={t.scaleNote}>100</span>
          </div>
        </div>
      </div>

      <SectionLabel>Les cinq critères</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {result.criteria.map((criterion, index) => (
          <div
            key={`${criterion.name}-${index}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: '12px 14px',
              borderRadius: 12,
              ...(criterion.band === 'Poor' ? criticalSurface : confirmSurface),
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <span style={{ font: `600 14.5px ${font.body}`, color: ink.heading }}>
                {criterion.name}
              </span>
              <BandChip band={criterion.band} small />
            </div>
            <span style={{ font: `400 13.5px/1.5 ${font.body}`, color: ink.body }}>
              « {criterion.cited_moment} »
            </span>
          </div>
        ))}
      </div>

      <Finding index={1} title="Ce qui n’a pas fonctionné" tone="teal">
        <span style={t.bodyText}>{result.what_went_wrong}</span>
      </Finding>

      <Finding index={2} title="Comment progresser" tone="orange">
        <span style={t.bodyText}>{result.how_to_improve}</span>
      </Finding>

      <Finding index={3} title="Ce que vous auriez pu dire" tone="teal">
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
            Réponse modèle
          </span>
          <span style={{ font: `400 14.5px/1.6 ${font.body}`, color: ink.onDarkPure }}>
            « {result.correct_example} »
          </span>
        </div>
      </Finding>
    </MetalCard>
  );
}

function Header({
  providerLabel,
  model,
  modelMs,
}: {
  providerLabel: string;
  model: string;
  modelMs: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <SectionLabel>{providerLabel}</SectionLabel>
      <span style={t.scaleNote}>
        {model} · {(modelMs / 1000).toFixed(2)} s
      </span>
    </div>
  );
}

function BandChip({ band, small }: { band: Band; small?: boolean }) {
  const height = small ? 26 : 30;
  const fontSize = small ? 13 : 14.5;
  if (band === 'Poor') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height,
          padding: '0 13px',
          borderRadius: height / 2,
          font: `600 ${fontSize}px ${font.body}`,
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
        height,
        padding: '0 13px',
        borderRadius: height / 2,
        font: `600 ${fontSize}px ${font.body}`,
        ...tealButton,
      }}
    >
      <CheckIcon size={small ? 11 : 13} />
      {band}
    </span>
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
        style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}
      >
        <span style={t.itemHeading}>{title}</span>
        {children}
      </div>
    </div>
  );
}
