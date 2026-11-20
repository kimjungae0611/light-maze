/**
 * [optics.js - 빛의 직진 및 반사 물리 엔진]
 * 이 스크립트는 중학교 과학 교육과정의 빛의 성질을 2차원 기하학으로 정밀하게 시뮬레이션합니다.
 * 
 * 1. 빛의 직진: 광선(Ray)이 장애물에 닿을 때까지 직선으로 이동합니다.
 * 2. 반사의 법칙: 입사각 = 반사각 (반드시 '법선'을 기준으로 측정).
 * 3. 법선(Normal): 빛이 거울에 닿는 충돌점에서 거울 면과 직각(90도)을 이루는 가상의 기준선.
 * 4. 반사 공식: r = d - 2 * (d · n) * n (d: 진행방향, n: 법선, r: 반사방향)
 */

// 2차원 벡터 연산을 위한 헬퍼 객체
const Vector2D = {
  // 두 점 사이의 벡터 생성 (p1 -> p2)
  create(x, y) {
    return { x, y };
  },

  // 벡터 덧셈
  add(v1, v2) {
    return { x: v1.x + v2.x, y: v1.y + v2.y };
  },

  // 벡터 뺄셈
  subtract(v1, v2) {
    return { x: v1.x - v2.x, y: v1.y - v2.y };
  },

  // 스칼라 곱셈
  multiply(v, scalar) {
    return { x: v.x * scalar, y: v.y * scalar };
  },

  // 벡터의 길이(크기) 계산
  length(v) {
    return Math.hypot(v.x, v.y);
  },

  // 단위 벡터로 정규화 (길이를 1로 만듦)
  normalize(v) {
    const len = Math.hypot(v.x, v.y);
    if (len === 0) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
  },

  // 내적(Dot Product): 두 벡터 사이의 각도 및 투영 계산에 사용
  dot(v1, v2) {
    return v1.x * v2.x + v1.y * v2.y;
  },

  // 외적의 z값 (2D 크로스곱): 두 선분의 교차 판정에 사용
  cross(v1, v2) {
    return v1.x * v2.y - v1.y * v2.x;
  }
};

/**
 * 선분과 광선의 교차점 계산 함수
 * 광선(origin에서 dir 방향으로 발사)과 선분(p1 ~ p2)의 교차 여부를 판별합니다.
 * @param {Object} rayOrigin 광선 시작점 {x, y}
 * @param {Object} rayDir 정규화된 광선 방향 {x, y}
 * @param {Object} p1 선분 시작점 {x, y}
 * @param {Object} p2 선분 끝점 {x, y}
 * @returns {Object|null} 교차 정보 { t, point, normal } 또는 null
 */
function intersectRaySegment(rayOrigin, rayDir, p1, p2) {
  const segVector = Vector2D.subtract(p2, p1);
  const diff = Vector2D.subtract(p1, rayOrigin);

  const crossRaySeg = Vector2D.cross(rayDir, segVector);

  // 평행한 경우 교차하지 않음 (오차 허용)
  if (Math.abs(crossRaySeg) < 1e-8) {
    return null;
  }

  // 매개변수 t: 광선 상의 진행 거리 (t > 0 이어야 광선 앞쪽)
  // 매개변수 u: 선분 상의 위치 비율 (0 <= u <= 1 이어야 선분 내부)
  const t = Vector2D.cross(diff, segVector) / crossRaySeg;
  const u = Vector2D.cross(diff, rayDir) / crossRaySeg;

  // 광선 진행 방향(t > 0.001로 자기 자신 충돌 방지) 및 선분 범위(0 <= u <= 1) 확인
  if (t > 1e-3 && u >= 0 && u <= 1) {
    // 충돌 좌표
    const point = {
      x: rayOrigin.x + rayDir.x * t,
      y: rayOrigin.y + rayDir.y * t
    };

    // 선분에 수직인 법선 벡터(Normal) 계산
    // 선분 벡터 (dx, dy)에 대해 수직은 (-dy, dx)
    let normal = Vector2D.normalize({
      x: -segVector.y,
      y: segVector.x
    });

    // 광선이 다가오는 방향을 향하도록 법선의 방향 부호 보정
    // 내적(rayDir · normal)이 양수이면 같은 방향이므로 반전시킴
    if (Vector2D.dot(rayDir, normal) > 0) {
      normal = Vector2D.multiply(normal, -1);
    }

    return {
      t: t,
      point: point,
      normal: normal
    };
  }

  return null;
}

