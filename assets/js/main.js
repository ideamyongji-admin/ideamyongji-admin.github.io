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

  // 숫자 카운트업 ("409명" → 0에서 409까지 세어 올라감)
  function animateCountUp(el) {
    const raw = el.textContent.trim();
    const match = raw.match(/^(\d+)(.*)$/);
    if (!match) return;
    const target = parseInt(match[1], 10);
    const suffix = match[2];
    const duration = 1100;
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // 스크롤 리빌: 카드/섹션 헤더/히어로 통계가 화면에 들어오면 살짝 떠오르며 등장
  const revealTargets = document.querySelectorAll('.card, .section-head, .hero-stats .stat');
  if (revealTargets.length) {
    revealTargets.forEach((el) => el.classList.add('reveal'));

    if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-revealed');
            const statNumber = entry.target.matches('.hero-stats .stat') ? entry.target.querySelector('b') : null;
            if (statNumber) animateCountUp(statNumber);
            io.unobserve(entry.target);
          });
        },
        { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
      );
      revealTargets.forEach((el) => io.observe(el));
    } else {
      revealTargets.forEach((el) => el.classList.add('is-revealed'));
    }
  }
});
