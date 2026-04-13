// regional.js - 지역/출신중 분석 (학교 클릭 드릴다운 + 필터)
const RegionalPage = {
  async render(container) {
    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <h2 class="text-2xl font-bold text-gray-900">지역/출신중 분석</h2>
          <select id="regional-year" class="rounded-lg border-gray-300 text-sm px-3 py-2">
            <option value="">전체 연도</option>
          </select>
        </div>

        <div class="flex gap-2 border-b">
          <button class="reg-tab px-4 py-2 text-sm font-medium border-b-2 border-blue-500 text-blue-600" data-tab="school">출신중별</button>
          <button class="reg-tab px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700" data-tab="region">지역별</button>
          <button class="reg-tab px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700" data-tab="type">전형별</button>
        </div>

        <div id="regional-content"></div>
      </div>
    `;

    const yearSelect = container.querySelector('#regional-year');
    const years = await DB.getYears();
    years.forEach(y => { const o = document.createElement('option'); o.value = y; o.textContent = `${y}년`; yearSelect.appendChild(o); });
    if (years.length) yearSelect.value = years[0];

    yearSelect.addEventListener('change', () => this.loadTab());
    container.querySelectorAll('.reg-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('.reg-tab').forEach(t => { t.classList.remove('border-b-2', 'border-blue-500', 'text-blue-600'); t.classList.add('text-gray-500'); });
        tab.classList.add('border-b-2', 'border-blue-500', 'text-blue-600'); tab.classList.remove('text-gray-500');
        this.currentTab = tab.dataset.tab;
        this.loadTab();
      });
    });

    this.currentTab = 'school';
    await this.loadTab();
  },

  // 출신중 이름에서 지역 추출
  extractRegion(schoolName) {
    if (!schoolName) return '미분류';
    // "천안성성중학교" → "천안", "온양용화중학교" → "온양"
    const cities = ['서울','부산','대구','인천','광주','대전','울산','세종',
      '천안','아산','공주','논산','서산','당진','보령','홍성','예산','청양','태안','부여','서천','금산','계룡',
      '수원','성남','고양','용인','안산','안양','남양주','화성','평택','의정부','파주','시흥','김포','광명','군포',
      '청주','충주','제천','음성','증평','괴산','진천','보은','옥천','영동','단양',
      '전주','익산','군산','정읍','남원','김제','완주','무주','장수','임실','순창','고창','부안',
      '포항','경주','구미','김천','안동','영주','상주','문경','영천','칠곡','예천','봉화','울진','울릉',
      '창원','김해','진주','양산','거제','통영','사천','밀양','함안','거창','합천','산청','고성','하동','남해',
      '목포','여수','순천','나주','광양','담양','곡성','구례','화순','영광','장성','완도','해남','진도','강진','영암','무안','함평','보성','장흥','고흥','신안',
      '춘천','원주','강릉','동해','삼척','속초','양양','인제','홍천','횡성','영월','평창','정선','철원','화천','양구',
      '제주','서귀포'];
    for (const city of cities) {
      if (schoolName.startsWith(city)) return city;
    }
    // 주소에서 시/군 추출은 별도 처리
    return '기타';
  },

  async loadTab() {
    const yearEl = document.getElementById('regional-year');
    if (!yearEl) return;
    const 연도 = yearEl.value;
    const filters = 연도 ? { 연도: Number(연도) } : {};
    const applicants = await DB.getApplicants(filters);
    const summaries = 연도 ? await DB.getAllScoresSummary(Number(연도)) : await DB.getAllScoresSummary();
    const summaryMap = new Map(summaries.map(s => [s.접수번호, s]));
    const content = document.getElementById('regional-content');
    if (!content) return;

    this.allApplicants = applicants;
    this.summaryMap = summaryMap;

    switch (this.currentTab) {
      case 'school': this.renderSchools(content, applicants, summaryMap); break;
      case 'region': this.renderRegions(content, applicants, summaryMap); break;
      case 'type': this.renderByType(content, applicants, summaryMap); break;
    }
  },

  renderSchools(container, applicants, summaryMap) {
    const bySchool = {};
    applicants.forEach(a => {
      const school = a.출신중 || '미분류';
      if (!bySchool[school]) bySchool[school] = { 지원: 0, 합격: 0, 남: 0, 여: 0, scores: [], students: [] };
      bySchool[school].지원++;
      if (a.성별 === '남자') bySchool[school].남++;
      else if (a.성별 === '여자') bySchool[school].여++;
      const s = summaryMap.get(a.접수번호);
      const result = (s && s.합불여부) || a.합불여부;
      if (result === '합격' || result === '추가합격') bySchool[school].합격++;
      if (s && s.교과성적 != null) bySchool[school].scores.push(s.교과성적);
      bySchool[school].students.push(a.접수번호);
    });

    const entries = Object.entries(bySchool)
      .map(([name, data]) => ({
        name, ...data,
        평균점수: data.scores.length ? Utils.mean(data.scores) : null,
        최고점: data.scores.length ? Utils.max(data.scores) : null,
        최저점: data.scores.length ? Utils.min(data.scores) : null
      }))
      .sort((a, b) => b.지원 - a.지원);

    container.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div class="bg-white rounded-xl border p-5">
          <h3 class="text-sm font-semibold text-gray-600 mb-3">출신중별 지원 현황 (상위 15)</h3>
          <div style="height: 400px"><canvas id="chart-school-count"></canvas></div>
        </div>
        <div class="bg-white rounded-xl border p-5">
          <h3 class="text-sm font-semibold text-gray-600 mb-3">출신중별 평균 교과성적 (상위 15)</h3>
          <div style="height: 400px"><canvas id="chart-school-score"></canvas></div>
        </div>
      </div>
      <div class="bg-white rounded-xl border p-4">
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm text-gray-500">총 ${entries.length}개 출신중 <span class="text-xs text-blue-500 ml-2">학교명을 클릭하면 학생 목록을 볼 수 있습니다</span></p>
          <button id="btn-export-school" class="px-3 py-1 border rounded-lg text-sm hover:bg-gray-50">Excel 내보내기</button>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 cursor-pointer" data-sort="name">출신중</th>
                <th class="px-3 py-2 text-center text-xs font-medium text-gray-500 cursor-pointer" data-sort="지원">지원자</th>
                <th class="px-3 py-2 text-center text-xs font-medium text-gray-500">남</th>
                <th class="px-3 py-2 text-center text-xs font-medium text-gray-500">여</th>
                <th class="px-3 py-2 text-center text-xs font-medium text-gray-500">합격</th>
                <th class="px-3 py-2 text-center text-xs font-medium text-gray-500">평균</th>
                <th class="px-3 py-2 text-center text-xs font-medium text-gray-500">최고</th>
                <th class="px-3 py-2 text-center text-xs font-medium text-gray-500">최저</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              ${entries.map(e => `
                <tr class="hover:bg-blue-50 cursor-pointer school-row" data-school="${e.name}">
                  <td class="px-3 py-2 text-sm font-medium text-blue-600 hover:underline">${e.name}</td>
                  <td class="px-3 py-2 text-sm text-center font-bold">${e.지원}</td>
                  <td class="px-3 py-2 text-sm text-center text-blue-500">${e.남}</td>
                  <td class="px-3 py-2 text-sm text-center text-pink-500">${e.여}</td>
                  <td class="px-3 py-2 text-sm text-center text-green-600">${e.합격}</td>
                  <td class="px-3 py-2 text-sm text-center font-mono">${e.평균점수 != null ? Utils.formatNumber(e.평균점수) : '-'}</td>
                  <td class="px-3 py-2 text-sm text-center font-mono">${e.최고점 != null ? Utils.formatNumber(e.최고점) : '-'}</td>
                  <td class="px-3 py-2 text-sm text-center font-mono">${e.최저점 != null ? Utils.formatNumber(e.최저점) : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // 차트
    const top15 = entries.slice(0, 15);
    ChartHelpers.bar('chart-school-count', {
      labels: top15.map(e => e.name.replace('중학교', '')),
      datasets: [
        { label: '지원', data: top15.map(e => e.지원), color: '#3B82F6' },
        { label: '남', data: top15.map(e => e.남), color: '#60A5FA' },
        { label: '여', data: top15.map(e => e.여), color: '#F472B6' }
      ],
      horizontal: true
    });

    const withScore = entries.filter(e => e.평균점수 != null && e.지원 >= 2).slice(0, 15);
    ChartHelpers.bar('chart-school-score', {
      labels: withScore.map(e => e.name.replace('중학교', '')),
      datasets: [{ label: '평균 교과성적', data: withScore.map(e => e.평균점수), color: '#10B981' }],
      horizontal: true
    });

    // 학교 클릭 이벤트
    container.querySelectorAll('.school-row').forEach(row => {
      row.addEventListener('click', () => this.showSchoolDetail(row.dataset.school));
    });

    // Excel 내보내기
    document.getElementById('btn-export-school')?.addEventListener('click', () => {
      ImportExport.downloadExcel(entries.map(e => ({
        출신중: e.name, 지원자: e.지원, 남: e.남, 여: e.여, 합격: e.합격,
        평균교과성적: e.평균점수 != null ? Number(Utils.formatNumber(e.평균점수)) : '',
        최고점: e.최고점 != null ? Number(Utils.formatNumber(e.최고점)) : '',
        최저점: e.최저점 != null ? Number(Utils.formatNumber(e.최저점)) : ''
      })), '출신중별_분석');
      Toast.success('데이터를 내보냈습니다.');
    });
  },

  async showSchoolDetail(schoolName) {
    const applicants = this.allApplicants.filter(a => (a.출신중 || '미분류') === schoolName);
    const summaryMap = this.summaryMap;

    const students = applicants.map(a => {
      const s = summaryMap.get(a.접수번호) || {};
      return {
        접수번호: a.접수번호, 수험번호: a.수험번호, 성명: a.성명, 성별: a.성별,
        전형구분: a.전형구분, 출신중: a.출신중,
        교과성적: s.교과성적, 면접점수: s.면접점수, 최종점수: s.최종점수,
        합불여부: s.합불여부 || a.합불여부
      };
    });

    // 통계
    const males = students.filter(s => s.성별 === '남자').length;
    const females = students.filter(s => s.성별 === '여자').length;
    const types = {};
    students.forEach(s => { types[s.전형구분 || '미분류'] = (types[s.전형구분 || '미분류'] || 0) + 1; });
    const scores = students.map(s => s.교과성적).filter(v => v != null);

    const body = Modal.show({
      title: `${schoolName} - 지원자 목록 (${students.length}명)`,
      size: 'xl',
      content: `
        <div class="space-y-4">
          <!-- 요약 -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="p-3 bg-gray-50 rounded-lg text-center">
              <p class="text-xs text-gray-500">전체</p>
              <p class="text-xl font-bold">${students.length}명</p>
            </div>
            <div class="p-3 bg-blue-50 rounded-lg text-center">
              <p class="text-xs text-blue-500">남자</p>
              <p class="text-xl font-bold text-blue-600">${males}명</p>
            </div>
            <div class="p-3 bg-pink-50 rounded-lg text-center">
              <p class="text-xs text-pink-500">여자</p>
              <p class="text-xl font-bold text-pink-600">${females}명</p>
            </div>
            <div class="p-3 bg-green-50 rounded-lg text-center">
              <p class="text-xs text-green-500">평균 교과</p>
              <p class="text-xl font-bold text-green-600">${scores.length ? Utils.formatNumber(Utils.mean(scores)) : '-'}</p>
            </div>
          </div>

          <!-- 전형별 분포 -->
          <div class="flex flex-wrap gap-2">
            ${Object.entries(types).map(([t, c]) => `<span class="px-2 py-1 bg-gray-100 rounded text-xs">${t}: ${c}명</span>`).join('')}
          </div>

          <!-- 필터 -->
          <div class="flex gap-3 items-center border-t pt-3">
            <span class="text-xs text-gray-500">필터:</span>
            <select id="school-filter-gender" class="rounded border-gray-300 text-xs px-2 py-1">
              <option value="">전체 성별</option>
              <option value="남자">남자</option>
              <option value="여자">여자</option>
            </select>
            <select id="school-filter-type" class="rounded border-gray-300 text-xs px-2 py-1">
              <option value="">전체 전형</option>
              ${Object.keys(types).map(t => `<option value="${t}">${t}</option>`).join('')}
            </select>
            <select id="school-filter-result" class="rounded border-gray-300 text-xs px-2 py-1">
              <option value="">전체 합불</option>
              <option value="합격">합격</option>
              <option value="불합격">불합격</option>
              <option value="대기">대기</option>
            </select>
          </div>

          <!-- 학생 테이블 -->
          <div id="school-student-table" class="overflow-x-auto"></div>
        </div>
      `,
      buttons: [{ label: '닫기', onClick: () => Modal.close() }]
    });

    // 테이블 렌더
    const renderStudentTable = (data) => {
      const tableEl = document.getElementById('school-student-table');
      if (!tableEl) return;
      tableEl.innerHTML = `
        <table class="min-w-full divide-y divide-gray-200 text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-3 py-2 text-left text-xs text-gray-500">접수번호</th>
              <th class="px-3 py-2 text-left text-xs text-gray-500">성명</th>
              <th class="px-3 py-2 text-center text-xs text-gray-500">성별</th>
              <th class="px-3 py-2 text-left text-xs text-gray-500">전형구분</th>
              <th class="px-3 py-2 text-center text-xs text-gray-500">교과성적</th>
              <th class="px-3 py-2 text-center text-xs text-gray-500">면접점수</th>
              <th class="px-3 py-2 text-center text-xs text-gray-500">최종점수</th>
              <th class="px-3 py-2 text-center text-xs text-gray-500">합불여부</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            ${data.length ? data.map(s => `
              <tr class="hover:bg-gray-50 cursor-pointer" onclick="Modal.close(); App.navigate('applicant-detail', {접수번호:'${s.접수번호}'})">
                <td class="px-3 py-2">${s.접수번호}</td>
                <td class="px-3 py-2 font-medium">${s.성명 || '-'}</td>
                <td class="px-3 py-2 text-center">${s.성별 === '남자' ? '<span class="text-blue-500">남</span>' : s.성별 === '여자' ? '<span class="text-pink-500">여</span>' : '-'}</td>
                <td class="px-3 py-2 text-xs">${s.전형구분 || '-'}</td>
                <td class="px-3 py-2 text-center font-mono">${s.교과성적 != null ? Utils.formatNumber(s.교과성적) : '-'}</td>
                <td class="px-3 py-2 text-center font-mono">${s.면접점수 != null ? Utils.formatNumber(s.면접점수) : '-'}</td>
                <td class="px-3 py-2 text-center font-mono font-bold">${s.최종점수 != null ? Utils.formatNumber(s.최종점수) : '-'}</td>
                <td class="px-3 py-2 text-center">${s.합불여부 ? `<span class="px-2 py-0.5 rounded-full text-xs font-medium ${this.getResultColor(s.합불여부)}">${s.합불여부}</span>` : '-'}</td>
              </tr>
            `).join('') : '<tr><td colspan="8" class="px-4 py-6 text-center text-gray-400">해당 조건의 학생이 없습니다</td></tr>'}
          </tbody>
        </table>
        <p class="text-xs text-gray-400 mt-2">${data.length}명 표시</p>
      `;
    };

    renderStudentTable(students.sort((a, b) => (b.교과성적 || 0) - (a.교과성적 || 0)));

    // 필터 이벤트
    const applyFilter = () => {
      const gender = document.getElementById('school-filter-gender')?.value;
      const type = document.getElementById('school-filter-type')?.value;
      const result = document.getElementById('school-filter-result')?.value;
      let filtered = [...students];
      if (gender) filtered = filtered.filter(s => s.성별 === gender);
      if (type) filtered = filtered.filter(s => s.전형구분 === type);
      if (result) filtered = filtered.filter(s => s.합불여부 === result);
      renderStudentTable(filtered.sort((a, b) => (b.교과성적 || 0) - (a.교과성적 || 0)));
    };

    document.getElementById('school-filter-gender')?.addEventListener('change', applyFilter);
    document.getElementById('school-filter-type')?.addEventListener('change', applyFilter);
    document.getElementById('school-filter-result')?.addEventListener('change', applyFilter);
  },

  renderRegions(container, applicants, summaryMap) {
    // 출신중에서 지역 자동 추출
    const byRegion = {};
    applicants.forEach(a => {
      const region = this.extractRegion(a.출신중);
      if (!byRegion[region]) byRegion[region] = { 지원: 0, 합격: 0, 남: 0, 여: 0, scores: [], schools: new Set() };
      byRegion[region].지원++;
      if (a.성별 === '남자') byRegion[region].남++;
      else if (a.성별 === '여자') byRegion[region].여++;
      const s = summaryMap.get(a.접수번호);
      if (s && (s.합불여부 === '합격' || s.합불여부 === '추가합격')) byRegion[region].합격++;
      if (s && s.교과성적 != null) byRegion[region].scores.push(s.교과성적);
      if (a.출신중) byRegion[region].schools.add(a.출신중);
    });

    const entries = Object.entries(byRegion)
      .map(([name, data]) => ({
        name, ...data,
        학교수: data.schools.size,
        합격률: data.지원 > 0 ? (data.합격 / data.지원 * 100).toFixed(1) : '0.0',
        평균점수: data.scores.length ? Utils.mean(data.scores) : null
      }))
      .sort((a, b) => b.지원 - a.지원);

    container.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div class="bg-white rounded-xl border p-5">
          <h3 class="text-sm font-semibold text-gray-600 mb-3">지역별 지원 현황</h3>
          <div style="height: 400px"><canvas id="chart-region-count"></canvas></div>
        </div>
        <div class="bg-white rounded-xl border p-5">
          <h3 class="text-sm font-semibold text-gray-600 mb-3">지역별 성비</h3>
          <div style="height: 400px"><canvas id="chart-region-gender"></canvas></div>
        </div>
      </div>
      <div class="bg-white rounded-xl border p-4">
        <p class="text-sm text-gray-500 mb-3">총 ${entries.length}개 지역 <span class="text-xs text-gray-400">(출신중 이름에서 자동 추출)</span></p>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-3 py-2 text-left text-xs text-gray-500">지역</th>
                <th class="px-3 py-2 text-center text-xs text-gray-500">학교 수</th>
                <th class="px-3 py-2 text-center text-xs text-gray-500">지원자</th>
                <th class="px-3 py-2 text-center text-xs text-gray-500">남</th>
                <th class="px-3 py-2 text-center text-xs text-gray-500">여</th>
                <th class="px-3 py-2 text-center text-xs text-gray-500">합격</th>
                <th class="px-3 py-2 text-center text-xs text-gray-500">합격률</th>
                <th class="px-3 py-2 text-center text-xs text-gray-500">평균 교과</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              ${entries.map(e => `<tr class="hover:bg-gray-50">
                <td class="px-3 py-2 font-medium">${e.name}</td>
                <td class="px-3 py-2 text-center">${e.학교수}</td>
                <td class="px-3 py-2 text-center font-bold">${e.지원}</td>
                <td class="px-3 py-2 text-center text-blue-500">${e.남}</td>
                <td class="px-3 py-2 text-center text-pink-500">${e.여}</td>
                <td class="px-3 py-2 text-center text-green-600">${e.합격}</td>
                <td class="px-3 py-2 text-center">${e.합격률}%</td>
                <td class="px-3 py-2 text-center font-mono">${e.평균점수 != null ? Utils.formatNumber(e.평균점수) : '-'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const top = entries.slice(0, 15);
    ChartHelpers.bar('chart-region-count', {
      labels: top.map(e => e.name),
      datasets: [{ label: '지원자', data: top.map(e => e.지원), color: '#3B82F6' }],
      horizontal: true
    });

    ChartHelpers.create('chart-region-gender', {
      type: 'bar',
      data: {
        labels: top.map(e => e.name),
        datasets: [
          { label: '남', data: top.map(e => e.남), backgroundColor: '#60A5FA', borderRadius: 2 },
          { label: '여', data: top.map(e => e.여), backgroundColor: '#F472B6', borderRadius: 2 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        scales: { x: { stacked: true }, y: { stacked: true } }
      }
    });
  },

  renderByType(container, applicants, summaryMap) {
    const byType = {};
    applicants.forEach(a => {
      const type = a.전형구분 || '미분류';
      if (!byType[type]) byType[type] = { 지원: 0, 합격: 0, 남: 0, 여: 0, scores: [] };
      byType[type].지원++;
      if (a.성별 === '남자') byType[type].남++;
      else if (a.성별 === '여자') byType[type].여++;
      const s = summaryMap.get(a.접수번호);
      if (s && (s.합불여부 === '합격' || s.합불여부 === '추가합격')) byType[type].합격++;
      if (s && s.교과성적 != null) byType[type].scores.push(s.교과성적);
    });

    const entries = Object.entries(byType)
      .map(([name, data]) => ({
        name, ...data,
        합격률: data.지원 > 0 ? (data.합격 / data.지원 * 100).toFixed(1) : '0.0',
        평균점수: data.scores.length ? Utils.mean(data.scores) : null,
        최고점: data.scores.length ? Utils.max(data.scores) : null,
        최저점: data.scores.length ? Utils.min(data.scores) : null
      }))
      .sort((a, b) => b.지원 - a.지원);

    container.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div class="bg-white rounded-xl border p-5">
          <h3 class="text-sm font-semibold text-gray-600 mb-3">전형별 지원 현황</h3>
          <div style="height: 350px"><canvas id="chart-type-pie"></canvas></div>
        </div>
        <div class="bg-white rounded-xl border p-5">
          <h3 class="text-sm font-semibold text-gray-600 mb-3">전형별 교과성적 비교</h3>
          <div style="height: 350px"><canvas id="chart-type-score"></canvas></div>
        </div>
      </div>
      <div class="bg-white rounded-xl border p-4">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-3 py-2 text-left text-xs text-gray-500">전형구분</th>
                <th class="px-3 py-2 text-center text-xs text-gray-500">지원자</th>
                <th class="px-3 py-2 text-center text-xs text-gray-500">남</th>
                <th class="px-3 py-2 text-center text-xs text-gray-500">여</th>
                <th class="px-3 py-2 text-center text-xs text-gray-500">합격</th>
                <th class="px-3 py-2 text-center text-xs text-gray-500">합격률</th>
                <th class="px-3 py-2 text-center text-xs text-gray-500">평균 교과</th>
                <th class="px-3 py-2 text-center text-xs text-gray-500">최고</th>
                <th class="px-3 py-2 text-center text-xs text-gray-500">최저</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              ${entries.map(e => `<tr class="hover:bg-gray-50">
                <td class="px-3 py-2 font-medium">${e.name}</td>
                <td class="px-3 py-2 text-center font-bold">${e.지원}</td>
                <td class="px-3 py-2 text-center text-blue-500">${e.남}</td>
                <td class="px-3 py-2 text-center text-pink-500">${e.여}</td>
                <td class="px-3 py-2 text-center text-green-600">${e.합격}</td>
                <td class="px-3 py-2 text-center">${e.합격률}%</td>
                <td class="px-3 py-2 text-center font-mono">${e.평균점수 != null ? Utils.formatNumber(e.평균점수) : '-'}</td>
                <td class="px-3 py-2 text-center font-mono">${e.최고점 != null ? Utils.formatNumber(e.최고점) : '-'}</td>
                <td class="px-3 py-2 text-center font-mono">${e.최저점 != null ? Utils.formatNumber(e.최저점) : '-'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    ChartHelpers.pie('chart-type-pie', {
      labels: entries.map(e => e.name),
      data: entries.map(e => e.지원),
      doughnut: true
    });

    if (entries.some(e => e.scores.length)) {
      ChartHelpers.boxPlot('chart-type-score', {
        groups: entries.filter(e => e.scores.length).map(e => ({ label: e.name, data: e.scores })),
        title: ''
      });
    }
  },

  getResultColor(result) {
    const colors = { '합격': 'bg-green-100 text-green-700', '불합격': 'bg-red-100 text-red-700', '대기': 'bg-yellow-100 text-yellow-700', '추가합격': 'bg-blue-100 text-blue-700' };
    return colors[result] || 'bg-gray-100 text-gray-700';
  }
};

window.RegionalPage = RegionalPage;
