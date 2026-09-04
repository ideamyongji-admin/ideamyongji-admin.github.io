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

  // 맨 위로 가기 버튼 (일정 이상 스크롤하면 나타남)
  const scrollTopBtn = document.createElement('button');
  scrollTopBtn.type = 'button';
  scrollTopBtn.className = 'scroll-top-btn';
  scrollTopBtn.setAttribute('aria-label', '맨 위로 가기');
  scrollTopBtn.textContent = '↑';
  document.body.appendChild(scrollTopBtn);
  window.addEventListener('scroll', () => {
    scrollTopBtn.classList.toggle('show', window.scrollY > 480);
  }, { passive: true });
  scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

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

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover)').matches;

  // 스크롤 연동 텍스트 리빌: 문단을 단어 단위로 쪼개서, 화면의 일정 지점을 지나면 하나씩 선명해짐
  const scrollTextEls = document.querySelectorAll('.scroll-reveal-text');
  if (scrollTextEls.length && !prefersReducedMotion) {
    const wordGroups = [...scrollTextEls].map((el) => {
      const tokens = el.textContent.split(/(\s+)/);
      el.innerHTML = tokens.map((t) => (t.trim() ? `<span class="word">${t}</span>` : t)).join('');
      return [...el.querySelectorAll('.word')];
    });

    let ticking = false;
    const updateWords = () => {
      const line = window.innerHeight * 0.72;
      wordGroups.forEach((words) => {
        words.forEach((w) => w.classList.toggle('is-lit', w.getBoundingClientRect().top < line));
      });
      ticking = false;
    };
    updateWords();
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateWords);
    }, { passive: true });
    window.addEventListener('resize', updateWords);
  }

  // 매그네틱 버튼: 마우스를 가져가면 버튼이 커서 쪽으로 살짝 끌려옴
  if (canHover && !prefersReducedMotion) {
    document.querySelectorAll('.btn').forEach((btn) => {
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const relX = e.clientX - rect.left - rect.width / 2;
        const relY = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = `translate(${relX * 0.25}px, ${relY * 0.35}px)`;
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    });

    // 카드 틸트: 마우스 위치에 따라 카드가 입체적으로 살짝 기울어짐
    document.querySelectorAll('.card').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = `perspective(600px) rotateX(${-py * 6}deg) rotateY(${px * 6}deg) translateY(-4px)`;
      });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
  }
});
