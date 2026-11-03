# v3 RPG 확장 진행 상황 (재개용 메모)

## 단계
1. [완료] 설계 워크플로 `wf_5f014727-6ee` → docs/v3/DESIGN.md, docs/v3/CONTRACT.md (§24 JSON 빌드 작업), ARCHITECTURE.md v3 섹션 (커밋 3de9528)
2. [진행중] 구현 워크플로 `arcane-wilds-v3-build` — 웨이브 0(core) → 1(skills,combat,player,world,ui) → 2(magic,melee,enemies) → 3(narrative) → 통합 → 리뷰/수정
   - 각 오너는 /home/user/wt/<owner> 워크트리, 브랜치 v3/<owner>; 웨이브마다 v3-rpg로 머지
   - 재개: 아래 run id로 Workflow({scriptPath, resumeFromRunId})
3. [대기] 직접 검증(플레이테스트·스크린샷) → 커밋 → origin v3-rpg 푸시 → 아티팩트 재배포
   (https://claude.ai/artifact/7LwzvnUbMZoR78eALTV69d)

저장소: https://github.com/Sunny8197783/ChangdongDemo1 (작업 브랜치 v3-rpg)
