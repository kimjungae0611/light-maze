/**
 * [optics.js - 빛의 직진, 반사, 흡수 및 센서 관통 물리 엔진]
 * 이 스크립트는 중학교 과학 교육과정의 빛의 성질을 2차원 기하학으로 정밀하게 시뮬레이션합니다.
 * 
 * 1. 빛의 직진: 균일한 매질(공기) 안에서 광선(Ray)은 장애물에 닿을 때까지 직선으로 이동합니다.
 * 2. 반사의 법칙: 입사각 = 반사각 (반드시 거울 면의 '법선'을 기준으로 측정).
 * 3. 법선(Normal): 충돌점에서 거울 면과 직각(90도)을 이루는 가상의 기준선.
 * 4. 흡수 패널: 빛을 반사하지 않고 에너지를 그대로 흡수하여 광선 진행을 종료합니다.
 * 5. 체크포인트 센서: 빛을 가로막거나 꺾지 않고 그대로 투과시키며, 광선이 통과한 순서를 기록합니다.
 * 6. 다중 수신기: 여러 개의 수신기를 독립적으로 감지하고 점등 상태를 유지합니다.
 */

// 2차원 벡터 연산을 위한 헬퍼 객체
const Vector2D = {
  // 두 점 사이의 벡터 생성
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

  // 내적(Dot Product): 각도 및 투영 계산에 사용
  dot(v1, v2) {
    return v1.x * v2.x + v1.y * v2.y;
  },

  // 외적의 z값 (2D 크로스곱): 선분 교차 판정에 사용
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

    // 선분에 수직인 법선 벡터(Normal) 계산: 선분 벡터 (dx, dy)에 대해 (-dy, dx)
    let normal = Vector2D.normalize({
      x: -segVector.y,
      y: segVector.x
    });

    // 광선이 다가오는 방향을 향하도록 법선의 방향 부호 보정
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
 * 원(수신기/체크포인트)과 광선의 교차 계산 함수
 * @param {Object} rayOrigin 광선 시작점
 * @param {Object} rayDir 정규화된 광선 방향
 * @param {Object} center 원 중심 {x, y}
 * @param {number} radius 원 반지름
 * @returns {Object|null} { t, point, normal }
 */
function intersectRayCircle(rayOrigin, rayDir, center, radius) {
  const m = Vector2D.subtract(rayOrigin, center);
  const b = Vector2D.dot(m, rayDir);
  const c = Vector2D.dot(m, m) - radius * radius;

  // 광선 시작점이 원 외부에 있고 광선이 원의 반대 방향을 향하면 교차 없음
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
 * 선분과 점 사이의 최단 거리 및 투영점 계산 (체크포인트 투과 감지용)
 * @param {Object} p1 선분 시작점
 * @param {Object} p2 선분 끝점
 * @param {Object} center 검사할 점의 좌표
 * @returns {Object} { distance, closestPoint, tRatio }
 */
function distancePointToSegment(p1, p2, center) {
  const seg = Vector2D.subtract(p2, p1);
  const segLen = Vector2D.length(seg);
  if (segLen === 0) {
    return {
      distance: Vector2D.length(Vector2D.subtract(center, p1)),
      closestPoint: p1,
      tRatio: 0
    };
  }
  const v = Vector2D.subtract(center, p1);
  const t = Math.max(0, Math.min(1, Vector2D.dot(v, seg) / (segLen * segLen)));
  const closestPoint = {
    x: p1.x + seg.x * t,
    y: p1.y + seg.y * t
  };
  return {
    distance: Vector2D.length(Vector2D.subtract(center, closestPoint)),
    closestPoint,
    tRatio: t
  };
}

/**
 * 광학 시뮬레이터 클래스 (OpticsEngine)
 * 미로 맵과 거울 배치를 바탕으로 광선의 전체 경로와 반사·흡수·통과 현상을 계산합니다.
 */
class OpticsEngine {
  constructor(options = {}) {
    this.maxBounces = options.maxBounces || 30; // 무한 반사 방지를 위한 최대 반사 상한
    this.gridSize = options.gridSize || 56;     // 그리드 1칸의 픽셀 크기
  }

  /**
   * 거울 객체로부터 2D 선분(양 끝점)을 생성합니다.
   * 거울은 칸의 중심에 위치하며 45도 단위로 회전합니다.
   * @param {Object} mirror { x, y, angle }
   * @returns {Object} { p1, p2, mirrorRef }
   */
  getMirrorSegment(mirror) {
    const cx = (mirror.x + 0.5) * this.gridSize;
    const cy = (mirror.y + 0.5) * this.gridSize;
    const halfLength = (this.gridSize * 0.75) / 2; // 거울 길이

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
   * 흡수 패널 타일(Grid Cell)로부터 4개 변(선분)을 생성합니다.
   * @param {number} gx 그리드 X 좌표
   * @param {number} gy 그리드 Y 좌표
   * @returns {Array} 4개 선분의 배열
   */
  getAbsorberSegments(gx, gy) {
    const x1 = gx * this.gridSize;
    const y1 = gy * this.gridSize;
    const x2 = x1 + this.gridSize;
    const y2 = y1 + this.gridSize;

    return [
      { p1: { x: x1, y: y1 }, p2: { x: x2, y: y1 }, type: 'absorber', gridX: gx, gridY: gy },
      { p1: { x: x2, y: y1 }, p2: { x: x2, y: y2 }, type: 'absorber', gridX: gx, gridY: gy },
      { p1: { x: x2, y: y2 }, p2: { x: x1, y: y2 }, type: 'absorber', gridX: gx, gridY: gy },
      { p1: { x: x1, y: y2 }, p2: { x: x1, y: y1 }, type: 'absorber', gridX: gx, gridY: gy }
    ];
  }

  /**
   * 광선을 추적하여 경로 세그먼트들과 충돌 이벤트를 정밀 계산합니다.
   * @param {Object} stage 맵 정보 (광원, 수신기들, 벽, 흡수패널, 체크포인트, 맵 크기)
   * @param {Array} mirrors 현재 배치된 거울 목록 [{ x, y, angle }]
   * @param {Object|null} customSourceDir 사용자가 선택한 광원 방향 (1단계용, {x, y})
   * @param {Array} litReceiverIds 이미 점등된 수신기 ID 배열 (9~10단계 다중 수신기 상태 유지용)
   * @returns {Object} traceResult
   */
  traceLight(stage, mirrors = [], customSourceDir = null, litReceiverIds = []) {
    // 1. 광원의 위치 및 시작 방향 설정
    const startPos = {
      x: (stage.source.x + 0.5) * this.gridSize,
      y: (stage.source.y + 0.5) * this.gridSize
    };

    let currentDir = customSourceDir || stage.source.dir;
    currentDir = Vector2D.normalize(currentDir);

    let currentOrigin = { ...startPos };
    const path = [{ ...currentOrigin }];   // 광선이 지나간 궤적 좌표들
    const reflections = [];                // 반사 지점 데이터(법선, 입사각, 반사각 등)
    const visitedCheckpoints = [];         // 통과한 체크포인트 ID 순서 배열
    const visitedSet = new Set();          // 중복 체크 방지용 집합

    let hitReceiver = false;               // 이번 발사에서 목표 수신기를 새로 맞혔는지 여부
    let hitReceiverObj = null;             // 맞힌 수신기 객체
    let hitReason = '';                    // 결과 해설/안내 메시지
    let bounceCount = 0;                   // 반사 횟수
    let hitType = null;                    // 최종 충돌 종류 ('receiver', 'wall', 'absorber', 'boundary', 'loop', 'max_bounces')
    let absorberHitPoint = null;           // 흡수 패널 충돌 좌표 (시각 이펙트용)

    // 수신기 목록 정규화 (단일 receiver와 복수 receivers 배열 모두 완벽 지원)
    const receiversList = [];
    if (stage.receivers && Array.isArray(stage.receivers)) {
      stage.receivers.forEach((rec, idx) => {
        receiversList.push({
          id: rec.id || `rec_${idx + 1}`,
          label: rec.label || `코어 ${idx + 1}`,
          x: rec.x,
          y: rec.y,
          center: {
            x: (rec.x + 0.5) * this.gridSize,
            y: (rec.y + 0.5) * this.gridSize
          },
          radius: this.gridSize * 0.35
        });
      });
    } else if (stage.receiver) {
      receiversList.push({
        id: stage.receiver.id || 'rec_main',
        label: stage.receiver.label || '에너지 코어',
        x: stage.receiver.x,
        y: stage.receiver.y,
        center: {
          x: (stage.receiver.x + 0.5) * this.gridSize,
          y: (stage.receiver.y + 0.5) * this.gridSize
        },
        radius: this.gridSize * 0.35
      });
    }

    // 체크포인트 목록 정규화 (단일 checkpoint와 복수 checkpoints 배열 모두 지원)
    const checkpointsList = [];
    if (stage.checkpoints && Array.isArray(stage.checkpoints)) {
      stage.checkpoints.forEach((cp, idx) => {
        checkpointsList.push({
          id: cp.id || `CP_${idx + 1}`,
          label: cp.label || `체크포인트 ${cp.id || idx + 1}`,
          x: cp.x,
          y: cp.y,
          center: {
            x: (cp.x + 0.5) * this.gridSize,
            y: (cp.y + 0.5) * this.gridSize
          },
          radius: this.gridSize * 0.38
        });
      });
    } else if (stage.checkpoint) {
      checkpointsList.push({
        id: stage.checkpoint.id || 'CP_1',
        label: stage.checkpoint.label || '에너지 체크포인트',
        x: stage.checkpoint.x,
        y: stage.checkpoint.y,
        center: {
          x: (stage.checkpoint.x + 0.5) * this.gridSize,
          y: (stage.checkpoint.y + 0.5) * this.gridSize
        },
        radius: this.gridSize * 0.38
      });
    }

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
    if (stage.walls) {
      stage.walls.forEach(w => {
        wallSegments.push(...this.getWallSegments(w.x, w.y));
      });
    }

    // 흡수 패널 선분 수집
    const absorberSegments = [];
    if (stage.absorbers) {
      stage.absorbers.forEach(ab => {
        absorberSegments.push(...this.getAbsorberSegments(ab.x, ab.y));
      });
    }

    // 거울 선분 수집
    const mirrorSegments = mirrors.map(m => this.getMirrorSegment(m));

    // 무한 루프(동일 거울에 동일 입사 벡터로 충돌) 감지용 기록
    const hitHistory = [];

    // 광선 전파 루프 (최대 반사 상한까지 직진 및 반사 반복)
    while (bounceCount < this.maxBounces) {
      let closestHit = null;
      let currentHitType = null;
      let hitObject = null;

      // A. 모든 수신기 충돌 검사 (수신기는 원형 충돌체)
      for (const rec of receiversList) {
        const recHit = intersectRayCircle(currentOrigin, currentDir, rec.center, rec.radius);
        if (recHit && (!closestHit || recHit.t < closestHit.t)) {
          closestHit = recHit;
          currentHitType = 'receiver';
          hitObject = rec;
        }
      }

      // B. 벽 충돌 검사
      for (const seg of wallSegments) {
        const hit = intersectRaySegment(currentOrigin, currentDir, seg.p1, seg.p2);
        if (hit && (!closestHit || hit.t < closestHit.t)) {
          closestHit = hit;
          currentHitType = 'wall';
          hitObject = seg;
        }
      }

      // C. 흡수 패널 충돌 검사
      for (const seg of absorberSegments) {
        const hit = intersectRaySegment(currentOrigin, currentDir, seg.p1, seg.p2);
        if (hit && (!closestHit || hit.t < closestHit.t)) {
          closestHit = hit;
          currentHitType = 'absorber';
          hitObject = seg;
        }
      }

      // D. 거울 충돌 검사
      for (const mSeg of mirrorSegments) {
        const hit = intersectRaySegment(currentOrigin, currentDir, mSeg.p1, mSeg.p2);
        if (hit && (!closestHit || hit.t < closestHit.t)) {
          closestHit = hit;
          currentHitType = 'mirror';
          hitObject = mSeg;
        }
      }

      // E. 맵 경계 충돌 검사
      for (const bSeg of boundarySegments) {
        const hit = intersectRaySegment(currentOrigin, currentDir, bSeg.p1, bSeg.p2);
        if (hit && (!closestHit || hit.t < closestHit.t)) {
          closestHit = hit;
          currentHitType = 'boundary';
          hitObject = bSeg;
        }
      }

      // 더 이상 부딪히지 않는 경우
      if (!closestHit) {
        const farPoint = Vector2D.add(currentOrigin, Vector2D.multiply(currentDir, 1000));
        path.push(farPoint);
        hitType = 'boundary';
        hitReason = '수신기에 도달하지 못했어요. 빛이 나가는 방향을 살펴보세요.';
        break;
      }

      // =====================================================================
      // 체크포인트 투과 검사: 이번 광선 구간 (currentOrigin -> closestHit.point)
      // 체크포인트는 빛을 막거나 꺾지 않으므로, 광선이 지나가는 길목에 있으면 방문 기록!
      // =====================================================================
      const pStart = currentOrigin;
      const pEnd = closestHit.point;
      const traversedCps = [];

      for (const cp of checkpointsList) {
        if (!visitedSet.has(cp.id)) {
          const distInfo = distancePointToSegment(pStart, pEnd, cp.center);
          if (distInfo.distance <= cp.radius) {
            // 구간 내에서 통과한 위치 비율(tRatio)과 함께 저장하여 순서대로 정렬
            traversedCps.push({
              id: cp.id,
              label: cp.label,
              tRatio: distInfo.tRatio
            });
          }
        }
      }

      // 광선 진행 순서대로 정렬 후 방문 목록에 추가
      traversedCps.sort((a, b) => a.tRatio - b.tRatio);
      traversedCps.forEach(cp => {
        visitedCheckpoints.push(cp.id);
        visitedSet.add(cp.id);
      });

      // 경로에 충돌점 추가
      path.push({ ...closestHit.point });
      hitType = currentHitType;

      // =====================================================================
      // 충돌 대상별 분기 처리
      // =====================================================================
      if (currentHitType === 'receiver') {
        hitReceiverObj = hitObject;
        hitReceiver = true;
        hitReason = `${hitObject.label}에 빛이 도달했습니다!`;
        break;
      } else if (currentHitType === 'absorber') {
        absorberHitPoint = { ...closestHit.point };
        hitReason = '흡수 패널에 닿아 빛이 완전히 흡수되었습니다! 패널을 우회해 보세요.';
        break;
      } else if (currentHitType === 'wall') {
        hitReason = '벽에 막혔어요. 거울로 방향을 바꿔 보세요.';
        break;
      } else if (currentHitType === 'boundary') {
        hitReason = '빛이 연구소 미로 밖으로 벗어났어요. 각도를 조정해 보세요.';
        break;
      } else if (currentHitType === 'mirror') {
        // [반사의 법칙 적용: 입사각 = 반사각]
        const normal = closestHit.normal;
        const incomingDir = { ...currentDir };

        // 입사각(θ) 계산: 법선과 입사광선 사이의 각도 (0 ~ 90도)
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

        // 법선 벡터 시각화용 선분
        const normalLen = this.gridSize * 0.45;
        const normalVisual = {
          p1: Vector2D.add(closestHit.point, Vector2D.multiply(normal, normalLen)),
          p2: Vector2D.subtract(closestHit.point, Vector2D.multiply(normal, normalLen))
        };

        // 반사 기록 저장
        reflections.push({
          point: { ...closestHit.point },
          normal: normal,
          normalVisual: normalVisual,
          incomingDir: incomingDir,
          reflectDir: normalizedReflectDir,
          incidentAngle: angleDeg,   // 입사각
          reflectionAngle: angleDeg, // 반사각 (입사각 == 반사각)
          mirror: hitObject.mirrorRef
        });

        // 무한 루프 감지 (동일 거울, 근사 충돌점, 동일 반사 방향)
        const loopKey = `${hitObject.mirrorRef.x},${hitObject.mirrorRef.y}_${normalizedReflectDir.x.toFixed(3)},${normalizedReflectDir.y.toFixed(3)}`;
        if (hitHistory.includes(loopKey)) {
          hitType = 'loop';
          hitReason = '빛의 경로가 동일한 거울 사이를 끝없이 맴돌고 있습니다. 거울의 배치를 수정해 보세요.';
          break;
        }
        hitHistory.push(loopKey);

        // 다음 광선의 시작 위치 설정 (오차 방지 0.05px 전진)
        currentOrigin = Vector2D.add(closestHit.point, Vector2D.multiply(normalizedReflectDir, 0.05));
        currentDir = normalizedReflectDir;
        bounceCount++;
      }
    }

    // 최대 반사 상한 도달 시 루프 종료
    if (bounceCount >= this.maxBounces && hitType !== 'loop' && !hitReceiver) {
      hitType = 'max_bounces';
      hitReason = '빛이 너무 많이 반사되어 신호가 약해졌습니다. 거울 수를 조절하거나 경로를 단순화해 보세요.';
    }

    return {
      path,
      hitReceiver,
      hitReceiverObj,
      hitType,
      hitReason,
      reflections,
      bounceCount,
      visitedCheckpoints,
      absorberHitPoint
    };
  }

  /**
   * 스테이지별 클리어 조건을 종합 판정하는 함수
   * @param {Object} stage 스테이지 데이터
   * @param {Object} traceResult traceLight 결과 객체
   * @param {Array} litReceivers 이미 점등된 수신기 ID 배열 (9~10단계용)
   * @param {number} mirrorCount 설치된 거울 수
   * @returns {Object} { success, message, newlyLitReceiverId, badgeEarned }
   */
  evaluateStageCompletion(stage, traceResult, litReceivers = [], mirrorCount = 0) {
    const { hitReceiver, hitReceiverObj, visitedCheckpoints, hitType, hitReason } = traceResult;

    // A. 수신기에 닿지 않은 경우 무조건 실패
    if (!hitReceiver || !hitReceiverObj) {
      return {
        success: false,
        message: hitReason || '빛이 수신기에 도달하지 못했습니다.',
        newlyLitReceiverId: null,
        badgeEarned: null
      };
    }

    // B. 스테이지별 특수 성공 조건 검사
    // 5단계: 체크포인트 1개 이상 통과 필수
    if (stage.id === 5) {
      const requiredCp = stage.checkpoint ? stage.checkpoint.id : (stage.checkpoints ? stage.checkpoints[0].id : 'CP_1');
      if (!visitedCheckpoints.includes(requiredCp)) {
        return {
          success: false,
          message: '수신기에는 닿았지만, 중간의 [에너지 체크포인트]를 통과하지 않았습니다! 체크포인트를 경유해 보세요.',
          newlyLitReceiverId: null,
          badgeEarned: null
        };
      }
    }

    // 8단계: 체크포인트 순서 검사 (반드시 A -> B 순서로 통과해야 함)
    if (stage.id === 8) {
      const idxA = visitedCheckpoints.indexOf('A');
      const idxB = visitedCheckpoints.indexOf('B');

      if (idxA === -1 && idxB === -1) {
        return {
          success: false,
          message: '체크포인트 A와 B를 모두 지나지 않고 수신기에 도달했습니다. A ➜ B 순서로 경유해야 합니다.',
          newlyLitReceiverId: null,
          badgeEarned: null
        };
      }
      if (idxA === -1) {
        return {
          success: false,
          message: '체크포인트 A를 지나지 않았습니다! 먼저 A를 지난 후 B로 향해야 합니다.',
          newlyLitReceiverId: null,
          badgeEarned: null
        };
      }
      if (idxB === -1) {
        return {
          success: false,
          message: '체크포인트 A는 지났으나 B를 통과하지 못했습니다! A를 거쳐 B를 지나도록 설계해 보세요.',
          newlyLitReceiverId: null,
          badgeEarned: null
        };
      }
      if (idxB < idxA) {
        return {
          success: false,
          message: '순서가 잘못되었습니다! 체크포인트 B를 A보다 먼저 통과했습니다. 반드시 [A ➜ B] 순서로 지나야 합니다.',
          newlyLitReceiverId: null,
          badgeEarned: null
        };
      }
    }

    // 10단계: 공통 체크포인트 통과 후 수신기 도달 필수
    if (stage.id === 10) {
      const commonCp = 'CP_CENTER';
      if (!visitedCheckpoints.includes(commonCp)) {
        return {
          success: false,
          message: '중앙의 [에너지 변환 체크포인트]를 먼저 통과한 후 수신기에 닿아야 코어가 점등됩니다!',
          newlyLitReceiverId: null,
          badgeEarned: null
        };
      }
    }

    // C. 7단계 배지 판정: 거울 3개 이하로 클리어 시 '광학 설계자' 배지
    let badgeEarned = null;
    if (stage.id === 7 && mirrorCount <= 3) {
      badgeEarned = 'opticalArchitect';
    }

    // D. 9단계 및 10단계: 다중 수신기 점등 관리
    if (stage.id === 9 || stage.id === 10) {
      const targetId = hitReceiverObj.id;
      const isAlreadyLit = litReceivers.includes(targetId);

      let newlyLitReceiverId = null;
      if (!isAlreadyLit) {
        newlyLitReceiverId = targetId;
      }

      // 전체 수신기 모두 점등되었는지 확인
      const currentLitCount = litReceivers.length + (newlyLitReceiverId ? 1 : 0);
      const totalReceivers = stage.receivers ? stage.receivers.length : 1;

      if (currentLitCount >= totalReceivers) {
        return {
          success: true,
          isStageFullyCleared: true,
          message: stage.successExplanation || '모든 에너지 코어가 성공적으로 가동되었습니다!',
          newlyLitReceiverId,
          badgeEarned: stage.id === 10 ? 'mazeMaster' : null
        };
      } else {
        return {
          success: true,
          isStageFullyCleared: false,
          message: isAlreadyLit 
            ? `${hitReceiverObj.label}은(는) 이미 켜져 있습니다. 거울을 다시 배치해 다른 코어를 켜보세요!`
            : `${hitReceiverObj.label} 점등 성공! 점등 상태가 유지됩니다. 이제 거울을 재배치해 남은 코어를 켜보세요!`,
          newlyLitReceiverId,
          badgeEarned: null
        };
      }
    }

    // E. 1~8단계 일반 성공 처리
    return {
      success: true,
      isStageFullyCleared: true,
      message: stage.successExplanation || '에너지 코어가 성공적으로 가동되었습니다!',
      newlyLitReceiverId: hitReceiverObj.id,
      badgeEarned
    };
  }
}
