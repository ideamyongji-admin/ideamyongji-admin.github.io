document.addEventListener('DOMContentLoaded', () => {
  // 모바일 내비게이션 토글
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('nav--open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // 현재 페이지 기준 상단 메뉴 활성화 표시
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav a, .subnav a').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href) return;
    const file = href.split('#')[0];
    if (file === path) {
      a.classList.add('active');
      const parentLi = a.closest('li');
      if (parentLi) parentLi.classList.add('active');
    }
  });

  // 사업단소식 탭 전환 (공지사항 / 자료실)
  const tabLinks = document.querySelectorAll('.tab-link');
  const tabPanels = document.querySelectorAll('.tab-panel');
  if (tabLinks.length && tabPanels.length) {
    const panelNames = [...tabPanels].map((p) => p.dataset.panel);
    const activateTab = (name) => {
      tabLinks.forEach((l) => l.classList.toggle('active', l.dataset.tab === name));
      tabPanels.forEach((p) => { p.hidden = p.dataset.panel !== name; });
    };
    const initial = location.hash.replace('#', '');
    activateTab(panelNames.includes(initial) ? initial : panelNames[0]);

    tabLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        activateTab(link.dataset.tab);
        history.replaceState(null, '', '#' + link.dataset.tab);
      });
    });
  }

  // 스크롤 시 헤더 그림자
  const header = document.querySelector('.site-header');
  if (header) {
    window.addEventListener('scroll', () => {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    }, { passive: true });
  }
});
