// ============================================================
// CommunityPanel.jsx - 커뮤니티 (공지·그룹·메시지·공유일정)
// ============================================================

import React, { useState, useEffect } from 'react';
import { useApp } from '../AppContext';
import { community, notifyFromCommunity } from '../services/communityService';

const TABS = ['공지', '그룹', '메시지', '공유일정'];

export default function CommunityPanel({ onClose }) {
  const { state, actions } = useApp();
  const { theme, community: commCfg } = state;

  const [tab, setTab] = useState(0);
  const [notices, setNotices] = useState([]);
  const [groups, setGroups] = useState([]);
  const [messages, setMessages] = useState([]);
  const [sharedSchedules, setSharedSchedules] = useState([]);

  // 공지 발송 폼
  const [noticeForm, setNoticeForm] = useState({ title: '', content: '', type: 'info', groupId: null });
  // 그룹 참가 폼
  const [joinCode, setJoinCode] = useState('');
  const [createGroupForm, setCreateGroupForm] = useState({ name: '', code: '' });
  // 메시지
  const [msgTarget, setMsgTarget] = useState('');
  const [msgContent, setMsgContent] = useState('');
  // 공유 일정
  const [schedForm, setSchedForm] = useState({ title: '', date: '', time: '', endTime: '', sharedWith: 'all' });

  // 커뮤니티 이벤트 구독
  useEffect(() => {
    const unsubs = [
      community.on('notice', n => setNotices(prev => [n, ...prev])),
      community.on('group_created', g => setGroups(prev => [...prev, g])),
      community.on('group_joined', g => setGroups(prev => prev.find(x => x.id === g.id) ? prev : [...prev, g])),
      community.on('message', m => setMessages(prev => [...prev, m])),
      community.on('schedule_added', s => setSharedSchedules(prev => [...prev, s]))
    ];
    return () => unsubs.forEach(u => u?.());
  }, []);

  // 공지 발송
  const sendNotice = async () => {
    if (!noticeForm.content.trim()) return;
    const n = await community.broadcastNotice({
      ...noticeForm,
      authorName: commCfg.username || '관리자'
    });
    notifyFromCommunity(n, actions.showNotification);
    setNoticeForm({ title: '', content: '', type: 'info', groupId: null });
  };

  // 그룹 참가
  const joinGroup = async () => {
    if (!joinCode.trim()) return;
    try {
      await community.joinGroup(joinCode, commCfg.userId, commCfg.username);
      setJoinCode('');
    } catch (e) { alert(e.message); }
  };

  // 그룹 생성
  const createGroup = async () => {
    if (!createGroupForm.name || !createGroupForm.code) return;
    await community.createGroup({
      ...createGroupForm, adminId: commCfg.userId,
      members: [{ id: commCfg.userId, name: commCfg.username }]
    });
    setCreateGroupForm({ name: '', code: '' });
  };

  // 메시지 발송
  const sendMessage = async () => {
    if (!msgTarget.trim() || !msgContent.trim()) return;
    await community.sendMessage({
      fromId: commCfg.userId, fromName: commCfg.username,
      toId: msgTarget, toName: msgTarget,
      content: msgContent
    });
    setMsgContent('');
  };

  // 공유 일정 등록
  const addSharedSched = async () => {
    if (!schedForm.title || !schedForm.date) return;
    await community.addSharedSchedule({
      ...schedForm,
      authorId: commCfg.userId,
      authorName: commCfg.username || '나'
    });
    setSchedForm({ title: '', date: '', time: '', endTime: '', sharedWith: 'all' });
  };

  const inputStyle = {
    width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 9,
    padding: '9px 13px', fontSize: 13, outline: 'none', fontFamily: 'inherit', color: '#1f2937'
  };

  const typeColor = {
    info:    { bg: '#dbeafe', text: '#1e40af', label: '일반' },
    warning: { bg: '#fef3c7', text: '#92400e', label: '주의' },
    urgent:  { bg: '#fee2e2', text: '#991b1b', label: '긴급' }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 8000, fontFamily: "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif"
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 20, width: 640, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(0,0,0,0.2)'
      }} onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2937' }}>👥 커뮤니티</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
        </div>

        {/* 탭 */}
        <div style={{ display: 'flex', padding: '12px 24px 0', gap: 4, borderBottom: '1px solid #f0f0f0' }}>
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)} style={{
              padding: '8px 16px', border: 'none',
              borderBottom: `2.5px solid ${tab === i ? theme.accentColor : 'transparent'}`,
              background: 'none', cursor: 'pointer', fontSize: 14,
              fontWeight: tab === i ? 600 : 400,
              color: tab === i ? theme.accentColor : '#6b7280'
            }}>{t}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>

          {/* ── 공지 탭 ── */}
          {tab === 0 && (
            <div>
              <div style={{ background: '#f9fafb', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>📢 공지 발송</div>
                <input placeholder="제목" value={noticeForm.title}
                  onChange={e => setNoticeForm({ ...noticeForm, title: e.target.value })}
                  style={{ ...inputStyle, marginBottom: 8 }}
                />
                <textarea rows={3} placeholder="내용" value={noticeForm.content}
                  onChange={e => setNoticeForm({ ...noticeForm, content: e.target.value })}
                  style={{ ...inputStyle, resize: 'none', marginBottom: 8 }}
                />
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  {['info', 'warning', 'urgent'].map(t => (
                    <button key={t} onClick={() => setNoticeForm({ ...noticeForm, type: t })}
                      style={{
                        padding: '5px 12px', borderRadius: 8, border: `1.5px solid ${noticeForm.type === t ? typeColor[t].text : '#e5e7eb'}`,
                        background: noticeForm.type === t ? typeColor[t].bg : '#fff',
                        color: noticeForm.type === t ? typeColor[t].text : '#6b7280',
                        cursor: 'pointer', fontSize: 12, fontWeight: 500
                      }}>{typeColor[t].label}</button>
                  ))}
                </div>
                <button onClick={sendNotice} style={{
                  width: '100%', background: theme.accentColor, color: '#fff',
                  border: 'none', borderRadius: 9, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer'
                }}>전체 발송</button>
              </div>

              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>수신된 공지</div>
              {notices.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#d1d5db', fontSize: 13, padding: '20px 0' }}>공지가 없습니다</div>
              ) : notices.map(n => {
                const c = typeColor[n.type] || typeColor.info;
                return (
                  <div key={n.id} style={{ background: c.bg, borderRadius: 10, padding: '10px 14px', marginBottom: 8, borderLeft: `4px solid ${c.text}` }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: c.text }}>{n.title || '공지'}</div>
                    <div style={{ fontSize: 13, color: c.text, opacity: 0.85, marginTop: 3 }}>{n.content}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                      {n.authorName} · {new Date(n.createdAt).toLocaleString('ko')}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 그룹 탭 ── */}
          {tab === 1 && (
            <div>
              <div style={{ background: '#f9fafb', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>그룹 참가</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="참가 코드 입력 (예: CNSA-2024)" value={joinCode}
                    onChange={e => setJoinCode(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                    onKeyDown={e => e.key === 'Enter' && joinGroup()}
                  />
                  <button onClick={joinGroup} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 9, padding: '0 18px', cursor: 'pointer', fontWeight: 600 }}>참가</button>
                </div>
              </div>

              <div style={{ background: '#f9fafb', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>새 그룹 만들기</div>
                <input placeholder="그룹 이름" value={createGroupForm.name}
                  onChange={e => setCreateGroupForm({ ...createGroupForm, name: e.target.value })}
                  style={{ ...inputStyle, marginBottom: 8 }}
                />
                <input placeholder="참가 코드 (영문·숫자, 예: CNSA-2024)" value={createGroupForm.code}
                  onChange={e => setCreateGroupForm({ ...createGroupForm, code: e.target.value })}
                  style={{ ...inputStyle, marginBottom: 10 }}
                />
                <button onClick={createGroup} style={{
                  width: '100%', background: '#f3f4f6', color: '#374151',
                  border: 'none', borderRadius: 9, padding: '10px', fontSize: 13, cursor: 'pointer', fontWeight: 600
                }}>그룹 생성</button>
              </div>

              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>내 그룹</div>
              {groups.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#d1d5db', fontSize: 13, padding: '20px 0' }}>참가한 그룹이 없습니다</div>
              ) : groups.map(g => (
                <div key={g.id} style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1f2937' }}>{g.name}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>코드: {g.code} · {g.members?.length || 1}명</div>
                  </div>
                  <button style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>탈퇴</button>
                </div>
              ))}
            </div>
          )}

          {/* ── 메시지 탭 ── */}
          {tab === 2 && (
            <div>
              <div style={{ background: '#f9fafb', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>메시지 보내기</div>
                <input placeholder="받는 사람 (사용자 ID 또는 이름)" value={msgTarget}
                  onChange={e => setMsgTarget(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="내용" value={msgContent}
                    onChange={e => setMsgContent(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  />
                  <button onClick={sendMessage} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 9, padding: '0 18px', cursor: 'pointer', fontWeight: 600 }}>전송</button>
                </div>
              </div>
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#d1d5db', fontSize: 13, padding: '20px 0' }}>받은 메시지가 없습니다</div>
              ) : messages.map(m => (
                <div key={m.id} style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#374151' }}>{m.fromName}</div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>{m.content}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{new Date(m.createdAt).toLocaleString('ko')}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── 공유 일정 탭 ── */}
          {tab === 3 && (
            <div>
              <div style={{ background: '#f9fafb', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>📅 공유 일정 추가</div>
                <input placeholder="일정 제목" value={schedForm.title}
                  onChange={e => setSchedForm({ ...schedForm, title: e.target.value })}
                  style={{ ...inputStyle, marginBottom: 8 }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <input type="date" value={schedForm.date}
                    onChange={e => setSchedForm({ ...schedForm, date: e.target.value })}
                    style={inputStyle}
                  />
                  <input type="time" value={schedForm.time}
                    onChange={e => setSchedForm({ ...schedForm, time: e.target.value })}
                    style={inputStyle}
                  />
                  <input type="time" value={schedForm.endTime}
                    onChange={e => setSchedForm({ ...schedForm, endTime: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <select value={schedForm.sharedWith}
                  onChange={e => setSchedForm({ ...schedForm, sharedWith: e.target.value })}
                  style={{ ...inputStyle, marginBottom: 10 }}>
                  <option value="all">전체 공유</option>
                  <option value="group">내 그룹</option>
                </select>
                <button onClick={addSharedSched} style={{
                  width: '100%', background: theme.accentColor, color: '#fff',
                  border: 'none', borderRadius: 9, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer'
                }}>공유 일정 등록</button>
              </div>

              {sharedSchedules.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#d1d5db', fontSize: 13, padding: '20px 0' }}>공유된 일정이 없습니다</div>
              ) : sharedSchedules.map(s => (
                <div key={s.id} style={{ background: '#dbeafe', borderRadius: 10, padding: '10px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1e40af' }}>👥 {s.title}</div>
                    <div style={{ fontSize: 12, color: '#3b82f6' }}>{s.date} {s.time && `${s.time}~${s.endTime}`}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{s.authorName} · {s.sharedWith === 'all' ? '전체 공유' : '그룹 공유'}</div>
                  </div>
                  <button onClick={() => community.removeSharedSchedule(s.id, commCfg.userId)}
                    style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 7, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>삭제</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
