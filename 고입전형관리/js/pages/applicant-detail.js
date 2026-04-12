// applicant-detail.js - 지원자 상세 정보
const ApplicantDetailPage = {
  async render(container, params = {}) {
    const 접수번호 = params.접수번호;
    if (!접수번호) {
      container.innerHTML = '<p class="text-gray-500 p-8">지원자를 선택해주세요.</p>';
      return;
    }

    const applicant = await DB.getApplicant(접수번호);
    if (!applicant) {
      container.innerHTML = '<p class="text-red-500 p-8">지원자를 찾을 수 없습니다.</p>';
      return;
    }

    const [grades, converted, summary, ged] = await Promise.all([
      DB.getGrades(접수번호),
      DB.getConvertedScores(접수번호),
      DB.getScoresSummary(접수번호),
      DB.getGedScores(접수번호)
    ]);

    const s = summary || {};

    container.innerHTML = `
      <div class="space-y-6">
        <!-- 헤더 -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <button id="btn-back" class="p-2 rounded-lg hover:bg-gray-100">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <div>
              <h2 class="text-2xl font-bold text-gray-900">${applicant.성명 || '-'}</h2>
              <p class="text-sm text-gray-500">접수번호: ${접수번호} | 수험번호: ${applicant.수험번호 || '-'}</p>
            </div>
          </div>
          <div class="flex gap-2">
            ${s.합불여부 || applicant.합불여부 ? `<span class="px-3 py-1 rounded-full text-sm font-medium ${this.getResultBadge(s.합불여부 || applicant.합불여부)}">${s.합불여부 || applicant.합불여부}</span>` : ''}
            <span class="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700">${applicant.전형구분 || '-'}</span>
          </div>
        </div>

        <!-- 기본 정보 -->
        <div class="bg-white rounded-xl border p-6">
          <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
            기본 정보
          </h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            ${this.infoItem('생년월일', applicant.생년월일)}
            ${this.infoItem('성별', applicant.성별)}
            ${this.infoItem('주소', applicant.주소)}
            ${this.infoItem('연락처(본인)', applicant.연락처_본인)}
            ${this.infoItem('연락처(보호자)', applicant.연락처_보호자)}
            ${this.infoItem('출신중', applicant.출신중)}
            ${this.infoItem('지역', `${applicant.지역 || ''} ${applicant.시 || ''}`)}
            ${this.infoItem('졸업년도', applicant.졸업년도)}
            ${this.infoItem('최종학력', applicant.최종학력)}
            ${this.infoItem('전형구분', applicant.전형구분)}
            ${applicant.사회통합전형항목 ? this.infoItem('사회통합 항목', applicant.사회통합전형항목) : ''}
            ${applicant.사회통합전형세부항목 ? this.infoItem('사회통합 세부', applicant.사회통합전형세부항목) : ''}
            ${this.infoItem('무단결석', applicant.무단결석 != null ? `${applicant.무단결석}일` : '-')}
            ${this.infoItem('무단지각/조퇴/결과', applicant.무단지각조퇴결과 != null ? `${applicant.무단지각조퇴결과}회` : '-')}
            ${this.infoItem('담임교사', s.담임교사이름)}
          </div>
        </div>

        <!-- 점수 요약 -->
        <div class="bg-white rounded-xl border p-6">
          <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            점수 요약
          </h3>
          <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
            ${this.scoreCard('교과성적', s.교과성적)}
            ${this.scoreCard('출석', s.출석)}
            ${this.scoreCard('1단계 최종', s['1단계최종점수'])}
            ${this.scoreCard('면접점수', s.면접점수)}
            ${this.scoreCard('감점', s.감점, true)}
          </div>
          <div class="mt-4 pt-4 border-t flex items-center justify-between">
            <span class="text-lg font-semibold text-gray-700">최종점수</span>
            <span class="text-3xl font-bold ${s.최종점수 != null ? 'text-blue-600' : 'text-gray-400'}">${s.최종점수 != null ? Utils.formatNumber(s.최종점수) : '-'}</span>
          </div>
        </div>

        <!-- 교과 성적 (원점수) -->
        ${grades.length ? this.renderGradesTable(grades) : ''}

        <!-- 환산점수 -->
        ${converted.length ? this.renderConvertedTable(converted) : ''}

        <!-- 평균 성적 -->
        ${s.도덕평균 != null ? this.renderAverages(s) : ''}

        <!-- 검정고시 -->
        ${ged ? this.renderGed(ged) : ''}

        <!-- 성적 레이더 차트 -->
        ${converted.length ? `
        <div class="bg-white rounded-xl border p-6">
          <h3 class="text-lg font-semibold mb-4">환산점수 레이더</h3>
          <div style="height: 300px; max-width: 400px; margin: 0 auto;"><canvas id="chart-radar"></canvas></div>
        </div>` : ''}
      </div>
    `;

    // 뒤로가기
    document.getElementById('btn-back').addEventListener('click', () => App.navigate('applicants'));

    // 레이더 차트
    if (converted.length) this.renderRadar(converted);
  },

  infoItem(label, value) {
    return `<div><span class="text-xs text-gray-400 block">${label}</span><span class="text-sm font-medium text-gray-800">${value || '-'}</span></div>`;
  },

  scoreCard(label, value, negative = false) {
    const display = value != null ? Utils.formatNumber(value) : '-';
    const color = value != null ? (negative ? 'text-red-600' : 'text-blue-600') : 'text-gray-400';
    return `<div class="text-center p-3 bg-gray-50 rounded-lg">
      <p class="text-xs text-gray-500">${label}</p>
      <p class="text-xl font-bold ${color}">${display}</p>
    </div>`;
  },

  renderGradesTable(grades) {
    const bySemester = {};
    grades.forEach(g => {
      if (!bySemester[g.학기]) bySemester[g.학기] = {};
      bySemester[g.학기][g.과목] = g.성적등급;
    });
    const semesters = Object.keys(bySemester).sort();

    let rows = '';
    for (const subj of Utils.SUBJECTS) {
      rows += `<tr><td class="px-3 py-2 text-sm font-medium bg-gray-50">${subj}</td>`;
      for (const sem of semesters) {
        const val = bySemester[sem]?.[subj];
        rows += `<td class="px-3 py-2 text-sm text-center">${val ?? '-'}</td>`;
      }
      rows += '</tr>';
    }

    return `
      <div class="bg-white rounded-xl border p-6">
        <h3 class="text-lg font-semibold mb-4">교과 성적 (원점수/등급)</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr><th class="px-3 py-2 text-left text-xs font-medium text-gray-500">과목</th>
              ${semesters.map(s => `<th class="px-3 py-2 text-center text-xs font-medium text-gray-500">${s}학기</th>`).join('')}</tr>
            </thead>
            <tbody class="divide-y divide-gray-200">${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  renderConvertedTable(converted) {
    const bySemester = {};
    converted.forEach(c => {
      if (!bySemester[c.학기]) bySemester[c.학기] = {};
      bySemester[c.학기][c.과목] = c.환산점수;
    });
    const semesters = Object.keys(bySemester).sort();

    let rows = '';
    for (const subj of Utils.CONVERTED_SUBJECTS) {
      rows += `<tr><td class="px-3 py-2 text-sm font-medium bg-gray-50">${subj}</td>`;
      for (const sem of semesters) {
        const val = bySemester[sem]?.[subj];
        rows += `<td class="px-3 py-2 text-sm text-center font-mono">${val != null ? Utils.formatNumber(val) : '-'}</td>`;
      }
      // 과목 평균
      const vals = semesters.map(s => bySemester[s]?.[subj]).filter(v => v != null);
      const avg = vals.length ? Utils.mean(vals) : null;
      rows += `<td class="px-3 py-2 text-sm text-center font-mono font-bold text-blue-600">${avg != null ? Utils.formatNumber(avg) : '-'}</td>`;
      rows += '</tr>';
    }

    return `
      <div class="bg-white rounded-xl border p-6">
        <h3 class="text-lg font-semibold mb-4">환산점수</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr><th class="px-3 py-2 text-left text-xs font-medium text-gray-500">과목</th>
              ${semesters.map(s => `<th class="px-3 py-2 text-center text-xs font-medium text-gray-500">${s}학기</th>`).join('')}
              <th class="px-3 py-2 text-center text-xs font-medium text-blue-500">평균</th></tr>
            </thead>
            <tbody class="divide-y divide-gray-200">${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  renderAverages(s) {
    const items = Utils.AVERAGE_SUBJECTS.map(subj => ({
      label: subj,
      value: s[subj + '평균']
    }));
    return `
      <div class="bg-white rounded-xl border p-6">
        <h3 class="text-lg font-semibold mb-4">과목 평균 (4학기)</h3>
        <div class="grid grid-cols-3 md:grid-cols-7 gap-3">
          ${items.map(i => `<div class="text-center p-3 bg-gray-50 rounded-lg">
            <p class="text-xs text-gray-500">${i.label}</p>
            <p class="text-lg font-bold ${i.value != null ? 'text-gray-800' : 'text-gray-400'}">${i.value != null ? Utils.formatNumber(i.value) : '-'}</p>
          </div>`).join('')}
        </div>
      </div>
    `;
  },

  renderGed(ged) {
    return `
      <div class="bg-white rounded-xl border p-6">
        <h3 class="text-lg font-semibold mb-4">검정고시 성적</h3>
        <div class="grid grid-cols-3 md:grid-cols-7 gap-3">
          ${Utils.GED_SUBJECTS.map(s => `<div class="text-center p-3 bg-gray-50 rounded-lg">
            <p class="text-xs text-gray-500">${s}</p>
            <p class="text-lg font-bold">${ged[s] != null ? Utils.formatNumber(ged[s]) : '-'}</p>
          </div>`).join('')}
          <div class="text-center p-3 bg-blue-50 rounded-lg">
            <p class="text-xs text-blue-500 font-medium">최종점수</p>
            <p class="text-lg font-bold text-blue-600">${ged.최종점수 != null ? Utils.formatNumber(ged.최종점수) : '-'}</p>
          </div>
        </div>
      </div>
    `;
  },

  renderRadar(converted) {
    const bySemester = {};
    converted.forEach(c => {
      if (!bySemester[c.학기]) bySemester[c.학기] = {};
      bySemester[c.학기][c.과목] = c.환산점수;
    });
    const semesters = Object.keys(bySemester).sort();

    ChartHelpers.create('chart-radar', {
      type: 'radar',
      data: {
        labels: Utils.CONVERTED_SUBJECTS,
        datasets: semesters.map((sem, i) => ({
          label: `${sem}학기`,
          data: Utils.CONVERTED_SUBJECTS.map(subj => bySemester[sem]?.[subj] || 0),
          borderColor: Utils.getColor(i),
          backgroundColor: Utils.getColor(i) + '20',
          pointRadius: 3
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { r: { beginAtZero: true } },
        plugins: { legend: { position: 'bottom' } }
      }
    });
  },

  getResultBadge(result) {
    const colors = {
      '합격': 'bg-green-100 text-green-700',
      '불합격': 'bg-red-100 text-red-700',
      '대기': 'bg-yellow-100 text-yellow-700',
      '추가합격': 'bg-blue-100 text-blue-700'
    };
    return colors[result] || 'bg-gray-100 text-gray-700';
  }
};

window.ApplicantDetailPage = ApplicantDetailPage;
