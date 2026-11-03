# v3 RPG 확장 진행 상황 (재개용 메모)

## 단계
1. [완료] 설계 워크플로 `wf_5f014727-6ee` → docs/v3/DESIGN.md, docs/v3/CONTRACT.md (§24 JSON 빌드 작업), ARCHITECTURE.md v3 섹션 (커밋 3de9528)
2. [진행중] 구현 워크플로 `arcane-wilds-v3-build` — 웨이브 0(core) → 1(skills,combat,player,world,ui) → 2(magic,melee,enemies) → 3(narrative) → 통합 → 리뷰/수정
   - 각 오너는 /home/user/wt/<owner> 워크트리, 브랜치 v3/<owner>; 웨이브마다 v3-rpg로 머지
   - run `wf_c2cd01fc-099`, script: /root/.claude/projects/-home-user-changdongdemo1/73b5b35e-096f-5c23-8d86-2f6619326bcd/workflows/scripts/arcane-wilds-v3-build-wf_5c28193c-792.js
   - 재개: Workflow({scriptPath, resumeFromRunId: "wf_c2cd01fc-099"})
3. [대기] 직접 검증(플레이테스트·스크린샷) → 커밋 → origin v3-rpg 푸시 → 아티팩트 재배포
   (https://claude.ai/artifact/7LwzvnUbMZoR78eALTV69d)

저장소: https://github.com/Sunny8197783/ChangdongDemo1 (작업 브랜치 v3-rpg)

## 결과 (빌드 완료)
- 구현 워크플로 `wf_c2cd01fc-099` 완료: 10 오너 빌드 → 웨이브 머지 → 통합 → 4관점 리뷰(24건) → 수정
- 검증: bootcheck, playtest --quick, playtest2, playtest3 (1259 통과, 0 실패) 모두 통과
- 추가 수정: 보스 등장/페이즈 전환 시 첫 드로우 워밍(main.js warmView) — 첫 시야 회전 끊김 제거.
  SwiftShader(소프트웨어 GL)에서는 새 위치에서 처음 보이는 오브젝트에 여전히 첫 드로우 비용이 있으나 실제 GPU에선 수 ms 수준으로 예상.
- 스크린샷: docs/v3/shots/
- 남은 컷: 니드호그라 3페이즈 하늘 추격(대체 구현으로 출시), 트렌트 팔 오르기, 칼리스 거울 반사, 보스 전용 인트로/음성, Act4 사이드 의뢰 2개
