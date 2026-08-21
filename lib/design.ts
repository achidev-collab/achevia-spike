/**
 * Design tokens transcribed verbatim from
 * `Achevia Metallic Study.dc.html` (Claude Design handoff bundle).
 *
 * Every value below is copied from that file. Nothing here is invented.
 * Source artboards:
 *   16b  Practice · Roleplay — one exchange, guest speaking
 *   17b  Practice · Interactive test — Task 1, spoken entry
 *   16e  Scoring in progress
 *   15e  Technical · listen and enter (incorrect-field treatment)
 *   15f  After the section · feedback, Good band
 *   06b  Onboarding · microphone test (recording state)
 */

import type { CSSProperties } from 'react';

/* ── Ink ─────────────────────────────────────────────────────────────── */
export const ink = {
  heading: '#1B3030',
  body: '#3E4B47',
  muted: '#66706C',
  disabled: '#8A938F',
  dark: '#16302E',
  onDark: '#EAF0EE',
  onDarkPure: '#FFFFFF',
  onDarkMuted: 'rgba(234,240,238,.6)',
  onDarkStrongMuted: 'rgba(234,240,238,.72)',
  teal: '#2D6A6A',
  tealLight: '#7ABFB2',
  orange: '#E67E22',
  orangeDeep: '#EA8429',
  criticalText: '#8E2C23',
  criticalStroke: '#A8352B',
} as const;

/* ── Type ────────────────────────────────────────────────────────────── */
export const font = {
  display: "'Plus Jakarta Sans',sans-serif",
  body: "'Inter',sans-serif",
} as const;

/* ── Surfaces ────────────────────────────────────────────────────────── */
export const pageBackground =
  'linear-gradient(126deg,#FFFFFF 0%,#F2F5F6 22%,#FFFFFF 40%,#E7ECEE 58%,#FBFDFD 74%,#EDF1F3 100%)';

export const pageAmbient =
  'radial-gradient(48% 40% at 78% 0%,rgba(255,255,255,.95),transparent 72%),radial-gradient(40% 44% at 4% 88%,rgba(122,191,178,.14),transparent 76%),radial-gradient(60% 30% at 50% 104%,rgba(40,58,53,.07),transparent 74%)';

export const metalCard: CSSProperties = {
  background:
    'linear-gradient(150deg,#FFFFFF 0%,#E9EEF0 46%,#FDFEFF 68%,#DCE3E7 100%)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,1),inset 0 -2px 3px rgba(60,80,78,.22),inset 0 0 0 1px rgba(255,255,255,.7),0 16px 34px rgba(40,58,53,.16)',
};

/** The heavier metal used for the guest-information strip on 16b. */
export const metalStrip: CSSProperties = {
  background:
    'linear-gradient(150deg,#FFFFFF 0%,#E9EEF0 46%,#FDFEFF 68%,#DCE3E7 100%)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,1),inset 0 -2px 3px rgba(60,80,78,.22),inset 0 0 0 1px rgba(255,255,255,.7),0 12px 26px rgba(40,58,53,.14)',
};

export const glassSurface: CSSProperties = {
  background: 'rgba(255,255,255,.5)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,1),inset 0 0 0 1px rgba(255,255,255,.65)',
};

/** Calm guest panel — 17b / 15e. */
export const deepTealPanel: CSSProperties = {
  background: 'linear-gradient(150deg,#20494A,#153634 52%,#0D2422)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.18),0 22px 44px rgba(19,45,42,.3)',
};

/** Calm guest avatar — 17b / 15e. */
export const tealAvatar: CSSProperties = {
  background: 'linear-gradient(155deg,#5A9E93,#2D6A6A 42%,#16332F)',
  boxShadow: 'inset 0 2px 0 rgba(255,255,255,.35),0 12px 26px rgba(0,0,0,.3)',
};

export const darkTile: CSSProperties = {
  background: 'linear-gradient(155deg,#1E4240,#123028 55%,#0C221D)',
};

/* ── Controls ────────────────────────────────────────────────────────── */
export const orangeButton: CSSProperties = {
  background:
    'linear-gradient(180deg,#F59D4C 0%,#EA8429 44%,#D2701A 78%,#C4670F 100%)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,.6),inset 0 -2px 1px rgba(138,66,10,.4),0 2px 0 #A85B12,0 14px 28px rgba(214,112,26,.34)',
  color: ink.dark,
};

/** Large orange mic disc — 16b. */
export const orangeDisc: CSSProperties = {
  background:
    'linear-gradient(180deg,#F59D4C 0%,#EA8429 44%,#D2701A 78%,#C4670F 100%)',
  boxShadow:
    'inset 0 2px 0 rgba(255,255,255,.6),inset 0 -3px 2px rgba(138,66,10,.4),0 18px 34px rgba(214,112,26,.36)',
};

/** Dark recording disc — 06b. */
export const recordingDisc: CSSProperties = {
  background: 'linear-gradient(150deg,#26433F,#16302E)',
  boxShadow:
    '0 16px 34px rgba(22,48,46,.3),inset 0 1px 0 rgba(255,255,255,.16)',
};

