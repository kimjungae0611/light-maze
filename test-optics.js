const fs = require('fs');
const vm = require('vm');

const opticsCode = fs.readFileSync('e:/구글바이브코딩/light-maze/js/optics.js', 'utf8');
const stagesCode = fs.readFileSync('e:/구글바이브코딩/light-maze/js/stages.js', 'utf8');

vm.runInThisContext(opticsCode);
vm.runInThisContext(stagesCode);

const engine = new OpticsEngine({ gridSize: 56, maxBounces: 30 });

console.log("=================================================");
console.log("       1~10단계 광학 물리 및 조건 전체 검증");
console.log("=================================================");

let allTestsPassed = true;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    allTestsPassed = false;
  }
}

// -------------------------------------------------------------
// [1단계 검증]
console.log("\n▶ [1단계: 빛의 첫걸음]");
const s1 = STAGES_DATA[0];
const r1_ok = engine.traceLight(s1, [], { x: 1, y: 0 });
const e1_ok = engine.evaluateStageCompletion(s1, r1_ok);
assert(e1_ok.success === true, "우측 발사 시 수신기 도달 및 성공");

const r1_fail = engine.traceLight(s1, [], { x: 0, y: -1 });
const e1_fail = engine.evaluateStageCompletion(s1, r1_fail);
assert(e1_fail.success === false, "상향 발사 시 벽 충돌 실패");

// -------------------------------------------------------------
// [2단계 검증]
console.log("\n▶ [2단계: 거울 한 장의 비밀]");
const s2 = STAGES_DATA[1];
const r2_ok = engine.traceLight(s2, [{ x: 1, y: 2, angle: 135 }]);
const e2_ok = engine.evaluateStageCompletion(s2, r2_ok);
assert(e2_ok.success === true, "(1, 2) 135도 거울 1회 반사 성공");

// -------------------------------------------------------------
// [3단계 검증]
console.log("\n▶ [3단계: 벽 너머의 신호]");
const s3 = STAGES_DATA[2];
const r3_ok = engine.traceLight(s3, [
  { x: 1, y: 2, angle: 135 },
  { x: 6, y: 2, angle: 45 }
]);
const e3_ok = engine.evaluateStageCompletion(s3, r3_ok);
assert(e3_ok.success === true, "2개 거울 우회 성공");

// -------------------------------------------------------------
// [4단계 검증]
console.log("\n▶ [4단계: 꺾인 통로]");
const s4 = STAGES_DATA[3];
const r4_ok = engine.traceLight(s4, [
  { x: 5, y: 5, angle: 135 },
  { x: 5, y: 2, angle: 45 }
]);
const e4_ok = engine.evaluateStageCompletion(s4, r4_ok);
assert(e4_ok.success === true, "오른쪽 출발 빛 2회 반사로 (2, 2) 코어 도달 성공");

// -------------------------------------------------------------
// [5단계 검증]
console.log("\n▶ [5단계: 에너지 체크포인트]");
const s5 = STAGES_DATA[4];
const r5_ok = engine.traceLight(s5, [
  { x: 1, y: 3, angle: 45 },
  { x: 6, y: 3, angle: 45 },
  { x: 6, y: 5, angle: 135 }
]);
const e5_ok = engine.evaluateStageCompletion(s5, r5_ok);
assert(e5_ok.success === true && r5_ok.visitedCheckpoints.includes("CP_1"), "체크포인트 경유 후 수신기 성공");

const mockNoCp = { hitReceiver: true, hitReceiverObj: { id: 'rec_5' }, visitedCheckpoints: [] };
const e5_mock_fail = engine.evaluateStageCompletion(s5, mockNoCp);
assert(e5_mock_fail.success === false, "체크포인트 미경유 시 성공 판정 거부");

// -------------------------------------------------------------
// [6단계 검증]
console.log("\n▶ [6단계: 흡수 구역을 피해라]");
const s6 = STAGES_DATA[5];
const r6_straight = engine.traceLight(s6, []);
assert(r6_straight.hitType === 'absorber', "직진 시 (1, 1) 흡수 패널 충돌 및 광선 정지");

const r6_ok = engine.traceLight(s6, [
  { x: 1, y: 3, angle: 135 },
  { x: 5, y: 3, angle: 45 },
  { x: 5, y: 5, angle: 45 }
]);
const e6_ok = engine.evaluateStageCompletion(s6, r6_ok);
assert(e6_ok.success === true, "흡수 패널 안전 우회 성공");

// -------------------------------------------------------------
// [7단계 검증]
console.log("\n▶ [7단계: 최소 거울 작전]");
const s7 = STAGES_DATA[6];
const r7_3m = engine.traceLight(s7, [
  { x: 1, y: 2, angle: 135 },
  { x: 5, y: 2, angle: 45 },
  { x: 5, y: 6, angle: 45 }
]);
const e7_3m = engine.evaluateStageCompletion(s7, r7_3m, [], 3);
assert(e7_3m.success === true, "3개 거울로 수신기 도달 성공");
assert(e7_3m.badgeEarned === 'opticalArchitect', "3개 이하 거울로 '광학 설계자' 배지 획득 확인");

