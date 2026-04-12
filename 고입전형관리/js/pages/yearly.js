// yearly.js - 연도별 비교/추이
const YearlyPage = {
  async render(container) {
    container.innerHTML = `
      <div class="space-y-6">
        <h2 class="text-2xl font-bold text-gray-900">연도별 비교/추이</h2>

        <!-- 연도별 요약 카드 -->
        <div id="yearly-cards" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"></div>

        <!-- 차트 -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white rounded-xl border p-5">
            <h3 class="text-sm font-semibold text-gray-600 mb-3">연도별 지원자 수 / 경쟁률</h3>
            <div style="height: 300px"><canvas id="chart-yearly-count"></canvas></div>
          </div>
          <div class="bg-white rounded-xl border p-5">
            <h3 class="text-sm font-semibold text-gray-600 mb-3">연도별 최종점수 추이</h3>
            <div style="height: 300px"><canvas id="chart-yearly-score"></canvas></div>
          </div>
          <div class="bg-white rounded-xl border p-5">
            <h3 class="text-sm font-semibold text-gray-600 mb-3">연도별 전형구분 분포</h3>
            <div style="height: 300px"><canvas id="chart-yearly-type"></canvas></div>
          </div>
          <div class="bg-white rounded-xl border p-5">
            <h3 class="text-sm font-semibold text-gray-600 mb-3">연도별 합격률 추이</h3>
            <div style="height: 300px"><canvas id="chart-yearly-rate"></canvas></div>
          </div>
        </div>

        <!-- 상세 테이블 -->
        <div class="bg-white rounded-xl border p-6">
          <h3 class="text-lg font-semibold mb-4">연도별 상세 비교</h3>
          <div id="yearly-table" class="overflow-x-auto"></div>
        </div>
      </div>
    `;

    await this.loadData();
  },

  async loadData() {
    const years = await DB.getYears();
    const cardsEl = document.getElementById('yearly-cards');
    if (!cardsEl) return;
    if (!years.length) {
      cardsEl.innerHTML = '<p class="text-gray-400 col-span-4 text-center py-8">데이터가 없습니다. 먼저 데이터를 가져와주세요.</p>';
      return;
    }

    const configs = await DB.getAllYearlyConfigs();
    const configMap = new Map(configs.map(c => [c.연도, c]));

    const yearData = [];
    for (const year of years.sort()) {
      const applicants = await DB.getApplicants({ 연도: year });
      const summaries = await DB.getAllScoresSummary(year);
      const summaryMap = new Map(summaries.map(s => [s.접수번호, s]));
      const config = configMap.get(year);

      const scores = summaries.map(s => s.최종점수).filter(v => v != null);
      const passed = applicants.filter(a => {
        const s = summaryMap.get(a.접수번호);
        const result = (s && s.합불여부) || a.합불여부;
        return result === '합격' || result === '추가합격';
      });

      const types = {};
      applicants.forEach(a => { types[a.전형구분 || '미분류'] = (types[a.전형구분 || '미분류'] || 0) + 1; });

      yearData.push({
        연도: year,
        지원자: applicants.length,
        모집인원: config ? config.모집인원 : null,
        경쟁률: config && config.모집인원 ? (applicants.length / config.모집인원).toFixed(1) : null,
        합격자: passed.length,
        합격률: applicants.length ? (passed.length / applicants.length * 100).toFixed(1) : '0.0',
        최고점: scores.length ? Utils.max(scores) : null,
        평균점: scores.length ? Utils.mean(scores) : null,
        최저점: scores.length ? Utils.min(scores) : null,
        중앙값: scores.length ? Utils.median(scores) : null,
        전형분포: types
      });
    }

    this.renderCards(yearData);
    this.renderCharts(yearData);
    this.renderTable(yearData);
  },

  renderCards(data) {
    document.getElementById('yearly-cards').innerHTML = data.map(d => `
      <div class="bg-white rounded-xl border p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-lg font-bold text-gray-900">${d.연도}년</h3>
          <span class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">${d.경쟁률 ? d.경쟁률 + ':1' : '-'}</span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <div><span class="text-gray-400">지원자</span> <span class="font-bold">${d.지원자}명</span></div>
          <div><span class="text-gray-400">합격자</span> <span class="font-bold text-green-600">${d.합격자}명</span></div>
          <div><span class="text-gray-400">평균점</span> <span class="font-bold">${d.평균점 != null ? Utils.formatNumber(d.평균점) : '-'}</span></div>
          <div><span class="text-gray-400">합격률</span> <span class="font-bold">${d.합격률}%</span></div>
        </div>
      </div>
    `).join('');
  },

  renderCharts(data) {
    const labels = data.map(d => `${d.연도}년`);

    // 지원자 수 + 경쟁률
    ChartHelpers.create('chart-yearly-count', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: '지원자 수', data: data.map(d => d.지원자), backgroundColor: '#3B82F6', borderRadius: 4, yAxisID: 'y' },
          { label: '경쟁률', data: data.map(d => d.경쟁률 ? Number(d.경쟁률) : null), borderColor: '#EF4444', backgroundColor: '#EF444420', type: 'line', yAxisID: 'y1', tension: 0.3, pointRadius: 5 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, position: 'left', title: { display: true, text: '지원자 수' } },
          y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '경쟁률' } }
        }
      }
    });

    // 점수 추이
    ChartHelpers.line('chart-yearly-score', {
      labels,
      datasets: [
        { label: '최고점', data: data.map(d => d.최고점), color: '#10B981' },
        { label: '평균', data: data.map(d => d.평균점), color: '#3B82F6' },
        { label: '중앙값', data: data.map(d => d.중앙값), color: '#F59E0B' },
        { label: '최저점', data: data.map(d => d.최저점), color: '#EF4444' }
      ]
    });

    // 전형구분 분포 (stacked bar)
    const allTypes = [...new Set(data.flatMap(d => Object.keys(d.전형분포)))];
    ChartHelpers.create('chart-yearly-type', {
      type: 'bar',
      data: {
        labels,
        datasets: allTypes.map((type, i) => ({
          label: type,
          data: data.map(d => d.전형분포[type] || 0),
          backgroundColor: Utils.getColor(i),
          borderRadius: 2
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
      }
    });

    // 합격률 추이
    ChartHelpers.line('chart-yearly-rate', {
      labels,
      datasets: [{ label: '합격률(%)', data: data.map(d => Number(d.합격률)), color: '#8B5CF6', fill: true }]
    });
  },

  renderTable(data) {
    let html = `<table class="min-w-full divide-y divide-gray-200 text-sm">
      <thead class="bg-gray-50">
        <tr>
          <th class="px-4 py-2 text-left font-medium text-gray-500">연도</th>
          <th class="px-4 py-2 text-center font-medium text-gray-500">지원자</th>
          <th class="px-4 py-2 text-center font-medium text-gray-500">모집인원</th>
          <th class="px-4 py-2 text-center font-medium text-gray-500">경쟁률</th>
          <th class="px-4 py-2 text-center font-medium text-gray-500">합격자</th>
          <th class="px-4 py-2 text-center font-medium text-gray-500">합격률</th>
          <th class="px-4 py-2 text-center font-medium text-gray-500">최고점</th>
          <th class="px-4 py-2 text-center font-medium text-gray-500">평균</th>
          <th class="px-4 py-2 text-center font-medium text-gray-500">중앙값</th>
          <th class="px-4 py-2 text-center font-medium text-gray-500">최저점</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-200">
        ${data.map(d => `<tr class="hover:bg-gray-50">
          <td class="px-4 py-2 font-medium">${d.연도}</td>
          <td class="px-4 py-2 text-center">${d.지원자}</td>
          <td class="px-4 py-2 text-center">${d.모집인원 ?? '-'}</td>
          <td class="px-4 py-2 text-center font-medium text-blue-600">${d.경쟁률 ? d.경쟁률 + ':1' : '-'}</td>
          <td class="px-4 py-2 text-center text-green-600">${d.합격자}</td>
          <td class="px-4 py-2 text-center">${d.합격률}%</td>
          <td class="px-4 py-2 text-center font-mono">${d.최고점 != null ? Utils.formatNumber(d.최고점) : '-'}</td>
          <td class="px-4 py-2 text-center font-mono">${d.평균점 != null ? Utils.formatNumber(d.평균점) : '-'}</td>
          <td class="px-4 py-2 text-center font-mono">${d.중앙값 != null ? Utils.formatNumber(d.중앙값) : '-'}</td>
          <td class="px-4 py-2 text-center font-mono">${d.최저점 != null ? Utils.formatNumber(d.최저점) : '-'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
    document.getElementById('yearly-table').innerHTML = html;
  }
};

window.YearlyPage = YearlyPage;
