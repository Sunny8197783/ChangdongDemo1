# v4 폴리시 진행 상황 (재개용 메모)

사용자 요청(2026-11-04): ① 렉이 심함 ② 게임이 불친절함 ③ 스킬 이펙트가 화려하기만 하고 정교하지 않음(마법진은 좋음) — 스킬마다 정교하고 예쁘게
④ 몹을 정교하게, 디테일까지 모델링 ⑤ 몬스터마다 공략법, 전투 중 회피를 더 쉽게 ⑥ 이펙트 때문에 적이 어디를 얼마나 빠르게 때리는지 안 보임 → 확실히 수정

## 단계
1. [진행중] 진단+설계 워크플로 `arcane-wilds-v4-design` run `wf_e06ffa7a-d47`
   - script: /root/.claude/projects/-home-user-changdongdemo1/73b5b35e-096f-5c23-8d86-2f6619326bcd/workflows/scripts/arcane-wilds-v4-design-wf_e06ffa7a-d47.js
   - 재개: Workflow({scriptPath, resumeFromRunId: "wf_e06ffa7a-d47"})
2. [대기] 구현 워크플로 (docs/v4/PLAN.md의 JSON 작업 목록)
3. [대기] 직접 검증 → 커밋 → origin v4-polish 푸시 → 아티팩트 재배포 (https://claude.ai/artifact/7LwzvnUbMZoR78eALTV69d, 파일 목록: 스크래치패드 pub/list.json 재생성)

브랜치: v4-polish (v3-rpg에서 분기)

## 사용자 확인 사항 (2026-11-04)
- 플레이 환경: **노트북 내장 그래픽 + 크롬**. 기본 품질은 이 기준으로 맞추고, 기기 성능에 따라 품질을 자동으로 낮추는 기능(자동 품질 조절)을 반드시 넣을 것.
  → 구현 워크플로의 모든 오너 프롬프트와 PLAN 성능 목표에 이 조건을 명시해 반영.

## 단계 상태 (2026-11-04 갱신)
- (1) 설계: **완료** — run wf_e06ffa7a-d47, docs/v4/PLAN.md v4.1 (커밋 de5d823, 푸시됨). 노트북 내장 그래픽 기준 medium 기본값 + 자동 품질 거버너(§2.2–2.3) 포함 확인.
- (2) 구현: **진행 중** — run `wf_e69257f0-71f`
  - scriptPath: /root/.claude/projects/-home-user-changdongdemo1/73b5b35e-096f-5c23-8d86-2f6619326bcd/workflows/scripts/arcane-wilds-v4-build-wf_e69257f0-71f.js
  - 재개: Workflow({scriptPath, resumeFromRunId: 'wf_e69257f0-71f'})
  - 구성: WaveA(core → tag core-p0a) → WaveB(11 owner, /home/user/wt4/<owner>, branch v4/<owner>) → Integrate(§7.10, --perf 게이트, 시트 리뷰) → Review(6 렌즈) → Verify(반박 검증) → Fix(최대 2회 + 재통합)
- (3) 검증·푸시·재배포: 대기
- 2026-11-04 15:4x: 5시간 사용량 한도로 구현 run 중단(완료: core wave A, world, mobmodels; 태그 tells-b, vfx-b 생성됨). 18:23 UTC 같은 run id로 재개(task wbqcx1u4b).
