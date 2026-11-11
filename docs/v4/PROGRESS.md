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
- 2026-11-04 ~21:00: 두 번째 한도 중단(완료 추가: core-b, tells, vfx, player). 2026-11-05 00:02 UTC 재개(task wvhtayrmm). 남은 것: magic, melee, mobs, bosses, ux → 통합·리뷰·수정.
- 2026-11-05 05:13 UTC: 세 번째 재개(task wz6ytpbxk). 사용자 요청 '토큰을 덜 쓰는 방향'으로 축소: 리뷰 6→2 렌즈(effort medium), 별도 검증 단계 제거(수정 담당이 직접 확인), 수정 1회, 남은 빌더에 토큰 절약 지시, 자동 재개 체크 2시간 간격.
- 2026-11-05 08:58 UTC: 사용자 요청으로 저장 후 중지. 완료: core, world, mobmodels, tells, vfx, player, magic, melee, mobs (태그 *-b). 진행 중이던 bosses, ux는 WIP 커밋. 모든 v4/* 브랜치와 태그를 origin에 푸시. 자동 재개 예약은 비활성화(삭제 안 함). 재개: Workflow({scriptPath, resumeFromRunId:'wf_e69257f0-71f'}) 후 예약 재활성화.

### 로컬 태그 (프록시가 태그 푸시를 403으로 막아 기록만 함; 재생성: git tag <name> <sha>)
- core-b 21040b7
- core-p0a 274dcac
- kit-p0a 2ab85be
- magic-b 743aedb
- melee-b 48db1e1
- mobmodels-b 9faeb46
- mobs-b 09b720a
- models-p0a fe90c05
- player-b a6487c3
- player-b.2 36d965a
- tells-b 2a3497d
- tells-b.2 dc0f040
- tells-p0a 6b2738c
- vfx-b 4727b28
- world-b 1849646
- world-p0a fe8589e
- 2026-11-10 01:12 UTC: 사용자 요청으로 재개(task w8j6ey1jr), 자동 재개 예약 재활성화.

## 2026-11-10 — v4 빌드 완료
- 빌드 워크플로 wf_e69257f0-71f 완료 (27 agents). 최종 head d34d2d4 (integrate round 2).
- 최종 검증: bootcheck 17/17 OK, playtest --quick PASS, playtest3 1274/0 fail, C8 GPU 게이트 통과(F-mage 0.258, F-ranger 0.327, S-plains 0.314).
- 아티팩트 v6 재배포 (https://claude.ai/artifact/7LwzvnUbMZoR78eALTV69d).
- 남은 항목(major): 골렘 페이즈2 스킵(가끔), B-golem C6 공격 없음, treant 판정 flaky, magic castLock 0.05 고정(clearFx), 셰이더 프로그램 수 159–164 (예산 130), 일부 마법 가독성/실루엣 수치, 업로드 call 수.
- push: 06:xx UTC 이후 GitHub 403으로 실패 중 (로컬 커밋 보존).

## 2026-11-11 — 마법 이펙트 v3 롤백 + 골렘/캐스팅 버그 수정
- 사용자 요청으로 마법 이펙트를 v3-rpg 모습으로 롤백 (looks/palette/motifs 삭제). castId·castLock 통합은 src/spells/castctx.js로 유지, lookOf는 항상 'legacy'.
- castLock 0.05 고정 버그: 피니셔에 kill() 추가, clearFx()가 피니셔 종료 + castLock 리셋.
- 골렘 페이즈2 스킵: 피니셔 damage 이벤트의 프록(lightning.p2.bolt)이 중첩 치명타로 페이즈2 진입 후, 바깥 치명타가 다시 onDeath → bossDefeated. golem.js/bossbase.js onDeath에서 hp > 0인 stale kill 무시.
- B-golem C6 "공격 0": 등장 연출(5.2 s) 때문에 측정 창을 넘김 — 하네스 문제, 미수정.
- 검증: bootcheck OK, playtest --quick PASS, playtest2 3회 PASS, playtest3 1274/0 fail, playtest4 magic(활성 체크)·player 59/59·bosses golem 37/0, kalis+nox 74/0.
