/**
 * [storage.js - 로컬 저장소 및 진행 상황 관리]
 * 플레이어의 스테이지 해금 상태, 에너지 코어 획득 기록, 음소거 설정을 브라우저에 안전하게 저장합니다.
 * localStorage가 제한된 환경(시크릿 모드, iframe 보안 등)에서도 오류 없이 실행되도록 메모리 폴백(Fallback)을 지원합니다.
 */

class StorageManager {
  constructor() {
    this.storageKey = 'light_maze_save_data';
    this.memoryStore = {
      unlockedStage: 1, // 기본 1단계 해금
      coresCollected: 0, // 기본 0개
      isMuted: false,   // 기본 소리 켬
      stageCleared: { 1: false, 2: false, 3: false }
    };
    this.isStorageAvailable = this.checkStorageAvailability();
    this.load();
  }

  // localStorage 사용 가능 여부 테스트
  checkStorageAvailability() {
    try {
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      console.warn('localStorage를 사용할 수 없어 임시 메모리 저장소를 사용합니다.', e);
      return false;
    }
  }

  // 저장된 데이터 불러오기
  load() {
    if (!this.isStorageAvailable) return;
    try {
      const saved = window.localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.memoryStore = { ...this.memoryStore, ...parsed };
      }
    } catch (e) {
      console.error('세이브 데이터 로드 실패:', e);
    }
  }

  // 데이터 영구 저장
  save() {
    if (!this.isStorageAvailable) return;
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(this.memoryStore));
    } catch (e) {
      console.error('세이브 데이터 저장 실패:', e);
    }
  }

  // 스테이지 클리어 기록 및 다음 단계 해금
  clearStage(stageId) {
    this.memoryStore.stageCleared[stageId] = true;
    
    // 해금 단계 업데이트 (최대 3단계까지)
    if (stageId + 1 <= 3 && this.memoryStore.unlockedStage < stageId + 1) {
      this.memoryStore.unlockedStage = stageId + 1;
    }

    // 획득한 에너지 코어 수 계산 (클리어한 스테이지 개수)
    let count = 0;
    for (let i = 1; i <= 3; i++) {
      if (this.memoryStore.stageCleared[i]) count++;
    }
    this.memoryStore.coresCollected = count;

    this.save();
  }

  // 특정 스테이지가 해금되었는지 확인
  isStageUnlocked(stageId) {
    if (stageId === 1) return true;
    return this.memoryStore.unlockedStage >= stageId;
  }

  // 특정 스테이지 클리어 여부 확인
  isStageCleared(stageId) {
    return !!this.memoryStore.stageCleared[stageId];
  }

  // 획득한 코어 총 개수 반환
  getCoresCount() {
    return this.memoryStore.coresCollected;
  }

  // 음소거 상태 가져오기
  getMuted() {
    return this.memoryStore.isMuted;
  }

  // 음소거 상태 설정
  setMuted(muted) {
    this.memoryStore.isMuted = muted;
    this.save();
  }

  // 진행 상황 초기화 (디버깅 또는 처음부터 다시하기용)
  resetAll() {
    this.memoryStore = {
      unlockedStage: 1,
      coresCollected: 0,
      isMuted: this.memoryStore.isMuted,
      stageCleared: { 1: false, 2: false, 3: false }
    };
    this.save();
  }
}
