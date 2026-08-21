'use client';

import { AlertIcon } from '@/components/Icons';
import { fieldIncorrect, font, ink } from '@/lib/design';

/**
 * Critical state, styled from the incorrect-field treatment on 15e.
 * Used when a provider key is missing or a free tier is exhausted. There is
 * no fallback score behind this message.
 */
export function ErrorNotice({
  provider,
  message,
}: {
  provider?: string | null;
  message: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 16px',
        borderRadius: 13,
        ...fieldIncorrect,
      }}
    >
      <AlertIcon size={17} color={ink.criticalStroke} style={{ marginTop: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {provider ? (
          <span style={{ font: `600 14px ${font.body}`, color: ink.heading }}>
            {provider}
          </span>
        ) : null}
        <span
          style={{
            font: `400 14px/1.5 ${font.body}`,
            color: ink.criticalText,
          }}
        >
          {message}
        </span>
      </div>
    </div>
  );
}
