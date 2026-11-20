const fs = require('fs');
const vm = require('vm');

const opticsCode = fs.readFileSync('e:/구글바이브코딩/light-maze/js/optics.js', 'utf8');
const stagesCode = fs.readFileSync('e:/구글바이브코딩/light-maze/js/stages.js', 'utf8');

vm.runInThisContext(opticsCode);
vm.runInThisContext(stagesCode);

const engine = new OpticsEngine({ gridSize: 56, maxBounces: 25 });

console.log("=== 1단계 테스트 ===");
const stage1 = STAGES_DATA[0];
const res1_right = engine.traceLight(stage1, [], { x: 1, y: 0 });
console.log("1단계 우측 발사 성공:", res1_right.hitReceiver, "/ 사유:", res1_right.hitReason);
const res1_up = engine.traceLight(stage1, [], { x: 0, y: -1 });
console.log("1단계 상향 발사 성공:", res1_up.hitReceiver, "/ 사유:", res1_up.hitReason);

console.log("\n=== 2단계 테스트 ===");
const stage2 = STAGES_DATA[1];
const res2_ok = engine.traceLight(stage2, [{ x: 1, y: 2, angle: 135 }]);
console.log("2단계 정답(135도 거울) 성공:", res2_ok.hitReceiver, "/ 반사 횟수:", res2_ok.reflections.length);
if (res2_ok.reflections[0]) {
  console.log("거울 1 입사각:", res2_ok.reflections[0].incidentAngle, "반사각:", res2_ok.reflections[0].reflectionAngle);
}
const res2_fail = engine.traceLight(stage2, []);
console.log("2단계 거울 미배치 성공:", res2_fail.hitReceiver, "/ 사유:", res2_fail.hitReason);

console.log("\n=== 3단계 테스트 ===");
const stage3 = STAGES_DATA[2];
const res3_ok = engine.traceLight(stage3, [
  { x: 1, y: 2, angle: 135 },
  { x: 6, y: 2, angle: 45 }
]);
console.log("3단계 정답(거울2개) 성공:", res3_ok.hitReceiver, "/ 반사 횟수:", res3_ok.reflections.length);
if (res3_ok.reflections.length === 2) {
  console.log("거울 1 입사각/반사각:", res3_ok.reflections[0].incidentAngle, res3_ok.reflections[0].reflectionAngle);
  console.log("거울 2 입사각/반사각:", res3_ok.reflections[1].incidentAngle, res3_ok.reflections[1].reflectionAngle);
}
const res3_one = engine.traceLight(stage3, [{ x: 1, y: 2, angle: 135 }]);
console.log("3단계 거울 1개만 배치 시 성공:", res3_one.hitReceiver, "/ 사유:", res3_one.hitReason);
