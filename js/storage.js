/**
 * [storage.js - 로컬 저장소 및 진행 상황 관리]
 * 플레이어의 1~10단계 스테이지 해금 상태, 에너지 코어 10개 획득 기록,
 * 획득한 특별 배지, 음소거 설정을 브라우저에 안전하게 저장합니다.
 * 기존 3단계 세이브 데이터를 안전하게 새 10단계 포맷으로 자동 마이그레이션합니다.
 */

class StorageManager {
  constructor() {
    this.storageKey = 'light_maze_save_data';
    this.memoryStore = {
      unlockedStage: 1,      // 기본 1단계 해금 (최대 10)
      coresCollected: 0,     // 획득한 총 에너지 코어 수 (1~10)
      isMuted: false,        // 기본 소리 켬
      stageCleared: {
        1: false, 2: false, 3: false, 4: false, 5: false,
        6: false, 7: false, 8: false, 9: false, 10: false
      },
      badges: {
        opticalArchitect: false, // 7단계 거울 3개 이하 클리어 배지
        mazeMaster: false        // 10단계 최종 클리어 배지
      }
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

  // 저장된 데이터 불러오기 및 하위 호환 자동 마이그레이션
  load() {
    if (!this.isStorageAvailable) return;
    try {
      const saved = window.localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);

        // 기존 3단계 저장 데이터 호환 마이그레이션
        const stageCleared = { ...this.memoryStore.stageCleared };
        if (parsed.stageCleared) {
          for (let i = 1; i <= 10; i++) {
            if (parsed.stageCleared[i]) {
              stageCleared[i] = true;
            }
          }
        }

        const badges = {
          ...this.memoryStore.badges,
          ...(parsed.badges || {})
        };

        this.memoryStore = {
          ...this.memoryStore,
          ...parsed,
          stageCleared,
          badges,
          unlockedStage: Math.max(1, Math.min(10, parsed.unlockedStage || 1))
        };

        // 전체 코어 개수 재계산 (완료한 단계 수)
        this.recalculateCores();
      }
    } catch (e) {
      console.error('세이브 데이터 로드 실패, 기본값으로 초기화:', e);
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

  // 획득한 총 에너지 코어 수 재계산 (완료한 스테이지 1개당 코어 1개)
  recalculateCores() {
    let count = 0;
    for (let i = 1; i <= 10; i++) {
      if (this.memoryStore.stageCleared[i]) {
        count++;
      }
    }
    this.memoryStore.coresCollected = count;
  }

  // 스테이지 클리어 기록 및 다음 단계 해금
  clearStage(stageId, badgeEarned = null) {
    this.memoryStore.stageCleared[stageId] = true;

    // 배지 획득 처리
    if (badgeEarned && this.memoryStore.badges[badgeEarned] !== undefined) {
      this.memoryStore.badges[badgeEarned] = true;
    }

    // 다음 단계 해금 (최대 10단계까지)
    if (stageId + 1 <= 10 && this.memoryStore.unlockedStage < stageId + 1) {
      this.memoryStore.unlockedStage = stageId + 1;
    }

    this.recalculateCores();
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

  // 획득한 코어 총 개수 반환 (0 ~ 10)
  getCoresCount() {
    return this.memoryStore.coresCollected;
  }

  // 배지 획득 여부 확인
  hasBadge(badgeKey) {
    return !!this.memoryStore.badges[badgeKey];
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

  // 진행 상황 전체 초기화 (데이터 초기화 메뉴용)
  resetAll() {
    this.memoryStore = {
      unlockedStage: 1,
      coresCollected: 0,
      isMuted: this.memoryStore.isMuted,
      stageCleared: {
        1: false, 2: false, 3: false, 4: false, 5: false,
        6: false, 7: false, 8: false, 9: false, 10: false
      },
      badges: {
        opticalArchitect: false,
        mazeMaster: false
      }
    };
    this.save();
  }
}
