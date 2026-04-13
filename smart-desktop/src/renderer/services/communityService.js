// ============================================================
// communityService.js - 커뮤니티 (공지·그룹·메시지·공유 일정)
// Firebase Realtime DB 또는 자체 서버 선택 가능
// ============================================================

// ── 커뮤니티 아키텍처 ────────────────────────────────────────
//
// 옵션 A (권장): Firebase Realtime Database (무료 티어 충분)
//   - 설정: Firebase 콘솔 → 프로젝트 생성 → 웹앱 추가 → config 복사
//   - 실시간 리스너로 즉시 동기화
//
// 옵션 B: 자체 서버 (Node.js + Socket.io)
//   - 학교 서버 또는 클라우드 VM에 배포
//
// 현재: 구조 정의 + Firebase 연동 준비 코드

// ── 메시지 타입 정의 ─────────────────────────────────────────
export const MSG_TYPE = {
  NOTICE:    'notice',    // 전체 공지
  GROUP:     'group',     // 그룹 공지
  DIRECT:    'direct',    // 1:1 메시지
  SCHEDULE:  'schedule',  // 공유 일정
  ALERT:     'alert'      // 긴급 알림
};

// ── Firebase 설정 (사용자가 설정 패널에서 입력) ───────────────
// eslint-disable-next-line no-unused-vars
let firebaseConfig = null;
// eslint-disable-next-line no-unused-vars
let db = null;

export function initFirebase(config) {
  if (!config?.apiKey) return false;
  try {
    // 실제 배포 시 firebase 패키지 import 필요
    // import { initializeApp } from 'firebase/app';
    // import { getDatabase } from 'firebase/database';
    firebaseConfig = config;
    console.log('Firebase 초기화 준비 완료');
    return true;
  } catch (e) {
    console.error('Firebase 초기화 실패:', e);
    return false;
  }
}

// ── 로컬 커뮤니티 (Firebase 없을 때 데모용) ──────────────────
class LocalCommunity {
  constructor() {
    this.listeners = new Map();
    this.data = {
      notices: [],
      groups: {},
      messages: {},
      sharedSchedules: []
    };
  }

  // 전체 공지 발송 (관리자)
  async broadcastNotice({ title, content, type = 'info', authorName, groupId = null }) {
    const notice = {
      id: Date.now().toString(),
      title,
      content,
      type,               // info | warning | urgent
      authorName,
      groupId,            // null = 전체
      createdAt: new Date().toISOString(),
      readBy: []
    };

    if (groupId) {
      if (!this.data.groups[groupId]) this.data.groups[groupId] = { notices: [] };
      this.data.groups[groupId].notices.unshift(notice);
    } else {
      this.data.notices.unshift(notice);
    }

    this.emit('notice', notice);
    return notice;
  }

  // 그룹 관리
  async createGroup({ name, code, adminId, members = [] }) {
    const group = {
      id: Date.now().toString(),
      name,
      code,              // 참가 코드 (예: CNSA-2024)
      adminId,
      members,
      createdAt: new Date().toISOString(),
      notices: [],
      sharedSchedules: []
    };
    this.data.groups[group.id] = group;
    this.emit('group_created', group);
    return group;
  }

  async joinGroup(code, userId, userName) {
    const group = Object.values(this.data.groups).find(g => g.code === code);
    if (!group) throw new Error('그룹 코드가 올바르지 않습니다.');
    if (!group.members.find(m => m.id === userId)) {
      group.members.push({ id: userId, name: userName, joinedAt: new Date().toISOString() });
    }
    this.emit('group_joined', group);
    return group;
  }

  // 1:1 메시지
  async sendMessage({ fromId, fromName, toId, toName, content }) {
    const channelKey = [fromId, toId].sort().join('_');
    if (!this.data.messages[channelKey]) this.data.messages[channelKey] = [];

    const msg = {
      id: Date.now().toString(),
      fromId, fromName, toId, toName,
      content,
      createdAt: new Date().toISOString(),
      read: false
    };

    this.data.messages[channelKey].push(msg);
    this.emit('message', msg);
    return msg;
  }

  // 공유 일정 등록
  async addSharedSchedule({ title, date, time, endTime, authorId, authorName, groupId, sharedWith = 'all' }) {
    const schedule = {
      id: Date.now().toString(),
      title, date, time, endTime,
      authorId, authorName,
      groupId,
      sharedWith,  // 'all' | groupId | [userId, ...]
      createdAt: new Date().toISOString(),
      color: '#3b82f6'
    };
    this.data.sharedSchedules.push(schedule);
    this.emit('schedule_added', schedule);
    return schedule;
  }

  // 공유 일정 삭제
  async removeSharedSchedule(scheduleId, requesterId, deleteForAll = false) {
    const idx = this.data.sharedSchedules.findIndex(s => s.id === scheduleId);
    if (idx === -1) return;

    const schedule = this.data.sharedSchedules[idx];
    if (deleteForAll && schedule.authorId === requesterId) {
      this.data.sharedSchedules.splice(idx, 1);
      this.emit('schedule_removed', { id: scheduleId, deleteForAll: true });
    } else {
      // 나만 삭제 (hiddenBy 배열에 추가)
      if (!schedule.hiddenBy) schedule.hiddenBy = [];
      schedule.hiddenBy.push(requesterId);
      this.emit('schedule_hidden', { id: scheduleId, userId: requesterId });
    }
  }

  // 이벤트 시스템
  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const cbs = this.listeners.get(event) || [];
    this.listeners.set(event, cbs.filter(cb => cb !== callback));
  }

  emit(event, data) {
    (this.listeners.get(event) || []).forEach(cb => cb(data));
    (this.listeners.get('*') || []).forEach(cb => cb(event, data));
  }

  // 미읽음 메시지 수
  getUnreadCount(userId) {
    return Object.values(this.data.messages)
      .flat()
      .filter(m => m.toId === userId && !m.read)
      .length;
  }

  // 공지 목록 (그룹 포함)
  getNotices(groupIds = []) {
    const global = this.data.notices;
    const grouped = groupIds.flatMap(gid => this.data.groups[gid]?.notices || []);
    return [...global, ...grouped].sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  // 나의 공유 일정
  getMySharedSchedules(userId, groupIds = []) {
    return this.data.sharedSchedules.filter(s => {
      if (s.hiddenBy?.includes(userId)) return false;
      if (s.sharedWith === 'all') return true;
      if (s.authorId === userId) return true;
      if (Array.isArray(s.sharedWith) && s.sharedWith.includes(userId)) return true;
      if (groupIds.includes(s.groupId)) return true;
      return false;
    });
  }
}

export const community = new LocalCommunity();

// ── 알림 푸시 헬퍼 ──────────────────────────────────────────
export function notifyFromCommunity(notice, showNotification) {
  const typeMap = {
    urgent:  { type: 'danger',  prefix: '🚨 긴급' },
    warning: { type: 'warning', prefix: '⚠️ 공지' },
    info:    { type: 'info',    prefix: '📢 공지' }
  };
  const cfg = typeMap[notice.type] || typeMap.info;

  showNotification({
    type: cfg.type,
    title: `${cfg.prefix}: ${notice.title}`,
    message: notice.content.slice(0, 60) + (notice.content.length > 60 ? '...' : ''),
    duration: notice.type === 'urgent' ? 10000 : 5000
  });
}
