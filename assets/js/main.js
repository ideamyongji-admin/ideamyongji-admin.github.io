document.addEventListener('DOMContentLoaded', () => {
  // 모바일 내비게이션 토글
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.nav');
  if (toggle && nav) {
    if (!nav.id) nav.id = 'site-nav';
    toggle.setAttribute('aria-controls', nav.id);

    const setNav = (open) => {
      nav.classList.toggle('nav--open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
      // 메뉴가 자체 스크롤을 갖는 전체화면 패널이므로 배경 스크롤을 잠급니다
      document.body.style.overflow = open ? 'hidden' : '';
    };

    toggle.addEventListener('click', () => setNav(!nav.classList.contains('nav--open')));
    // 메뉴 안의 링크를 누르면(같은 페이지 해시 이동 포함) 닫습니다
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) setNav(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('nav--open')) { setNav(false); toggle.focus(); }
    });
    // 데스크톱 폭으로 돌아오면 열린 상태가 남아 배경 스크롤이 잠긴 채로 있을 수 있음
    window.matchMedia('(min-width: 961px)').addEventListener('change', (e) => { if (e.matches) setNav(false); });
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

    // 헤더 드롭다운처럼 이 페이지 안에서 "news.html#gallery" 같은 해시 링크를 누르는 경우,
    // 이미 같은 페이지에 있으면 브라우저가 페이지를 다시 불러오지 않고 해시만 바꾸므로
    // 위 클릭 리스너가 걸리지 않습니다. hashchange를 별도로 감지해 탭을 전환합니다.
    window.addEventListener('hashchange', () => {
      const name = location.hash.replace('#', '');
      if (panelNames.includes(name)) activateTab(name);
    });
  }

  // 히어로 사진 스트립: 세로로 천천히 흐르는 갤러리.
  // 이음매 없이 반복하려면 이동 거리가 "그룹 1개 높이 + 간격"과 정확히 같아야 합니다.
  // translateY(-50%) 같은 어림값은 gap 때문에 어긋나므로 실측해서 넣습니다.
  const strip = document.querySelector('[data-hero-strip]');
  if (strip) {
    const track = strip.querySelector('.hero-strip-track');
    const group = track.querySelector('.hero-strip-group');

    // 모션 감소 설정에서는 흐르지 않고 손으로 훑어보는 목록이 되므로,
    // 이음매용 복제분이 필요 없습니다(같은 사진이 두 번 나열되는 것 방지).
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const layout = () => {
      track.querySelectorAll('.hero-strip-group').forEach((g, i) => { if (i > 0) g.remove(); });
      if (reduceMotion.matches) { strip.classList.add('is-ready'); return; }
      const gap = parseFloat(getComputedStyle(track).rowGap) || 0;
      const shift = group.getBoundingClientRect().height + gap;
      if (!shift) return;
      // 복제분은 스크린리더가 사진 설명을 두 번 읽지 않도록 숨기고, 링크도 빼둡니다.
      const twin = group.cloneNode(true);
      twin.setAttribute('aria-hidden', 'true');
      twin.querySelectorAll('a').forEach((a) => a.setAttribute('tabindex', '-1'));
      track.appendChild(twin);
      strip.style.setProperty('--strip-shift', shift + 'px');
      // 사진 1장당 7.5초 속도로 맞춰, 장수가 늘어도 체감 속도가 같게 유지합니다.
      const shots = group.querySelectorAll('.hero-shot').length || 1;
      strip.style.setProperty('--strip-duration', (shots * 7.5) + 's');
      strip.classList.add('is-ready');
    };

    // 사진이 실제로 로드된 뒤 높이를 재야 정확합니다.
    const imgs = [...group.querySelectorAll('img')];
    Promise.all(imgs.map((i) => i.complete ? null : new Promise((r) => {
      i.addEventListener('load', r, { once: true });
      i.addEventListener('error', r, { once: true });
    }))).then(layout);

    let stripTimer;
    window.addEventListener('resize', () => {
      clearTimeout(stripTimer);
      stripTimer = setTimeout(layout, 200);
    });

    // WCAG 2.2.2 — 5초 넘게 자동으로 움직이는 콘텐츠에는 정지 수단이 있어야 합니다.
    // (마우스 hover·키보드 포커스 정지는 CSS가 처리하지만, 터치 사용자에게는
    //  명시적인 버튼이 필요합니다.)
    if (!reduceMotion.matches) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hero-strip-toggle';
      const icon = (name) =>
        '<svg class="ic" aria-hidden="true" focusable="false"><use href="#i-' + name + '"></use></svg>';
      const render = (paused) => {
        btn.innerHTML = icon(paused ? 'play' : 'pause');
        btn.setAttribute('aria-label', paused ? '사진 넘김 다시 시작' : '사진 넘김 일시정지');
        btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
      };
      render(false);
      btn.addEventListener('click', () => render(strip.classList.toggle('is-paused')));
      strip.appendChild(btn);
    }
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
    // 텍스트 노드만 골라 단어를 감쌉니다. el.innerHTML을 통째로 다시 쓰면
    // 문단 안의 <strong>/<em> 같은 인라인 마크업이 사라지므로 그렇게 하지 않습니다.
    const wrapWords = (root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      textNodes.forEach((node) => {
        if (!node.nodeValue.trim()) return;
        const frag = document.createDocumentFragment();
        node.nodeValue.split(/(\s+)/).forEach((token) => {
          if (!token) return;
          if (!token.trim()) { frag.appendChild(document.createTextNode(token)); return; }
          const span = document.createElement('span');
          span.className = 'word';
          span.textContent = token;
          frag.appendChild(span);
        });
        node.parentNode.replaceChild(frag, node);
      });
    };
    const wordGroups = [...scrollTextEls].map((el) => {
      wrapWords(el);
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
  }
});
