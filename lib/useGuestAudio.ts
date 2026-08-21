'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type ScriptId = 'opening' | 'pms_information';

export interface GuestAudioState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  /** Deepgram round trip measured on the client, in ms. */
  ttsMs: number | null;
  isPlaying: boolean;
  elapsed: number;
  duration: number;
  progress: number;
  replays: number;
}

/**
 * Fetches the guest line from /api/tts (server-side Deepgram call), autoplays
 * it once, and exposes replay. Replay is unlimited and never capped.
 */
export function useGuestAudio(script: ScriptId, { autoplay }: { autoplay: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const startedRef = useRef(false);

  const [state, setState] = useState<GuestAudioState>({
    status: 'idle',
    error: null,
    ttsMs: null,
    isPlaying: false,
    elapsed: 0,
    duration: 0,
    progress: 0,
    replays: 0,
  });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'loading', error: null }));
    const startedAt = performance.now();
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script }),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(
          detail?.error ?? `Deepgram request failed with HTTP ${response.status}.`,
        );
      }

      const blob = await response.blob();
      const ttsMs = performance.now() - startedAt;

      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;

      const audio = new Audio(url);
      audio.preload = 'auto';
      audioRef.current = audio;

      audio.addEventListener('loadedmetadata', () => {
        setState((prev) => ({
          ...prev,
          duration: Number.isFinite(audio.duration) ? audio.duration : 0,
        }));
      });
      audio.addEventListener('timeupdate', () => {
        setState((prev) => ({
          ...prev,
          elapsed: audio.currentTime,
          progress: audio.duration ? audio.currentTime / audio.duration : 0,
        }));
      });
      audio.addEventListener('play', () => {
        setState((prev) => ({ ...prev, isPlaying: true }));
      });
      audio.addEventListener('pause', () => {
        setState((prev) => ({ ...prev, isPlaying: false }));
      });
      audio.addEventListener('ended', () => {
        setState((prev) => ({ ...prev, isPlaying: false, progress: 1 }));
      });

      setState((prev) => ({ ...prev, status: 'ready', ttsMs }));

      if (autoplay) {
        // A browser may refuse autoplay before a gesture. That is not a
        // pipeline failure, so it does not become an error state — Replay
        // starts it.
        void audio.play().catch(() => undefined);
      }
    } catch (cause) {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: (cause as Error).message,
      }));
    }
  }, [autoplay, script]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void load();
    return () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [load]);

  /** Replays the same audio. Costs time only; it never changes a result. */
  const replay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
    setState((prev) => ({ ...prev, replays: prev.replays + 1 }));
  }, []);

  return { ...state, replay, retry: load };
}
