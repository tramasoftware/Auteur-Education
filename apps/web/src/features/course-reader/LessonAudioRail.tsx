"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, courses } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import type { LessonAudioPlayback, LessonAudioStatus } from "@/types/generator";

const SPEEDS = [1, 1.25, 1.5];
const SKIP_MS = 15_000;

type LessonRef = {
  courseId: string;
  moduleId: string;
  lessonId: string;
};

type AudioRailProps = {
  title: string;
  lesson?: LessonRef;
};

type RailState = "idle" | "preparing" | "ready" | "failed";

export function AudioRail({ title, lesson }: AudioRailProps) {
  const [open, setOpen] = useState(false);
  const enabled = Boolean(lesson);
  return (
    <div className="ae-audio-slot">
      <section
        className="ae-audio-reader"
        data-expanded={open ? "true" : "false"}
        data-state={enabled ? "ready" : "idle"}
        aria-label="Lesson audio"
      >
        <button
          className="ae-audio-disclosure"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="ae-audio-art" aria-hidden="true">
            <svg className="ae-audio-folder" viewBox="0 0 64 56" fill="none">
              <path
                d="M3 18c3.3 0 5-2.3 5-5.6V11c0-1.66 1.34-3 3-3h14c1.66 0 3 1.34 3 3v1.4c0 3.3 2.3 5.6 5.6 5.6H57c2.21 0 4 1.79 4 4v23c0 2.21-1.79 4-4 4H7c-2.21 0-4-1.79-4-4V22c0-2.21 1.79-4 4-4Z"
                fill="#24314f"
              />
              <path
                d="M7 21h50c2.21 0 4 1.79 4 4v21c0 2.21-1.79 4-4 4H7c-2.21 0-4-1.79-4-4V25c0-2.21 1.79-4 4-4Z"
                fill="#192341"
              />
            </svg>
          </span>
          <span className="ae-audio-copy">
            <span className="ae-audio-eyebrow">Listen</span>
            <span className="ae-audio-title">{title}</span>
          </span>
          <span className="ae-audio-signal" aria-hidden="true" />
        </button>
        <div className="ae-audio-panel">
          <div className="ae-audio-panel-clip">
            <div className="ae-audio-detail">
              {lesson ? (
                <LessonPlayer lesson={lesson} />
              ) : (
                <>
                  <IdleControls />
                  <p className="ae-audio-note">Audio is not available yet.</p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function IdleControls() {
  return (
    <div className="ae-audio-controls">
      <SkipButton label="Back 15 seconds" backward disabled />
      <PlayButton label="Listen" playing={false} disabled />
      <SkipButton label="Forward 15 seconds" backward={false} disabled />
    </div>
  );
}

function LessonPlayer({ lesson }: { lesson: LessonRef }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [rail, setRail] = useState<RailState>("idle");
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<LessonAudioStatus | null>(null);
  const [playback, setPlayback] = useState<LessonAudioPlayback | null>(null);
  const [position, setPosition] = useState(0);
  const [rate, setRate] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const chunkIndex = useRef(0);
  const persistAt = useRef(0);

  const loadPlayback = useCallback(async () => {
    const body = await courses.getLessonAudioPlayback(
      lesson.courseId,
      lesson.moduleId,
      lesson.lessonId,
    );
    setPlayback(body);
    setPosition(body.position_ms);
    setRate(body.playback_rate);
    setRail("ready");
    setMessage(null);
    applyPosition(audioRef.current, body, body.position_ms, chunkIndex);
  }, [lesson.courseId, lesson.moduleId, lesson.lessonId]);

  const applyStatus = useCallback(
    async (body: LessonAudioStatus) => {
      setStatus(body);
      if (body.status === "ready") {
        await loadPlayback();
        return;
      }
      if (body.status === "failed") {
        setRail("failed");
        setPlaying(false);
        setMessage(body.error_message || "Lesson audio could not be prepared.");
        return;
      }
      setRail("preparing");
      setMessage("Preparing audio…");
    },
    [loadPlayback],
  );

  const request = useCallback(async () => {
    setRail("preparing");
    setMessage("Preparing audio…");
    try {
      const body = await courses.requestLessonAudio(
        lesson.courseId,
        lesson.moduleId,
        lesson.lessonId,
      );
      await applyStatus(body);
    } catch (error) {
      setRail("failed");
      setPlaying(false);
      setMessage(audioError(error));
    }
  }, [applyStatus, lesson.courseId, lesson.moduleId, lesson.lessonId]);

  usePolling(
    async () => {
      try {
        const body = await courses.getLessonAudio(
          lesson.courseId,
          lesson.moduleId,
          lesson.lessonId,
        );
        await applyStatus(body);
      } catch (error) {
        setRail("failed");
        setMessage(audioError(error));
      }
    },
    rail === "preparing",
    2000,
  );

  useEffect(() => {
    const node = audioRef.current;
    if (!node || !playback) {
      return;
    }
    node.playbackRate = rate;
  }, [playback, rate]);

  const persist = useCallback(
    (nextPosition: number, nextRate: number) => {
      const now = Date.now();
      if (now - persistAt.current < 2000) {
        return;
      }
      persistAt.current = now;
      void courses.saveLessonAudioProgress(
        lesson.courseId,
        lesson.moduleId,
        lesson.lessonId,
        { position_ms: Math.max(0, Math.round(nextPosition)), playback_rate: nextRate },
      );
    },
    [lesson.courseId, lesson.moduleId, lesson.lessonId],
  );

  const seek = (next: number) => {
    if (!playback || !audioRef.current) {
      return;
    }
    const clamped = Math.max(0, Math.min(playback.duration_ms, next));
    setPosition(clamped);
    applyPosition(audioRef.current, playback, clamped, chunkIndex);
    persist(clamped, rate);
  };

  const toggle = async () => {
    if (rail === "idle" || (rail === "failed" && !playback)) {
      await request();
      return;
    }
    if (rail === "preparing") {
      return;
    }
    const node = audioRef.current;
    if (!node || !playback) {
      await request();
      return;
    }
    if (playing) {
      node.pause();
      setPlaying(false);
      persist(position, rate);
      return;
    }
    try {
      await node.play();
      setPlaying(true);
    } catch {
      setMessage("Could not start playback.");
    }
  };

  const retry = async () => {
    setRail("preparing");
    setMessage("Preparing audio…");
    try {
      const body = await courses.retryLessonAudio(
        lesson.courseId,
        lesson.moduleId,
        lesson.lessonId,
      );
      await applyStatus(body);
    } catch (error) {
      setRail("failed");
      setMessage(audioError(error));
    }
  };

  const onTime = () => {
    const node = audioRef.current;
    if (!node || !playback) {
      return;
    }
    const absolute = absolutePosition(playback, chunkIndex.current, node.currentTime);
    setPosition(absolute);
    persist(absolute, rate);
  };

  const onEnded = () => {
    if (!playback || !audioRef.current) {
      return;
    }
    const next = chunkIndex.current + 1;
    if (next >= playback.chunks.length) {
      setPlaying(false);
      setPosition(playback.duration_ms);
      persist(playback.duration_ms, rate);
      return;
    }
    chunkIndex.current = next;
    audioRef.current.src = playback.chunks[next].url;
    audioRef.current.playbackRate = rate;
    void audioRef.current.play();
  };

  const note =
    message ??
    (rail === "preparing"
      ? "Preparing audio…"
      : rail === "idle"
        ? "Press play to listen to this lesson."
        : null);

  return (
    <>
      <audio
        ref={audioRef}
        preload="none"
        onTimeUpdate={onTime}
        onEnded={onEnded}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <div className="ae-audio-controls">
        <SkipButton
          label="Back 15 seconds"
          backward
          disabled={rail !== "ready"}
          onClick={() => seek(position - SKIP_MS)}
        />
        <PlayButton
          label={playing ? "Pause" : "Listen"}
          playing={playing}
          disabled={rail === "preparing"}
          onClick={() => void toggle()}
        />
        <SkipButton
          label="Forward 15 seconds"
          backward={false}
          disabled={rail !== "ready"}
          onClick={() => seek(position + SKIP_MS)}
        />
      </div>
      {playback ? (
        <div className="ae-audio-meter-row">
          <span className="ae-audio-time">{formatMs(position)}</span>
          <input
            className="ae-audio-meter"
            type="range"
            min={0}
            max={Math.max(playback.duration_ms, 1)}
            value={Math.min(position, playback.duration_ms)}
            aria-label="Lesson position"
            onChange={(event) => seek(Number(event.target.value))}
          />
          <span className="ae-audio-time">{formatMs(playback.duration_ms)}</span>
        </div>
      ) : null}
      {playback ? (
        <div className="ae-audio-speeds" role="group" aria-label="Playback speed">
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              className="ae-audio-speed"
              data-active={value === rate ? "true" : "false"}
              onClick={() => {
                setRate(value);
                if (audioRef.current) {
                  audioRef.current.playbackRate = value;
                }
                persist(position, value);
              }}
            >
              {value}×
            </button>
          ))}
        </div>
      ) : null}
      {note ? <p className="ae-audio-note">{note}</p> : null}
      {rail === "failed" ? (
        <button className="ae-audio-retry" type="button" onClick={() => void retry()}>
          Try again
        </button>
      ) : null}
      {status?.status === "generating" || status?.status === "queued" ? (
        <p className="ae-audio-note">You can keep reading while audio is prepared.</p>
      ) : null}
    </>
  );
}

function PlayButton({
  label,
  playing,
  disabled,
  onClick,
}: {
  label: string;
  playing: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className="ae-audio-toggle"
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        {playing ? (
          <path d="M6 4h3v12H6V4Zm5 0h3v12h-3V4Z" fill="currentColor" />
        ) : (
          <path d="M6 3.5 16 10 6 16.5Z" fill="currentColor" />
        )}
      </svg>
    </button>
  );
}

function SkipButton({
  label,
  backward,
  disabled,
  onClick,
}: {
  label: string;
  backward: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className="ae-audio-step"
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {backward ? (
          <path
            d="M6 5v14M18 5l-9 7 9 7Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M18 5v14M6 5l9 7-9 7Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </button>
  );
}

function applyPosition(
  node: HTMLAudioElement | null,
  playback: LessonAudioPlayback,
  positionMs: number,
  chunkIndex: { current: number },
) {
  if (!node || playback.chunks.length === 0) {
    return;
  }
  let remaining = positionMs;
  for (let index = 0; index < playback.chunks.length; index += 1) {
    const chunk = playback.chunks[index];
    if (remaining <= chunk.duration_ms || index === playback.chunks.length - 1) {
      chunkIndex.current = index;
      if (node.src !== chunk.url) {
        node.src = chunk.url;
      }
      node.currentTime = Math.max(0, remaining / 1000);
      return;
    }
    remaining -= chunk.duration_ms;
  }
}

function absolutePosition(
  playback: LessonAudioPlayback,
  index: number,
  currentTime: number,
): number {
  const before = playback.chunks
    .slice(0, index)
    .reduce((sum, chunk) => sum + chunk.duration_ms, 0);
  return before + currentTime * 1000;
}

function formatMs(value: number): string {
  const seconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function audioError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Lesson audio is not available right now.";
}
