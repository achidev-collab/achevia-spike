'use client';

import { MetalCard, SectionLabel } from '@/components/Screen';
import { font, glassSurface, ink, type as t } from '@/lib/design';

export interface LatencyRow {
  label: string;
  /** Milliseconds, or null when the step has not run. */
  ms: number | null;
  note?: string;
  emphasis?: boolean;
}

/**
 * Round-trip latency, on screen rather than in the console.
 * Row treatment copied from the scoring-progress artboard (16e).
 */
export function LatencyPanel({
  title,
  rows,
}: {
  title: string;
  rows: LatencyRow[];
}) {
  return (
    <MetalCard style={{ gap: 12 }}>
      <SectionLabel>{title}</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row) => (
          <div
            key={row.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 13,
              padding: '12px 14px',
              borderRadius: 13,
              ...glassSurface,
            }}
          >
            <span
              style={{
                flex: 1,
                font: row.emphasis
                  ? `600 14px ${font.body}`
                  : `400 14px ${font.body}`,
                color: row.ms === null ? ink.disabled : ink.heading,
              }}
            >
              {row.label}
            </span>
            {row.note ? <span style={t.metaSmall}>{row.note}</span> : null}
            <span
              style={{
                font: `600 15px ${font.display}`,
                color: row.ms === null ? ink.disabled : ink.heading,
                minWidth: 92,
                textAlign: 'right',
              }}
            >
              {row.ms === null ? 'Not run' : formatMs(row.ms)}
            </span>
          </div>
        ))}
      </div>
    </MetalCard>
  );
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
