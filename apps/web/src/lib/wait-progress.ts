/** Decorative wait bar — not server-reported generation percent. */

const CAP = 95;
const EASE_K = 3.2;
/** Visible pauses. Each one is this fraction of approachMs. */
const HOLD_PERCENTS = [50, 60, 70, 80, 90] as const;
const HOLD_SHARE = 0.07;

const EASE_DENOM = 1 - Math.exp(-EASE_K);

type MoveSegment = {
  kind: "move";
  fromT: number;
  toT: number;
  fromM: number;
  toM: number;
};

type HoldSegment = {
  kind: "hold";
  fromT: number;
  toT: number;
  percent: number;
};

type Segment = MoveSegment | HoldSegment;

function easePercent(motion: number): number {
  const u = Math.min(1, Math.max(0, motion));
  return (CAP * (1 - Math.exp(-EASE_K * u))) / EASE_DENOM;
}

function motionAt(percent: number): number {
  const y = Math.min(CAP - 1e-4, Math.max(0, percent)) / CAP;
  return -Math.log(1 - y * EASE_DENOM) / EASE_K;
}

function buildTimeline(): readonly Segment[] {
  const motionShare = 1 - HOLD_PERCENTS.length * HOLD_SHARE;
  const marks = [0, ...HOLD_PERCENTS.map((percent) => motionAt(percent)), 1];
  const labels = [0, ...HOLD_PERCENTS, CAP];
  const segments: Segment[] = [];
  let cursor = 0;
  for (let i = 0; i < marks.length - 1; i += 1) {
    const fromM = marks[i];
    const toM = marks[i + 1];
    const span = (toM - fromM) * motionShare;
    segments.push({
      kind: "move",
      fromT: cursor,
      toT: cursor + span,
      fromM,
      toM,
    });
    cursor += span;
    const landed = labels[i + 1];
    if (landed < CAP) {
      segments.push({
        kind: "hold",
        fromT: cursor,
        toT: cursor + HOLD_SHARE,
        percent: landed,
      });
      cursor += HOLD_SHARE;
    }
  }
  const last = segments[segments.length - 1];
  if (last) {
    last.toT = 1;
  }
  return segments;
}

const TIMELINE = buildTimeline();

function approachPercent(elapsedMs: number, approachMs: number): number {
  const u = Math.min(1, Math.max(0, elapsedMs / approachMs));
  for (let i = 0; i < TIMELINE.length; i += 1) {
    const segment = TIMELINE[i];
    const last = i === TIMELINE.length - 1;
    if (!last && u > segment.toT) {
      continue;
    }
    if (segment.kind === "hold") {
      return segment.percent;
    }
    const span = segment.toT - segment.fromT;
    const local = span <= 0 ? 1 : Math.min(1, Math.max(0, (u - segment.fromT) / span));
    return Math.round(
      easePercent(segment.fromM + (segment.toM - segment.fromM) * local),
    );
  }
  return CAP;
}

/** Percent for full-screen generation waits until the request finishes. */
export function waitProgressPercent(
  elapsedMs: number,
  { approachMs, crawlMs = 14_000 }: { approachMs: number; crawlMs?: number },
): number {
  if (elapsedMs < approachMs) {
    return approachPercent(elapsedMs, approachMs);
  }
  const crawl = Math.min(3, ((elapsedMs - approachMs) / crawlMs) * 3);
  return Math.min(98, Math.round(95 + crawl));
}