/**
 * 원(수신기)과 광선의 교차 계산 함수
 * @param {Object} rayOrigin 
 * @param {Object} rayDir 
 * @param {Object} center 원 중심 {x, y}
 * @param {number} radius 원 반지름
 * @returns {Object|null}
 */
function intersectRayCircle(rayOrigin, rayDir, center, radius) {
  const m = Vector2D.subtract(rayOrigin, center);
  const b = Vector2D.dot(m, rayDir);
  const c = Vector2D.dot(m, m) - radius * radius;

  // 광선 시작점이 원 내부에 있거나 앞을 향하지 않는 경우 처리
  if (c > 0 && b > 0) return null;

  const discriminant = b * b - c;
  if (discriminant < 0) return null;

  let t = -b - Math.sqrt(discriminant);
  if (t < 1e-3) {
    t = -b + Math.sqrt(discriminant);
  }

  if (t > 1e-3) {
    const point = {
      x: rayOrigin.x + rayDir.x * t,
      y: rayOrigin.y + rayDir.y * t
    };
    const normal = Vector2D.normalize(Vector2D.subtract(point, center));
    return { t, point, normal };
  }

  return null;
}

/**
 * 광학 시뮬레이터 클래스 (RayTracer)
 * 미로 맵과 거울 배치를 바탕으로 광선의 전체 경로와 반사 현상을 계산합니다.
 */
class OpticsEngine {
  constructor(options = {}) {
    this.maxBounces = options.maxBounces || 25; // 무한 반사 방지를 위한 최대 반사 횟수
    this.gridSize = options.gridSize || 60;     // 그리드 1칸의 픽셀 크기
  }

  /**
   * 거울 객체로부터 2D 선분(양 끝점)을 생성합니다.
   * 거울은 칸의 중심에 위치하며 45도 단위로 회전합니다.
   * @param {Object} mirror { x, y, angle } (angle: 0, 45, 90, 135도)
   * @returns {Object} { p1, p2, mirror }
   */
  getMirrorSegment(mirror) {
    const cx = (mirror.x + 0.5) * this.gridSize;
    const cy = (mirror.y + 0.5) * this.gridSize;
    const halfLength = (this.gridSize * 0.75) / 2; // 거울 길이

    // 각도를 라디안으로 변환
    const rad = (mirror.angle * Math.PI) / 180;
    const dx = Math.cos(rad) * halfLength;
    const dy = Math.sin(rad) * halfLength;

    return {
      p1: { x: cx - dx, y: cy - dy },
      p2: { x: cx + dx, y: cy + dy },
      mirrorRef: mirror
    };
  }

  /**
   * 벽 타일(Grid Cell)로부터 4개 변(선분)을 생성합니다.
   * @param {number} gx 그리드 X 좌표
   * @param {number} gy 그리드 Y 좌표
   * @returns {Array} 4개 선분의 배열
   */
  getWallSegments(gx, gy) {
    const x1 = gx * this.gridSize;
    const y1 = gy * this.gridSize;
    const x2 = x1 + this.gridSize;
    const y2 = y1 + this.gridSize;

    return [
      { p1: { x: x1, y: y1 }, p2: { x: x2, y: y1 }, type: 'wall' }, // 상
      { p1: { x: x2, y: y1 }, p2: { x: x2, y: y2 }, type: 'wall' }, // 우
      { p1: { x: x2, y: y2 }, p2: { x: x1, y: y2 }, type: 'wall' }, // 하
      { p1: { x: x1, y: y2 }, p2: { x: x1, y: y1 }, type: 'wall' }  // 좌
    ];
  }

