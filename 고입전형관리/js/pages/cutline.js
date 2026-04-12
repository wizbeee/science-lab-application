// cutline.js - 커트라인 분석 (교과성적/최종점수 선택, 50%/70% 커트라인, 정원내/외)
const CutlinePage = {
  async render(container) {
    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <h2 class="text-2xl font-bold text-gray-900">커트라인 분석</h2>
          <div class="flex gap-3 items-center">
            <select id="cutline-score-type" class="rounded-lg border-gray-300 text-sm px-3 py-2 font-medium">
              <option value="교과성적">교과성적(내신)</option>
              <option value="1단계최종점수">1단계 최종점수</option>
              <option value="면접점수">면접점수</option>
              <option value="최종점수">최종점수(면접포함)</option>
            </select>
            <select id="cutline-year" class="rounded-lg border-gray-300 text-sm px-3 py-2">
              <option value="">전체 연도</option>
            </select>
          </div>
        </div>

        <!-- 커트라인 요약 카드 -->
        <div id="cutline-summary" class="grid grid-cols-2 md:grid-cols-5 gap-4"></div>

        <!-- 정원내/정원외 커트라인 -->
        <div class="bg-white rounded-xl border p-6">
          <h3 class="text-lg font-semibold mb-4">정원별 커트라인</h3>
          <div id="quota-cutlines" class="grid grid-cols-1 md:grid-cols-3 gap-4"></div>
        </div>

        <!-- 시뮬레이션 -->
        <div class="bg-white rounded-xl border p-6">
          <h3 class="text-lg font-semibold mb-4">당락 시뮬레이션</h3>
          <div class="flex flex-wrap gap-4 items-end mb-4">
            <div>
              <label class="text-sm text-gray-600 block mb-1">모집인원</label>
              <input id="sim-slots" type="number" class="rounded-lg border-gray-300 text-sm px-3 py-2 w-32" value="360">
            </div>
            <div>
              <label class="text-sm text-gray-600 block mb-1">전형구분</label>
              <select id="sim-type" class="rounded-lg border-gray-300 text-sm px-3 py-2">
                <option value="">전체</option>
              </select>
            </div>
            <button id="btn-simulate" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm">시뮬레이션 실행</button>
          </div>
          <div id="sim-result" class="hidden"></div>
        </div>

        <!-- 차트 -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white rounded-xl border p-5">
            <h3 class="text-sm font-semibold text-gray-600 mb-3">점수 분포 + 커트라인</h3>
            <div style="height: 320px"><canvas id="chart-cutline"></canvas></div>
          </div>
          <div class="bg-white rounded-xl border p-5">
            <h3 class="text-sm font-semibold text-gray-600 mb-3">전형별 비교</h3>
            <div style="height: 320px"><canvas id="chart-cutline-type"></canvas></div>
          </div>
        </div>

        <!-- 점수대별 인원 -->
        <div class="bg-white rounded-xl border p-6">
          <h3 class="text-lg font-semibold mb-4">점수대별 인원</h3>
          <div id="score-bands"></div>
        </div>
      </div>
    `;

    const yearSelect = container.querySelector('#cutline-year');
    const years = await DB.getYears();
    years.forEach(y => { const o = document.createElement('option'); o.value = y; o.textContent = `${y}년`; yearSelect.appendChild(o); });
    if (years.length) yearSelect.value = years[0];

    const types = await DB.getDistinctValues('전형구분');
    const typeSelect = container.querySelector('#sim-type');
    types.forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t; typeSelect.appendChild(o); });

    yearSelect.addEventListener('change', () => this.loadData());
    document.getElementById('cutline-score-type')?.addEventListener('change', () => this.loadData());
    document.getElementById('btn-simulate')?.addEventListener('click', () => this.simulate());

    // 설정에서 모집인원 가져오기
    if (years.length) {
      const config = await DB.getYearlyConfig(Number(years[0]));
      if (config && config.정원내) {
        document.getElementById('sim-slots').value = config.정원내;
      } else if (config && config.모집인원) {
        document.getElementById('sim-slots').value = config.모집인원;
      }
    }

    await this.loadData();
  },

  getScoreField() {
    const el = document.getElementById('cutline-score-type');
    return el ? el.value : '교과성적';
  },

  getScore(item) {
    const field = this.getScoreField();
    return item[field];
  },

  async loadData() {
    const yearEl = document.getElementById('cutline-year');
    if (!yearEl) return;
    const 연도 = yearEl.value;
    const filters = 연도 ? { 연도: Number(연도) } : {};
    const applicants = await DB.getApplicants(filters);
    const summaries = 연도 ? await DB.getAllScoresSummary(Number(연도)) : await DB.getAllScoresSummary();
    const summaryMap = new Map(summaries.map(s => [s.접수번호, s]));
    const config = 연도 ? await DB.getYearlyConfig(Number(연도)) : null;

    const scoreField = this.getScoreField();
    const merged = applicants
      .map(a => ({ ...a, ...(summaryMap.get(a.접수번호) || {}) }))
      .filter(a => a[scoreField] != null)
      .sort((a, b) => b[scoreField] - a[scoreField]);

    this.data = merged;
    this.config = config;
    this.renderSummary(merged, config);
    this.renderQuotaCutlines(merged, config);
    this.renderCharts(merged, config);
    this.renderScoreBands(merged);
  },

  renderSummary(data, config) {
    const scoreField = this.getScoreField();
    const scores = data.map(d => d[scoreField]);
    const total = data.length;

    // 정원내 기본값 360
    const slots = (config && config.정원내) || (config && config.모집인원) || 360;
    const cutlineScore = total >= slots ? data[slots - 1][scoreField] : null;

    // 50% 커트라인 (중간 = 순위 50% 위치)
    const idx50 = Math.ceil(total * 0.5) - 1;
    const cut50 = total > 0 ? data[Math.min(idx50, total - 1)][scoreField] : null;

    // 70% 커트라인 (상위 70% = 순위 70% 위치, 100명중 70등)
    const idx70 = Math.ceil(total * 0.7) - 1;
    const cut70 = total > 0 ? data[Math.min(idx70, total - 1)][scoreField] : null;

    const summaryEl = document.getElementById('cutline-summary');
    if (!summaryEl) return;

    summaryEl.innerHTML = `
      <div class="bg-white rounded-xl border p-4">
        <p class="text-xs text-gray-500">정원 커트라인</p>
        <p class="text-2xl font-bold ${cutlineScore != null ? 'text-red-600' : 'text-gray-400'}">${cutlineScore != null ? Utils.formatNumber(cutlineScore) : '-'}</p>
        <p class="text-xs text-gray-400">${slots}명 기준</p>
      </div>
      <div class="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
        <p class="text-xs text-yellow-700 font-medium">50% (중간)</p>
        <p class="text-2xl font-bold text-yellow-600">${cut50 != null ? Utils.formatNumber(cut50) : '-'}</p>
        <p class="text-xs text-gray-400">${total > 0 ? `${Math.ceil(total * 0.5)}등 / ${total}명` : ''}</p>
      </div>
      <div class="bg-orange-50 rounded-xl border border-orange-200 p-4">
        <p class="text-xs text-orange-700 font-medium">70% (상위70%)</p>
        <p class="text-2xl font-bold text-orange-600">${cut70 != null ? Utils.formatNumber(cut70) : '-'}</p>
        <p class="text-xs text-gray-400">${total > 0 ? `${Math.ceil(total * 0.7)}등 / ${total}명` : ''}</p>
      </div>
      <div class="bg-white rounded-xl border p-4">
        <p class="text-xs text-gray-500">최고 / 최저</p>
        <p class="text-2xl font-bold text-blue-600">${scores.length ? Utils.formatNumber(Utils.max(scores)) : '-'}</p>
        <p class="text-xs text-gray-400">최저: ${scores.length ? Utils.formatNumber(Utils.min(scores)) : '-'}</p>
      </div>
      <div class="bg-white rounded-xl border p-4">
        <p class="text-xs text-gray-500">평균 / 중앙값</p>
        <p class="text-2xl font-bold text-green-600">${scores.length ? Utils.formatNumber(Utils.mean(scores)) : '-'}</p>
        <p class="text-xs text-gray-400">중앙값: ${scores.length ? Utils.formatNumber(Utils.median(scores)) : '-'}</p>
      </div>
    `;
  },

  renderQuotaCutlines(data, config) {
    const el = document.getElementById('quota-cutlines');
    if (!el) return;
    const scoreField = this.getScoreField();

    const 정원내 = (config && config.정원내) || 360;
    const 특례 = (config && config.특례) || 10;
    const 국가유공자 = (config && config.국가유공자) || 10;
    const 정원외합계 = (config && config.정원외합계) || 2;

    const cutInner = data.length >= 정원내 ? data[정원내 - 1][scoreField] : null;
    const cutTotal = data.length >= (정원내 + 정원외합계) ? data[정원내 + 정원외합계 - 1][scoreField] : null;

    el.innerHTML = `
      <div class="p-4 bg-blue-50 rounded-lg">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium text-blue-800">정원내</span>
          <span class="text-xs text-blue-600">${정원내}명</span>
        </div>
        <p class="text-2xl font-bold text-blue-700">${cutInner != null ? Utils.formatNumber(cutInner) : '-'}</p>
        <p class="text-xs text-blue-500 mt-1">경쟁률: ${data.length ? (data.length / 정원내).toFixed(1) + ':1' : '-'}</p>
      </div>
      <div class="p-4 bg-purple-50 rounded-lg">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium text-purple-800">정원외</span>
          <span class="text-xs text-purple-600">총 ${정원외합계}명</span>
        </div>
        <p class="text-2xl font-bold text-purple-700">${cutTotal != null ? Utils.formatNumber(cutTotal) : '-'}</p>
        <p class="text-xs text-purple-500 mt-1">특례 ${특례}명 / 국가유공자 ${국가유공자}명 범위</p>
      </div>
      <div class="p-4 bg-gray-50 rounded-lg">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium text-gray-800">총 모집</span>
          <span class="text-xs text-gray-600">${정원내 + 정원외합계}명</span>
        </div>
        <p class="text-xs text-gray-600 mt-2 leading-relaxed">
          정원내 ${정원내}명<br>
          + 정원외 ${정원외합계}명<br>
          <span class="text-gray-400">(특례 ${특례}명 한도, 국가유공자 ${국가유공자}명 한도)</span>
        </p>
      </div>
    `;
  },

  renderCharts(data, config) {
    const scoreField = this.getScoreField();
    const scores = data.map(d => d[scoreField]);
    const 정원내 = (config && config.정원내) || 360;

    if (scores.length) {
      const ranges = [];
      const minScore = Math.floor(Utils.min(scores) / 5) * 5;
      const maxScore = Math.ceil(Utils.max(scores) / 5) * 5;
      for (let i = maxScore; i >= minScore; i -= 5) {
        ranges.push({ label: `${i}~${i + 4}`, min: i, max: i + 4.99 });
      }
      const dist = Utils.distribution(scores, ranges);

      const cutlineScore = data.length >= 정원내 ? data[정원내 - 1][scoreField] : null;
      const idx50 = Math.ceil(data.length * 0.5) - 1;
      const cut50 = data.length > 0 ? data[Math.min(idx50, data.length - 1)][scoreField] : null;
      const idx70 = Math.ceil(data.length * 0.7) - 1;
      const cut70 = data.length > 0 ? data[Math.min(idx70, data.length - 1)][scoreField] : null;

      // 색상: 정원 커트 이하는 빨강, 70% 이하는 주황, 나머지 파랑
      const bgColors = dist.map(d => {
        if (cutlineScore != null && d.max < cutlineScore) return '#EF444460';
        if (cut70 != null && d.max < cut70) return '#F97316C0';
        return '#3B82F680';
      });

      const annotations = {};
      if (cutlineScore != null) {
        const cutLabel = ranges.findIndex(r => cutlineScore >= r.min && cutlineScore <= r.max);
        annotations.cutline = { type: 'line', xMin: cutLabel, xMax: cutLabel, borderColor: '#EF4444', borderWidth: 2, borderDash: [6, 3], label: { display: true, content: `정원 ${Utils.formatNumber(cutlineScore)}`, position: 'start', backgroundColor: '#EF4444' } };
      }
      if (cut50 != null) {
        const idx = ranges.findIndex(r => cut50 >= r.min && cut50 <= r.max);
        annotations.cut50 = { type: 'line', xMin: idx, xMax: idx, borderColor: '#EAB308', borderWidth: 2, borderDash: [4, 4], label: { display: true, content: `50% ${Utils.formatNumber(cut50)}`, position: 'center', backgroundColor: '#EAB308' } };
      }

      ChartHelpers.create('chart-cutline', {
        type: 'bar',
        data: {
          labels: dist.map(d => d.label),
          datasets: [{ label: '인원', data: dist.map(d => d.count), backgroundColor: bgColors, borderRadius: 4 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true } }
        }
      });
    }

    // 전형별 비교
    const byType = {};
    data.forEach(d => {
      const type = d.전형구분 || '미분류';
      if (!byType[type]) byType[type] = [];
      byType[type].push(d[scoreField]);
    });

    const types = Object.keys(byType);
    if (types.length) {
      ChartHelpers.bar('chart-cutline-type', {
        labels: types,
        datasets: [
          { label: '최고점', data: types.map(t => Utils.max(byType[t])), color: '#3B82F6' },
          { label: '평균', data: types.map(t => Utils.mean(byType[t])), color: '#10B981' },
          { label: '50%', data: types.map(t => { const s = [...byType[t]].sort((a,b) => b-a); const i = Math.ceil(s.length*0.5)-1; return s[Math.min(i,s.length-1)] || 0; }), color: '#EAB308' },
          { label: '70%', data: types.map(t => { const s = [...byType[t]].sort((a,b) => b-a); const i = Math.ceil(s.length*0.7)-1; return s[Math.min(i,s.length-1)] || 0; }), color: '#F97316' },
          { label: '최저점', data: types.map(t => Utils.min(byType[t])), color: '#EF4444' }
        ]
      });
    }
  },

  renderScoreBands(data) {
    const scoreField = this.getScoreField();
    const scores = data.map(d => d[scoreField]);
    const bandsEl = document.getElementById('score-bands');
    if (!bandsEl) return;

    if (!scores.length) {
      bandsEl.innerHTML = '<p class="text-gray-400 text-sm">데이터 없음</p>';
      return;
    }

    const 정원내 = (this.config && this.config.정원내) || 360;
    const idx50 = Math.ceil(data.length * 0.5);
    const idx70 = Math.ceil(data.length * 0.7);

    const ranges = Utils.autoRanges(scores).reverse();
    if (!ranges.length) { bandsEl.innerHTML = '<p class="text-gray-400 text-sm">데이터 없음</p>'; return; }

    const dist = Utils.distribution(scores, ranges);
    const maxCount = Math.max(...dist.map(x => x.count), 1);
    let cumulative = 0;

    bandsEl.innerHTML = `
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">점수대</th>
            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500">인원</th>
            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500">비율</th>
            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500">누적</th>
            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500">구간표시</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">바</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          ${dist.map(d => {
            const prevCum = cumulative;
            cumulative += d.count;
            const pct = (d.count / scores.length * 100).toFixed(1);
            const barWidth = (d.count / maxCount * 100);
            let markers = [];
            if (prevCum < 정원내 && cumulative >= 정원내) markers.push('<span class="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded font-medium">정원</span>');
            if (prevCum < idx50 && cumulative >= idx50) markers.push('<span class="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded font-medium">50%</span>');
            if (prevCum < idx70 && cumulative >= idx70) markers.push('<span class="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded font-medium">70%</span>');
            const rowBg = markers.length ? 'bg-gray-50' : '';
            return `<tr class="${rowBg}">
              <td class="px-4 py-2 text-sm font-medium">${d.label}</td>
              <td class="px-4 py-2 text-sm text-center">${d.count}명</td>
              <td class="px-4 py-2 text-sm text-center">${pct}%</td>
              <td class="px-4 py-2 text-sm text-center font-mono">${cumulative}명</td>
              <td class="px-4 py-2 text-center">${markers.join(' ') || ''}</td>
              <td class="px-4 py-2"><div class="h-4 rounded bg-blue-400" style="width: ${barWidth}%"></div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  },

  async simulate() {
    const slots = Number(document.getElementById('sim-slots').value);
    const typeFilter = document.getElementById('sim-type').value;
    const scoreField = this.getScoreField();

    if (!slots) { Toast.warning('모집인원을 입력해주세요.'); return; }

    let data = this.data || [];
    if (typeFilter) data = data.filter(d => d.전형구분 === typeFilter);
    data = [...data].sort((a, b) => b[scoreField] - a[scoreField]);

    const passed = data.slice(0, slots);
    const failed = data.slice(slots);
    const cutline = passed.length ? passed[passed.length - 1][scoreField] : null;
    const borderline = data.filter(d => cutline != null && Math.abs(d[scoreField] - cutline) <= 1);

    // 50%, 70% 커트라인
    const idx50 = Math.ceil(data.length * 0.5) - 1;
    const cut50 = data.length > 0 ? data[Math.min(idx50, data.length - 1)][scoreField] : null;
    const idx70 = Math.ceil(data.length * 0.7) - 1;
    const cut70 = data.length > 0 ? data[Math.min(idx70, data.length - 1)][scoreField] : null;

    const result = document.getElementById('sim-result');
    if (!result) return;
    result.classList.remove('hidden');
    result.innerHTML = `
      <div class="bg-blue-50 rounded-lg p-4 space-y-3">
        <div class="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div class="text-center">
            <p class="text-xs text-blue-500">모집인원</p>
            <p class="text-xl font-bold text-blue-700">${slots}명</p>
          </div>
          <div class="text-center">
            <p class="text-xs text-blue-500">지원자</p>
            <p class="text-xl font-bold text-blue-700">${data.length}명</p>
          </div>
          <div class="text-center">
            <p class="text-xs text-red-500 font-medium">정원 커트</p>
            <p class="text-xl font-bold text-red-600">${cutline != null ? Utils.formatNumber(cutline) : '-'}</p>
          </div>
          <div class="text-center">
            <p class="text-xs text-yellow-600 font-medium">50% (중간)</p>
            <p class="text-xl font-bold text-yellow-600">${cut50 != null ? Utils.formatNumber(cut50) : '-'}</p>
          </div>
          <div class="text-center">
            <p class="text-xs text-orange-600 font-medium">70% (상위70%)</p>
            <p class="text-xl font-bold text-orange-600">${cut70 != null ? Utils.formatNumber(cut70) : '-'}</p>
          </div>
          <div class="text-center">
            <p class="text-xs text-gray-500">커트라인 근접</p>
            <p class="text-xl font-bold text-gray-700">${borderline.length}명 <span class="text-xs font-normal">(±1점)</span></p>
          </div>
        </div>
        ${borderline.length ? `
        <div class="mt-3 pt-3 border-t border-blue-200">
          <p class="text-xs text-gray-600 font-medium mb-2">커트라인 근접 지원자:</p>
          <div class="flex flex-wrap gap-2">
            ${borderline.map(b => `<span class="px-2 py-1 bg-white rounded text-xs">${b.성명} (${Utils.formatNumber(b[scoreField])})</span>`).join('')}
          </div>
        </div>` : ''}
      </div>
    `;
  }
};

window.CutlinePage = CutlinePage;
