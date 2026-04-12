// db.js - IndexedDB via Dexie.js
const db = new Dexie('AdmissionDB');

db.version(1).stores({
  applicants: '접수번호, 수험번호, 연도, 성명, 성별, 출신중, 지역, 시, 전형구분, 합불여부, 최종점수',
  grades: '++id, 접수번호, 학기, 과목',
  convertedScores: '++id, 접수번호, 학기, 과목',
  scoresSummary: '접수번호, 교과성적, 최종점수, 합불여부',
  gedScores: '접수번호',
  yearlyConfig: '연도',
  dataHistory: '++id, 연도, 가져오기일시'
});

// ─── Applicant CRUD ───
const DB = {
  // 지원자 전체 조회 (연도 필터 옵션)
  async getApplicants(filters = {}) {
    let collection = db.applicants;
    if (filters.연도) collection = collection.where('연도').equals(filters.연도);
    let results = await collection.toArray();

    if (filters.전형구분) results = results.filter(a => a.전형구분 === filters.전형구분);
    if (filters.합불여부) results = results.filter(a => a.합불여부 === filters.합불여부);
    if (filters.지역) results = results.filter(a => a.지역 === filters.지역);
    if (filters.시) results = results.filter(a => a.시 === filters.시);
    if (filters.검색어) {
      const q = filters.검색어.toLowerCase();
      results = results.filter(a =>
        (a.성명 || '').toLowerCase().includes(q) ||
        (a.수험번호 || '').includes(q) ||
        (a.접수번호 || '').includes(q) ||
        (a.출신중 || '').toLowerCase().includes(q)
      );
    }
    return results;
  },

  async getApplicant(접수번호) {
    return db.applicants.get(접수번호);
  },

  async putApplicant(data) {
    return db.applicants.put(data);
  },

  async bulkPutApplicants(dataArray) {
    return db.applicants.bulkPut(dataArray);
  },

  async deleteApplicant(접수번호) {
    return db.transaction('rw', db.applicants, db.grades, db.convertedScores, db.scoresSummary, db.gedScores, async () => {
      await db.applicants.delete(접수번호);
      await db.grades.where('접수번호').equals(접수번호).delete();
      await db.convertedScores.where('접수번호').equals(접수번호).delete();
      await db.scoresSummary.delete(접수번호);
      await db.gedScores.delete(접수번호);
    });
  },

  // ─── Grades ───
  async getGrades(접수번호) {
    return db.grades.where('접수번호').equals(접수번호).toArray();
  },

  async bulkPutGrades(dataArray) {
    return db.grades.bulkPut(dataArray);
  },

  // ─── Converted Scores ───
  async getConvertedScores(접수번호) {
    return db.convertedScores.where('접수번호').equals(접수번호).toArray();
  },

  async bulkPutConvertedScores(dataArray) {
    return db.convertedScores.bulkPut(dataArray);
  },

  // ─── Scores Summary ───
  async getScoresSummary(접수번호) {
    return db.scoresSummary.get(접수번호);
  },

  async getAllScoresSummary(연도) {
    if (연도) {
      const applicants = await db.applicants.where('연도').equals(연도).toArray();
      const ids = applicants.map(a => a.접수번호);
      return db.scoresSummary.where('접수번호').anyOf(ids).toArray();
    }
    return db.scoresSummary.toArray();
  },

  async putScoresSummary(data) {
    return db.scoresSummary.put(data);
  },

  async bulkPutScoresSummary(dataArray) {
    return db.scoresSummary.bulkPut(dataArray);
  },

  // ─── GED Scores ───
  async getGedScores(접수번호) {
    return db.gedScores.get(접수번호);
  },

  async bulkPutGedScores(dataArray) {
    return db.gedScores.bulkPut(dataArray);
  },

  // ─── Yearly Config ───
  async getYearlyConfig(연도) {
    return db.yearlyConfig.get(연도);
  },

  async getAllYearlyConfigs() {
    return db.yearlyConfig.toArray();
  },

  async putYearlyConfig(data) {
    return db.yearlyConfig.put(data);
  },

  // ─── Statistics helpers ───
  async getDistinctValues(field) {
    const all = await db.applicants.toArray();
    return [...new Set(all.map(a => a[field]).filter(Boolean))].sort();
  },

  async getYears() {
    const all = await db.applicants.toArray();
    return [...new Set(all.map(a => a.연도).filter(Boolean))].sort((a, b) => b - a);
  },

  async getCount(filters = {}) {
    const results = await this.getApplicants(filters);
    return results.length;
  },

  // ─── Backup / Restore ───
  async exportAll() {
    const [applicants, grades, convertedScores, scoresSummary, gedScores, yearlyConfig] = await Promise.all([
      db.applicants.toArray(),
      db.grades.toArray(),
      db.convertedScores.toArray(),
      db.scoresSummary.toArray(),
      db.gedScores.toArray(),
      db.yearlyConfig.toArray()
    ]);
    return { applicants, grades, convertedScores, scoresSummary, gedScores, yearlyConfig, exportDate: new Date().toISOString() };
  },

  async importAll(data) {
    return db.transaction('rw', db.applicants, db.grades, db.convertedScores, db.scoresSummary, db.gedScores, db.yearlyConfig, async () => {
      if (data.applicants) await db.applicants.bulkPut(data.applicants);
      if (data.grades) await db.grades.bulkPut(data.grades);
      if (data.convertedScores) await db.convertedScores.bulkPut(data.convertedScores);
      if (data.scoresSummary) await db.scoresSummary.bulkPut(data.scoresSummary);
      if (data.gedScores) await db.gedScores.bulkPut(data.gedScores);
      if (data.yearlyConfig) await db.yearlyConfig.bulkPut(data.yearlyConfig);
    });
  },

  async clearAll() {
    return db.transaction('rw', db.applicants, db.grades, db.convertedScores, db.scoresSummary, db.gedScores, db.yearlyConfig, async () => {
      await db.applicants.clear();
      await db.grades.clear();
      await db.convertedScores.clear();
      await db.scoresSummary.clear();
      await db.gedScores.clear();
      await db.yearlyConfig.clear();
    });
  },

  async clearYear(연도) {
    const applicants = await db.applicants.where('연도').equals(연도).toArray();
    const ids = applicants.map(a => a.접수번호);
    return db.transaction('rw', db.applicants, db.grades, db.convertedScores, db.scoresSummary, db.gedScores, async () => {
      await db.applicants.where('연도').equals(연도).delete();
      for (const id of ids) {
        await db.grades.where('접수번호').equals(id).delete();
        await db.convertedScores.where('접수번호').equals(id).delete();
      }
      await db.scoresSummary.where('접수번호').anyOf(ids).delete();
      await db.gedScores.where('접수번호').anyOf(ids).delete();
    });
  }
};

window.DB = DB;
window.db = db;
