export type PointerPhase = "down" | "move" | "up";

export type PointerSample = { t: number; x: number; y: number; phase: PointerPhase };

export type ViewportRect = { x: number; y: number; width: number; height: number };

export function buildSwipeSequence(
  rect: ViewportRect,
  direction: "up" | "down" | "left" | "right",
  durationMs = 220,
): PointerSample[] {
  const cx = rect.x + rect.width * 0.5;
  const cy = rect.y + rect.height * 0.5;
  const reach = Math.min(rect.width, rect.height) * 0.34;
  const vector = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  }[direction];
  const steps = 6;
  const points: PointerSample[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const p = i / steps;
    const x = clamp(cx + vector.x * reach * p, rect.x + 1, rect.x + rect.width - 1);
    const y = clamp(cy + vector.y * reach * p, rect.y + 1, rect.y + rect.height - 1);
    points.push({
      t: Math.round(durationMs * p),
      x,
      y,
      phase: i === 0 ? "down" : i === steps ? "up" : "move",
    });
  }
  return points;
}

export function swipeScrollDelta(rect: ViewportRect, direction: "up" | "down" | "left" | "right"): { x: number; y: number } {
  const seq = buildSwipeSequence(rect, direction);
  const last = seq[seq.length - 1];
  const first = seq[0];
  return { x: -(last.x - first.x), y: -(last.y - first.y) };
}

export function feedPageDelta(height: number, direction: "next" | "prev"): number {
  const page = Math.max(1, height);
  return direction === "next" ? page : -page;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type NormPoint = { x: number; y: number };

export function denormalize(point: NormPoint, rect: Pick<ViewportRect, "width" | "height">): { x: number; y: number } {
  const x = clamp(point.x, 0, 1) * rect.width;
  const y = clamp(point.y, 0, 1) * rect.height;
  return { x, y };
}