// -------------------------------------------------------------
// [8단계 검증]
console.log("\n▶ [8단계: 순서가 있는 빛]");
const s8 = STAGES_DATA[7];
const r8_ok = engine.traceLight(s8, [
  { x: 1, y: 1, angle: 135 },
  { x: 6, y: 1, angle: 45 },
  { x: 6, y: 5, angle: 135 }
]);
const e8_ok = engine.evaluateStageCompletion(s8, r8_ok);
assert(e8_ok.success === true, "A ➜ B ➜ 수신기 정상 순서 성공");
assert(r8_ok.visitedCheckpoints.join(',') === 'A,B', `방문 순서 일치: ${r8_ok.visitedCheckpoints.join(' -> ')}`);

const mockRevOrder = { hitReceiver: true, hitReceiverObj: { id: 'rec_8' }, visitedCheckpoints: ['B', 'A'] };
const e8_rev_fail = engine.evaluateStageCompletion(s8, mockRevOrder);
assert(e8_rev_fail.success === false, "B가 A보다 먼저 방문된 경우 실패 판정");

// -------------------------------------------------------------
// [9단계 검증]
console.log("\n▶ [9단계: 두 개의 에너지 코어]");
const s9 = STAGES_DATA[8];
// 1차 발사: 알파 코어 (6, 1)
const r9_alpha = engine.traceLight(s9, [
  { x: 2, y: 3, angle: 135 },
  { x: 2, y: 1, angle: 135 }
]);
const e9_alpha = engine.evaluateStageCompletion(s9, r9_alpha, []);
assert(e9_alpha.success === true && e9_alpha.newlyLitReceiverId === 'rec_9_a', "1차 발사 알파 코어 점등 성공");
assert(e9_alpha.isStageFullyCleared === false, "1개만 켰을 때는 아직 스테이지 미완료 상태 유지");

// 2차 발사: 베타 코어 (6, 5)
const r9_beta = engine.traceLight(s9, [
  { x: 2, y: 3, angle: 45 },
  { x: 2, y: 5, angle: 45 }
]);
const e9_beta = engine.evaluateStageCompletion(s9, r9_beta, ['rec_9_a']);
assert(e9_beta.success === true && e9_beta.newlyLitReceiverId === 'rec_9_b', "2차 발사 베타 코어 점등 성공");
assert(e9_beta.isStageFullyCleared === true, "알파와 베타 모두 켰을 때 최종 스테이지 완료");

// -------------------------------------------------------------
// [10단계 검증]
console.log("\n▶ [10단계: 도시의 중심 코어]");
const s10 = STAGES_DATA[9];
// A. 상단 코어 점등
const r10_top = engine.traceLight(s10, [
  { x: 4, y: 3, angle: 135 },
  { x: 4, y: 1, angle: 135 }
]);
const e10_top = engine.evaluateStageCompletion(s10, r10_top, []);
assert(e10_top.success === true && e10_top.newlyLitReceiverId === 'rec_10_top', "상단 코어 점등 (체크포인트 경유)");

// B. 하단 코어 점등
const r10_bot = engine.traceLight(s10, [
  { x: 4, y: 3, angle: 45 },
  { x: 4, y: 5, angle: 45 }
]);
const e10_bot = engine.evaluateStageCompletion(s10, r10_bot, ['rec_10_top']);
assert(e10_bot.success === true && e10_bot.newlyLitReceiverId === 'rec_10_bot', "하단 코어 점등 (체크포인트 경유)");

// C. 중앙 코어 점등 (4개 거울 우회)
const r10_mid = engine.traceLight(s10, [
  { x: 4, y: 3, angle: 45 },
  { x: 4, y: 4, angle: 45 },
  { x: 6, y: 4, angle: 135 },
  { x: 6, y: 3, angle: 135 }
]);
const e10_mid = engine.evaluateStageCompletion(s10, r10_mid, ['rec_10_top', 'rec_10_bot'], 4);
assert(e10_mid.success === true && e10_mid.newlyLitReceiverId === 'rec_10_mid', "중앙 코어 점등 (흡수 패널 우회 및 체크포인트 경유)");
assert(e10_mid.isStageFullyCleared === true, "3개 코어 모두 점등 시 10단계 최종 완료");
assert(e10_mid.badgeEarned === 'mazeMaster', "10단계 완료 시 '빛의 미로 마스터' 배지 획득");

console.log("\n=================================================");
if (allTestsPassed) {
  console.log("🎉 [축하합니다!] 1~10단계 모든 광학 계산 및 미션 조건 100% 검증 완료!");
} else {
  console.error("❌ 검증 실패 항목이 있습니다.");
}
console.log("=================================================");
