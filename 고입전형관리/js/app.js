// app.js - 앱 초기화, 라우팅, 전역 상태
const App = {
  currentPage: 'dashboard',
  currentParams: {},

  pages: {
    'dashboard': { label: '대시보드', icon: 'home', handler: DashboardPage },
    'applicants': { label: '지원자 관리', icon: 'users', handler: ApplicantsPage },
    'applicant-detail': { label: '지원자 상세', icon: 'user', handler: ApplicantDetailPage, hidden: true },
    'analysis': { label: '성적 분석', icon: 'bar-chart-2', handler: AnalysisPage },
    'cutline': { label: '커트라인', icon: 'git-commit', handler: CutlinePage },
    'regional': { label: '지역/출신중', icon: 'map-pin', handler: RegionalPage },
    'yearly': { label: '연도별 비교', icon: 'trending-up', handler: YearlyPage },
    'results': { label: '합격자 관리', icon: 'check-circle', handler: ResultsPage },
    'settings': { label: '설정', icon: 'settings', handler: SettingsPage }
  },

  init() {
    this.renderNav();
    this.navigate('dashboard');

    // 키보드 단축키
    document.addEventListener('keydown', (e) => {
      if (e.altKey) {
        const shortcuts = { '1': 'dashboard', '2': 'applicants', '3': 'analysis', '4': 'cutline', '5': 'regional', '6': 'yearly', '7': 'results', '8': 'settings' };
        if (shortcuts[e.key]) { e.preventDefault(); this.navigate(shortcuts[e.key]); }
      }
    });
  },

  renderNav() {
    const nav = document.getElementById('nav-menu');
    if (!nav) return;

    nav.innerHTML = Object.entries(this.pages)
      .filter(([, p]) => !p.hidden)
      .map(([key, p]) => `
        <button class="nav-item flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
          ${key === this.currentPage ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}"
          data-page="${key}">
          <i data-lucide="${p.icon}" class="w-4 h-4"></i>
          <span>${p.label}</span>
        </button>
      `).join('');

    nav.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => this.navigate(btn.dataset.page));
    });

    // Lucide 아이콘 렌더링
    if (window.lucide) lucide.createIcons();
  },

  async navigate(page, params = {}) {
    const pageConfig = this.pages[page];
    if (!pageConfig) return;

    this.currentPage = page;
    this.currentParams = params;

    // 네비게이션 활성 상태 업데이트
    document.querySelectorAll('.nav-item').forEach(btn => {
      const isActive = btn.dataset.page === page || (page === 'applicant-detail' && btn.dataset.page === 'applicants');
      btn.classList.toggle('bg-blue-50', isActive);
      btn.classList.toggle('text-blue-700', isActive);
      btn.classList.toggle('text-gray-600', !isActive);
    });

    // 모바일: 사이드바 닫기
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth < 1024) {
      sidebar.classList.add('-translate-x-full');
    }

    // 페이지 렌더링
    const content = document.getElementById('page-content');
    content.innerHTML = '<div class="flex items-center justify-center h-64"><div class="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div></div>';

    try {
      await pageConfig.handler.render(content, params);
      // 아이콘 재렌더링
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error('Page render error:', err);
      content.innerHTML = `<div class="text-red-500 p-8">
        <h3 class="text-lg font-semibold mb-2">페이지 로드 오류</h3>
        <p class="text-sm">${err.message}</p>
      </div>`;
    }

    // URL 해시 업데이트
    window.location.hash = page;
  }
};

// 해시 기반 라우팅
window.addEventListener('hashchange', () => {
  const page = window.location.hash.slice(1);
  if (page && App.pages[page] && page !== App.currentPage) {
    App.navigate(page);
  }
});

// 앱 시작
document.addEventListener('DOMContentLoaded', () => {
  const hashPage = window.location.hash.slice(1);
  if (hashPage && App.pages[hashPage]) {
    App.currentPage = hashPage;
  }
  App.init();
});

window.App = App;
