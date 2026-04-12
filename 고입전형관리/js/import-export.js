// import-export.js - Excel/CSV 가져오기, 내보내기, 백업/복원
const ImportExport = {
  // ─── 워크북 읽기 (시트 목록 반환) ───
  readWorkbook(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          resolve(workbook);
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('파일 읽기 실패'));
      reader.readAsArrayBuffer(file);
    });
  },

  // 시트 이름 목록
  getSheetNames(workbook) {
    return workbook.SheetNames;
  },

  // 특정 시트 파싱
  parseSheet(workbook, sheetName, 연도) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rows.length) return null;
    return this.processRows(rows, 연도);
  },

  // 여러 시트 파싱 (시트별 연도 매핑)
  parseMultipleSheets(workbook, sheetConfigs) {
    // sheetConfigs = [{ sheetName, 연도 }, ...]
    const allResults = { applicants: [], grades: [], convertedScores: [], scoresSummary: [], gedScores: [] };
    for (const config of sheetConfigs) {
      const result = this.parseSheet(workbook, config.sheetName, config.연도);
      if (result) {
        allResults.applicants.push(...result.applicants);
        allResults.grades.push(...result.grades);
        allResults.convertedScores.push(...result.convertedScores);
        allResults.scoresSummary.push(...result.scoresSummary);
        allResults.gedScores.push(...result.gedScores);
      }
    }
    return allResults;
  },

  // ─── (레거시) 단일 시트 파싱 ───
  async parseFile(file, 연도) {
    const workbook = await this.readWorkbook(file);
    const result = this.parseSheet(workbook, workbook.SheetNames[0], 연도);
    if (!result) throw new Error('파일에 데이터가 없습니다.');
    return result;
  },

  // 행 데이터를 DB 구조로 변환
  processRows(rows, 연도) {
    const headers = Object.keys(rows[0]);
    const applicants = [];
    const grades = [];
    const convertedScores = [];
    const scoresSummary = [];
    const gedScores = [];
    const unmappedHeaders = new Set();

    for (const row of rows) {
      // 1) 지원자 기본 정보
      const applicant = { 연도: 연도 || Utils.getCurrentYear() };
      const summary = {};
      const ged = {};
      let hasGed = false;

      for (const header of headers) {
        const value = row[header];

        // '성명' 단독 헤더: 지원자 성명이 아직 없으면 지원자로, 있으면 회사로
        if (header === '성명') {
          if (!applicant.성명) {
            applicant.성명 = value;
          } else {
            applicant.성명_회사 = value;
          }
          continue;
        }

        // 기본 필드 매핑
        if (Utils.HEADER_MAP[header]) {
          const dbField = Utils.HEADER_MAP[header];
          // 점수 관련 summary 필드
          if (['교과성적', '출석', '1단계최종점수', '면접점수', '감점', '최종점수'].includes(dbField)) {
            summary[dbField] = Utils.parseNum(value);
          } else if (['도덕평균', '사회평균', '역사평균', '기가평균', '음악평균', '미술평균', '체육평균'].includes(dbField)) {
            summary[dbField] = Utils.parseNum(value);
          } else if (dbField === '합불여부') {
            summary[dbField] = value;
            applicant[dbField] = value;
          } else if (dbField === '담임교사이름') {
            summary[dbField] = value;
          } else {
            applicant[dbField] = value;
          }
          continue;
        }

        // 환산점수 (먼저 체크! - parseGradeHeader가 '국어(환산점수)'를 잘못 잡는 것 방지)
        const convertedInfo = Utils.parseConvertedHeader(header);
        if (convertedInfo && value !== '' && value != null) {
          convertedScores.push({
            접수번호: row['접수번호'],
            학기: convertedInfo.학기,
            과목: convertedInfo.과목,
            환산점수: Utils.parseNum(value)
          });
          continue;
        }

        // 성적 (원점수)
        const gradeInfo = Utils.parseGradeHeader(header);
        if (gradeInfo && value !== '' && value != null) {
          grades.push({
            접수번호: row['접수번호'],
            학기: gradeInfo.학기,
            과목: gradeInfo.과목,
            성적등급: value
          });
          continue;
        }

        // 검정고시
        const gedSubject = Utils.parseGedHeader(header);
        if (gedSubject) {
          ged[gedSubject] = Utils.parseNum(value);
          hasGed = true;
          continue;
        }

        // 검정고시 최종점수
        if (header === '검정고시 최종점수' || header === '검정고시최종점수') {
          ged['최종점수'] = Utils.parseNum(value);
          hasGed = true;
          continue;
        }

        // 매핑 안 된 헤더 추적
        unmappedHeaders.add(header);
      }

      // 숫자 필드 변환
      applicant.무단결석 = Utils.parseNum(applicant.무단결석);
      applicant.무단지각조퇴결과 = Utils.parseNum(applicant.무단지각조퇴결과);

      if (applicant.접수번호) {
        applicants.push(applicant);

        summary.접수번호 = applicant.접수번호;
        scoresSummary.push(summary);

        if (hasGed) {
          ged.접수번호 = applicant.접수번호;
          gedScores.push(ged);
        }
      }
    }

    // 매핑 안 된 헤더 콘솔 경고
    if (unmappedHeaders.size) {
      console.warn('매핑 안 된 Excel 헤더:', [...unmappedHeaders]);
    }

    return { applicants, grades, convertedScores, scoresSummary, gedScores, unmappedHeaders: [...unmappedHeaders] };
  },

  // ─── DB에 저장 ───
  async saveToDB(parsed) {
    const counts = {
      applicants: parsed.applicants.length,
      grades: parsed.grades.length,
      convertedScores: parsed.convertedScores.length,
      scoresSummary: parsed.scoresSummary.length,
      gedScores: parsed.gedScores.length
    };

    await DB.bulkPutApplicants(parsed.applicants);
    if (parsed.grades.length) await DB.bulkPutGrades(parsed.grades);
    if (parsed.convertedScores.length) await DB.bulkPutConvertedScores(parsed.convertedScores);
    if (parsed.scoresSummary.length) await DB.bulkPutScoresSummary(parsed.scoresSummary);
    if (parsed.gedScores.length) await DB.bulkPutGedScores(parsed.gedScores);

    return counts;
  },

  // ─── Excel 내보내기 ───
  async exportApplicants(filters = {}) {
    const applicants = await DB.getApplicants(filters);
    const summaries = await db.scoresSummary.toArray();
    const summaryMap = new Map(summaries.map(s => [s.접수번호, s]));

    const exportData = applicants.map(a => {
      const s = summaryMap.get(a.접수번호) || {};
      return {
        접수번호: a.접수번호,
        수험번호: a.수험번호,
        성명: a.성명,
        성별: a.성별,
        생년월일: a.생년월일,
        출신중: a.출신중,
        지역: a.지역,
        시: a.시,
        전형구분: a.전형구분,
        교과성적: s.교과성적,
        출석: s.출석,
        '1단계최종점수': s['1단계최종점수'],
        면접점수: s.면접점수,
        감점: s.감점,
        최종점수: s.최종점수,
        합불여부: s.합불여부 || a.합불여부
      };
    });

    this.downloadExcel(exportData, `지원자목록_${filters.연도 || 'all'}`);
  },

  async exportResults(filters = {}) {
    const applicants = await DB.getApplicants(filters);
    const summaries = await db.scoresSummary.toArray();
    const summaryMap = new Map(summaries.map(s => [s.접수번호, s]));

    const withScores = applicants
      .map(a => ({ ...a, ...(summaryMap.get(a.접수번호) || {}) }))
      .filter(a => a.최종점수 != null)
      .sort((a, b) => (b.최종점수 || 0) - (a.최종점수 || 0));

    const exportData = withScores.map((a, i) => ({
      순위: i + 1,
      접수번호: a.접수번호,
      수험번호: a.수험번호,
      성명: a.성명,
      출신중: a.출신중,
      전형구분: a.전형구분,
      교과성적: a.교과성적,
      출석: a.출석,
      면접점수: a.면접점수,
      감점: a.감점,
      최종점수: a.최종점수,
      합불여부: a.합불여부
    }));

    this.downloadExcel(exportData, `전형결과_${filters.연도 || 'all'}`);
  },

  downloadExcel(data, filename) {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    // 열 너비 자동 조정
    const colWidths = Object.keys(data[0] || {}).map(key => ({
      wch: Math.max(key.length * 2, ...data.map(r => String(r[key] || '').length)) + 2
    }));
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `${filename}.xlsx`);
  },

  // ─── JSON 백업/복원 ───
  async backupToJSON() {
    const data = await DB.exportAll();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `고입전형_백업_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async restoreFromJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data.applicants) throw new Error('올바른 백업 파일이 아닙니다.');
          await DB.importAll(data);
          resolve({
            applicants: (data.applicants || []).length,
            grades: (data.grades || []).length,
            convertedScores: (data.convertedScores || []).length,
            scoresSummary: (data.scoresSummary || []).length,
            gedScores: (data.gedScores || []).length
          });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('파일 읽기 실패'));
      reader.readAsText(file);
    });
  }
};

window.ImportExport = ImportExport;
