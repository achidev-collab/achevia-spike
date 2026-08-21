'use client';

import type { CSSProperties, ReactNode } from 'react';

import {
  glassSurface,
  ink,
  font,
  layout,
  pageAmbient,
  pageBackground,
  type as t,
} from '@/lib/design';

/**
 * The 1440 × 900 web-app canvas from the design file: metal ground, ambient
 * radial wash, 72px glass header, then the stage.
 */
export function Screen({
  eyebrow,
  title,
  headerRight,
  children,
}: {
  eyebrow: string;
  title: string;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        background: pageBackground,
      }}
    >
      <div
        style={{ position: 'absolute', inset: 0, background: pageAmbient, pointerEvents: 'none' }}
      />
      <header
        style={{
          position: 'relative',
          height: layout.headerHeight,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
          padding: layout.headerPadding,
          background: 'rgba(255,255,255,.32)',
          backdropFilter: 'blur(26px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(26px) saturate(1.5)',
          boxShadow: 'inset 0 -1px 0 rgba(255,255,255,.7)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={t.eyebrow}>{eyebrow}</span>
          <span style={t.screenTitle}>{title}</span>
        </div>
        {headerRight}
      </header>
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: layout.stageGap,
          padding: layout.stagePadding,
        }}
      >
        <div
          style={{
            width: layout.columnWidth,
            maxWidth: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** The 38px glass pill used in the header on 16b / 17b. */
export function GlassPill({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 38,
        padding: '0 17px',
        borderRadius: 19,
        font: `500 13.5px ${font.body}`,
        color: ink.body,
        ...glassSurface,
      }}
    >
      {children}
    </div>
  );
}

/** Brushed-metal card. */
export function MetalCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        boxSizing: 'border-box',
        borderRadius: 22,
        padding: '22px 26px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        background:
          'linear-gradient(150deg,#FFFFFF 0%,#E9EEF0 46%,#FDFEFF 68%,#DCE3E7 100%)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,1),inset 0 -2px 3px rgba(60,80,78,.22),inset 0 0 0 1px rgba(255,255,255,.7),0 16px 34px rgba(40,58,53,.16)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <span style={t.sectionLabel}>{children}</span>;
}