export const tealButton: CSSProperties = {
  background: 'linear-gradient(180deg,#4E8F86,#245855 60%,#183934)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.4)',
  color: '#F7FBFA',
};

/** Inactive segmented chip — 15f / 16e header. */
export const inactiveChip: CSSProperties = {
  background: 'rgba(255,255,255,.42)',
  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.7)',
  color: ink.disabled,
};

/** Replay control on the dark guest panel — 17b. */
export const onDarkChip: CSSProperties = {
  background: 'rgba(255,255,255,.12)',
  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.25)',
  color: ink.onDark,
};

/* ── Fields — 17b ─────────────────────────────────────────────────────── */
export const fieldIdle: CSSProperties = {
  background: 'rgba(255,255,255,.5)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,1),inset 0 0 0 1px rgba(40,58,53,.12)',
};

export const fieldActive: CSSProperties = {
  background: 'rgba(255,255,255,.72)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,1),inset 0 0 0 1.6px rgba(45,106,106,.55)',
};

export const fieldFilled: CSSProperties = {
  background: 'rgba(255,255,255,.72)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,1),inset 0 0 0 1px rgba(40,58,53,.12)',
};

/** Incorrect field — 15e. */
export const fieldIncorrect: CSSProperties = {
  background: 'rgba(168,53,43,.06)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,.9),inset 0 0 0 1.6px rgba(168,53,43,.5)',
};

/** Confirmation surface — 17b info bar / 15f Good band. */
export const confirmSurface: CSSProperties = {
  background: 'rgba(45,106,106,.08)',
  boxShadow: 'inset 0 0 0 1px rgba(45,106,106,.18)',
};

export const confirmSurfaceStrong: CSSProperties = {
  background: 'rgba(45,106,106,.13)',
  boxShadow: 'inset 0 0 0 1.8px rgba(45,106,106,.5)',
};

/** Working / in-progress row — 16e. */
export const workingRow: CSSProperties = {
  background: 'rgba(234,132,41,.07)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,1),inset 0 0 0 1px rgba(234,132,41,.24)',
};

/** Critical band swatch — 15f. */
export const criticalSurface: CSSProperties = {
  background: 'rgba(168,53,43,.07)',
  boxShadow: 'inset 0 0 0 1px rgba(168,53,43,.18)',
};

/** Open / attention chip — 15f. */
export const attentionChip: CSSProperties = {
  background: 'rgba(234,132,41,.14)',
  boxShadow: 'inset 0 0 0 1.4px rgba(234,132,41,.4)',
  color: '#B4600F',
};

/* ── Text presets copied from the file's `font:` shorthands ──────────── */
export const type = {
  eyebrow: {
    font: `800 14px ${font.body}`,
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    color: ink.dark,
  } as CSSProperties,
  screenTitle: { font: `600 19px/1 ${font.display}`, color: ink.heading } as CSSProperties,
  sectionLabel: {
    font: `500 13.5px ${font.body}`,
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    color: ink.muted,
  } as CSSProperties,
  cardHeading: { font: `600 22px ${font.display}`, color: ink.heading } as CSSProperties,
  itemHeading: { font: `600 15px ${font.display}`, color: ink.heading } as CSSProperties,
  bandName: { font: `600 17px ${font.display}`, color: ink.heading } as CSSProperties,
  bodyText: { font: `400 13.5px/1.55 ${font.body}`, color: ink.body } as CSSProperties,
  bodyTextLg: { font: `400 14px/1.45 ${font.body}`, color: ink.body } as CSSProperties,
  fieldLabel: { font: `400 14px ${font.body}`, color: ink.muted } as CSSProperties,
  fieldValue: { font: `500 14px ${font.body}`, color: ink.heading } as CSSProperties,
  fieldEmpty: { font: `400 14px ${font.body}`, color: 'rgba(27,48,48,.32)' } as CSSProperties,
  meta: { font: `500 14px ${font.body}`, color: ink.muted } as CSSProperties,
  metaSmall: { font: `500 12.5px ${font.body}`, color: ink.muted } as CSSProperties,
  scaleNote: { font: `400 11.5px ${font.body}`, color: ink.muted } as CSSProperties,
  bigNumber: {
    font: `700 58px/1 ${font.display}`,
    color: ink.heading,
    letterSpacing: '-.02em',
  } as CSSProperties,
  bigNumberUnit: { font: `600 22px ${font.display}`, color: ink.muted } as CSSProperties,
} as const;

/* ── Layout constants ────────────────────────────────────────────────── */
export const layout = {
  headerHeight: 72,
  headerPadding: '0 30px',
  stagePadding: '24px 30px 26px',
  columnWidth: 1020,
  stageGap: 16,
} as const;

/** Waveform bar heights, in the file's repeating order (16b). */
export const WAVEFORM_HEIGHTS = [34, 62, 96, 48, 74, 55, 88, 40, 66] as const;
