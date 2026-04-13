// results.js - 최종 합격자 관리/발표
const ResultsPage = {
  async render(container) {
    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex items-center justify-between">
          <h2 class="text-2xl font-bold text-gray-900">합격자 관리</h2>
          <div class="flex gap-3">
            <select id="results-year" class="rounded-lg border-gray-300 text-sm px-3 py-2">
              <option value="">전체 연도</option>
            </select>
            <select id="results-type" class="rounded-lg border-gray-300 text-sm px-3 py-2">
              <option value="">전체 전형</option>
            </select>
          </div>
        </div>

        <!-- 현황 요약 -->
        <div id="results-summary" class="grid grid-cols-2 md:grid-cols-5 gap-4"></div>

        <!-- 합격 처리 도구 -->
        <div class="bg-white rounded-xl border p-6">
          <h3 class="text-lg font-semibold mb-4">합불 처리</h3>
          <div class="flex flex-wrap gap-3 items-end mb-4">
            <div>
              <label class="text-sm text-gray-600 block mb-1">모집인원</label>
              <input id="results-slots" type="number" class="rounded-lg border-gray-300 text-sm px-3 py-2 w-32">
            </div>
            <button id="btn-auto-select" class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm">
              성적순 자동 선발
            </button>
            <button id="btn-export-passed" class="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm">
              합격자 명단 내보내기
            </button>
            <button id="btn-print-result" class="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm">
              합격자 발표 인쇄
            </button>
          </div>
        </div>

        <!-- 결과 테이블 -->
        <div class="bg-white rounded-xl border p-4">
          <div id="results-table"></div>
        </div>
      </div>
    `;

    const yearSelect = container.querySelector('#results-year');
    const years = await DB.getYears();
    years.forEach(y => { const o = document.createElement('option'); o.value = y; o.textContent = `${y}년`; yearSelect.appendChild(o); });
    if (years.length) yearSelect.value = years[0];

    const typeSelect = container.querySelector('#results-type');
    const types = await DB.getDistinctValues('전형구분');
    types.forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t; typeSelect.appendChild(o); });

    yearSelect?.addEventListener('change', () => this.loadData());
    typeSelect?.addEventListener('change', () => this.loadData());

    document.getElementById('btn-auto-select')?.addEventListener('click', () => this.autoSelect());
    document.getElementById('btn-export-passed')?.addEventListener('click', () => this.exportPassed());
    document.getElementById('btn-print-result')?.addEventListener('click', () => this.printResult());

    const config = years.length ? await DB.getYearlyConfig(years[0]) : null;
    if (config && config.모집인원) document.getElementById('results-slots').value = config.모집인원;

    await this.loadData();
  },

  async loadData() {
    const yearEl = document.getElementById('results-year');
    if (!yearEl) return;
    const 연도 = yearEl.value;
    const 전형 = document.getElementById('results-type')?.value;
    const filters = {};
    if (연도) filters.연도 = Number(연도);
    if (전형) filters.전형구분 = 전형;

    const applicants = await DB.getApplicants(filters);
    const summaries = 연도 ? await DB.getAllScoresSummary(Number(연도)) : await DB.getAllScoresSummary();
    const summaryMap = new Map(summaries.map(s => [s.접수번호, s]));

    const merged = applicants
      .map(a => {
        const s = summaryMap.get(a.접수번호) || {};
        return { ...a, 교과성적: s.교과성적, 면접점수: s.면접점수, 최종점수: s.최종점수, 합불여부: s.합불여부 || a.합불여부 };
      })
      .sort((a, b) => (b.최종점수 || 0) - (a.최종점수 || 0))
      .map((a, i) => ({ ...a, 순위: a.최종점수 != null ? i + 1 : '-' }));

    this.currentData = merged;
    this.summaryMap = summaryMap;

    // 요약
    const total = merged.length;
    const passed = merged.filter(a => a.합불여부 === '합격' || a.합불여부 === '추가합격').length;
    const failed = merged.filter(a => a.합불여부 === '불합격').length;
    const waiting = merged.filter(a => a.합불여부 === '대기').length;
    const undecided = merged.filter(a => !a.합불여부 || a.합불여부 === '').length;

    document.getElementById('results-summary').innerHTML = `
      <div class="bg-white rounded-xl border p-4 text-center">
        <p class="text-xs text-gray-500">전체</p><p class="text-2xl font-bold">${total}</p>
      </div>
      <div class="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
        <p class="text-xs text-green-600">합격</p><p class="text-2xl font-bold text-green-700">${passed}</p>
      </div>
      <div class="bg-red-50 rounded-xl border border-red-200 p-4 text-center">
        <p class="text-xs text-red-600">불합격</p><p class="text-2xl font-bold text-red-700">${failed}</p>
      </div>
      <div class="bg-yellow-50 rounded-xl border border-yellow-200 p-4 text-center">
        <p class="text-xs text-yellow-600">대기</p><p class="text-2xl font-bold text-yellow-700">${waiting}</p>
      </div>
      <div class="bg-gray-50 rounded-xl border p-4 text-center">
        <p class="text-xs text-gray-500">미정</p><p class="text-2xl font-bold text-gray-400">${undecided}</p>
      </div>
    `;

    // 테이블
    if (!this.table) {
      this.table = new DataTable('#results-table', {
        columns: [
          { key: '순위', label: '순위', className: 'font-mono w-16' },
          { key: '접수번호', label: '접수번호' },
          { key: '성명', label: '성명', className: 'font-medium' },
          { key: '출신중', label: '출신중' },
          { key: '전형구분', label: '전형구분' },
          { key: '최종점수', label: '최종점수', render: v => v != null ? `<span class="font-mono font-bold">${Utils.formatNumber(v)}</span>` : '-' },
          { key: '합불여부', label: '합불여부', render: (v, row) =>
            `<select class="result-select text-xs rounded border-gray-300 py-1 ${this.getSelectColor(v)}" data-id="${row.접수번호}">
              <option value="">미정</option>
              <option value="합격" ${v === '합격' ? 'selected' : ''}>합격</option>
              <option value="불합격" ${v === '불합격' ? 'selected' : ''}>불합격</option>
              <option value="대기" ${v === '대기' ? 'selected' : ''}>대기</option>
              <option value="추가합격" ${v === '추가합격' ? 'selected' : ''}>추가합격</option>
            </select>`
          }
        ],
        onRowClick: (id) => App.navigate('applicant-detail', { 접수번호: id }),
        pageSize: 100
      });
    }
    this.table.setData(merged);

    // 합불 변경 이벤트
    setTimeout(() => {
      document.querySelectorAll('.result-select').forEach(sel => {
        sel.addEventListener('click', e => e.stopPropagation());
        sel.addEventListener('change', async (e) => {
          const id = e.target.dataset.id;
          const value = e.target.value;
          // DB 업데이트
          const existing = await DB.getScoresSummary(id) || { 접수번호: id };
          existing.합불여부 = value;
          await DB.putScoresSummary(existing);
          const applicant = await DB.getApplicant(id);
          if (applicant) { applicant.합불여부 = value; await DB.putApplicant(applicant); }
          Toast.success(`${id} → ${value || '미정'}`);
          e.target.className = `result-select text-xs rounded border-gray-300 py-1 ${this.getSelectColor(value)}`;
        });
      });
    }, 100);
  },

  async autoSelect() {
    const slots = Number(document.getElementById('results-slots').value);
    if (!slots) { Toast.warning('모집인원을 입력해주세요.'); return; }

    const data = this.currentData.filter(a => a.최종점수 != null).sort((a, b) => b.최종점수 - a.최종점수);
    const ok = await Modal.confirm(`상위 ${slots}명을 합격으로, 나머지를 불합격으로 처리하시겠습니까?\n\n(총 ${data.length}명 중 점수가 있는 지원자 대상)`);
    if (!ok) return;

    for (let i = 0; i < data.length; i++) {
      const result = i < slots ? '합격' : '불합격';
      const existing = await DB.getScoresSummary(data[i].접수번호) || { 접수번호: data[i].접수번호 };
      existing.합불여부 = result;
      await DB.putScoresSummary(existing);
      const applicant = await DB.getApplicant(data[i].접수번호);
      if (applicant) { applicant.합불여부 = result; await DB.putApplicant(applicant); }
    }

    Toast.success(`${Math.min(slots, data.length)}명 합격, ${Math.max(0, data.length - slots)}명 불합격 처리 완료`);
    this.loadData();
  },

  async exportPassed() {
    const passed = this.currentData.filter(a => a.합불여부 === '합격' || a.합불여부 === '추가합격');
    if (!passed.length) { Toast.warning('합격자가 없습니다.'); return; }
    ImportExport.downloadExcel(passed.map((p, i) => ({
      순번: i + 1, 접수번호: p.접수번호, 수험번호: p.수험번호, 성명: p.성명,
      출신중: p.출신중, 전형구분: p.전형구분, 최종점수: p.최종점수, 합불여부: p.합불여부
    })), '합격자명단');
    Toast.success('합격자 명단을 내보냈습니다.');
  },

  printResult() {
    const passed = this.currentData.filter(a => a.합불여부 === '합격' || a.합불여부 === '추가합격');
    const year = document.getElementById('results-year').value || '';

    const printContent = `
      <div style="font-family: 'Malgun Gothic', sans-serif; padding: 40px;">
        <h1 style="text-align: center; font-size: 24px; margin-bottom: 8px;">${year}학년도 신입생 합격자 명단</h1>
        <p style="text-align: center; color: #666; margin-bottom: 30px;">총 ${passed.length}명</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="border: 1px solid #d1d5db; padding: 8px;">순번</th>
              <th style="border: 1px solid #d1d5db; padding: 8px;">수험번호</th>
              <th style="border: 1px solid #d1d5db; padding: 8px;">성명</th>
              <th style="border: 1px solid #d1d5db; padding: 8px;">출신중</th>
              <th style="border: 1px solid #d1d5db; padding: 8px;">전형구분</th>
            </tr>
          </thead>
          <tbody>
            ${passed.map((p, i) => `<tr>
              <td style="border: 1px solid #d1d5db; padding: 6px; text-align: center;">${i + 1}</td>
              <td style="border: 1px solid #d1d5db; padding: 6px; text-align: center;">${p.수험번호 || ''}</td>
              <td style="border: 1px solid #d1d5db; padding: 6px; text-align: center;">${p.성명 || ''}</td>
              <td style="border: 1px solid #d1d5db; padding: 6px; text-align: center;">${p.출신중 || ''}</td>
              <td style="border: 1px solid #d1d5db; padding: 6px; text-align: center;">${p.전형구분 || ''}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;

    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>합격자 명단</title></head><body>${printContent}</body></html>`);
    win.document.close();
    win.print();
  },

  getSelectColor(v) {
    const colors = { '합격': 'bg-green-100 text-green-700', '불합격': 'bg-red-100 text-red-700', '대기': 'bg-yellow-100 text-yellow-700', '추가합격': 'bg-blue-100 text-blue-700' };
    return colors[v] || '';
  }
};

window.ResultsPage = ResultsPage;
