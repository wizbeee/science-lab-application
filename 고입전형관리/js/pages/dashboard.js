// dashboard.js - 대시보드 (종합 현황)
const DashboardPage = {
  async render(container) {
    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex items-center justify-between">
          <h2 class="text-2xl font-bold text-gray-900">대시보드</h2>
          <div class="flex items-center gap-3">
            <select id="dash-year" class="rounded-lg border-gray-300 text-sm px-3 py-2">
              <option value="">전체 연도</option>
            </select>
          </div>
        </div>

        <!-- 요약 카드 -->
        <div id="dash-summary" class="grid grid-cols-2 md:grid-cols-4 gap-4"></div>

        <!-- 차트 영역 -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white rounded-xl border p-5">
            <h3 class="text-sm font-semibold text-gray-600 mb-3">전형구분별 지원 현황</h3>
            <div style="height: 280px"><canvas id="chart-admission-type"></canvas></div>
          </div>
          <div class="bg-white rounded-xl border p-5">
            <h3 class="text-sm font-semibold text-gray-600 mb-3">합불 현황</h3>
            <div style="height: 280px"><canvas id="chart-result-dist"></canvas></div>
          </div>
          <div class="bg-white rounded-xl border p-5">
            <h3 class="text-sm font-semibold text-gray-600 mb-3">최종점수 분포</h3>
            <div style="height: 280px"><canvas id="chart-score-dist"></canvas></div>
          </div>
          <div class="bg-white rounded-xl border p-5">
            <h3 class="text-sm font-semibold text-gray-600 mb-3">지역별 지원 현황 (상위 10)</h3>
            <div style="height: 280px"><canvas id="chart-region"></canvas></div>
          </div>
          <div class="bg-white rounded-xl border p-5 lg:col-span-2">
            <h3 class="text-sm font-semibold text-gray-600 mb-3">출신중 지원 현황 (상위 15)</h3>
            <div style="height: 300px"><canvas id="chart-schools"></canvas></div>
          </div>
        </div>
      </div>
    `;

    const yearSelect = container.querySelector('#dash-year');
    const years = await DB.getYears();
    years.forEach(y => {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = `${y}년`;
      yearSelect.appendChild(opt);
    });

    if (years.length) yearSelect.value = years[0];

    yearSelect.addEventListener('change', () => this.loadData(yearSelect.value));
    this.loadData(yearSelect.value);
  },

  async loadData(연도) {
    const filters = 연도 ? { 연도: Number(연도) } : {};
    const applicants = await DB.getApplicants(filters);
    const summaries = 연도 ? await DB.getAllScoresSummary(Number(연도)) : await DB.getAllScoresSummary();
    const config = 연도 ? await DB.getYearlyConfig(Number(연도)) : null;
    const summaryMap = new Map(summaries.map(s => [s.접수번호, s]));

    // 요약 카드
    const total = applicants.length;
    const slots = config ? config.모집인원 : '-';
    const rate = config && config.모집인원 ? (total / config.모집인원).toFixed(1) : '-';
    const passed = applicants.filter(a => {
      const s = summaryMap.get(a.접수번호);
      return s && (s.합불여부 === '합격' || a.합불여부 === '합격');
    }).length;

    const avgScore = summaries.filter(s => s.최종점수 != null).map(s => s.최종점수);

    document.getElementById('dash-summary').innerHTML = `
      ${this.card('지원자 수', `${total}명`, 'text-blue-600', '전체 지원자')}
      ${this.card('모집 인원', typeof slots === 'number' ? `${slots}명` : slots, 'text-green-600', '정원')}
      ${this.card('경쟁률', rate !== '-' ? `${rate}:1` : '-', 'text-purple-600', '지원자/정원')}
      ${this.card('합격자', `${passed}명`, 'text-orange-600', avgScore.length ? `평균 ${Utils.formatNumber(Utils.mean(avgScore))}점` : '')}
    `;

    // 전형구분별
    const byType = {};
    applicants.forEach(a => { byType[a.전형구분 || '미분류'] = (byType[a.전형구분 || '미분류'] || 0) + 1; });
    const typeLabels = Object.keys(byType);
    ChartHelpers.pie('chart-admission-type', {
      labels: typeLabels, data: typeLabels.map(k => byType[k]), doughnut: true
    });

    // 합불 현황
    const byResult = {};
    applicants.forEach(a => {
      const s = summaryMap.get(a.접수번호);
      const result = (s && s.합불여부) || a.합불여부 || '미정';
      byResult[result] = (byResult[result] || 0) + 1;
    });
    const resultLabels = Object.keys(byResult);
    ChartHelpers.pie('chart-result-dist', {
      labels: resultLabels, data: resultLabels.map(k => byResult[k]), doughnut: true
    });

    // 최종점수 분포
    const scores = summaries.map(s => s.최종점수).filter(v => v != null);
    if (scores.length) {
      ChartHelpers.histogram('chart-score-dist', { data: scores, title: '' });
    }

    // 지역별
    const byRegion = {};
    applicants.forEach(a => { if (a.지역) byRegion[a.지역] = (byRegion[a.지역] || 0) + 1; });
    const regionEntries = Object.entries(byRegion).sort((a, b) => b[1] - a[1]).slice(0, 10);
    ChartHelpers.bar('chart-region', {
      labels: regionEntries.map(e => e[0]),
      datasets: [{ label: '지원자 수', data: regionEntries.map(e => e[1]) }],
      horizontal: true
    });

    // 출신중별
    const bySchool = {};
    applicants.forEach(a => { if (a.출신중) bySchool[a.출신중] = (bySchool[a.출신중] || 0) + 1; });
    const schoolEntries = Object.entries(bySchool).sort((a, b) => b[1] - a[1]).slice(0, 15);
    ChartHelpers.bar('chart-schools', {
      labels: schoolEntries.map(e => e[0]),
      datasets: [{ label: '지원자 수', data: schoolEntries.map(e => e[1]) }]
    });
  },

  card(title, value, color, sub) {
    return `
      <div class="bg-white rounded-xl border p-5">
        <p class="text-sm text-gray-500">${title}</p>
        <p class="text-3xl font-bold ${color} mt-1">${value}</p>
        ${sub ? `<p class="text-xs text-gray-400 mt-1">${sub}</p>` : ''}
      </div>
    `;
  }
};

window.DashboardPage = DashboardPage;
