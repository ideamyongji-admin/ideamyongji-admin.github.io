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

  // 예산 진행률 바 애니메이션
  document.querySelectorAll('.budget-bar > span').forEach((bar) => {
    const pct = bar.getAttribute('data-pct');
    requestAnimationFrame(() => { bar.style.width = pct + '%'; });
  });

  // 스크롤 시 헤더 그림자
  const header = document.querySelector('.site-header');
  if (header) {
    window.addEventListener('scroll', () => {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    }, { passive: true });
  }
});
