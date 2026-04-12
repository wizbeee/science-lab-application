// settings.js - 설정 (연도, 모집인원, 배점, 백업/복원)
const SettingsPage = {
  async render(container) {
    const years = await DB.getYears();
    const configs = await DB.getAllYearlyConfigs();
    const configMap = new Map(configs.map(c => [c.연도, c]));

    container.innerHTML = `
      <div class="space-y-6">
        <h2 class="text-2xl font-bold text-gray-900">설정</h2>

        <!-- 연도별 설정 -->
        <div class="bg-white rounded-xl border p-6">
          <h3 class="text-lg font-semibold mb-4">연도별 전형 설정</h3>
          <div class="flex gap-3 mb-4">
            <input id="config-year" type="number" value="${Utils.getCurrentYear()}" class="rounded-lg border-gray-300 text-sm px-3 py-2 w-32" placeholder="연도">
            <button id="btn-load-config" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm">불러오기/생성</button>
          </div>
          <div id="config-form" class="hidden space-y-4">
            <h4 class="text-sm font-semibold text-gray-600 border-b pb-2">정원 구조</h4>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label class="text-sm font-medium text-gray-700 block mb-1">정원내</label>
                <input id="config-정원내" type="number" class="w-full rounded-lg border-gray-300 text-sm px-3 py-2" placeholder="360" value="360">
              </div>
              <div>
                <label class="text-sm font-medium text-gray-700 block mb-1">정원외 합계</label>
                <input id="config-정원외합계" type="number" class="w-full rounded-lg border-gray-300 text-sm px-3 py-2" placeholder="2" value="2">
              </div>
              <div>
                <label class="text-sm font-medium text-gray-700 block mb-1">특례 한도</label>
                <input id="config-특례" type="number" class="w-full rounded-lg border-gray-300 text-sm px-3 py-2" placeholder="10" value="10">
              </div>
              <div>
                <label class="text-sm font-medium text-gray-700 block mb-1">국가유공자 한도</label>
                <input id="config-국가유공자" type="number" class="w-full rounded-lg border-gray-300 text-sm px-3 py-2" placeholder="10" value="10">
              </div>
            </div>
            <p class="text-xs text-gray-400">총 모집인원 = 정원내 + 정원외 합계. 특례/국가유공자는 정원외 모집 시 해당 전형의 한도입니다.</p>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label class="text-sm font-medium text-gray-700 block mb-1">총 모집인원 (레거시)</label>
                <input id="config-slots" type="number" class="w-full rounded-lg border-gray-300 text-sm px-3 py-2" placeholder="자동계산">
              </div>
            </div>
            <div>
              <label class="text-sm font-medium text-gray-700 block mb-1">메모</label>
              <textarea id="config-memo" rows="2" class="w-full rounded-lg border-gray-300 text-sm px-3 py-2" placeholder="연도별 특이사항 메모"></textarea>
            </div>
            <button id="btn-save-config" class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm">설정 저장</button>
          </div>
        </div>

        <!-- 데이터 관리 -->
        <div class="bg-white rounded-xl border p-6">
          <h3 class="text-lg font-semibold mb-4">데이터 관리</h3>
          <div class="space-y-4">
            <!-- 백업 -->
            <div class="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
              <div>
                <p class="font-medium text-blue-800">전체 데이터 백업</p>
                <p class="text-sm text-blue-600">모든 연도의 지원자, 성적, 설정 데이터를 JSON 파일로 저장합니다.</p>
              </div>
              <button id="btn-backup" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm whitespace-nowrap">백업 다운로드</button>
            </div>

            <!-- 복원 -->
            <div class="flex items-center justify-between p-4 bg-green-50 rounded-lg">
              <div>
                <p class="font-medium text-green-800">백업 데이터 복원</p>
                <p class="text-sm text-green-600">이전에 백업한 JSON 파일에서 데이터를 복원합니다.</p>
              </div>
              <div>
                <input type="file" id="restore-input" accept=".json" class="hidden">
                <button id="btn-restore" class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm whitespace-nowrap">복원하기</button>
              </div>
            </div>

            <!-- 연도별 삭제 -->
            <div class="flex items-center justify-between p-4 bg-red-50 rounded-lg">
              <div>
                <p class="font-medium text-red-800">연도별 데이터 삭제</p>
                <p class="text-sm text-red-600">특정 연도의 데이터만 삭제합니다.</p>
              </div>
              <div class="flex gap-2">
                <select id="delete-year" class="rounded-lg border-gray-300 text-sm px-3 py-2">
                  <option value="">연도 선택</option>
                  ${years.map(y => `<option value="${y}">${y}년</option>`).join('')}
                </select>
                <button id="btn-delete-year" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm whitespace-nowrap">삭제</button>
              </div>
            </div>

            <!-- 전체 초기화 -->
            <div class="flex items-center justify-between p-4 bg-gray-100 rounded-lg">
              <div>
                <p class="font-medium text-gray-800">전체 데이터 초기화</p>
                <p class="text-sm text-gray-600">모든 데이터를 삭제하고 초기 상태로 되돌립니다.</p>
              </div>
              <button id="btn-clear-all" class="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm whitespace-nowrap">전체 초기화</button>
            </div>
          </div>
        </div>

        <!-- DB 현황 -->
        <div class="bg-white rounded-xl border p-6">
          <h3 class="text-lg font-semibold mb-4">데이터 현황</h3>
          <div id="db-stats" class="grid grid-cols-2 md:grid-cols-4 gap-4"></div>
        </div>
      </div>
    `;

    this.bindEvents();
    this.loadDBStats();
  },

  bindEvents() {
    // 연도별 설정
    document.getElementById('btn-load-config').addEventListener('click', () => this.loadConfig());
    document.getElementById('btn-save-config').addEventListener('click', () => this.saveConfig());

    // 백업
    document.getElementById('btn-backup').addEventListener('click', async () => {
      await ImportExport.backupToJSON();
      Toast.success('백업 파일을 다운로드했습니다.');
    });

    // 복원
    document.getElementById('btn-restore').addEventListener('click', () => {
      document.getElementById('restore-input').click();
    });
    document.getElementById('restore-input').addEventListener('change', async (e) => {
      if (!e.target.files[0]) return;
      const ok = await Modal.confirm('백업 데이터를 복원하시겠습니까? 기존 데이터에 병합됩니다.');
      if (!ok) return;
      try {
        const counts = await ImportExport.restoreFromJSON(e.target.files[0]);
        Toast.success(`복원 완료: 지원자 ${counts.applicants}명`);
        this.loadDBStats();
      } catch (err) {
        Toast.error(`복원 실패: ${err.message}`);
      }
    });

    // 연도별 삭제
    document.getElementById('btn-delete-year').addEventListener('click', async () => {
      const year = document.getElementById('delete-year').value;
      if (!year) { Toast.warning('연도를 선택해주세요.'); return; }
      const ok = await Modal.confirm(`${year}년도 데이터를 모두 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`);
      if (!ok) return;
      await DB.clearYear(Number(year));
      Toast.success(`${year}년도 데이터가 삭제되었습니다.`);
      this.loadDBStats();
    });

    // 전체 초기화
    document.getElementById('btn-clear-all').addEventListener('click', async () => {
      const ok = await Modal.confirm('정말로 모든 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다!\n\n먼저 백업을 권장합니다.');
      if (!ok) return;
      const ok2 = await Modal.confirm('마지막 확인: 모든 지원자, 성적, 설정 데이터가 영구 삭제됩니다.');
      if (!ok2) return;
      await DB.clearAll();
      Toast.success('모든 데이터가 초기화되었습니다.');
      this.loadDBStats();
    });
  },

  async loadConfig() {
    const year = Number(document.getElementById('config-year').value);
    if (!year) { Toast.warning('연도를 입력해주세요.'); return; }

    const config = await DB.getYearlyConfig(year) || { 연도: year, 모집인원: null, 메모: '', 정원내: 360, 정원외합계: 2, 특례: 10, 국가유공자: 10 };
    document.getElementById('config-정원내').value = config.정원내 || 360;
    document.getElementById('config-정원외합계').value = config.정원외합계 || 2;
    document.getElementById('config-특례').value = config.특례 || 10;
    document.getElementById('config-국가유공자').value = config.국가유공자 || 10;
    document.getElementById('config-slots').value = config.모집인원 || '';
    document.getElementById('config-memo').value = config.메모 || '';
    document.getElementById('config-form').classList.remove('hidden');
  },

  async saveConfig() {
    const year = Number(document.getElementById('config-year').value);
    if (!year) return;
    const 정원내 = Number(document.getElementById('config-정원내').value) || 360;
    const 정원외합계 = Number(document.getElementById('config-정원외합계').value) || 2;
    const config = {
      연도: year,
      정원내,
      정원외합계,
      특례: Number(document.getElementById('config-특례').value) || 10,
      국가유공자: Number(document.getElementById('config-국가유공자').value) || 10,
      모집인원: Number(document.getElementById('config-slots').value) || (정원내 + 정원외합계),
      메모: document.getElementById('config-memo').value
    };
    await DB.putYearlyConfig(config);
    Toast.success(`${year}년도 설정이 저장되었습니다.`);
  },

  async loadDBStats() {
    const [applicants, grades, converted, summaries] = await Promise.all([
      db.applicants.count(),
      db.grades.count(),
      db.convertedScores.count(),
      db.scoresSummary.count()
    ]);
    const years = await DB.getYears();

    document.getElementById('db-stats').innerHTML = `
      <div class="p-4 bg-gray-50 rounded-lg text-center">
        <p class="text-xs text-gray-500">저장된 연도</p>
        <p class="text-2xl font-bold text-gray-800">${years.length}개</p>
        <p class="text-xs text-gray-400">${years.join(', ') || '-'}</p>
      </div>
      <div class="p-4 bg-gray-50 rounded-lg text-center">
        <p class="text-xs text-gray-500">전체 지원자</p>
        <p class="text-2xl font-bold text-blue-600">${applicants.toLocaleString()}명</p>
      </div>
      <div class="p-4 bg-gray-50 rounded-lg text-center">
        <p class="text-xs text-gray-500">성적 데이터</p>
        <p class="text-2xl font-bold text-green-600">${grades.toLocaleString()}건</p>
      </div>
      <div class="p-4 bg-gray-50 rounded-lg text-center">
        <p class="text-xs text-gray-500">환산점수</p>
        <p class="text-2xl font-bold text-purple-600">${converted.toLocaleString()}건</p>
      </div>
    `;
  }
};

window.SettingsPage = SettingsPage;
