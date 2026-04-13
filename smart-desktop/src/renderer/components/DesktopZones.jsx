// ============================================================
// DesktopZones.jsx - 바탕화면 파일 구역
// 긴급 / 진행중 업무 / 나중에 볼 파일
// 파일 드래그 앤 드롭, 구역 추가/삭제/이름 변경
// ============================================================

import React, { useState, useEffect } from 'react';
import { useApp } from '../AppContext';

export default function DesktopZones() {
  const { state, actions } = useApp();
  const { theme, desktopZones } = state;
  const [editingZone, setEditingZone] = useState(null);
  const [desktopFiles, setDesktopFiles] = useState([]);
  const [editLabel, setEditLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [newZone, setNewZone] = useState({ label: '', color: '#3b82f6' });

  // 바탕화면 실제 파일 로드 (5초마다 실시간 갱신)
  useEffect(() => {
    async function loadDesktopFiles() {
      if (window.electronAPI?.desktop?.getFiles) {
        const files = await window.electronAPI.desktop.getFiles();
        setDesktopFiles(files || []);
      }
    }
    loadDesktopFiles();
    const timer = setInterval(loadDesktopFiles, 5000);
    return () => clearInterval(timer);
  }, []);

  // 파일 드래그 앤 드롭
  const handleDrop = (zoneId, e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const newFiles = files.map(f => ({
      id: Date.now() + Math.random(),
      name: f.name,
      path: f.path,
      size: f.size,
      type: f.type,
      addedAt: new Date().toISOString()
    }));

    const updated = desktopZones.map(z => {
      if (z.id === zoneId) {
        return { ...z, files: [...(z.files || []), ...newFiles] };
      }
      return z;
    });

    actions.setUI({ desktopZones: updated });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // 파일 열기
  const openFile = (filePath) => {
    if (window.electronAPI) {
      window.electronAPI.shell.openPath(filePath);
    }
  };

  // 파일 제거 (구역에서만 제거, 실제 파일은 삭제 안함)
  const removeFile = (zoneId, fileId) => {
    const updated = desktopZones.map(z => {
      if (z.id === zoneId) {
        return { ...z, files: z.files.filter(f => f.id !== fileId) };
      }
      return z;
    });
    actions.setUI({ desktopZones: updated });
  };

  // 구역 추가
  const addZone = () => {
    if (!newZone.label.trim()) return;
    const updated = [...desktopZones, {
      id: Date.now(),
      label: newZone.label.trim(),
      color: newZone.color,
      files: []
    }];
    actions.setUI({ desktopZones: updated });
    setNewZone({ label: '', color: '#3b82f6' });
    setAdding(false);
  };

  // 구역 삭제
  const deleteZone = (zoneId) => {
    const updated = desktopZones.filter(z => z.id !== zoneId);
    actions.setUI({ desktopZones: updated });
  };

  // 구역 이름 변경
  const renameZone = (zoneId) => {
    if (!editLabel.trim()) { setEditingZone(null); return; }
    const updated = desktopZones.map(z =>
      z.id === zoneId ? { ...z, label: editLabel.trim() } : z
    );
    actions.setUI({ desktopZones: updated });
    setEditingZone(null);
  };

  // 파일 크기 표시
  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / 1024 / 1024).toFixed(1) + 'MB';
  };

  // 파일 아이콘
  const getFileIcon = (name) => {
    const ext = name.split('.').pop()?.toLowerCase();
    const icons = {
      pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', ppt: '📎', pptx: '📎',
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', svg: '🖼️',
      mp4: '🎬', avi: '🎬', mov: '🎬', mp3: '🎵', wav: '🎵',
      zip: '📦', rar: '📦', '7z': '📦',
      exe: '⚙️', hwp: '📝', txt: '📃', csv: '📊'
    };
    return icons[ext] || '📄';
  };

  return (<>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {desktopZones.map(zone => (
        <div
          key={zone.id}
          onDrop={(e) => handleDrop(zone.id, e)}
          onDragOver={handleDragOver}
          style={{
            flex: '1 1 200px',
            minWidth: 200,
            maxWidth: 280,
            background: zone.color + '08',
            border: `1.5px dashed ${zone.color}50`,
            borderRadius: 14,
            padding: '12px 14px',
            minHeight: 140,
            transition: 'border-color 0.2s'
          }}
        >
          {/* 구역 헤더 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            {editingZone === zone.id ? (
              <input
                autoFocus
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                onBlur={() => renameZone(zone.id)}
                onKeyDown={e => { if (e.key === 'Enter') renameZone(zone.id); if (e.key === 'Escape') setEditingZone(null); }}
                style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: 120 }}
              />
            ) : (
              <div
                onDoubleClick={() => { setEditingZone(zone.id); setEditLabel(zone.label); }}
                style={{ fontSize: 13, fontWeight: 700, color: zone.color, cursor: 'pointer' }}
                title="더블클릭하여 이름 변경"
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: zone.color, display: 'inline-block', marginRight: 6 }} />
                {zone.label}
              </div>
            )}
            <div style={{ display: 'flex', gap: 4 }}>
              <span style={{ fontSize: 10, color: '#9ca3af', background: '#f3f4f6', borderRadius: 6, padding: '2px 6px' }}>
                {(zone.files || []).length}개
              </span>
              <button onClick={() => deleteZone(zone.id)}
                style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 12, padding: '0 2px' }}
                title="구역 삭제">✕</button>
            </div>
          </div>

          {/* 파일 목록 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(zone.files || []).map(file => (
              <div key={file.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#fff', borderRadius: 8, padding: '6px 8px',
                border: '0.5px solid #f0f0f0', cursor: 'pointer',
                fontSize: 12
              }}
                onClick={() => openFile(file.path)}
                title={file.path}
              >
                <span style={{ fontSize: 14 }}>{getFileIcon(file.name)}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151' }}>
                  {file.name}
                </span>
                <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>{formatSize(file.size)}</span>
                <button onClick={(e) => { e.stopPropagation(); removeFile(zone.id, file.id); }}
                  style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
              </div>
            ))}
          </div>

          {/* 드롭 안내 */}
          {(zone.files || []).length === 0 && (
            <div style={{ textAlign: 'center', padding: '16px 0', color: zone.color + '80', fontSize: 12 }}>
              📂 파일을 여기에 드래그하세요
            </div>
          )}
        </div>
      ))}

      {/* 구역 추가 */}
      {adding ? (
        <div style={{
          flex: '1 1 200px', minWidth: 200, maxWidth: 280,
          background: '#f9fafb', border: '1.5px dashed #d1d5db',
          borderRadius: 14, padding: '12px 14px'
        }}>
          <input placeholder="구역 이름" value={newZone.label}
            onChange={e => setNewZone({ ...newZone, label: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') addZone(); }}
            autoFocus
            style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 7, padding: '8px 10px', fontSize: 13, marginBottom: 8, fontFamily: 'inherit', outline: 'none' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>색상:</span>
            {['#ef4444', '#f97316', '#3b82f6', '#10b981', '#8b5cf6'].map(c => (
              <button key={c} onClick={() => setNewZone({ ...newZone, color: c })}
                style={{
                  width: 22, height: 22, borderRadius: '50%', background: c,
                  border: newZone.color === c ? '2.5px solid #1f2937' : '2px solid transparent',
                  cursor: 'pointer', padding: 0
                }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={addZone} style={{ flex: 1, background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 7, padding: '8px', fontSize: 12, cursor: 'pointer' }}>추가</button>
            <button onClick={() => setAdding(false)} style={{ flex: 1, background: '#e5e7eb', color: '#6b7280', border: 'none', borderRadius: 7, padding: '8px', fontSize: 12, cursor: 'pointer' }}>취소</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{
          flex: '0 0 60px', minHeight: 140,
          background: '#f9fafb', border: '1.5px dashed #d1d5db',
          borderRadius: 14, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 4, color: '#9ca3af'
        }}>
          <div style={{ fontSize: 20 }}>+</div>
          <div style={{ fontSize: 10 }}>구역 추가</div>
        </button>
      )}
    </div>

    {/* 폴더 파일 표시 */}
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>📁</span>
        <span>{desktopFiles.length > 0 ? '폴더 파일' : '바탕화면'}</span>
        <button onClick={async () => {
          if (window.electronAPI?.desktop?.getFiles) {
            const files = await window.electronAPI.desktop.getFiles();
            setDesktopFiles(files || []);
          }
        }} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 10 }}>🔄</button>
        <button onClick={() => {
          const path = prompt('표시할 폴더 경로를 입력하세요\n예: C:\\Users\\사용자\\Documents');
          if (path) {
            // 커스텀 폴더 경로를 localStorage에 저장
            localStorage.setItem('smart-desktop-folder', path);
            // 새로고침하여 반영
            window.location.reload();
          }
        }} style={{ background: 'none', border: 'none', color: theme.accentColor, cursor: 'pointer', fontSize: 10, marginLeft: 'auto' }}>📂 폴더 변경</button>
      </div>
      {desktopFiles.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {desktopFiles.map((f, i) => (
            <div key={i}
              onClick={() => openFile(f.path)}
              title={f.name}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                width: 58, padding: '4px 2px', borderRadius: 7, cursor: 'pointer',
                background: 'transparent', transition: 'background 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = theme.accentColor + '10'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: 22, marginBottom: 1 }}>{f.isDir ? '📁' : getFileIcon(f.name)}</span>
              <span style={{ fontSize: 8, color: '#6b7280', textAlign: 'center', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: '8px 0' }}>Electron 앱에서 파일이 표시됩니다</div>
      )}
    </div>
    </>
  );
}
