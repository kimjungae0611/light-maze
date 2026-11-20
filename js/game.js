/**
 * [game.js - 메인 게임 컨트롤러 및 캔버스 렌더러]
 * 이 스크립트는 게임의 흐름(화면 전환, 사용자 터치/클릭 입력, 거울 배치/회전/회수,
 * 광선 발사 애니메이션, 법선·각도 관찰기 시각화, 모달 제어)을 총괄합니다.
 */

// 게임 전체 상태를 관리하는 컨트롤러 클래스
class LightMazeGame {
  constructor() {
    // 1. 하위 시스템 초기화
    this.storage = new StorageManager();
    this.sound = new SoundEffects(this.storage);
    this.optics = new OpticsEngine({ gridSize: 56, maxBounces: 25 });

    // 2. 캔버스 및 그래픽 컨텍스트
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.gridSize = 56; // 캔버스 그리드 1칸 크기 (픽셀)

    // 3. 현재 게임 상태 변수
    this.currentStageId = 1;
    this.currentStage = null;
    this.mirrors = [];             // 현재 배치된 거울 목록 [{ x, y, angle }]
    this.selectedTool = 'mirror';  // 선택된 도구 ('mirror')
    this.customSourceDir = null;   // 1단계 플레이어 지정 광원 방향 {x, y}
    this.isObserverOn = false;     // 법선·각도 관찰기 켜짐 여부
    this.isFiring = false;         // 광선 발사 중 여부
    this.currentHintIndex = 0;     // 현재 열람 중인 힌트 인덱스
    
    // 선택된 거울 (팝업 조작용)
    this.activeMirror = null;

    // 광선 애니메이션 데이터
    this.animPath = [];
    this.animProgress = 0;
    this.lastTraceResult = null;
    this.particles = [];           // 충돌 스파크 파티클 효과

    // 4. DOM 요소 캐싱
    this.cacheDomElements();

    // 5. 이벤트 리스너 등록 및 초기 화면 설정
    this.bindEvents();
    this.updateAudioButtonState();
    this.updateGlobalCoreIndicators();
    this.showScreen('screen-intro');

    // 6. 메인 렌더링 루프 시작 (requestAnimationFrame)
    this.lastTimestamp = performance.now();
    this.renderLoop = this.renderLoop.bind(this);
    requestAnimationFrame(this.renderLoop);
  }

  // DOM 요소 캐싱
  cacheDomElements() {
    // 화면 섹션
    this.screens = {
      intro: document.getElementById('screen-intro'),
      stages: document.getElementById('screen-stages'),
      game: document.getElementById('screen-game')
    };

    // 모달들
    this.modals = {
      success: document.getElementById('modal-success'),
      complete: document.getElementById('modal-complete'),
      hint: document.getElementById('modal-hint')
    };

    // 헤더 및 안내
    this.stageTitle = document.getElementById('current-stage-title');
    this.stageGoal = document.getElementById('current-stage-goal');
    this.missionPrompt = document.getElementById('mission-prompt-text');
    this.feedbackBar = document.getElementById('feedback-bar');
    this.feedbackText = document.getElementById('feedback-text');
    this.feedbackIcon = document.getElementById('feedback-icon');

    // 거울 팝업
    this.mirrorPopup = document.getElementById('mirror-popup');

    // 컨트롤 패널
    this.sourceControls = document.getElementById('source-dir-controls');
    this.mirrorControls = document.getElementById('mirror-inventory-controls');
    this.mirrorBadge = document.getElementById('mirror-count-badge');
    this.observerText = document.getElementById('observer-state-text');
    this.btnObserver = document.getElementById('btn-toggle-observer');
  }

