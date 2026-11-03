# v3 RPG 확장 진행 상황 (재개용 메모)

## 단계
1. [진행중] 설계 워크플로 `arcane-wilds-v3-design` — run `wf_5f014727-6ee`
   - script: /root/.claude/projects/-home-user-changdongdemo1/73b5b35e-096f-5c23-8d86-2f6619326bcd/workflows/scripts/arcane-wilds-v3-design-wf_5f014727-6ee.js
   - 재개: Workflow({scriptPath, resumeFromRunId: "wf_5f014727-6ee"})
   - 산출물: docs/v3/DESIGN.md, docs/v3/CONTRACT.md (마지막에 JSON 빌드 작업 목록), ARCHITECTURE.md v3 섹션
2. [대기] 구현 워크플로 — CONTRACT.md의 빌드 작업 목록으로 병렬 빌드 → 통합 → 리뷰 → 수정
3. [대기] 직접 검증(플레이테스트·스크린샷) → 커밋 → origin v3-rpg 푸시 → 아티팩트 재배포
   (https://claude.ai/artifact/7LwzvnUbMZoR78eALTV69d, pub html: /tmp/claude-0/-home-user/73b5b35e-096f-5c23-8d86-2f6619326bcd/scratchpad/pub/arcane-wilds.html — 없으면 index.html로 재생성)

저장소: https://github.com/Sunny8197783/ChangdongDemo1 (작업 브랜치 v3-rpg)
