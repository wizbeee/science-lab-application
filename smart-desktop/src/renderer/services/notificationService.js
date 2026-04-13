// ============================================================
// notificationService.js - 알림 시스템
// 수업 7분 전 알림 (시간표 연동), 수업 중 무음 자동 전환
// ============================================================

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// 현재 수업 중인지 확인
export function isInClass(schedule) {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  return schedule.periods.some(p =>
    p.type === 'class' && timeToMinutes(p.start) <= mins && mins < timeToMinutes(p.end)
  );
}

// 요일 키 반환
function getTodayKey() {
  const day = new Date().getDay();
  return ['', 'mon', 'tue', 'wed', 'thu', 'fri'][day] || null;
}

// 알림 스케줄러 시작
// getSchedule / getNotifications / getTimetable: 함수로 받아 항상 최신 state 참조 (stale closure 방지)
export function startNotificationScheduler(getSchedule, getNotifications, showNotification, setUI, getTimetable) {
  const alreadyNotified = new Set();

  const check = () => {
    const schedule = getSchedule();
    const notifications = getNotifications();
    const timetable = getTimetable();

    if (!schedule?.periods) return;

    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const todayStr = now.toDateString();
    const todayKey = getTodayKey();

    // 수업 5분 전 알림 (시간표 과목 정보 포함)
    if (notifications.classReminder) {
      schedule.periods.forEach(p => {
        if (p.type !== 'class') return;
        const startMins = timeToMinutes(p.start);
        const diff = Math.round(startMins - mins);
        const notifKey = `${todayStr}-${p.id}`;

        if (diff > 0 && diff <= 5 && !alreadyNotified.has(notifKey)) {
          alreadyNotified.add(notifKey);

          // 시간표에서 해당 교시 과목 찾기
          // timetable[day]는 string[] 배열 (인덱스 0 = 1교시)
          let subject = '';
          if (todayKey && Array.isArray(timetable?.[todayKey])) {
            // p.id는 1-based (1교시=id1), 배열은 0-based
            const classIdx = schedule.periods
              .filter(x => x.type === 'class')
              .findIndex(x => x.id === p.id);
            if (classIdx >= 0) subject = timetable[todayKey][classIdx] || '';
          }

          showNotification({
            type: 'class',
            title: subject ? `📚 ${diff}분 뒤 ${p.name} — ${subject}` : `📚 ${diff}분 뒤 ${p.name} 수업`,
            message: `⏰ ${p.start} ~ ${p.end}`,
            duration: 10000
          });
        }
      });
    }

    // 수업 중 무음 모드 자동 전환
    if (notifications.silentDuringClass) {
      const inClass = isInClass(schedule);
      setUI({ silentMode: inClass });
    }

    // 자정(0:00~0:01) 구간에 알림 기록 초기화 (15초 간격 check이므로 범위로 검사)
    if (now.getHours() === 0 && now.getMinutes() === 0) alreadyNotified.clear();
  };

  const timer = setInterval(check, 15000);
  check();

  return () => clearInterval(timer);
}

// ── Gmail 새 메일 알림 스케줄러 ────────────────────────────
// 5분마다 미읽 메일 수를 확인하고 증가 시 알림 발송
export function startMailNotificationScheduler(getGoogle, getNotifications, showNotification) {
  let lastUnreadCount = -1;  // -1 = 초기화 전 (첫 확인은 알림 안 함)

  const check = async () => {
    const notifications = getNotifications();
    if (!notifications.mailAlert) return;

    const google = getGoogle();
    if (!google || !google.connected || !google.accessToken) {
      lastUnreadCount = -1;
      return;
    }

    try {
      const { setTokens, getUnreadCount, getRecentEmails } = await import('./googleService');
      setTokens(google.accessToken, google.refreshToken, 3600);

      const count = await getUnreadCount();

      if (lastUnreadCount === -1) {
        // 첫 확인: 기준점만 저장, 알림 없음
        lastUnreadCount = count;
        return;
      }

      if (count > lastUnreadCount) {
        const diff = count - lastUnreadCount;
        lastUnreadCount = count;

        // 새 메일 상세 정보 가져오기 (최신 1개)
        try {
          const emails = await getRecentEmails(1);
          const latest = emails[0];
          if (latest) {
            showNotification({
              type: 'info',
              title: `📧 새 메일 ${diff > 1 ? diff + '통' : ''}`,
              message: `${latest.from}: ${latest.subject}`,
              duration: 8000
            });
          } else {
            showNotification({
              type: 'info',
              title: `📧 새 메일 ${diff}통`,
              message: 'Gmail에 새 메일이 도착했습니다.',
              duration: 8000
            });
          }
        } catch {
          showNotification({
            type: 'info',
            title: `📧 새 메일 ${diff}통`,
            message: 'Gmail에 새 메일이 도착했습니다.',
            duration: 8000
          });
        }
      } else {
        lastUnreadCount = count;
      }
    } catch {
      // 네트워크 오류 등 — 조용히 무시
    }
  };

  // 5분마다 확인
  const timer = setInterval(check, 5 * 60 * 1000);
  // 30초 후 첫 확인 (앱 시작 직후 토큰 준비 대기)
  const initial = setTimeout(check, 30000);

  return () => {
    clearInterval(timer);
    clearTimeout(initial);
  };
}
