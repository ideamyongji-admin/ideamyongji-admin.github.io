# IDEA 사업단 홈페이지

인공지능 융합 디자인-엔지니어링 사업단(IDEA, Institute for Design Engineering with AI) 공식 홈페이지입니다.
명지대학교 산업경영공학과·비주얼커뮤니케이션디자인학과·인더스트리얼디자인학과가 참여하는 교내 자율형 특성화사업단 소개 사이트입니다.

## 사이트 구조

| 페이지 | 설명 |
|---|---|
| [index.html](index.html) | 홈 |
| [about.html](about.html) | 사업단소개 (추진 필요성 · 비전과 목표 · 대학발전계획 연계) |
| [people.html](people.html) | 참여인력 |
| [programs.html](programs.html) | 특성화계획 (마이크로디그리 · 4대 핵심 프로그램) |
| [career.html](career.html) | 진로지도계획 · 산학협력계획 |
| [performance.html](performance.html) | 사업비 집행계획 · 성과지표 |
| [news.html](news.html) | 사업단소식 |
| [contact.html](contact.html) | 오시는 길 |

## 기술 스택

순수 HTML / CSS / JavaScript로 제작된 정적 웹사이트입니다. 별도의 빌드 과정이 필요 없습니다.

- `assets/css/style.css` — 디자인 시스템 (색상, 타이포그래피, 컴포넌트)
- `assets/js/main.js` — 모바일 내비게이션, 예산 그래프 애니메이션 등
- `assets/img/` — 로고 및 배지 이미지

## 로컬에서 실행하기

```bash
python -m http.server 8000
```

이후 브라우저에서 `http://localhost:8000` 접속

## 배포

GitHub Pages를 통해 배포됩니다. `main` 브랜치에 푸시하면 자동으로 반영됩니다.

## 아이콘 세트

`assets/icons/sprite.inc.html`이 SVG 아이콘 스프라이트의 **원본**입니다.
`<symbol id="i-이름">` 형태이며, 규격은 24×24 viewBox · 1.7px 스트로크 · `currentColor`입니다.

각 페이지는 이 스프라이트를 `<body>` 바로 뒤에 **인라인으로 복사해** 갖고 있고,
사용처에서는 `<svg class="ic"><use href="#i-이름"></use></svg>`로 참조합니다.
외부 파일 `<use href="파일.svg#id">`는 브라우저/오리진 제약이 있어 인라인을 택했습니다.

아이콘을 추가·수정할 때는 `sprite.inc.html`을 먼저 고치고,
그 내용을 아이콘을 쓰는 페이지(`index/about/programs/career/news/admin`)의
스프라이트 블록에 함께 반영해야 합니다.
아이콘을 쓰지 않는 페이지(`people/contact/reserve/reserve-admin`)에는 넣지 않습니다.

> 헤더·티커·푸터·스프라이트가 페이지마다 복제되어 있습니다.
> 내비게이션을 한 곳에서만 고치려면 정적 사이트 빌드(예: 11ty)로 파셜을 분리하는 작업이 필요합니다.

## 히어로 사진 스트립 (index.html)

첫 화면 오른쪽에서 공간·활동 사진 4장이 세로로 천천히 흐릅니다.

- 사진 원본은 `assets/images/hero/<이름>_440x330.{jpg,webp}` / `_880x660.{jpg,webp}` 4종
- **자동이 아니라 큐레이션입니다.** `gallery.json`을 읽지 않고 `index.html`에 직접 적어 둡니다.
  첫 화면에 어떤 사진이 걸릴지는 골라야 하는 문제이지, 최신순으로 자동 결정할 일이 아닙니다.
- 사진을 바꾸려면 ① 새 파일을 위 4종 규격으로 만들고 ② `index.html`의 `.hero-strip-group`
  안 `<a class="hero-shot">` 블록을 수정합니다. 장수는 자유이며, `main.js`가 높이를
  실측해 이음매 없이 반복하고 속도(장당 7.5초)도 자동으로 맞춥니다.
- 접근성: 일시정지 버튼, 마우스·키보드 포커스 시 자동 정지, `prefers-reduced-motion`
  환경에서는 정지 + 수동 스크롤로 동작합니다 (WCAG 2.2.2).

### 사진 보정 스크립트

업로드한 원본은 `.gitignore`로 저장소에서 제외하고, 웹용 파생본만 커밋합니다.
톤 보정(화이트밸런스·노출·콘트라스트)과 리사이즈는 동일한 절차로 맞춰 스트립 안에서
색온도가 튀지 않게 합니다.
