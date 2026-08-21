/**
 * Every path below is copied from `Achevia Metallic Study.dc.html`.
 * Stroke weights and viewBox are the file's own.
 */
import type { CSSProperties } from 'react';

interface IconProps {
  size: number;
  color?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}

function Stroked({
  size,
  color = 'currentColor',
  strokeWidth = 2,
  style,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ width: size, height: size, flexShrink: 0, ...style }}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Stroked strokeWidth={2.6} {...props}>
      <path d="M5 12.6l4.4 4.4L19 7.6" />
    </Stroked>
  );
}

export function ReplayIcon(props: IconProps) {
  return (
    <Stroked {...props}>
      <path d="M4 12a8 8 0 1 1 2.6 5.9" />
      <path d="M4 20v-5h5" />
    </Stroked>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <Stroked strokeWidth={1.9} {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3" />
    </Stroked>
  );
}

/** The filled recording mic from the microphone-test screen (06b). */
export function RecordingMicIcon(props: IconProps) {
  return (
    <Stroked strokeWidth={1.85} {...props}>
      <rect x="7.4" y="1.8" width="9.2" height="14" rx="4.6" />
      <path d="M12 5v7.6M9.8 6.8v4M14.2 6.8v4" />
      <path d="M4.6 12.4a7.4 7.4 0 0 0 14.8 0" />
    </Stroked>
  );
}

export function PauseIcon({ size, color = '#16302E', style }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ width: size, height: size, flexShrink: 0, ...style }}
      fill={color}
      stroke="none"
      aria-hidden="true"
    >
      <rect x="7.4" y="5" width="3.4" height="14" rx="1.2" />
      <rect x="13.2" y="5" width="3.4" height="14" rx="1.2" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Stroked {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.6V12l3 1.8" />
    </Stroked>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Stroked {...props}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.4" />
      <path d="M8.4 10.5V8a3.6 3.6 0 0 1 7.2 0v2.5" />
    </Stroked>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Stroked {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.8v5" />
      <path d="M12 16.1h.01" />
    </Stroked>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Stroked strokeWidth={1.9} {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11v5.4M12 7.8h.01" />
    </Stroked>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Stroked strokeWidth={2.2} {...props}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </Stroked>
  );
}

export function LevelsIcon(props: IconProps) {
  return (
    <Stroked strokeWidth={1.9} {...props}>
      <path d="M3 11v2M6.6 8.4v7.2M10.2 10v4M13.8 5.4v13.2M17.4 8.4v7.2M21 10.6v2.8" />
    </Stroked>
  );
}
