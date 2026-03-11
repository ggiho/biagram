/**
 * Orthogonal edge routing with candidate-lane search.
 *
 * The previous router only tried a handful of global bypass paths, which made
 * routes brittle after drag/focus transitions. This version searches a richer
 * set of horizontal / vertical lanes derived from obstacle boundaries while
 * preserving the existing renderer contract.
 */

interface Point {
  x: number;
  y: number;
}

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PADDING = 25;
const GAP = 40;
const BEND_PENALTY = 30;
const EPSILON = 0.5;

function segmentIntersectsRect(
  x1: number, y1: number,
  x2: number, y2: number,
  rect: Rectangle,
  padding: number
): boolean {
  const left = rect.x - padding;
  const right = rect.x + rect.width + padding;
  const top = rect.y - padding;
  const bottom = rect.y + rect.height + padding;

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  if (maxX < left || minX > right || maxY < top || minY > bottom) {
    return false;
  }

  if (Math.abs(y1 - y2) < EPSILON) {
    const y = (y1 + y2) / 2;
    return y >= top && y <= bottom && maxX >= left && minX <= right;
  }

  if (Math.abs(x1 - x2) < EPSILON) {
    const x = (x1 + x2) / 2;
    return x >= left && x <= right && maxY >= top && minY <= bottom;
  }

  return false;
}

function pathCollides(points: Point[], obstacles: Rectangle[], padding: number): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (!p1 || !p2) continue;

    for (const rect of obstacles) {
      if (segmentIntersectsRect(p1.x, p1.y, p2.x, p2.y, rect, padding)) {
        return true;
      }
    }
  }

  return false;
}

function uniqueSorted(values: number[]): number[] {
  return Array.from(new Set(values.map((value) => Math.round(value)))).sort((a, b) => a - b);
}

function areSamePoint(a: Point | undefined, b: Point | undefined): boolean {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
}

function isCollinear(a: Point | undefined, b: Point | undefined, c: Point | undefined): boolean {
  if (!a || !b || !c) return false;
  return (
    (Math.abs(a.x - b.x) < EPSILON && Math.abs(b.x - c.x) < EPSILON) ||
    (Math.abs(a.y - b.y) < EPSILON && Math.abs(b.y - c.y) < EPSILON)
  );
}

function normalizePath(points: Point[]): Point[] {
  const deduped: Point[] = [];

  for (const point of points) {
    const prev = deduped[deduped.length - 1];
    if (!areSamePoint(prev, point)) {
      deduped.push(point);
    }
  }

  const normalized: Point[] = [];

  for (const point of deduped) {
    while (normalized.length >= 2 && isCollinear(normalized[normalized.length - 2], normalized[normalized.length - 1], point)) {
      normalized.pop();
    }
    normalized.push(point);
  }

  return normalized;
}

function calculatePathScore(points: Point[]): number {
  let length = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (!p1 || !p2) continue;
    length += Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);
  }

  const bends = Math.max(0, points.length - 2);
  return length + bends * BEND_PENALTY;
}

function toControlPoints(points: Point[]): Point[] {
  const normalized = normalizePath(points);
  return normalized.slice(1, -1);
}

export function calculateOrthogonalRoute(
  start: Point,
  end: Point,
  startSide: 'left' | 'right',
  endSide: 'left' | 'right',
  allObstacles: Rectangle[],
  fromRect: Rectangle,
  toRect: Rectangle
): Point[] {
  const obstacles = allObstacles.filter((obs) => {
    const isFrom = Math.abs(obs.x - fromRect.x) < EPSILON && Math.abs(obs.y - fromRect.y) < EPSILON;
    const isTo = Math.abs(obs.x - toRect.x) < EPSILON && Math.abs(obs.y - toRect.y) < EPSILON;
    return !isFrom && !isTo;
  });

  const startGap = startSide === 'right' ? GAP : -GAP;
  const endGap = endSide === 'left' ? -GAP : GAP;
  const startStub = { x: start.x + startGap, y: start.y };
  const endStub = { x: end.x + endGap, y: end.y };

  const candidateXs = uniqueSorted([
    startStub.x,
    endStub.x,
    (startStub.x + endStub.x) / 2,
    ...obstacles.flatMap((obs) => [
      obs.x - PADDING - GAP,
      obs.x + obs.width + PADDING + GAP,
      obs.x - PADDING - GAP * 2,
      obs.x + obs.width + PADDING + GAP * 2,
    ]),
  ]);

  const candidateYs = uniqueSorted([
    startStub.y,
    endStub.y,
    (startStub.y + endStub.y) / 2,
    ...obstacles.flatMap((obs) => [
      obs.y - PADDING - GAP,
      obs.y + obs.height + PADDING + GAP,
      obs.y - PADDING - GAP * 2,
      obs.y + obs.height + PADDING + GAP * 2,
    ]),
  ]);

  const candidatePaths: Point[][] = [];

  const pushPath = (points: Point[]): void => {
    candidatePaths.push(normalizePath(points));
  };

  // Direct stub-to-stub corridor.
  pushPath([start, startStub, { x: endStub.x, y: startStub.y }, endStub, end]);

  // Horizontal-lane routes (best for left/right ports).
  for (const routeY of candidateYs) {
    pushPath([
      start,
      startStub,
      { x: startStub.x, y: routeY },
      { x: endStub.x, y: routeY },
      endStub,
      end,
    ]);
  }

  // Vertical-lane routes (best when obstacles force a wide detour).
  for (const routeX of candidateXs) {
    pushPath([
      start,
      startStub,
      { x: routeX, y: startStub.y },
      { x: routeX, y: endStub.y },
      endStub,
      end,
    ]);
  }

  // Mixed routes for harder obstacle fields.
  for (const routeX of candidateXs) {
    for (const routeY of candidateYs) {
      pushPath([
        start,
        startStub,
        { x: routeX, y: startStub.y },
        { x: routeX, y: routeY },
        { x: endStub.x, y: routeY },
        endStub,
        end,
      ]);
    }
  }

  let bestPath: Point[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidatePaths) {
    if (pathCollides(candidate, obstacles, PADDING)) {
      continue;
    }

    const score = calculatePathScore(candidate);
    if (score < bestScore) {
      bestPath = candidate;
      bestScore = score;
    }
  }

  if (bestPath) {
    return toControlPoints(bestPath);
  }

  return toControlPoints([start, startStub, { x: endStub.x, y: startStub.y }, endStub, end]);
}