  // 화면 전환 헬퍼
  showScreen(screenId) {
    Object.values(this.screens).forEach(screen => {
      screen.classList.remove('active');
    });
    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
    }
    this.hideMirrorPopup();
  }

  // 이벤트 리스너 등록
  bindEvents() {
    // A. 화면 네비게이션
    document.getElementById('btn-start-game').addEventListener('click', () => {
      this.sound.playClick();
      // 가장 최근에 해금된 단계로 진입
      const stageToPlay = Math.min(this.storage.memoryStore.unlockedStage, 3);
      this.loadStage(stageToPlay);
      this.showScreen('screen-game');
    });

    document.getElementById('btn-show-stages').addEventListener('click', () => {
      this.sound.playClick();
      this.renderStageSelectList();
      this.showScreen('screen-stages');
    });

    document.getElementById('btn-back-to-intro').addEventListener('click', () => {
      this.sound.playClick();
      this.showScreen('screen-intro');
    });

    document.getElementById('btn-nav-stages').addEventListener('click', () => {
      this.sound.playClick();
      this.renderStageSelectList();
      this.showScreen('screen-stages');
    });

    // B. 오디오 음소거 버튼
    document.getElementById('btn-toggle-sound').addEventListener('click', () => {
      const isMuted = this.sound.toggleMute();
      this.updateAudioButtonState();
      if (!isMuted) this.sound.playClick();
    });

    // C. 1단계 광원 방향 선택 버튼들
    const dirButtons = document.querySelectorAll('.btn-dir');
    dirButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.sound.playClick();
        dirButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const dirType = btn.dataset.dir;
        if (dirType === 'up') this.customSourceDir = { x: 0, y: -1 };
        else if (dirType === 'down') this.customSourceDir = { x: 0, y: 1 };
        else if (dirType === 'left') this.customSourceDir = { x: -1, y: 0 };
        else if (dirType === 'right') this.customSourceDir = { x: 1, y: 0 };

        this.setFeedback('광원 발사 방향이 변경되었습니다. [빛 발사]를 눌러보세요.', 'info');
        this.resetLaserAnimation();
      });
    });

    // D. 메인 액션 버튼: 빛 발사
    document.getElementById('btn-fire-light').addEventListener('click', () => {
      this.fireLight();
    });

    // E. 관찰기 토글 버튼
    this.btnObserver.addEventListener('click', () => {
      this.sound.playClick();
      this.isObserverOn = !this.isObserverOn;
      this.observerText.textContent = this.isObserverOn ? 'ON' : 'OFF';
      this.btnObserver.classList.toggle('active', this.isObserverOn);
      this.setFeedback(
        this.isObserverOn 
          ? '법선·각도 관찰기가 켜졌습니다. 거울에 닿는 빛의 법선과 입사각·반사각을 관찰해보세요!' 
          : '법선·각도 관찰기가 꺼졌습니다.', 
        'info'
      );
    });

    // F. 힌트 버튼 및 힌트 모달
    document.getElementById('btn-hint').addEventListener('click', () => {
      this.sound.playClick();
      this.showHintModal();
    });

    document.getElementById('btn-next-hint').addEventListener('click', () => {
      this.sound.playClick();
      this.currentHintIndex++;
      this.updateHintModalContent();
    });

    document.getElementById('btn-close-hint').addEventListener('click', () => {
      this.sound.playClick();
      this.modals.hint.classList.add('hidden');
    });

    // G. 초기화 버튼
    document.getElementById('btn-reset-stage').addEventListener('click', () => {
      this.sound.playClick();
      this.resetCurrentStage();
      this.setFeedback('현재 단계가 처음 상태로 초기화되었습니다.', 'info');
    });

    // H. 거울 조작 팝업 버튼들 (회전 및 회수)
    document.getElementById('btn-popup-rotate-cw').addEventListener('click', () => {
      if (this.activeMirror) {
        this.sound.playRotate();
        this.activeMirror.angle = (this.activeMirror.angle + 45) % 180;
        this.hideMirrorPopup();
        this.resetLaserAnimation();
        this.setFeedback(`거울 각도를 ${this.activeMirror.angle}°로 회전했습니다.`, 'info');
      }
    });

    document.getElementById('btn-popup-rotate-ccw').addEventListener('click', () => {
      if (this.activeMirror) {
        this.sound.playRotate();
        this.activeMirror.angle = (this.activeMirror.angle + 135) % 180;
        this.hideMirrorPopup();
        this.resetLaserAnimation();
        this.setFeedback(`거울 각도를 ${this.activeMirror.angle}°로 회전했습니다.`, 'info');
      }
    });

    document.getElementById('btn-popup-remove').addEventListener('click', () => {
      if (this.activeMirror) {
        this.sound.playClick();
        this.removeMirror(this.activeMirror);
        this.hideMirrorPopup();
        this.resetLaserAnimation();
        this.setFeedback('거울을 도구함으로 회수했습니다.', 'info');
      }
    });

    // I. 캔버스 클릭/터치 이벤트 (드래그 없이 원클릭 조작)
    this.canvas.addEventListener('click', (e) => {
      this.handleCanvasClick(e);
    });

    // J. 성공 및 엔딩 모달 버튼들
    document.getElementById('btn-modal-next').addEventListener('click', () => {
      this.sound.playClick();
      this.modals.success.classList.add('hidden');
      if (this.currentStageId < 3) {
        this.loadStage(this.currentStageId + 1);
      } else {
        this.showCompleteModal();
      }
    });

    document.getElementById('btn-modal-replay').addEventListener('click', () => {
      this.sound.playClick();
      this.modals.success.classList.add('hidden');
    });

    document.getElementById('btn-complete-stages').addEventListener('click', () => {
      this.sound.playClick();
      this.modals.complete.classList.add('hidden');
      this.renderStageSelectList();
      this.showScreen('screen-stages');
    });

    document.getElementById('btn-complete-restart').addEventListener('click', () => {
      this.sound.playClick();
      this.modals.complete.classList.add('hidden');
      this.storage.resetAll();
      this.updateGlobalCoreIndicators();
      this.loadStage(1);
      this.showScreen('screen-game');
    });
  }

  // 음소거 버튼 UI 상태 갱신
  updateAudioButtonState() {
    const btn = document.getElementById('btn-toggle-sound');
    btn.textContent = this.sound.isMuted ? '🔇' : '🔊';
  }

  // 상단 에너지 코어 게이지 갱신
  updateGlobalCoreIndicators() {
    const clearedCount = this.storage.getCoresCount();
    for (let i = 1; i <= 3; i++) {
      const ind = document.getElementById(`core-ind-${i}`);
      if (ind) {
        ind.classList.toggle('active', this.storage.isStageCleared(i));
      }
      const introSlot = document.getElementById(`intro-core-${i}`);
      if (introSlot) {
        introSlot.classList.toggle('active', this.storage.isStageCleared(i));
      }
    }
  }

  // 단계 선택 화면 카드 렌더링
  renderStageSelectList() {
    for (let i = 1; i <= 3; i++) {
      const card = document.getElementById(`stage-card-${i}`);
      const reward = document.getElementById(`stage-reward-${i}`);
      const isUnlocked = this.storage.isStageUnlocked(i);
      const isCleared = this.storage.isStageCleared(i);

      card.classList.toggle('locked', !isUnlocked);

      if (isCleared) {
        reward.textContent = '🟢 복구 완료';
        reward.className = 'stage-reward cleared';
      } else if (isUnlocked) {
        reward.textContent = '🟡 도전 가능';
        reward.className = 'stage-reward';
      } else {
        reward.textContent = '⚪ 잠김';
        reward.className = 'stage-reward';
      }

      // 카드 클릭 이벤트 (한 번만 바인딩되도록 교체)
      card.onclick = () => {
        if (this.storage.isStageUnlocked(i)) {
          this.sound.playClick();
          this.loadStage(i);
          this.showScreen('screen-game');
        } else {
          this.sound.playHitWall();
          alert('이전 단계를 먼저 클리어하여 에너지 코어를 복구해야 합니다!');
        }
      };
    }
  }

  // 스테이지 데이터 로드 및 초기화
  loadStage(stageId) {
    this.currentStageId = stageId;
    this.currentStage = STAGES_DATA.find(s => s.id === stageId);
    this.mirrors = [];
    this.activeMirror = null;
    this.hideMirrorPopup();
    this.currentHintIndex = 0;
    this.customSourceDir = null;

    // 캔버스 크기 그리드에 맞춤
    this.canvas.width = this.currentStage.cols * this.gridSize;
    this.canvas.height = this.currentStage.rows * this.gridSize;

    // 헤더 텍스트 갱신
    this.stageTitle.textContent = this.currentStage.title;
    this.stageGoal.textContent = this.currentStage.learningGoal;
    this.missionPrompt.textContent = this.currentStage.initialPrompt;

    // 컨트롤 영역 분기
    if (this.currentStage.source.allowDirChange) {
      // 1단계: 광원 방향 버튼 활성화
      this.sourceControls.classList.remove('hidden');
      this.mirrorControls.classList.add('hidden');
      this.customSourceDir = { ...this.currentStage.source.dir };
      this.resetDirButtons(this.customSourceDir);
    } else {
      // 2, 3단계: 거울 도구함 활성화
      this.sourceControls.classList.add('hidden');
      this.mirrorControls.classList.remove('hidden');
      this.updateMirrorInventoryBadge();
    }

    this.resetLaserAnimation();
    this.setFeedback(this.currentStage.initialPrompt, 'info');
  }

  // 방향 버튼 UI 초기화
  resetDirButtons(dir) {
    const dirButtons = document.querySelectorAll('.btn-dir');
    dirButtons.forEach(b => b.classList.remove('active'));
    let activeKey = 'right';
    if (dir.x === 0 && dir.y === -1) activeKey = 'up';
    else if (dir.x === 0 && dir.y === 1) activeKey = 'down';
    else if (dir.x === -1 && dir.y === 0) activeKey = 'left';

    const target = document.querySelector(`.btn-dir[data-dir="${activeKey}"]`);
    if (target) target.classList.add('active');
  }

  // 남은 거울 수 배지 업데이트
  updateMirrorInventoryBadge() {
    const placed = this.mirrors.length;
    const total = this.currentStage.availableMirrors;
    const remaining = total - placed;
    this.mirrorBadge.textContent = `${remaining}/${total}`;
  }

  // 현재 스테이지 리셋
  resetCurrentStage() {
    this.mirrors = [];
    this.activeMirror = null;
    this.hideMirrorPopup();
    if (this.currentStage.source.allowDirChange) {
      this.customSourceDir = { ...this.currentStage.source.dir };
      this.resetDirButtons(this.customSourceDir);
    }
    this.updateMirrorInventoryBadge();
    this.resetLaserAnimation();
  }

  // 광선 애니메이션 리셋
  resetLaserAnimation() {
    this.isFiring = false;
    this.animPath = [];
    this.animProgress = 0;
    this.lastTraceResult = null;
  }

  // 피드백 바 메시지 출력
  setFeedback(message, type = 'info') {
    this.feedbackText.textContent = message;
    this.feedbackBar.className = 'feedback-bar';
    if (type === 'success') {
      this.feedbackBar.classList.add('success');
      this.feedbackIcon.textContent = '✨';
    } else if (type === 'error') {
      this.feedbackBar.classList.add('error');
      this.feedbackIcon.textContent = '⚠️';
    } else {
      this.feedbackIcon.textContent = '💡';
    }
  }

  // =========================================================================
  // 사용자 인터랙션: 거울 배치 / 선택 / 팝업
  // =========================================================================

  handleCanvasClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    const clickX = (event.clientX - rect.left) * scaleX;
    const clickY = (event.clientY - rect.top) * scaleY;

    const gridX = Math.floor(clickX / this.gridSize);
    const gridY = Math.floor(clickY / this.gridSize);

    // 1. 이미 설치된 거울을 클릭했는지 검사
    const clickedMirror = this.mirrors.find(m => m.x === gridX && m.y === gridY);
    if (clickedMirror) {
      this.sound.playClick();
      this.showMirrorPopup(clickedMirror, event.clientX, event.clientY);
      return;
    }

    // 2. 비어 있는 설치 슬롯을 클릭했는지 검사
    const clickedSlot = this.currentStage.slots.find(s => s.x === gridX && s.y === gridY);
    if (clickedSlot) {
      this.hideMirrorPopup();
      // 거울 설치 시도
      if (this.mirrors.length < this.currentStage.availableMirrors) {
        this.sound.playRotate();
        // 거울 기본 각도: 135도 (대각선 ＼, 상향광선을 우측으로 90도 반사시키는 가장 표준 각도)
        const newMirror = { x: gridX, y: gridY, angle: 135 };
        this.mirrors.push(newMirror);
        this.updateMirrorInventoryBadge();
        this.resetLaserAnimation();
        this.setFeedback('거울을 배치했습니다. 거울을 다시 누르면 45도씩 회전하거나 회수할 수 있습니다.', 'info');
      } else {
        this.sound.playHitWall();
        this.setFeedback('사용 가능한 거울을 모두 배치했습니다! 기존 거울을 누르면 위치를 옮기거나 회전할 수 있습니다.', 'error');
      }
      return;
    }

    // 3. 빈 공간이나 벽 등을 클릭한 경우 팝업 닫기
    this.hideMirrorPopup();
  }

  // 거울 조작 팝업 표시
  showMirrorPopup(mirror, clientX, clientY) {
    this.activeMirror = mirror;
    const containerRect = this.canvas.parentElement.getBoundingClientRect();
    
    // 캔버스 내 픽셀 위치 기준 계산
    const cellCenterX = (mirror.x + 0.5) * (containerRect.width / this.currentStage.cols);
    const cellCenterY = (mirror.y + 0.5) * (containerRect.height / this.currentStage.rows);

    this.mirrorPopup.style.left = `${cellCenterX}px`;
    this.mirrorPopup.style.top = `${cellCenterY}px`;
    this.mirrorPopup.classList.remove('hidden');
  }

  hideMirrorPopup() {
    this.activeMirror = null;
    this.mirrorPopup.classList.add('hidden');
  }

  // 거울 회수
  removeMirror(mirror) {
    this.mirrors = this.mirrors.filter(m => m !== mirror);
    this.updateMirrorInventoryBadge();
  }

  // =========================================================================
  // 광선 발사 및 애니메이션 시뮬레이션
  // =========================================================================

  fireLight() {
    this.hideMirrorPopup();
    this.sound.playLaser();

    // 광학 엔진을 통해 정밀한 물리 시뮬레이션 광선 추적 수행
    const result = this.optics.traceLight(
      this.currentStage,
      this.mirrors,
      this.customSourceDir
    );

    this.lastTraceResult = result;
    this.animPath = result.path;
    this.animProgress = 0;
    this.isFiring = true;

    // 초기 피드백 바 안내
    this.setFeedback('광선이 진행 중입니다...', 'info');
  }

  // 광선이 끝까지 도달했을 때의 처리
  onLaserComplete() {
    this.isFiring = false;
    const res = this.lastTraceResult;
    if (!res) return;

    if (res.hitReceiver) {
      // 성공 처리
      this.sound.playSuccess();
      this.storage.clearStage(this.currentStageId);
      this.updateGlobalCoreIndicators();
      this.setFeedback(res.hitReason, 'success');

      // 성공 모달 표시 (0.4초 후)
      setTimeout(() => {
        this.showSuccessModal();
      }, 400);
    } else {
      // 실패 처리
      this.sound.playHitWall();
      this.setFeedback(res.hitReason, 'error');
    }
  }

  // 스파크 파티클 추가 함수
  spawnSparks(x, y, color = '#ffe600') {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.5;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color
      });
    }
  }

  // =========================================================================
  // 모달 제어 시스템
  // =========================================================================

  showSuccessModal() {
    const modal = this.modals.success;
    document.getElementById('modal-stage-title').textContent = `${this.currentStage.title} 클리어!`;
    document.getElementById('modal-core-desc').textContent = `도시의 에너지 코어 ${this.currentStageId}개가 정상 작동하기 시작했습니다.`;
    document.getElementById('modal-science-text').textContent = this.currentStage.successExplanation;
    modal.classList.remove('hidden');
  }

  showCompleteModal() {
    this.modals.complete.classList.remove('hidden');
  }

  showHintModal() {
    this.currentHintIndex = 0;
    this.updateHintModalContent();
    this.modals.hint.classList.remove('hidden');
  }

  updateHintModalContent() {
    const hints = this.currentStage.hints;
    if (this.currentHintIndex >= hints.length) {
      this.currentHintIndex = 0;
    }
    document.getElementById('hint-stage-name').textContent = `${this.currentStage.title} - 탐구 힌트`;
    document.getElementById('hint-content-text').textContent = hints[this.currentHintIndex];
    document.getElementById('hint-step-indicator').textContent = `힌트 ${this.currentHintIndex + 1}/${hints.length}`;
  }

  // =========================================================================
  // 렌더링 파이프라인 (Canvas 2D Rendering)
  // =========================================================================

  renderLoop(timestamp) {
    const dt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    this.update(dt);
    this.render();

    requestAnimationFrame(this.renderLoop);
  }

  // 물리 및 애니메이션 상태 업데이트
  update(dt) {
    // 1. 광선 진행 애니메이션
    if (this.isFiring && this.animPath.length > 1) {
      const speed = 7.5; // 애니메이션 진행 속도 (세그먼트/초)
      const prevProgress = this.animProgress;
      this.animProgress += speed * dt;

      // 정점(거울/벽 충돌)을 통과하는 순간 효과음 및 파티클 발생
      const prevIdx = Math.floor(prevProgress);
      const currIdx = Math.floor(this.animProgress);
      if (currIdx > prevIdx && currIdx < this.animPath.length) {
        const hitPt = this.animPath[currIdx];
        this.spawnSparks(hitPt.x, hitPt.y);
        // 반사음 재생
        this.sound.playReflect(currIdx - 1);
      }

      // 애니메이션 완료 검사
      if (this.animProgress >= this.animPath.length - 1) {
        this.animProgress = this.animPath.length - 1;
        this.onLaserComplete();
      }
    }

    // 2. 파티클 수명 업데이트
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt * 2.5;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  // 전체 화면 렌더링
  render() {
    if (!this.currentStage) return;

    const ctx = this.ctx;
    const S = this.gridSize;

    // 1. 캔버스 클리어 및 배경 격자 그리기
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.renderGrid(ctx, S);

    // 2. 거울 설치 슬롯 그리기
    this.renderSlots(ctx, S);

    // 3. 고정 장애물 벽 그리기
    this.renderWalls(ctx, S);

    // 4. 수신기(에너지 코어) 그리기
    this.renderReceiver(ctx, S);

    // 5. 광원(발사대) 그리기
    this.renderSource(ctx, S);

    // 6. 플레이어가 설치한 거울 그리기
    this.renderMirrors(ctx, S);

    // 7. 광선(Laser Beam) 그리기
    this.renderLaser(ctx);

    // 8. 법선·각도 관찰기 오버레이 그리기 (활성화 시)
    if (this.isObserverOn && this.lastTraceResult && this.lastTraceResult.reflections.length > 0) {
      this.renderObserverOverlay(ctx);
    }

    // 9. 파티클 그리기
    this.renderParticles(ctx);
  }

  // 배경 격자(Grid)
  renderGrid(ctx, S) {
    ctx.strokeStyle = '#152142';
    ctx.lineWidth = 1;
    for (let x = 0; x <= this.canvas.width; x += S) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= this.canvas.height; y += S) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.canvas.width, y);
      ctx.stroke();
    }
  }

  // 거울 설치 슬롯 (점선 박스)
  renderSlots(ctx, S) {
    this.currentStage.slots.forEach(slot => {
      // 이미 거울이 설치된 슬롯은 은은한 표시만
      const isOccupied = this.mirrors.some(m => m.x === slot.x && m.y === slot.y);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = isOccupied ? '#1f345c' : '#00f0ff';
      ctx.lineWidth = isOccupied ? 1 : 1.5;
      ctx.strokeRect(slot.x * S + 4, slot.y * S + 4, S - 8, S - 8);

      if (!isOccupied) {
        ctx.fillStyle = 'rgba(0, 240, 255, 0.05)';
        ctx.fillRect(slot.x * S + 4, slot.y * S + 4, S - 8, S - 8);
        ctx.fillStyle = '#00f0ff';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('거울 슬롯', (slot.x + 0.5) * S, (slot.y + 0.5) * S);
      }
      ctx.restore();
    });
  }

  // 벽 (장애물 메탈 블록)
  renderWalls(ctx, S) {
    this.currentStage.walls.forEach(w => {
      const px = w.x * S;
      const py = w.y * S;

      // 블록 본체
      ctx.fillStyle = '#243254';
      ctx.fillRect(px + 1, py + 1, S - 2, S - 2);

      // 입체 테두리
      ctx.strokeStyle = '#3e5284';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 2, py + 2, S - 4, S - 4);

      // 경고 패턴 사선
      ctx.strokeStyle = '#1b2642';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px + 4, py + S - 4);
      ctx.lineTo(px + S - 4, py + 4);
      ctx.stroke();
    });
  }

  // 수신기 (에너지 코어)
  renderReceiver(ctx, S) {
    const rx = (this.currentStage.receiver.x + 0.5) * S;
    const ry = (this.currentStage.receiver.y + 0.5) * S;
    const radius = S * 0.35;
    const isCleared = this.storage.isStageCleared(this.currentStageId);

    ctx.save();
    // 외곽 지지 링
    ctx.strokeStyle = isCleared ? '#00f0ff' : '#475569';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(rx, ry, radius, 0, Math.PI * 2);
    ctx.stroke();

    // 코어 중심 발광 구체
    const grad = ctx.createRadialGradient(rx, ry, 2, rx, ry, radius);
    if (isCleared) {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.5, '#00f0ff');
      grad.addColorStop(1, '#006699');
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 16;
    } else {
      grad.addColorStop(0, '#334155');
      grad.addColorStop(0.7, '#1e293b');
      grad.addColorStop(1, '#0f172a');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(rx, ry, radius - 2, 0, Math.PI * 2);
    ctx.fill();

    // 수신기 텍스트
    ctx.fillStyle = isCleared ? '#ffffff' : '#94a3b8';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('코어', rx, ry);
    ctx.restore();
  }

  // 광원 (레이저 발사 노즐)
  renderSource(ctx, S) {
    const sx = (this.currentStage.source.x + 0.5) * S;
    const sy = (this.currentStage.source.y + 0.5) * S;
    const dir = this.customSourceDir || this.currentStage.source.dir;

    ctx.save();
    // 발사기 베이스
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(sx, sy, S * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 발사 노즐 방향 가이드 화살표
    const arrowLen = S * 0.38;
    const tipX = sx + dir.x * arrowLen;
    const tipY = sy + dir.y * arrowLen;

    ctx.strokeStyle = '#ffe600';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // 발사대 중앙 표시
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 설치된 회전 거울
  renderMirrors(ctx, S) {
    this.mirrors.forEach(mirror => {
      const seg = this.optics.getMirrorSegment(mirror);
      const isSelected = (this.activeMirror === mirror);

      ctx.save();
      // 선택 시 하이라이트 원형 배경
      if (isSelected) {
        ctx.fillStyle = 'rgba(0, 240, 255, 0.2)';
        ctx.beginPath();
        ctx.arc((mirror.x + 0.5) * S, (mirror.y + 0.5) * S, S * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }

      // 거울 뒷면(지지대)
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(seg.p1.x, seg.p1.y);
      ctx.lineTo(seg.p2.x, seg.p2.y);
      ctx.stroke();

      // 거울 앞면(선명한 청록색 반사면)
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(seg.p1.x, seg.p1.y);
      ctx.lineTo(seg.p2.x, seg.p2.y);
      ctx.stroke();

      // 거울 각도 표시 텍스트
      ctx.fillStyle = '#00f0ff';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${mirror.angle}°`, (mirror.x + 0.5) * S, mirror.y * S + 12);
      ctx.restore();
    });
  }

  // 광선 빔 그리기
  renderLaser(ctx) {
    if (this.animPath.length < 2) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 완성된 세그먼트와 현재 진행 중인 세그먼트 그리기
    const fullSegments = Math.floor(this.animProgress);
    const partialT = this.animProgress - fullSegments;

    ctx.beginPath();
    ctx.moveTo(this.animPath[0].x, this.animPath[0].y);

    for (let i = 1; i <= fullSegments; i++) {
      ctx.lineTo(this.animPath[i].x, this.animPath[i].y);
    }

    if (fullSegments < this.animPath.length - 1) {
      const pA = this.animPath[fullSegments];
      const pB = this.animPath[fullSegments + 1];
      const curX = pA.x + (pB.x - pA.x) * partialT;
      const curY = pA.y + (pB.y - pA.y) * partialT;
      ctx.lineTo(curX, curY);
    }

    // 외부 글로우(Glow) 레이어
    ctx.strokeStyle = 'rgba(255, 230, 0, 0.4)';
    ctx.lineWidth = 8;
    ctx.shadowColor = '#ffe600';
    ctx.shadowBlur = 14;
    ctx.stroke();

    // 중심 코어 고휘도 레이어
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 0;
    ctx.stroke();

    ctx.restore();
  }

  // =========================================================================
  // 과학 시각화: 법선·각도 관찰기 오버레이 (Observer Mode)
  // =========================================================================

  renderObserverOverlay(ctx) {
    const reflections = this.lastTraceResult.reflections;
    reflections.forEach((ref, index) => {
      const hitPt = ref.point;
      const nVis = ref.normalVisual;

      ctx.save();

      // 1. 법선(Normal) 점선 렌더링
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#38bdf8'; // 스카이블루 점선
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(nVis.p1.x, nVis.p1.y);
      ctx.lineTo(nVis.p2.x, nVis.p2.y);
      ctx.stroke();

      // 법선 레이블 "법선(Normal)" 표시
      ctx.setLineDash([]);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('법선(기준선)', nVis.p1.x, nVis.p1.y - 6);

      // 2. 직각 표시 (거울 면과 법선이 90도임을 직관적으로 표시)
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(hitPt.x, hitPt.y, 3, 0, Math.PI * 2);
      ctx.fill();

      // 3. 입사각 및 반사각 호(Arc)와 각도 수치 표시
      const arcRadius = 24;
      // 법선의 방향 각도
      const normalAngle = Math.atan2(ref.normal.y, ref.normal.x);
      // 입사광이 들어온 방향 (hitPt 기준 역방향)
      const incomingAngle = Math.atan2(-ref.incomingDir.y, -ref.incomingDir.x);
      // 반사광이 나가는 방향
      const reflectAngle = Math.atan2(ref.reflectDir.y, ref.reflectDir.x);

      // 입사각 호 (보라색 계열)
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hitPt.x, hitPt.y, arcRadius, normalAngle, incomingAngle, (normalAngle > incomingAngle));
      ctx.stroke();

      // 반사각 호 (연두색 계열)
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hitPt.x, hitPt.y, arcRadius, normalAngle, reflectAngle, (normalAngle > reflectAngle));
      ctx.stroke();

      // 각도 값 텍스트 렌더링 (법선 기준)
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = '#c084fc';
      ctx.fillText(`입사각 ${ref.incidentAngle}°`, hitPt.x - 30, hitPt.y - 28);
      ctx.fillStyle = '#4ade80';
      ctx.fillText(`반사각 ${ref.reflectionAngle}°`, hitPt.x + 30, hitPt.y - 28);

      // 법선 기준 설명 캡션
      ctx.fillStyle = '#fef08a';
      ctx.font = '10px sans-serif';
      ctx.fillText(`(입사각 ${ref.incidentAngle}° = 반사각 ${ref.reflectionAngle}°)`, hitPt.x, hitPt.y + 26);

      ctx.restore();
    });
  }

  // 스파크 파티클 렌더링
  renderParticles(ctx) {
    this.particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
}

// 브라우저 DOM 로드 완료 시 게임 인스턴스 시작
window.addEventListener('DOMContentLoaded', () => {
  window.gameApp = new LightMazeGame();
});