  /**
   * 광선을 추적하여 경로 세그먼트들과 충돌 이벤트를 계산합니다.
   * @param {Object} stage 맵 정보 (광원, 수신기, 벽, 맵 크기)
   * @param {Array} mirrors 현재 배치된 거울 목록 [{ x, y, angle }]
   * @param {Object} customSourceDir 사용자가 선택한 광원 방향 (1단계용, {x, y})
   * @returns {Object} { path, hitReceiver, hitReason, reflections }
   */
  traceLight(stage, mirrors = [], customSourceDir = null) {
    // 1. 광원의 위치 및 시작 방향 설정
    const startPos = {
      x: (stage.source.x + 0.5) * this.gridSize,
      y: (stage.source.y + 0.5) * this.gridSize
    };

    let currentDir = customSourceDir || stage.source.dir;
    currentDir = Vector2D.normalize(currentDir);

    let currentOrigin = { ...startPos };
    const path = [ { ...currentOrigin } ]; // 광선이 지나간 궤적 좌표들
    const reflections = [];                // 반사 지점 데이터(법선, 입사각, 반사각 등)

    let hitReceiver = false;
    let hitReason = '';
    let bounceCount = 0;

    // 수신기 중심 및 히트박스 반지름 (시각적 크기와 정확히 일치)
    const receiverCenter = {
      x: (stage.receiver.x + 0.5) * this.gridSize,
      y: (stage.receiver.y + 0.5) * this.gridSize
    };
    const receiverRadius = this.gridSize * 0.35;

    // 맵 외곽 경계선 선분들
    const mapWidthPx = stage.cols * this.gridSize;
    const mapHeightPx = stage.rows * this.gridSize;
    const boundarySegments = [
      { p1: { x: 0, y: 0 }, p2: { x: mapWidthPx, y: 0 }, type: 'boundary' },
      { p1: { x: mapWidthPx, y: 0 }, p2: { x: mapWidthPx, y: mapHeightPx }, type: 'boundary' },
      { p1: { x: mapWidthPx, y: mapHeightPx }, p2: { x: 0, y: mapHeightPx }, type: 'boundary' },
      { p1: { x: 0, y: mapHeightPx }, p2: { x: 0, y: 0 }, type: 'boundary' }
    ];

    // 벽 선분 수집
    const wallSegments = [];
    stage.walls.forEach(w => {
      wallSegments.push(...this.getWallSegments(w.x, w.y));
    });

    // 거울 선분 수집
    const mirrorSegments = mirrors.map(m => this.getMirrorSegment(m));

    // 광선 전파 루프 (최대 반사 상한까지 직진 및 반사 반복)
    while (bounceCount < this.maxBounces) {
      let closestHit = null;
      let hitType = null;
      let hitObject = null;

      // A. 수신기 충돌 검사 (수신기는 원형 충돌체)
      const recHit = intersectRayCircle(currentOrigin, currentDir, receiverCenter, receiverRadius);
      if (recHit) {
        closestHit = recHit;
        hitType = 'receiver';
      }

      // B. 벽 충돌 검사
      for (const seg of wallSegments) {
        const hit = intersectRaySegment(currentOrigin, currentDir, seg.p1, seg.p2);
        if (hit && (!closestHit || hit.t < closestHit.t)) {
          closestHit = hit;
          hitType = 'wall';
        }
      }

      // C. 거울 충돌 검사
      for (const mSeg of mirrorSegments) {
        const hit = intersectRaySegment(currentOrigin, currentDir, mSeg.p1, mSeg.p2);
        if (hit && (!closestHit || hit.t < closestHit.t)) {
          closestHit = hit;
          hitType = 'mirror';
          hitObject = mSeg;
        }
      }

      // D. 맵 경계 충돌 검사
      for (const bSeg of boundarySegments) {
        const hit = intersectRaySegment(currentOrigin, currentDir, bSeg.p1, bSeg.p2);
        if (hit && (!closestHit || hit.t < closestHit.t)) {
          closestHit = hit;
          hitType = 'boundary';
        }
      }

      // 더 이상 어떤 물체에도 부딪히지 않는 경우 (예외적 상황)
      if (!closestHit) {
        const farPoint = Vector2D.add(currentOrigin, Vector2D.multiply(currentDir, 1000));
        path.push(farPoint);
        hitReason = '수신기에 도달하지 못했어요. 빛이 나가는 방향을 살펴보세요.';
        break;
      }

      // 경로에 충돌점 추가
      path.push({ ...closestHit.point });

      // 충돌 대상별 분기 처리
      if (hitType === 'receiver') {
        hitReceiver = true;
        hitReason = '에너지 코어에 빛이 도달했습니다! 수신기가 가동됩니다.';
        break;
      } else if (hitType === 'wall') {
        hitReason = '벽에 막혔어요. 거울로 방향을 바꿔 보세요.';
        break;
      } else if (hitType === 'boundary') {
        hitReason = '빛이 연구소 미로 밖으로 벗어났어요. 각도를 조정해 보세요.';
        break;
      } else if (hitType === 'mirror') {
        // [핵심 과학 원리: 반사의 법칙 적용]
        // 법선(n)은 거울 표면에 수직인 단위 벡터
        const normal = closestHit.normal;
        const incomingDir = { ...currentDir };

        // 입사각(θ_in) 계산: 법선과 입사광선 사이의 각도 (0 ~ 90도 범위로 계산)
        // cos(θ) = |d · n|
        const dotProduct = Vector2D.dot(incomingDir, normal);
        const cosTheta = Math.min(Math.max(Math.abs(dotProduct), 0), 1);
        const angleRad = Math.acos(cosTheta);
        const angleDeg = Math.round((angleRad * 180) / Math.PI);

        // 반사 벡터 계산 공식: r = d - 2(d · n)n
        const reflectDir = Vector2D.subtract(
          incomingDir,
          Vector2D.multiply(normal, 2 * dotProduct)
        );
        const normalizedReflectDir = Vector2D.normalize(reflectDir);

        // 법선 벡터의 시작점 및 시각화용 선분 계산 (충돌점 기준 양방향 표시)
        const normalLen = this.gridSize * 0.45;
        const normalVisual = {
          p1: Vector2D.add(closestHit.point, Vector2D.multiply(normal, normalLen)),
          p2: Vector2D.subtract(closestHit.point, Vector2D.multiply(normal, normalLen))
        };

        // 반사 기록 저장 (관찰기 모드에서 법선과 각도 표시에 사용)
        reflections.push({
          point: { ...closestHit.point },
          normal: normal,
          normalVisual: normalVisual,
          incomingDir: incomingDir,
          reflectDir: normalizedReflectDir,
          incidentAngle: angleDeg,   // 입사각
          reflectionAngle: angleDeg, // 반사각 (반사의 법칙: 입사각 == 반사각)
          mirror: hitObject.mirrorRef
        });

        // 다음 광선의 시작 위치 설정 (수치 오차로 인한 자기 자신 즉시 충돌 방지: epsilon 0.05px 전진)
        currentOrigin = Vector2D.add(closestHit.point, Vector2D.multiply(normalizedReflectDir, 0.05));
        currentDir = normalizedReflectDir;
        bounceCount++;
      }
    }

    // 최대 반사 횟수에 도달하여 루프가 멈춘 경우
    if (bounceCount >= this.maxBounces && !hitReceiver) {
      hitReason = '빛의 경로가 반복됩니다. 거울 배치를 바꿔 보세요.';
    }

    return {
      path,
      hitReceiver,
      hitReason,
      reflections,
      bounceCount
    };
  }
}
