/**
 * [game.js - 메인 게임 컨트롤러 및 캔버스 렌더러]
 * 이 스크립트는 게임의 흐름(화면 전환, 사용자 터치/클릭 입력, 거울 배치/회전/회수,
 * 광선 발사 애니메이션, 흡수/센서/수신기 시각화, 법선·각도 관찰기, 모달 제어)을 총괄합니다.
 * 1~10단계 및 4개 구역 전체를 유기적으로 통합 지원합니다.
 */

class LightMazeGame {
  constructor() {
    // 1. 하위 시스템 초기화
    this.storage = new StorageManager();
    this.sound = new SoundEffects(this.storage);
    this.optics = new OpticsEngine({ gridSize: 56, maxBounces: 30 });

    // 2. 캔버스 및 그래픽 컨텍스트
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.gridSize = 56;

    // 3. 현재 게임 상태 변수
    this.currentStageId = 1;
    this.currentStage = null;
    this.mirrors = [];             // 현재 배치된 거울 목록 [{ x, y, angle }]
    this.selectedTool = 'mirror';  // 선택된 도구 ('mirror')
    this.customSourceDir = null;   // 1단계 플레이어 지정 광원 방향 {x, y}
    this.isObserverOn = false;     // 법선·각도 관찰기 켜짐 여부
    this.isFiring = false;         // 광선 발사 애니메이션 진행 중 여부
    this.currentHintIndex = 0;     // 현재 열람 중인 힌트 인덱스 (0~2)
    this.activeMirror = null;      // 현재 클릭되어 조작 중인 거울
    this.litReceivers = [];        // 9~10단계에서 현재 켜진 수신기 ID 목록

    // 광선 애니메이션 데이터
    this.animPath = [];
    this.animProgress = 0;
    this.lastTraceResult = null;
    this.particles = [];           // 스파크 및 충돌 이펙트 파티클들
    this.absorbEffectPoint = null; // 흡수 패널 충돌 시각 효과 위치

    // 4. DOM 요소 캐싱
    this.cacheDomElements();

    // 5. 이벤트 리스너 등록 및 초기 화면 설정
    this.bindEvents();
    this.updateAudioButtonState();
    this.updateGlobalCoreIndicators();
    this.showScreen('screen-intro');

    // 6. 메인 렌더링 루프 시작
    this.lastTimestamp = performance.now();
    this.renderLoop = this.renderLoop.bind(this);
    requestAnimationFrame(this.renderLoop);
  }

  // 사운드 안전 호출 헬퍼
  safeSound(methodName, ...args) {
    if (this.sound && typeof this.sound[methodName] === 'function') {
      try {
        this.sound[methodName](...args);
      } catch (e) {
        console.warn(`사운드 ${methodName} 재생 중 오류 (게임 계속 진행):`, e);
      }
    }
  }

