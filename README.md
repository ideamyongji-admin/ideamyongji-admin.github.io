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
