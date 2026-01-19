/**
 * Orthogonal Edge Routing with Obstacle Avoidance
 * 테이블(장애물)을 피해가는 직교 경로를 찾습니다.
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

const PADDING = 25; // 장애물과의 최소 거리
const GAP = 40; // 경로 꺾임 거리

/**
 * 선분이 사각형과 교차하는지 확인
 * 패딩을 포함한 확장된 사각형 영역 사용
 */
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

  // 선분의 bounding box가 사각형과 전혀 겹치지 않으면 교차 없음
  if (maxX < left || minX > right || maxY < top || minY > bottom) {
    return false;
  }

  // 수평선 (y1 ≈ y2)
  if (Math.abs(y1 - y2) < 1) {
    const y = (y1 + y2) / 2;
    // Y가 사각형 Y 범위 안에 있으면 충돌
    return y >= top && y <= bottom && maxX >= left && minX <= right;
  }

  // 수직선 (x1 ≈ x2)
  if (Math.abs(x1 - x2) < 1) {
    const x = (x1 + x2) / 2;
    // X가 사각형 X 범위 안에 있으면 충돌
    return x >= left && x <= right && maxY >= top && minY <= bottom;
  }

  // 대각선 (orthogonal routing에서는 발생하지 않음)
  return false;
}

/**
 * 전체 경로가 장애물과 충돌하는지 확인
 */
function pathCollides(
  points: Point[],
  obstacles: Rectangle[],
  padding: number
): boolean {
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

/**
 * 기본 2-bend orthogonal 경로
 */
function basicPath(
  start: Point,
  end: Point,
  startSide: 'left' | 'right',
  endSide: 'left' | 'right'
): Point[] {
  if (startSide === 'right' && endSide === 'left') {
    const midX = (start.x + end.x) / 2;
    return [
      { x: midX, y: start.y },
      { x: midX, y: end.y }
    ];
  } else if (startSide === 'left' && endSide === 'right') {
    const midX = (start.x + end.x) / 2;
    return [
      { x: midX, y: start.y },
      { x: midX, y: end.y }
    ];
  } else if (startSide === 'right' && endSide === 'right') {
    const outerX = Math.max(start.x, end.x) + GAP;
    return [
      { x: outerX, y: start.y },
      { x: outerX, y: end.y }
    ];
  } else {
    const outerX = Math.min(start.x, end.x) - GAP;
    return [
      { x: outerX, y: start.y },
      { x: outerX, y: end.y }
    ];
  }
}

/**
 * 우회 경로 생성 - 장애물 위 또는 아래로
 */
function avoidancePath(
  start: Point,
  end: Point,
  startSide: 'left' | 'right',
  endSide: 'left' | 'right',
  routeY: number // 우회할 Y 좌표
): Point[] {
  const startGap = startSide === 'right' ? GAP : -GAP;
  const endGap = endSide === 'left' ? -GAP : GAP;

  return [
    { x: start.x + startGap, y: start.y },
    { x: start.x + startGap, y: routeY },
    { x: end.x + endGap, y: routeY },
    { x: end.x + endGap, y: end.y }
  ];
}

/**
 * 메인 라우팅 함수
 */
export function calculateOrthogonalRoute(
  start: Point,
  end: Point,
  startSide: 'left' | 'right',
  endSide: 'left' | 'right',
  allObstacles: Rectangle[],
  fromRect: Rectangle,
  toRect: Rectangle
): Point[] {
  // fromRect, toRect 제외한 장애물
  const obstacles = allObstacles.filter(obs => {
    const isFrom = Math.abs(obs.x - fromRect.x) < 1 && Math.abs(obs.y - fromRect.y) < 1;
    const isTo = Math.abs(obs.x - toRect.x) < 1 && Math.abs(obs.y - toRect.y) < 1;
    return !isFrom && !isTo;
  });

  // 장애물이 없으면 기본 경로
  if (obstacles.length === 0) {
    return basicPath(start, end, startSide, endSide);
  }

  // 기본 경로 시도
  const basic = basicPath(start, end, startSide, endSide);
  const fullBasicPath = [start, ...basic, end];
  
  if (!pathCollides(fullBasicPath, obstacles, PADDING)) {
    return basic;
  }

  // 모든 장애물의 경계 계산 (경로 영역 필터링 없이)
  let minY = Infinity, maxY = -Infinity;
  let minX = Infinity, maxX = -Infinity;
  for (const obs of obstacles) {
    minY = Math.min(minY, obs.y);
    maxY = Math.max(maxY, obs.y + obs.height);
    minX = Math.min(minX, obs.x);
    maxX = Math.max(maxX, obs.x + obs.width);
  }

  // 우회 경로 옵션 - 모든 장애물 위/아래로
  const routeTop = minY - PADDING - GAP;
  const routeBottom = maxY + PADDING + GAP;

  // 시작/끝점의 Y 위치에 따라 우회 방향 결정
  const avgY = (start.y + end.y) / 2;
  const obstaclesCenterY = (minY + maxY) / 2;
  const preferTop = avgY < obstaclesCenterY;

  // 선호 방향 먼저 시도
  if (preferTop) {
    const topPath = avoidancePath(start, end, startSide, endSide, routeTop);
    const fullTopPath = [start, ...topPath, end];
    if (!pathCollides(fullTopPath, obstacles, PADDING)) {
      return topPath;
    }

    const bottomPath = avoidancePath(start, end, startSide, endSide, routeBottom);
    const fullBottomPath = [start, ...bottomPath, end];
    if (!pathCollides(fullBottomPath, obstacles, PADDING)) {
      return bottomPath;
    }
  } else {
    const bottomPath = avoidancePath(start, end, startSide, endSide, routeBottom);
    const fullBottomPath = [start, ...bottomPath, end];
    if (!pathCollides(fullBottomPath, obstacles, PADDING)) {
      return bottomPath;
    }

    const topPath = avoidancePath(start, end, startSide, endSide, routeTop);
    const fullTopPath = [start, ...topPath, end];
    if (!pathCollides(fullTopPath, obstacles, PADDING)) {
      return topPath;
    }
  }

  // 더 넓게 우회
  const wideRouteTop = minY - PADDING - GAP * 4;
  const wideRouteBottom = maxY + PADDING + GAP * 4;

  const wideTopPath = avoidancePath(start, end, startSide, endSide, wideRouteTop);
  if (!pathCollides([start, ...wideTopPath, end], obstacles, PADDING)) {
    return wideTopPath;
  }

  const wideBottomPath = avoidancePath(start, end, startSide, endSide, wideRouteBottom);
  if (!pathCollides([start, ...wideBottomPath, end], obstacles, PADDING)) {
    return wideBottomPath;
  }

  // 좌/우로 크게 우회 시도
  const routeLeft = minX - PADDING - GAP * 2;
  const routeRight = maxX + PADDING + GAP * 2;

  // 좌측 우회
  const leftPath = [
    { x: routeLeft, y: start.y },
    { x: routeLeft, y: end.y }
  ];
  if (!pathCollides([start, ...leftPath, end], obstacles, PADDING)) {
    return leftPath;
  }

  // 우측 우회
  const rightPath = [
    { x: routeRight, y: start.y },
    { x: routeRight, y: end.y }
  ];
  if (!pathCollides([start, ...rightPath, end], obstacles, PADDING)) {
    return rightPath;
  }

  // 모두 실패하면 기본 경로 반환
  return basic;
}
