// analysis.js - 성적 분석 (과목별, 전형별 비교)
const AnalysisPage = {
  async render(container) {
    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <h2 class="text-2xl font-bold text-gray-900">성적 분석</h2>
          <div class="flex gap-3">
            <select id="analysis-score-type" class="rounded-lg border-gray-300 text-sm px-3 py-2 font-medium">
              <option value="교과성적">교과성적(내신)</option>
              <option value="1단계최종점수">1단계 최종점수</option>
              <option value="최종점수">최종점수(면접포함)</option>
            </select>
            <select id="analysis-year" class="rounded-lg border-gray-300 text-sm px-3 py-2">
              <option value="">전체 연도</option>
            </select>
          </div>
        </div>

        <!-- 분석 탭 -->
        <div class="flex gap-2 border-b">
          <button class="analysis-tab px-4 py-2 text-sm font-medium border-b-2 border-blue-500 text-blue-600" data-tab="overview">종합</button>
          <button class="analysis-tab px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700" data-tab="subject">과목별</button>
          <button class="analysis-tab px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700" data-tab="type">전형별</button>
          <button class="analysis-tab px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700" data-tab="rank">순위</button>
        </div>

        <div id="analysis-content"></div>
      </div>
    `;

    const yearSelect = container.querySelector('#analysis-year');
    const years = await DB.getYears();
    years.forEach(y => { const o = document.createElement('option'); o.value = y; o.textContent = `${y}년`; yearSelect.appendChild(o); });
    if (years.length) yearSelect.value = years[0];

    yearSelect.addEventListener('change', () => this.loadTab());
    document.getElementById('analysis-score-type')?.addEventListener('change', () => this.loadTab());

    container.querySelectorAll('.analysis-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('.analysis-tab').forEach(t => {
          t.classList.remove('border-b-2', 'border-blue-500', 'text-blue-600');
          t.classList.add('text-gray-500');
        });
        tab.classList.add('border-b-2', 'border-blue-500', 'text-blue-600');
        tab.classList.remove('text-gray-500');
        this.currentTab = tab.dataset.tab;
        this.loadTab();
      });
    });

    this.currentTab = 'overview';
    this.loadTab();
  },

  getScoreField() {
    const el = document.getElementById('analysis-score-type');
    return el ? el.value : '교과성적';
  },

  async loadTab() {
    const yearEl = document.getElementById('analysis-year');
    if (!yearEl) return;
    const 연도 = yearEl.value;
    const filters = 연도 ? { 연도: Number(연도) } : {};
    const content = document.getElementById('analysis-content');
    if (!content) return;

    const applicants = await DB.getApplicants(filters);
    const summaries = 연도 ? await DB.getAllScoresSummary(Number(연도)) : await DB.getAllScoresSummary();
    const summaryMap = new Map(summaries.map(s => [s.접수번호, s]));

    switch (this.currentTab) {
      case 'overview': await this.renderOverview(content, applicants, summaries, summaryMap); break;
      case 'subject': await this.renderSubject(content, applicants); break;
      case 'type': await this.renderByType(content, applicants, summaryMap); break;
      case 'rank': await this.renderRank(content, applicants, summaryMap); break;
    }
  },

  async renderOverview(container, applicants, summaries, summaryMap) {
    const scoreField = this.getScoreField();
    const scores = summaries.map(s => s[scoreField]).filter(v => v != null);
    const docScores = summaries.map(s => s.교과성적).filter(v => v != null);
    const intScores = summaries.map(s => s.면접점수).filter(v => v != null);

    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        ${this.statCard(scoreField, scores)}
        ${scoreField !== '교과성적' ? this.statCard('교과성적', docScores) : this.statCard('1단계최종점수', summaries.map(s => s['1단계최종점수']).filter(v => v != null))}
        ${this.statCard('면접점수', intScores)}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white rounded-xl border p-5">
          <h3 class="text-sm font-semibold text-gray-600 mb-3">${scoreField} 분포</h3>
          <div style="height: 280px"><canvas id="chart-analysis-dist"></canvas></div>
        </div>
        <div class="bg-white rounded-xl border p-5">
          <h3 class="text-sm font-semibold text-gray-600 mb-3">${intScores.length ? '교과성적 vs 면접점수' : '교과성적 분포 (상세)'}</h3>
          <div style="height: 280px"><canvas id="chart-scatter"></canvas></div>
        </div>
      </div>
    `;

    if (scores.length) {
      ChartHelpers.histogram('chart-analysis-dist', { data: scores, title: '' });
    }

    // 면접점수 있으면 산점도, 없으면 교과성적 상세 분포
    if (intScores.length) {
      const scatterData = summaries
        .filter(s => s.교과성적 != null && s.면접점수 != null)
        .map(s => ({ x: s.교과성적, y: s.면접점수 }));
      ChartHelpers.create('chart-scatter', {
        type: 'scatter',
        data: { datasets: [{ label: '지원자', data: scatterData, backgroundColor: '#3B82F680', pointRadius: 4 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: { x: { title: { display: true, text: '교과성적' } }, y: { title: { display: true, text: '면접점수' } } },
          plugins: { legend: { display: false } }
        }
      });
    } else if (docScores.length) {
      // 면접 없으면 교과성적 5점 단위 상세 분포
      const ranges = Utils.autoRanges(docScores, 5);
      ChartHelpers.histogram('chart-scatter', { data: docScores, ranges, title: '' });
    }
  },

  async renderSubject(container, applicants) {
    const ids = applicants.map(a => a.접수번호);
    const converted = await db.convertedScores.where('접수번호').anyOf(ids).toArray();

    // 과목별 환산점수 통계
    const bySubject = {};
    converted.forEach(c => {
      if (!bySubject[c.과목]) bySubject[c.과목] = [];
      if (c.환산점수 != null) bySubject[c.과목].push(c.환산점수);
    });

    const subjects = Object.keys(bySubject);
    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        ${subjects.map(s => this.statCard(s + ' (환산)', bySubject[s])).join('')}
      </div>
      <div class="bg-white rounded-xl border p-5">
        <h3 class="text-sm font-semibold text-gray-600 mb-3">과목별 환산점수 비교</h3>
        <div style="height: 350px"><canvas id="chart-subject-compare"></canvas></div>
      </div>
    `;

    if (subjects.length) {
      ChartHelpers.boxPlot('chart-subject-compare', {
        groups: subjects.map(s => ({ label: s, data: bySubject[s] })),
        title: '과목별 환산점수 분포 (최소, Q1, 중앙값, Q3, 최대)'
      });
    }
  },

  async renderByType(container, applicants, summaryMap) {
    const scoreField = this.getScoreField();
    const byType = {};
    applicants.forEach(a => {
      const type = a.전형구분 || '미분류';
      if (!byType[type]) byType[type] = [];
      const s = summaryMap.get(a.접수번호);
      if (s && s[scoreField] != null) byType[type].push(s[scoreField]);
    });

    const types = Object.keys(byType);
    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-${Math.min(types.length, 3)} gap-4 mb-6">
        ${types.map(t => this.statCard(t, byType[t])).join('')}
      </div>
      <div class="bg-white rounded-xl border p-5">
        <h3 class="text-sm font-semibold text-gray-600 mb-3">전형별 ${scoreField} 분포</h3>
        <div style="height: 350px"><canvas id="chart-type-compare"></canvas></div>
      </div>
    `;

    if (types.length) {
      ChartHelpers.boxPlot('chart-type-compare', {
        groups: types.map(t => ({ label: t, data: byType[t] })),
        title: `전형별 ${scoreField} 분포`
      });
    }
  },

  async renderRank(container, applicants, summaryMap) {
    const scoreField = this.getScoreField();
    const ranked = applicants
      .map(a => {
        const s = summaryMap.get(a.접수번호) || {};
        return { ...a, 최종점수: s.최종점수, 교과성적: s.교과성적, '1단계최종점수': s['1단계최종점수'], 면접점수: s.면접점수, 합불여부: s.합불여부 || a.합불여부 };
      })
      .filter(a => a[scoreField] != null)
      .sort((a, b) => b[scoreField] - a[scoreField])
      .map((a, i) => ({ ...a, 순위: i + 1, _정렬점수: a[scoreField] }));

    container.innerHTML = `
      <div class="bg-white rounded-xl border p-4">
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm text-gray-500">총 ${ranked.length}명 (점수 있는 지원자)</p>
          <button id="btn-export-rank" class="px-3 py-1 border rounded-lg text-sm hover:bg-gray-50">Excel 내보내기</button>
        </div>
        <div id="rank-table"></div>
      </div>
    `;

    const table = new DataTable('#rank-table', {
      columns: [
        { key: '순위', label: '순위', className: 'font-mono' },
        { key: '접수번호', label: '접수번호' },
        { key: '성명', label: '성명', className: 'font-medium' },
        { key: '출신중', label: '출신중' },
        { key: '전형구분', label: '전형구분' },
        { key: '교과성적', label: '교과성적', render: v => v != null ? Utils.formatNumber(v) : '-' },
        { key: '면접점수', label: '면접점수', render: v => v != null ? Utils.formatNumber(v) : '-' },
        { key: '_정렬점수', label: scoreField, render: v => `<span class="font-mono font-bold">${Utils.formatNumber(v)}</span>` },
        { key: '합불여부', label: '합불여부', render: v => v ? `<span class="px-2 py-0.5 rounded-full text-xs font-medium ${ApplicantsPage.getResultColor(v)}">${v}</span>` : '-' }
      ],
      onRowClick: (id) => App.navigate('applicant-detail', { 접수번호: id }),
      pageSize: 100
    });
    table.setData(ranked);

    document.getElementById('btn-export-rank').addEventListener('click', () => {
      ImportExport.downloadExcel(ranked.map(r => ({
        순위: r.순위, 접수번호: r.접수번호, 수험번호: r.수험번호,
        성명: r.성명, 출신중: r.출신중, 전형구분: r.전형구분,
        교과성적: r.교과성적, 면접점수: r.면접점수, 최종점수: r.최종점수, 합불여부: r.합불여부
      })), '성적순위');
      Toast.success('순위 데이터를 내보냈습니다.');
    });
  },

  statCard(label, arr) {
    if (!arr || !arr.length) {
      return `<div class="bg-white rounded-xl border p-4">
        <h4 class="text-sm font-medium text-gray-600 mb-2">${label}</h4>
        <p class="text-gray-400 text-sm">데이터 없음</p>
      </div>`;
    }
    return `<div class="bg-white rounded-xl border p-4">
      <h4 class="text-sm font-medium text-gray-600 mb-2">${label} <span class="text-gray-400">(${arr.length}명)</span></h4>
      <div class="grid grid-cols-4 gap-2 text-center">
        <div><p class="text-xs text-gray-400">평균</p><p class="font-bold text-blue-600">${Utils.formatNumber(Utils.mean(arr))}</p></div>
        <div><p class="text-xs text-gray-400">중앙값</p><p class="font-bold">${Utils.formatNumber(Utils.median(arr))}</p></div>
        <div><p class="text-xs text-gray-400">최고</p><p class="font-bold text-green-600">${Utils.formatNumber(Utils.max(arr))}</p></div>
        <div><p class="text-xs text-gray-400">최저</p><p class="font-bold text-red-600">${Utils.formatNumber(Utils.min(arr))}</p></div>
      </div>
      <div class="mt-2 text-xs text-gray-400 text-center">표준편차: ${Utils.formatNumber(Utils.stdDev(arr))}</div>
    </div>`;
  }
};

window.AnalysisPage = AnalysisPage;