  // DOM 요소 캐싱
  cacheDomElements() {
    this.screens = {
      intro: document.getElementById('screen-intro'),
      stages: document.getElementById('screen-stages'),
      game: document.getElementById('screen-game')
    };

    this.modals = {
      success: document.getElementById('modal-success'),
      complete: document.getElementById('modal-complete'),
      hint: document.getElementById('modal-hint'),
      confirmReset: document.getElementById('modal-confirm-reset')
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
    this.mirrorPopupTitle = this.mirrorPopup ? this.mirrorPopup.querySelector('.popup-title') : null;

    // 컨트롤 패널
    this.sourceControls = document.getElementById('source-dir-controls');
    this.mirrorControls = document.getElementById('mirror-inventory-controls');
    this.mirrorBadge = document.getElementById('mirror-count-badge');
    this.observerText = document.getElementById('observer-state-text');
    this.btnObserver = document.getElementById('btn-toggle-observer');

    // 대시보드 컨테이너
    this.headerDashboard = document.getElementById('header-core-dashboard');
    this.introCoreGrid = document.getElementById('intro-core-grid');
    this.introCoreCount = document.getElementById('intro-core-count');
    this.stageSelectContainer = document.getElementById('stage-select-container');
    this.stageSelectCoreCount = document.getElementById('stage-select-core-count');

    // 배지
    this.badgeArchitect = document.getElementById('badge-architect');
    this.badgeMaster = document.getElementById('badge-master');
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

    if (screenId === 'screen-intro') {
      this.updateIntroScreen();
    } else if (screenId === 'screen-stages') {
      this.renderStageSelectList();
    }
  }

  // 10개 코어 대시보드 헤더 및 인트로 갱신
  updateGlobalCoreIndicators() {
    const coresCount = this.storage.getCoresCount();

    // 1. 헤더 코어 10개 핀 렌더링
    if (this.headerDashboard) {
      this.headerDashboard.innerHTML = '';
      for (let i = 1; i <= 10; i++) {
        const pin = document.createElement('div');
        pin.className = 'core-pin' + (this.storage.isStageCleared(i) ? ' lit' : '');
        pin.title = `${i}단계 코어: ${this.storage.isStageCleared(i) ? '복구 완료' : '미복구'}`;
        pin.innerHTML = `<span>${i}</span>`;
        this.headerDashboard.appendChild(pin);
      }
    }

    // 2. 인트로 화면 10개 코어 그리드
    if (this.introCoreGrid) {
      this.introCoreGrid.innerHTML = '';
      for (let i = 1; i <= 10; i++) {
        const isLit = this.storage.isStageCleared(i);
        const item = document.createElement('div');
        item.className = 'intro-core-cell' + (isLit ? ' lit' : '');
        item.innerHTML = `
          <div class="gem-circle">${isLit ? '💎' : '⚪'}</div>
          <span class="cell-label">${i}번 코어</span>
        `;
        this.introCoreGrid.appendChild(item);
      }
    }

    if (this.introCoreCount) {
      this.introCoreCount.textContent = coresCount;
    }
    if (this.stageSelectCoreCount) {
      this.stageSelectCoreCount.textContent = coresCount;
    }

    // 3. 배지 전시함 갱신
    if (this.badgeArchitect) {
      if (this.storage.hasBadge('opticalArchitect')) {
        this.badgeArchitect.classList.remove('locked');
        this.badgeArchitect.classList.add('unlocked');
      } else {
        this.badgeArchitect.classList.add('locked');
        this.badgeArchitect.classList.remove('unlocked');
      }
    }
    if (this.badgeMaster) {
      if (this.storage.hasBadge('mazeMaster')) {
        this.badgeMaster.classList.remove('locked');
        this.badgeMaster.classList.add('unlocked');
      } else {
        this.badgeMaster.classList.add('locked');
        this.badgeMaster.classList.remove('unlocked');
      }
    }
  }

  // 인트로 화면 갱신
  updateIntroScreen() {
    this.updateGlobalCoreIndicators();
  }

  // 4개 구역 구분 스테이지 선택 화면 동적 렌더링
  renderStageSelectList() {
    if (!this.stageSelectContainer) return;
    this.stageSelectContainer.innerHTML = '';
    this.updateGlobalCoreIndicators();

    const zones = [
      { name: "제1구역: 광학 연구소", range: [1, 3], icon: "🔬", desc: "빛의 직진과 1~2회 기본 반사의 원리를 마스터합니다." },
      { name: "제2구역: 지하 에너지 통로", range: [4, 6], icon: "⚡", desc: "꺾인 통로, 체크포인트 센서, 흡수 패널을 우회합니다." },
      { name: "제3구역: 중앙 제어 구역", range: [7, 9], icon: "🎛️", desc: "최소 거울 작전(배지), 센서 순서(A->B), 다중 코어를 해결합니다." },
      { name: "제4구역: 도시의 중심 코어", range: [10, 10], icon: "🏙️", desc: "변환 체크포인트를 거쳐 3개의 중심 코어를 모두 밝힙니다." }
    ];

    zones.forEach(zone => {
      const zoneSection = document.createElement('div');
      zoneSection.className = 'zone-section';

      const zoneHeader = document.createElement('div');
      zoneHeader.className = 'zone-header';
      zoneHeader.innerHTML = `
        <span class="zone-icon">${zone.icon}</span>
        <div class="zone-info">
          <h3>${zone.name}</h3>
          <p>${zone.desc}</p>
        </div>
      `;
      zoneSection.appendChild(zoneHeader);

      const grid = document.createElement('div');
      grid.className = 'zone-stages-grid';

      for (let sId = zone.range[0]; sId <= zone.range[1]; sId++) {
        const stage = STAGES_DATA.find(s => s.id === sId);
        if (!stage) continue;

        const isUnlocked = this.storage.isStageUnlocked(sId);
        const isCleared = this.storage.isStageCleared(sId);

        const card = document.createElement('div');
        card.className = `stage-card ${isUnlocked ? '' : 'locked'} ${isCleared ? 'cleared' : ''}`;
        card.dataset.stage = sId;

        card.innerHTML = `
          <div class="stage-status-icon">${isCleared ? '💎' : (isUnlocked ? '🔓' : '🔒')}</div>
          <div class="stage-card-body">
            <div class="stage-badge-small">${sId}단계</div>
            <h4 class="stage-card-title">${stage.title.split(': ')[1] || stage.title}</h4>
            <p class="stage-card-desc">${stage.subtitle}</p>
          </div>
          <div class="stage-reward-badge">${isCleared ? '✅ 복구됨' : (isUnlocked ? '도전 가능' : '잠김')}</div>
        `;

        if (isUnlocked) {
          card.addEventListener('click', () => {
            this.safeSound('playClick');
            this.loadStage(sId);
            this.showScreen('screen-game');
          });
        }

        grid.appendChild(card);
      }

      zoneSection.appendChild(grid);
      this.stageSelectContainer.appendChild(zoneSection);
    });
  }

  // 이벤트 리스너 등록
  bindEvents() {
    // 네비게이션
    document.getElementById('btn-start-game').addEventListener('click', () => {
      this.safeSound('playClick');
      const stageToPlay = Math.min(this.storage.memoryStore.unlockedStage, 10);
      this.loadStage(stageToPlay);
      this.showScreen('screen-game');
    });

    document.getElementById('btn-show-stages').addEventListener('click', () => {
      this.safeSound('playClick');
      this.showScreen('screen-stages');
    });

    document.getElementById('btn-back-to-intro').addEventListener('click', () => {
      this.safeSound('playClick');
      this.showScreen('screen-intro');
    });

    document.getElementById('btn-nav-stages').addEventListener('click', () => {
      this.safeSound('playClick');
      this.showScreen('screen-stages');
    });

    // 음소거
    document.getElementById('btn-toggle-sound').addEventListener('click', () => {
      const isMuted = this.sound.toggleMute();
      this.updateAudioButtonState();
      if (!isMuted) this.safeSound('playClick');
    });

    // 1단계 광원 방향 선택
    const dirButtons = document.querySelectorAll('.btn-dir');
    dirButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.isFiring) return;
        this.safeSound('playClick');
        dirButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const dirType = btn.dataset.dir;
        if (dirType === 'up') this.customSourceDir = { x: 0, y: -1 };
        else if (dirType === 'down') this.customSourceDir = { x: 0, y: 1 };
        else if (dirType === 'left') this.customSourceDir = { x: -1, y: 0 };
        else if (dirType === 'right') this.customSourceDir = { x: 1, y: 0 };

        this.setFeedback('광원 발사 방향이 변경되었습니다. [⚡ 빛 발사]를 눌러보세요.', 'info');
      });
    });

    // 액션 버튼: 발사
    document.getElementById('btn-fire-light').addEventListener('click', () => {
      if (this.isFiring) return;
      this.fireLight();
    });

    // 액션 버튼: 관찰기 토글
    document.getElementById('btn-toggle-observer').addEventListener('click', () => {
      this.safeSound('playClick');
      this.isObserverOn = !this.isObserverOn;
      this.updateObserverButtonState();
      if (this.isObserverOn) {
        this.setFeedback('🔬 관찰기가 켜졌습니다. 거울 충돌 지점의 법선(점선)과 입사각·반사각 크기를 확인해 보세요!', 'info');
      } else {
        this.setFeedback('관찰기가 꺼졌습니다.', 'info');
      }
    });

    // 액션 버튼: 힌트
    document.getElementById('btn-hint').addEventListener('click', () => {
      this.safeSound('playClick');
      this.openHintModal();
    });

    // 액션 버튼: 단계 초기화 (점등 상태 및 배치 초기화)
    document.getElementById('btn-reset-stage').addEventListener('click', () => {
      if (this.isFiring) return;
      this.safeSound('playClick');
      this.resetCurrentStage();
      this.setFeedback('배치와 점등 상태가 초기 상태로 리셋되었습니다. 다시 도전해 보세요!', 'info');
    });

    // 거울 조작 팝업 버튼들
    document.getElementById('btn-popup-rotate-ccw').addEventListener('click', () => {
      if (this.isFiring || !this.activeMirror) return;
      this.safeSound('playRotate');
      this.rotateMirror(this.activeMirror, -45);
    });

    document.getElementById('btn-popup-rotate-cw').addEventListener('click', () => {
      if (this.isFiring || !this.activeMirror) return;
      this.safeSound('playRotate');
      this.rotateMirror(this.activeMirror, 45);
    });

    document.getElementById('btn-popup-remove').addEventListener('click', () => {
      if (this.isFiring || !this.activeMirror) return;
      this.safeSound('playRemove');
      this.removeMirror(this.activeMirror);
      this.hideMirrorPopup();
    });

    // 모달 버튼들: 단계 성공 모달
    document.getElementById('btn-modal-next').addEventListener('click', () => {
      this.safeSound('playClick');
      this.closeModal('success');
      if (this.currentStageId < 10) {
        this.loadStage(this.currentStageId + 1);
      } else {
        this.showScreen('screen-stages');
      }
    });

    document.getElementById('btn-modal-replay').addEventListener('click', () => {
      this.safeSound('playClick');
      this.closeModal('success');
    });

    // 최종 엔딩 모달 버튼들
    document.getElementById('btn-complete-stages').addEventListener('click', () => {
      this.safeSound('playClick');
      this.closeModal('complete');
      this.showScreen('screen-stages');
    });

    document.getElementById('btn-complete-restart').addEventListener('click', () => {
      this.safeSound('playClick');
      this.closeModal('complete');
      this.loadStage(1);
    });

    // 힌트 모달 버튼들
    document.getElementById('btn-next-hint').addEventListener('click', () => {
      this.safeSound('playClick');
      if (!this.currentStage || !this.currentStage.hints) return;
      this.currentHintIndex = (this.currentHintIndex + 1) % this.currentStage.hints.length;
      this.updateHintModalContent();
    });

    document.getElementById('btn-close-hint').addEventListener('click', () => {
      this.safeSound('playClick');
      this.closeModal('hint');
    });

    // 세이브 데이터 전체 초기화 모달
    document.getElementById('btn-reset-saved-data').addEventListener('click', () => {
      this.safeSound('playClick');
      this.openModal('confirmReset');
    });

    document.getElementById('btn-confirm-reset-yes').addEventListener('click', () => {
      this.safeSound('playClick');
      this.storage.resetAll();
      this.closeModal('confirmReset');
      this.updateGlobalCoreIndicators();
      this.setFeedback('모든 진행 상황과 배지가 초기화되었습니다.', 'info');
    });

    document.getElementById('btn-confirm-reset-cancel').addEventListener('click', () => {
      this.safeSound('playClick');
      this.closeModal('confirmReset');
    });

    // 캔버스 인터랙션 (클릭 / 터치)
    this.canvas.addEventListener('pointerdown', (e) => this.handleCanvasPointerDown(e));
  }

  // 캔버스 크기 맞춤 및 반응형 스케일 계산
  resizeCanvasForStage(stage) {
    const desiredWidth = stage.cols * this.gridSize;
    const desiredHeight = stage.rows * this.gridSize;
    this.canvas.width = desiredWidth;
    this.canvas.height = desiredHeight;
  }

  // 특정 스테이지 불러오기
  loadStage(stageId) {
    const stage = STAGES_DATA.find(s => s.id === stageId);
    if (!stage) return;

    this.currentStageId = stageId;
    this.currentStage = stage;
    this.mirrors = [];
    this.litReceivers = [];
    this.animPath = [];
    this.animProgress = 0;
    this.lastTraceResult = null;
    this.absorbEffectPoint = null;
    this.customSourceDir = stage.source.allowDirChange ? { ...stage.source.dir } : null;
    this.currentHintIndex = 0;
    this.activeMirror = null;
    this.isFiring = false;
    this.hideMirrorPopup();

    this.resizeCanvasForStage(stage);

    // UI 헤더 정보 업데이트
    this.stageTitle.textContent = stage.title;
    this.stageGoal.textContent = stage.learningGoal || stage.subtitle;
    this.missionPrompt.textContent = stage.initialPrompt || stage.description;
    this.setFeedback('거울을 슬롯에 배치하거나 [⚡ 빛 발사]를 눌러보세요.', 'info');

    // 컨트롤 패널 분기 (1단계는 방향 선택, 2~10단계는 거울 도구함)
    if (stage.source.allowDirChange) {
      this.sourceControls.classList.remove('hidden');
      this.mirrorControls.classList.add('hidden');
    } else {
      this.sourceControls.classList.add('hidden');
      this.mirrorControls.classList.remove('hidden');
      this.updateMirrorInventoryBadge();
    }

    this.updateGlobalCoreIndicators();
  }

  // 현재 스테이지 초기화
  resetCurrentStage() {
    this.mirrors = [];
    this.litReceivers = [];
    this.animPath = [];
    this.animProgress = 0;
    this.lastTraceResult = null;
    this.absorbEffectPoint = null;
    this.activeMirror = null;
    this.isFiring = false;
    this.hideMirrorPopup();
    this.updateMirrorInventoryBadge();
  }

  // 도구함 잔여 거울 개수 배지 업데이트
  updateMirrorInventoryBadge() {
    if (!this.currentStage) return;
    const used = this.mirrors.length;
    const total = this.currentStage.availableMirrors;
    this.mirrorBadge.textContent = `${used}/${total}`;
    if (used >= total) {
      this.mirrorBadge.classList.add('full');
    } else {
      this.mirrorBadge.classList.remove('full');
    }
  }

  // 캔버스 클릭/터치 입력 처리
  handleCanvasPointerDown(e) {
    if (this.isFiring) return; // 발사 애니메이션 중 조작 차단

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;

    const gx = Math.floor(px / this.gridSize);
    const gy = Math.floor(py / this.gridSize);

    // 1. 이미 설치된 거울을 클릭했는지 확인
    const clickedMirror = this.mirrors.find(m => m.x === gx && m.y === gy);
    if (clickedMirror) {
      this.safeSound('playClick');
      this.showMirrorPopup(clickedMirror);
      return;
    }

    // 2. 거울 팝업이 열려 있는 상태에서 다른 곳 클릭 시 팝업 닫기
    this.hideMirrorPopup();

    // 3. 거울 설치 가능 슬롯을 클릭했는지 확인
    const isSlot = this.currentStage.slots && this.currentStage.slots.some(s => s.x === gx && s.y === gy);
    if (isSlot) {
      // 거울 잔여 수량 확인
      if (this.mirrors.length >= this.currentStage.availableMirrors) {
        this.safeSound('playError');
        this.setFeedback(`더 이상 거울을 설치할 수 없습니다! (최대 ${this.currentStage.availableMirrors}개)`, 'warning');
        return;
      }

      // 새 거울 설치 (기본 각도 135도)
      const newMirror = { x: gx, y: gy, angle: 135 };
      this.mirrors.push(newMirror);
      this.safeSound('playPlace');
      this.updateMirrorInventoryBadge();
      this.setFeedback(`거울이 (${gx}, ${gy})에 설치되었습니다. 거울을 눌러 회전시키거나 회수할 수 있습니다.`, 'success');

      // 설치 직후 거울 칸을 가리지 않게 위/옆으로 띄운 조작 팝업 출력
      this.showMirrorPopup(newMirror);
    }
  }

  // 거울 회전
  rotateMirror(mirror, deltaDeg) {
    mirror.angle = (mirror.angle + deltaDeg + 360) % 180; // 0, 45, 90, 135도 순환
    if (this.mirrorPopupTitle) {
      this.mirrorPopupTitle.textContent = `거울 조작 (${mirror.angle}°)`;
    }
    this.setFeedback(`거울 각도가 ${mirror.angle}° 로 회전되었습니다.`, 'info');
  }

  // 거울 회수
  removeMirror(mirror) {
    this.mirrors = this.mirrors.filter(m => m !== mirror);
    this.updateMirrorInventoryBadge();
    this.setFeedback('거울을 도구함으로 회수했습니다.', 'info');
  }

  /**
   * 거울 조작 팝업 표시
   * 사용자의 요청에 따라 바닥의 실제 거울 위치를 전혀 가리지 않도록
   * 거울 칸 바깥쪽(위쪽 또는 옆쪽)으로 넉넉하게 띄워서 배치합니다.
   */
  showMirrorPopup(mirror) {
    this.activeMirror = mirror;
    this.mirrorPopup.classList.remove('hidden');

    if (this.mirrorPopupTitle) {
      this.mirrorPopupTitle.textContent = `거울 조작 (${mirror.angle}°)`;
    }

    const containerRect = this.canvas.parentElement.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / this.canvas.width;
    const scaleY = canvasRect.height / this.canvas.height;

    // 거울 칸의 캔버스 화면 기준 중심 좌표
    const mirrorCenterX = (mirror.x + 0.5) * this.gridSize * scaleX + (canvasRect.left - containerRect.left);
    const mirrorCenterY = (mirror.y + 0.5) * this.gridSize * scaleY + (canvasRect.top - containerRect.top);
    const halfCellH = (this.gridSize * scaleY) / 2;
    const halfCellW = (this.gridSize * scaleX) / 2;

    const popupWidth = 180;
    const popupHeight = 72;

    // 기본 배치: 거울 칸 위쪽으로 넉넉히 15px 띄움 (거울을 100% 가리지 않음)
    let popupX = mirrorCenterX - popupWidth / 2;
    let popupY = mirrorCenterY - halfCellH - popupHeight - 14;

    // 위쪽 공간이 부족할 때 (1행 또는 2행 상단): 옆쪽 또는 아래쪽으로 지능적 우회
    if (popupY < 8) {
      // 1. 오른쪽 옆으로 띄우기
      if (mirrorCenterX + halfCellW + popupWidth + 14 < containerRect.width) {
        popupX = mirrorCenterX + halfCellW + 14;
        popupY = mirrorCenterY - popupHeight / 2;
      }
      // 2. 왼쪽 옆으로 띄우기
      else if (mirrorCenterX - halfCellW - popupWidth - 14 > 8) {
        popupX = mirrorCenterX - halfCellW - popupWidth - 14;
        popupY = mirrorCenterY - popupHeight / 2;
      }
      // 3. 아래쪽으로 넉넉히 띄우기
      else {
        popupX = mirrorCenterX - popupWidth / 2;
        popupY = mirrorCenterY + halfCellH + 14;
      }
    }

    // 컨테이너 경계선 클리핑 방지
    popupX = Math.max(8, Math.min(containerRect.width - popupWidth - 8, popupX));
    popupY = Math.max(8, Math.min(containerRect.height - popupHeight - 8, popupY));

    this.mirrorPopup.style.left = `${popupX}px`;
    this.mirrorPopup.style.top = `${popupY}px`;
  }

  hideMirrorPopup() {
    this.activeMirror = null;
    this.mirrorPopup.classList.add('hidden');
  }

  // =========================================================================
  // 광선 발사 로직
  // =========================================================================
  fireLight() {
    if (!this.currentStage) return;
    this.hideMirrorPopup();
    this.isFiring = true;
    this.safeSound('playLaserFire');

    // 물리 엔진을 통한 경로 및 충돌 계산
    const traceResult = this.optics.traceLight(
      this.currentStage,
      this.mirrors,
      this.customSourceDir,
      this.litReceivers
    );
    this.lastTraceResult = traceResult;

    // 실시간 애니메이션 세그먼트 생성
    this.animPath = traceResult.path || [];
    this.animProgress = 0;
    this.absorbEffectPoint = traceResult.absorberHitPoint;

    // 미션 종합 평가 (성공/실패)
    const evaluation = this.optics.evaluateStageCompletion(
      this.currentStage,
      traceResult,
      this.litReceivers,
      this.mirrors.length
    );
    this.evaluation = evaluation;

    this.setFeedback('광선이 진행 중입니다...', 'info');

    // 예외 안전 처리: 경로 세그먼트가 1개 이하이면 즉시 종료 처리
    if (this.animPath.length <= 1) {
      this.onLaserAnimationEnd();
    }
  }

  // 광선 발사 애니메이션 완료 후 처리
  onLaserAnimationEnd() {
    this.isFiring = false;
    const evalResult = this.evaluation;
    if (!evalResult) return;

    if (evalResult.success) {
      this.safeSound('playSuccess');

      // 새로운 수신기 점등 시 목록에 추가
      if (evalResult.newlyLitReceiverId && !this.litReceivers.includes(evalResult.newlyLitReceiverId)) {
        this.litReceivers.push(evalResult.newlyLitReceiverId);
      }

      // 스테이지 최종 클리어 판정
      if (evalResult.isStageFullyCleared) {
        // 영구 저장소에 클리어 및 코어 증가 기록
        this.storage.clearStage(this.currentStageId, evalResult.badgeEarned);
        this.updateGlobalCoreIndicators();

        setTimeout(() => {
          this.openSuccessModal(evalResult);
        }, 400);
      } else {
        // 9~10단계 중간 수신기 점등 알림
        this.setFeedback(evalResult.message, 'success');
      }
    } else {
      this.safeSound('playFail');
      this.setFeedback(evalResult.message, 'warning');
    }
  }

  // 성공 모달 띄우기 (구역 완료 및 최종 엔딩 분기)
  openSuccessModal(evalResult) {
    const stageId = this.currentStageId;

    // 10단계 최종 클리어 시: 최종 엔딩 모달 표시
    if (stageId === 10) {
      this.safeSound('playComplete');
      this.openModal('complete');
      return;
    }

    // 1~9단계 성공 모달
    const modalTitle = document.getElementById('modal-stage-title');
    const modalDesc = document.getElementById('modal-core-desc');
    const modalBadge = document.getElementById('modal-success-badge');
    const modalScience = document.getElementById('modal-science-text');
    const badgeAlert = document.getElementById('modal-badge-alert');

    modalTitle.textContent = `${this.currentStage.title} 클리어!`;
    modalScience.textContent = this.currentStage.successExplanation;

    // 3, 6, 9단계 구역 완료 특별 축하 메시지
    if (stageId === 3) {
      modalBadge.textContent = '🎉 [제1구역: 광학 연구소] 완전 복구!';
      modalDesc.textContent = '광학 연구소의 3개 코어가 모두 활성화되었습니다! 지하 에너지 통로가 열립니다.';
    } else if (stageId === 6) {
      modalBadge.textContent = '🎉 [제2구역: 지하 에너지 통로] 완전 복구!';
      modalDesc.textContent = '지하 관로의 위험을 극복했습니다! 이제 중앙 제어 구역으로 진입합니다.';
    } else if (stageId === 9) {
      modalBadge.textContent = '🎉 [제3구역: 중앙 제어 구역] 완전 복구!';
      modalDesc.textContent = '중앙 제어망의 전력이 회복되었습니다! 마지막 중심 코어로 향하세요!';
    } else {
      modalBadge.textContent = '✨ 에너지 코어 복구 완료!';
      modalDesc.textContent = `도시의 제${stageId} 에너지 코어가 정상 가동하기 시작했습니다.`;
    }

    // 7단계 배지 획득 안내
    if (evalResult.badgeEarned === 'opticalArchitect') {
      badgeAlert.classList.remove('hidden');
    } else {
      badgeAlert.classList.add('hidden');
    }

    this.openModal('success');
  }

  // 힌트 모달 열기
  openHintModal() {
    if (!this.currentStage || !this.currentStage.hints) return;
    this.updateHintModalContent();
    this.openModal('hint');
  }

  updateHintModalContent() {
    const hints = this.currentStage.hints;
    const nameEl = document.getElementById('hint-stage-name');
    const contentEl = document.getElementById('hint-content-text');
    const indicatorEl = document.getElementById('hint-step-indicator');

    nameEl.textContent = `${this.currentStage.title} - 탐구 힌트`;
    contentEl.textContent = hints[this.currentHintIndex] || '힌트가 없습니다.';
    indicatorEl.textContent = `힌트 ${this.currentHintIndex + 1}/${hints.length}`;
  }

  // 모달 제어 헬퍼
  openModal(modalKey) {
    const target = this.modals[modalKey];
    if (target) target.classList.remove('hidden');
  }

  closeModal(modalKey) {
    const target = this.modals[modalKey];
    if (target) target.classList.add('hidden');
  }

  setFeedback(text, type = 'info') {
    this.feedbackText.textContent = text;
    this.feedbackBar.className = `feedback-bar ${type}`;
    if (type === 'success') this.feedbackIcon.textContent = '✨';
    else if (type === 'warning') this.feedbackIcon.textContent = '⚠️';
    else this.feedbackIcon.textContent = '💡';
  }

  updateAudioButtonState() {
    const btn = document.getElementById('btn-toggle-sound');
    btn.textContent = this.sound.isMuted ? '🔇' : '🔊';
  }

  updateObserverButtonState() {
    this.observerText.textContent = this.isObserverOn ? 'ON' : 'OFF';
    if (this.isObserverOn) {
      this.btnObserver.classList.add('active');
    } else {
      this.btnObserver.classList.remove('active');
    }
  }

  // =========================================================================
  // 메인 렌더링 루프 (Canvas 2D)
  // =========================================================================
  renderLoop(timestamp) {
    const dt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    this.update(dt);
    this.render();

    requestAnimationFrame(this.renderLoop);
  }

  update(dt) {
    // 광선 애니메이션 진행도 업데이트
    if (this.isFiring && this.animPath.length > 1) {
      this.animProgress += dt * 3.5; // 애니메이션 속도
      if (this.animProgress >= this.animPath.length - 1) {
        this.animProgress = this.animPath.length - 1;
        this.onLaserAnimationEnd();
      }
    }

    // 파티클 업데이트
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  render() {
    const ctx = this.ctx;
    const stage = this.currentStage;
    if (!ctx || !stage) return;

    // 1. 배경 클리어
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 2. 그리드 격자선 렌더링
    this.drawGrid(ctx, stage);

    // 3. 거울 설치 슬롯 렌더링
    this.drawSlots(ctx, stage);

    // 4. 벽 렌더링
    this.drawWalls(ctx, stage);

    // 5. 흡수 패널 렌더링
    this.drawAbsorbers(ctx, stage);

    // 6. 체크포인트 센서 렌더링
    this.drawCheckpoints(ctx, stage);

    // 7. 수신기(코어) 렌더링
    this.drawReceivers(ctx, stage);

    // 8. 광원 렌더링
    this.drawSource(ctx, stage);

    // 9. 설치된 거울들 렌더링
    this.drawMirrors(ctx);

    // 10. 광선(레이저) 궤적 렌더링
    this.drawLaserRay(ctx);

    // 11. 법선 및 각도 관찰기 렌더링
    if (this.isObserverOn && this.lastTraceResult && this.lastTraceResult.reflections) {
      this.drawObserver(ctx, this.lastTraceResult.reflections);
    }

    // 12. 파티클 이펙트 렌더링
    this.drawParticles(ctx);
  }

  // 그리드 배경선
  drawGrid(ctx, stage) {
    ctx.save();
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= stage.cols; x++) {
      ctx.beginPath();
      ctx.moveTo(x * this.gridSize, 0);
      ctx.lineTo(x * this.gridSize, stage.rows * this.gridSize);
      ctx.stroke();
    }
    for (let y = 0; y <= stage.rows; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * this.gridSize);
      ctx.lineTo(stage.cols * this.gridSize, y * this.gridSize);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 거울 슬롯 점선 박스
  drawSlots(ctx, stage) {
    if (!stage.slots) return;
    ctx.save();
    stage.slots.forEach(slot => {
      const x = slot.x * this.gridSize;
      const y = slot.y * this.gridSize;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x + 4, y + 4, this.gridSize - 8, this.gridSize - 8);

      // 슬롯 중앙 작은 + 표식
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
      const cx = x + this.gridSize / 2;
      const cy = y + this.gridSize / 2;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy); ctx.lineTo(cx + 4, cy);
      ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 4);
      ctx.stroke();
    });
    ctx.restore();
  }

  // 일반 벽 타일
  drawWalls(ctx, stage) {
    if (!stage.walls) return;
    ctx.save();
    stage.walls.forEach(w => {
      const x = w.x * this.gridSize;
      const y = w.y * this.gridSize;

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x + 2, y + 2, this.gridSize - 4, this.gridSize - 4);

      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, this.gridSize - 4, this.gridSize - 4);

      // 대각선 질감 패턴
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + this.gridSize - 6, y + this.gridSize - 6);
      ctx.stroke();
    });
    ctx.restore();
  }

  // 흡수 패널 타일 (빛을 빨아들이는 붉은색 격자)
  drawAbsorbers(ctx, stage) {
    if (!stage.absorbers) return;
    ctx.save();
    stage.absorbers.forEach(ab => {
      const x = ab.x * this.gridSize;
      const y = ab.y * this.gridSize;

      // 짙은 붉은색 배경
      ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
      ctx.fillRect(x + 2, y + 2, this.gridSize - 4, this.gridSize - 4);

      // 붉은색 테두리
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, this.gridSize - 4, this.gridSize - 4);

      // 흡수 경고 격자 X
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + this.gridSize - 6, y + this.gridSize - 6);
      ctx.moveTo(x + this.gridSize - 6, y + 6); ctx.lineTo(x + 6, y + this.gridSize - 6);
      ctx.stroke();

      // 흡수 마크 텍스트
      ctx.fillStyle = '#fca5a5';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('흡수', x + this.gridSize / 2, y + this.gridSize / 2 + 3);
    });
    ctx.restore();
  }

  // 체크포인트 센서 (투과형 발광 센서)
  drawCheckpoints(ctx, stage) {
    const cps = stage.checkpoints || (stage.checkpoint ? [stage.checkpoint] : []);
    if (!cps.length) return;

    ctx.save();
    cps.forEach(cp => {
      const cx = (cp.x + 0.5) * this.gridSize;
      const cy = (cp.y + 0.5) * this.gridSize;
      const radius = this.gridSize * 0.35;

      // 외부 발광 링
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      // 내부 투명 원
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.75, 0, Math.PI * 2);
      ctx.fill();

      // 센서 라벨
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cp.id || 'CP', cx, cy);
    });
    ctx.restore();
  }

  // 수신기들 렌더링 (단일 및 다중 점등 상태)
  drawReceivers(ctx, stage) {
    const recs = stage.receivers || (stage.receiver ? [stage.receiver] : []);
    ctx.save();
    recs.forEach(rec => {
      const cx = (rec.x + 0.5) * this.gridSize;
      const cy = (rec.y + 0.5) * this.gridSize;
      const radius = this.gridSize * 0.35;
      const isLit = this.litReceivers.includes(rec.id);

      // 발광 외곽선
      ctx.strokeStyle = isLit ? '#fbbf24' : '#38bdf8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      // 내부 코어 젬
      ctx.fillStyle = isLit ? '#f59e0b' : '#0284c7';
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.6, 0, Math.PI * 2);
      ctx.fill();

      // 중심 하이라이트
      ctx.fillStyle = isLit ? '#fef08a' : '#e0f2fe';
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.25, 0, Math.PI * 2);
      ctx.fill();

      // 라벨
      ctx.fillStyle = isLit ? '#fde68a' : '#bae6fd';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(isLit ? 'ON' : '코어', cx, cy + radius + 11);
    });
    ctx.restore();
  }

  // 광원 발사대
  drawSource(ctx, stage) {
    const cx = (stage.source.x + 0.5) * this.gridSize;
    const cy = (stage.source.y + 0.5) * this.gridSize;
    const dir = this.customSourceDir || stage.source.dir;

    ctx.save();
    // 광원 본체 림
    ctx.fillStyle = '#6366f1';
    ctx.beginPath();
    ctx.arc(cx, cy, this.gridSize * 0.32, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#a5b4fc';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 발사 방향 노즐
    const normDir = Vector2D.normalize(dir);
    const nozzleLen = this.gridSize * 0.4;
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + normDir.x * nozzleLen, cy + normDir.y * nozzleLen);
    ctx.stroke();

    ctx.restore();
  }

  // 설치된 회전 거울들
  drawMirrors(ctx) {
    ctx.save();
    this.mirrors.forEach(mirror => {
      const seg = this.optics.getMirrorSegment(mirror);
      const isSelected = this.activeMirror === mirror;

      // 거울 반사면 본체 (두꺼운 은빛 선)
      ctx.strokeStyle = isSelected ? '#38bdf8' : '#e2e8f0';
      ctx.lineWidth = isSelected ? 6 : 4;
      ctx.beginPath();
      ctx.moveTo(seg.p1.x, seg.p1.y);
      ctx.lineTo(seg.p2.x, seg.p2.y);
      ctx.stroke();

      // 거울 양 끝단 원형 힌지
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(seg.p1.x, seg.p1.y, 3, 0, Math.PI * 2);
      ctx.arc(seg.p2.x, seg.p2.y, 3, 0, Math.PI * 2);
      ctx.fill();

      // 거울 각도 표시 텍스트
      const cx = (mirror.x + 0.5) * this.gridSize;
      const cy = (mirror.y + 0.5) * this.gridSize;
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${mirror.angle}°`, cx, cy - 14);
    });
    ctx.restore();
  }

  // 광선(레이저) 궤적 렌더링
  drawLaserRay(ctx) {
    if (!this.animPath || this.animPath.length < 2) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const currentIdx = Math.floor(this.animProgress);
    const t = this.animProgress - currentIdx;

    // 외곽 레이저 발광 글로우
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.4)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(this.animPath[0].x, this.animPath[0].y);

    for (let i = 1; i <= currentIdx; i++) {
      ctx.lineTo(this.animPath[i].x, this.animPath[i].y);
    }
    if (currentIdx < this.animPath.length - 1) {
      const p1 = this.animPath[currentIdx];
      const p2 = this.animPath[currentIdx + 1];
      const curX = p1.x + (p2.x - p1.x) * t;
      const curY = p1.y + (p2.y - p1.y) * t;
      ctx.lineTo(curX, curY);
    }
    ctx.stroke();

    // 레이저 코어 빔 (밝은 흰/적색 선)
    ctx.strokeStyle = '#fff1f2';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(this.animPath[0].x, this.animPath[0].y);

    for (let i = 1; i <= currentIdx; i++) {
      ctx.lineTo(this.animPath[i].x, this.animPath[i].y);
    }
    if (currentIdx < this.animPath.length - 1) {
      const p1 = this.animPath[currentIdx];
      const p2 = this.animPath[currentIdx + 1];
      const curX = p1.x + (p2.x - p1.x) * t;
      const curY = p1.y + (p2.y - p1.y) * t;
      ctx.lineTo(curX, curY);
    }
    ctx.stroke();

    ctx.restore();
  }

  // 법선 및 각도 관찰기 오버레이 렌더링
  drawObserver(ctx, reflections) {
    if (!reflections || !reflections.length) return;

    ctx.save();
    reflections.forEach((ref, idx) => {
      // 1. 법선(Normal) 점선 렌더링
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(ref.normalVisual.p1.x, ref.normalVisual.p1.y);
      ctx.lineTo(ref.normalVisual.p2.x, ref.normalVisual.p2.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // 2. 충돌점 원
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(ref.point.x, ref.point.y, 4, 0, Math.PI * 2);
      ctx.fill();

      // 3. 입사각 및 반사각 호(Arc) 및 텍스트 표시
      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const offsetDist = 18;
      const textX = ref.point.x + ref.normal.x * offsetDist;
      const textY = ref.point.y + ref.normal.y * offsetDist;

      ctx.fillText(`입사=${ref.incidentAngle}° / 반사=${ref.reflectionAngle}°`, textX, textY - 6);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px sans-serif';
      ctx.fillText(`(법선 기준 #${idx + 1})`, textX, textY + 8);
    });
    ctx.restore();
  }

  // 스파크 파티클 렌더링
  drawParticles(ctx) {
    if (!this.particles.length) return;
    ctx.save();
    this.particles.forEach(p => {
      ctx.fillStyle = p.color || '#f43f5e';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, p.life * 3), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
}

// 브라우저 윈도우 로드 완료 시 게임 컨트롤러 인스턴스화
window.addEventListener('DOMContentLoaded', () => {
  window.gameApp = new LightMazeGame();
});
