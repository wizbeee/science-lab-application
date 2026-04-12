// applicants.js - 지원자 목록 + 검색/필터
const ApplicantsPage = {
  table: null,

  async render(container) {
    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-2xl font-bold text-gray-900">지원자 관리</h2>
          <div class="flex gap-2">
            <button id="btn-import" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium">
              데이터 가져오기
            </button>
            <button id="btn-export" class="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm font-medium">
              Excel 내보내기
            </button>
          </div>
        </div>

        <!-- 필터 바 -->
        <div class="bg-white rounded-xl border p-4">
          <div class="flex flex-wrap gap-3 items-end">
            <div class="flex-1 min-w-[200px]">
              <label class="text-xs text-gray-500 block mb-1">검색</label>
              <input id="filter-search" type="text" placeholder="이름, 수험번호, 접수번호, 출신중..." class="w-full rounded-lg border-gray-300 text-sm px-3 py-2">
            </div>
            <div>
              <label class="text-xs text-gray-500 block mb-1">연도</label>
              <select id="filter-year" class="rounded-lg border-gray-300 text-sm px-3 py-2">
                <option value="">전체</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-500 block mb-1">전형구분</label>
              <select id="filter-type" class="rounded-lg border-gray-300 text-sm px-3 py-2">
                <option value="">전체</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-500 block mb-1">지역</label>
              <select id="filter-region" class="rounded-lg border-gray-300 text-sm px-3 py-2">
                <option value="">전체</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-500 block mb-1">합불여부</label>
              <select id="filter-result" class="rounded-lg border-gray-300 text-sm px-3 py-2">
                <option value="">전체</option>
                <option value="합격">합격</option>
                <option value="불합격">불합격</option>
                <option value="대기">대기</option>
                <option value="추가합격">추가합격</option>
              </select>
            </div>
            <button id="btn-filter-reset" class="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">초기화</button>
          </div>
        </div>

        <!-- 테이블 -->
        <div id="applicant-table" class="bg-white rounded-xl border p-4"></div>
      </div>

      <!-- 숨겨진 파일 입력 -->
      <input type="file" id="file-input" accept=".xlsx,.xls,.csv" class="hidden">
    `;

    // 필터 옵션 로드
    await this.loadFilterOptions();

    // 테이블 초기화
    this.table = new DataTable('#applicant-table', {
      columns: [
        { key: '접수번호', label: '접수번호' },
        { key: '수험번호', label: '수험번호' },
        { key: '성명', label: '성명', className: 'font-medium' },
        { key: '성별', label: '성별' },
        { key: '출신중', label: '출신중' },
        { key: '지역', label: '지역' },
        { key: '전형구분', label: '전형구분', render: (v) => v ? `<span class="px-2 py-0.5 rounded-full text-xs font-medium ${this.getTypeColor(v)}">${v}</span>` : '-' },
        { key: '최종점수', label: '최종점수', render: (v) => v != null ? `<span class="font-mono font-medium">${Utils.formatNumber(v)}</span>` : '-' },
        { key: '합불여부', label: '합불여부', render: (v) => v ? `<span class="px-2 py-0.5 rounded-full text-xs font-medium ${this.getResultColor(v)}">${v}</span>` : '-' }
      ],
      defaultSort: '접수번호',
      onRowClick: (id) => App.navigate('applicant-detail', { 접수번호: id }),
      selectable: true,
      pageSize: 50
    });

    // 이벤트 바인딩
    document.getElementById('btn-import')?.addEventListener('click', () => this.showImportDialog());
    document.getElementById('btn-export')?.addEventListener('click', () => this.exportData());

    const filterHandler = () => this.applyFilters();
    ['filter-year', 'filter-type', 'filter-region', 'filter-result'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', filterHandler);
    });

    let searchTimeout;
    document.getElementById('filter-search')?.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(filterHandler, 300);
    });

    document.getElementById('btn-filter-reset')?.addEventListener('click', () => {
      ['filter-search', 'filter-year', 'filter-type', 'filter-region', 'filter-result'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      filterHandler();
    });

    await this.applyFilters();
  },

  async loadFilterOptions() {
    const [years, types, regions] = await Promise.all([
      DB.getYears(),
      DB.getDistinctValues('전형구분'),
      DB.getDistinctValues('지역')
    ]);

    const yearSelect = document.getElementById('filter-year');
    years.forEach(y => { const o = document.createElement('option'); o.value = y; o.textContent = `${y}년`; yearSelect.appendChild(o); });
    if (years.length) yearSelect.value = years[0];

    const typeSelect = document.getElementById('filter-type');
    types.forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t; typeSelect.appendChild(o); });

    const regionSelect = document.getElementById('filter-region');
    regions.forEach(r => { const o = document.createElement('option'); o.value = r; o.textContent = r; regionSelect.appendChild(o); });
  },

  async applyFilters() {
    const filters = {
      검색어: document.getElementById('filter-search').value,
      연도: document.getElementById('filter-year').value ? Number(document.getElementById('filter-year').value) : undefined,
      전형구분: document.getElementById('filter-type').value || undefined,
      지역: document.getElementById('filter-region').value || undefined,
      합불여부: document.getElementById('filter-result').value || undefined
    };

    const applicants = await DB.getApplicants(filters);
    // 최종점수 merge
    const summaries = await db.scoresSummary.toArray();
    const summaryMap = new Map(summaries.map(s => [s.접수번호, s]));

    const merged = applicants.map(a => {
      const s = summaryMap.get(a.접수번호) || {};
      return { ...a, 최종점수: s.최종점수, 합불여부: s.합불여부 || a.합불여부 };
    });

    this.table.setData(merged);
  },

  showImportDialog() {
    this._workbook = null;
    const body = Modal.show({
      title: '데이터 가져오기 (Excel/CSV)',
      size: 'lg',
      content: `
        <div class="space-y-4">
          <div class="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors" id="drop-zone">
            <svg class="mx-auto h-12 w-12 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
            </svg>
            <p class="text-gray-500 mb-2">파일을 여기에 드래그하거나</p>
            <button id="btn-select-file" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm">파일 선택</button>
            <p class="text-xs text-gray-400 mt-2">지원 형식: .xlsx, .xls, .csv</p>
          </div>

          <!-- 시트 선택 영역 -->
          <div id="sheet-select-area" class="hidden">
            <h4 class="text-sm font-semibold text-gray-700 mb-2">시트 선택 (여러 개 선택 가능)</h4>
            <p class="text-xs text-gray-400 mb-3">각 시트에 연도를 지정해주세요. 여러 시트를 선택하면 한 번에 여러 연도 데이터를 가져올 수 있습니다.</p>
            <div id="sheet-list" class="space-y-2 max-h-64 overflow-y-auto"></div>
            <button id="btn-import-sheets" class="mt-4 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm w-full">선택한 시트 가져오기</button>
          </div>

          <div id="import-status" class="hidden">
            <div class="bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
              <div class="flex items-center gap-2">
                <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                <span id="import-status-text">처리 중...</span>
              </div>
            </div>
          </div>
        </div>
      `,
      buttons: [
        { label: '닫기', onClick: () => Modal.close() }
      ]
    });

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    document.getElementById('btn-select-file').addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) this.handleFileSelected(e.target.files[0]);
    });

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-blue-400', 'bg-blue-50'); });
    dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('border-blue-400', 'bg-blue-50'); });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('border-blue-400', 'bg-blue-50');
      if (e.dataTransfer.files[0]) this.handleFileSelected(e.dataTransfer.files[0]);
    });
  },

  async handleFileSelected(file) {
    const status = document.getElementById('import-status');
    const statusText = document.getElementById('import-status-text');
    status.classList.remove('hidden');
    statusText.textContent = `"${file.name}" 읽는 중...`;

    try {
      const workbook = await ImportExport.readWorkbook(file);
      this._workbook = workbook;
      const sheetNames = ImportExport.getSheetNames(workbook);

      status.classList.add('hidden');

      if (sheetNames.length === 1) {
        // 시트 1개: 바로 연도 입력 후 가져오기
        this.showSingleSheetImport(workbook, sheetNames[0]);
      } else {
        // 시트 여러 개: 시트 선택 UI 표시
        this.showSheetSelector(workbook, sheetNames);
      }
    } catch (err) {
      status.querySelector('div').className = 'bg-red-50 rounded-lg p-4 text-sm text-red-700';
      statusText.textContent = `파일 읽기 오류: ${err.message}`;
    }
  },

  showSingleSheetImport(workbook, sheetName) {
    const area = document.getElementById('sheet-select-area');
    area.classList.remove('hidden');
    area.innerHTML = `
      <div class="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
        <span class="text-sm font-medium text-blue-800">시트: ${sheetName}</span>
        <div>
          <label class="text-xs text-gray-600 mr-1">연도:</label>
          <input type="number" class="sheet-year rounded border-gray-300 text-sm px-2 py-1 w-24" value="${this.guessYear(sheetName)}" data-sheet="${sheetName}">
        </div>
      </div>
      <button id="btn-import-sheets" class="mt-3 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm w-full">가져오기</button>
    `;
    document.getElementById('btn-import-sheets').addEventListener('click', () => this.importSelectedSheets(workbook));
  },

  showSheetSelector(workbook, sheetNames) {
    const area = document.getElementById('sheet-select-area');
    area.classList.remove('hidden');
    const sheetList = document.getElementById('sheet-list');
    sheetList.innerHTML = sheetNames.map((name, i) => {
      const year = this.guessYear(name);
      const sheet = workbook.Sheets[name];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const rowCount = rows.length;
      return `
        <label class="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer ${i < sheetNames.length ? '' : 'opacity-50'}">
          <input type="checkbox" class="sheet-checkbox rounded border-gray-300" data-sheet="${name}" checked>
          <div class="flex-1">
            <span class="text-sm font-medium">${name}</span>
            <span class="text-xs text-gray-400 ml-2">(${rowCount}행)</span>
          </div>
          <div class="flex items-center gap-1">
            <label class="text-xs text-gray-500">연도:</label>
            <input type="number" class="sheet-year rounded border-gray-300 text-sm px-2 py-1 w-24" value="${year}" data-sheet="${name}">
          </div>
        </label>
      `;
    }).join('');

    document.getElementById('btn-import-sheets').addEventListener('click', () => this.importSelectedSheets(workbook));
  },

  guessYear(sheetName) {
    // 시트 이름에서 연도 추출 시도 (예: "2024", "2024년", "2024학년도")
    const match = sheetName.match(/(20\d{2})/);
    return match ? Number(match[1]) : Utils.getCurrentYear();
  },

  async importSelectedSheets(workbook) {
    const checkboxes = document.querySelectorAll('.sheet-checkbox:checked');
    const yearInputs = document.querySelectorAll('.sheet-year');
    const status = document.getElementById('import-status');
    const statusText = document.getElementById('import-status-text');

    if (!checkboxes.length && !yearInputs.length) {
      // 단일 시트 모드 (체크박스 없음)
      const yearInput = document.querySelector('.sheet-year');
      if (yearInput) {
        const sheetName = yearInput.dataset.sheet;
        const 연도 = Number(yearInput.value) || Utils.getCurrentYear();
        status.classList.remove('hidden');
        statusText.textContent = `시트 "${sheetName}" 처리 중...`;
        try {
          const parsed = ImportExport.parseSheet(workbook, sheetName, 연도);
          if (!parsed) throw new Error('데이터 없음');
          const counts = await ImportExport.saveToDB(parsed);
          status.querySelector('div').className = 'bg-green-50 rounded-lg p-4 text-sm text-green-700';
          statusText.textContent = `완료: 지원자 ${counts.applicants}명`;
          Toast.success(`${counts.applicants}명 가져옴`);
          await this.loadFilterOptions();
          await this.applyFilters();
        } catch (err) {
          status.querySelector('div').className = 'bg-red-50 rounded-lg p-4 text-sm text-red-700';
          statusText.textContent = `오류: ${err.message}`;
        }
        return;
      }
    }

    // 선택된 시트 수집
    const selectedSheets = new Set();
    checkboxes.forEach(cb => selectedSheets.add(cb.dataset.sheet));

    const sheetConfigs = [];
    yearInputs.forEach(input => {
      if (selectedSheets.has(input.dataset.sheet)) {
        sheetConfigs.push({ sheetName: input.dataset.sheet, 연도: Number(input.value) || Utils.getCurrentYear() });
      }
    });

    if (!sheetConfigs.length) { Toast.warning('시트를 선택해주세요.'); return; }

    status.classList.remove('hidden');
    statusText.textContent = `${sheetConfigs.length}개 시트 처리 중...`;

    try {
      const parsed = ImportExport.parseMultipleSheets(workbook, sheetConfigs);
      statusText.textContent = `데이터 저장 중... (지원자 ${parsed.applicants.length}명)`;
      const counts = await ImportExport.saveToDB(parsed);
      status.querySelector('div').className = 'bg-green-50 rounded-lg p-4 text-sm text-green-700';

      const yearList = [...new Set(sheetConfigs.map(c => c.연도))].join(', ');
      statusText.textContent = `완료: ${sheetConfigs.length}개 시트, 지원자 ${counts.applicants}명 (${yearList}년)`;
      Toast.success(`${sheetConfigs.length}개 시트에서 ${counts.applicants}명 가져옴`);
      await this.loadFilterOptions();
      await this.applyFilters();
    } catch (err) {
      status.querySelector('div').className = 'bg-red-50 rounded-lg p-4 text-sm text-red-700';
      statusText.textContent = `오류: ${err.message}`;
      Toast.error(`가져오기 실패: ${err.message}`);
    }
  },

  async exportData() {
    const 연도 = document.getElementById('filter-year').value;
    await ImportExport.exportApplicants(연도 ? { 연도: Number(연도) } : {});
    Toast.success('Excel 파일을 내보냈습니다.');
  },

  getTypeColor(type) {
    const colors = {
      '일반전형': 'bg-blue-100 text-blue-700',
      '사회통합전형': 'bg-green-100 text-green-700',
      '지역우선선발': 'bg-purple-100 text-purple-700'
    };
    return colors[type] || 'bg-gray-100 text-gray-700';
  },

  getResultColor(result) {
    const colors = {
      '합격': 'bg-green-100 text-green-700',
      '불합격': 'bg-red-100 text-red-700',
      '대기': 'bg-yellow-100 text-yellow-700',
      '추가합격': 'bg-blue-100 text-blue-700'
    };
    return colors[result] || 'bg-gray-100 text-gray-700';
  }
};

window.ApplicantsPage = ApplicantsPage;
