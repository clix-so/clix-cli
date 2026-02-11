# feat/refactor-firebase-apis 브랜치 작업 현황 리뷰

## Context

이 브랜치는 Firebase API 클라이언트를 googleapis 라이브러리로 마이그레이션하고, Service Account 관리 방식을 변경하며, Sender Config API 연동과 FirebaseWizard 상태 머신 리팩터링을 포함하는 대규모 작업입니다.

---

## 완료된 작업 (커밋 완료)

| # | 커밋 | 내용 |
|---|------|------|
| 1 | `acc35b0` | feat(config): 자동 프로젝트 타입 감지 |
| 2 | `5e5ad31` | feat: 프로젝트 로컬 `.clix/` 스토리지 마이그레이션 |
| 3 | `354615f` | feat(firebase): SA 관리 및 프로젝트 생성 |
| 4 | `1c18441` | refactor(firebase): REST API → googleapis 라이브러리 전환 |
| 5 | `4e604c5` | refactor(config): V1/V2 버전 관리 제거로 프로젝트 설정 단순화 |

---

## 완료된 작업 (아직 커밋 안 됨 — working tree)

### 1. Firebase API googleapis 마이그레이션 (추가 정리)
- **파일**: `firebase-api.ts`, `types.ts`, `index.ts`, `downloader.ts`
- IAM API 클라이언트 완전 삭제 (`iam-api.ts` 파일 삭제)
- `@googleapis/iam` 의존성 제거
- Service Account 생성/키 발급 메서드 제거 (사용자가 Firebase Console에서 직접 다운로드)
- API 호출마다 `debug.log`에 에러 로깅 추가

### 2. OAuth 스코프 단순화 + 디버깅 인프라
- **파일**: `oauth/config.ts`, `oauth/auth-client.ts`, `logger.ts`, `oauth.ts`
- OAuth 스코프: firebase + iam + cloud-platform → **firebase만**
- `.clix/debug.log` 파일 기반 OAuth 디버그 로깅 추가
- `invalid_grant` 에러 시 토큰 자동 클리어 + 재인증 시그널
- OAuth 콜백 HTML 스타일 업데이트

### 3. Internal API — Sender Config 연동
- **파일**: `api/types.ts`, `api/internal-client.ts`, `api/index.ts`
- `AppPushSenderConfig`, `SenderConfig` 타입 추가
- `getProject()`, `createOrUpdateSenderConfig()` API 메서드 추가
- 429/5xx/timeout에 대한 지수 백오프 재시도 로직

### 4. Firebase 감지 로직 수정
- **파일**: `preparation.ts`, `preparation.test.ts`
- `checkFirebaseStatus()`가 캐시된 `.clix/config.jsonc`만 보지 않고 항상 실제 파일 탐지 수행
- 파일에 프로젝트 ID가 없을 때 캐시된 projectId로 폴백

### 5. FirebaseWizard 상태 머신 리팩터링
- **파일**: `firebase-wizard-transitions.ts` (신규), `FirebaseWizard.tsx`, `__tests__/firebase-wizard-transitions.test.ts` (신규)
- `PHASE_TRANSITIONS` 중앙 집중 맵 + `transition()` 검증 함수 추출
- 모든 `setPhase()` 호출을 `transition(from, event)`로 교체
- `handleSaveServiceAccountJson` 분리: 핸들러는 1번만 전이, API 호출은 useEffect로 분리
- 34개 플로우 경로 테스트 (100% 커버리지)

### 6. FirebaseWizard 새 기능
- **파일**: `FirebaseWizard.tsx`
- Sender config 확인 3개 phase 추가 (`checking_sender_config`, `sender_config_registered`, `registering_sender_config`)
- `PasteServiceAccountPhase` 개선: 클립보드/JSON 직접입력/파일 드래그 자동 감지
- Service Account 메뉴 단순화: "Create new" 제거, Console 다운로드 + Paste만 제공

### 7. Chat UI 통합
- **파일**: `ChatApp.tsx`, `useOverlays.ts`, `useCommandHandler.ts`, `useMessageSending.ts`
- `install-preparation` 오버레이 타입 추가
- `/install` 커맨드 실행 시 preparation UI 먼저 표시
- `clixProjectId`를 `FirebaseWizard`에 전달

### 8. InstallPreparationUI 개선
- **파일**: `InstallPreparationUI.tsx`
- 초기 진입 phase 판별 로직 추가
- Ready phase에서 auto-continue 대신 명시적 액션 메뉴 제공

### 9. ProjectSelector 검색 기능
- **파일**: `ProjectSelector.tsx`
- 프로젝트 검색/필터 기능 추가
- 알파벳 정렬 (`Intl.Collator`)

### 10. Organization/Projects 서비스 추출
- **파일**: `organization-projects.ts` (신규), `organization-projects.test.ts` (신규)
- 동시 프로젝트 조회 (concurrency: 4)
- 지수 백오프 재시도
- LoginUI, SetupUI에서 중복 로직 제거

### 11. 인증 관련
- **파일**: `credentials.ts`, `LoginUI.tsx`, `SetupUI.tsx`
- `clearFirebaseTokens()` 견고성 개선
- 조직/프로젝트 조회를 새 서비스로 이전

### 12. 문서화
- **파일**: `AGENTS.md`
- FirebaseWizard 상태 머신 섹션 추가 (수정 규칙 4가지, 플로우 개요, 테스트 정보)

---

## 검증 상태

| 검증 항목 | 상태 |
|-----------|------|
| `bun run check` (lint + typecheck) | ✅ 통과 |
| `bun test` (623 unit tests) | ✅ 통과 |
| `bun run build` | ✅ 성공 |
| `bun test tests/e2e/` (20 E2E tests) | ✅ 통과 |
| firebase-wizard-transitions 커버리지 | ✅ 100% |

---

## 변경 파일 요약 (32개 파일, ~2,200줄)

| 카테고리 | 파일 수 | 주요 변경량 |
|----------|---------|-----------|
| Firebase API 마이그레이션 | 5 | IAM 삭제, googleapis 적용 |
| OAuth/디버깅 | 4 | 스코프 단순화, debug.log |
| Internal API (sender config) | 3 | 재시도 로직, 새 API 메서드 |
| FirebaseWizard 리팩터링 | 3 | 전이 맵, 34 테스트 |
| Install preparation | 3 | 파일 탐지 개선 |
| Chat UI 통합 | 6 | preparation 오버레이 |
| ProjectSelector | 1 | 검색/필터 |
| Organization 서비스 | 2 | 동시 조회 추출 |
| 인증/기타 | 3 | credentials 개선 |
| 문서/의존성 | 3 | AGENTS.md, package.json |

---

## 남은 작업

### 필수
1. **E2E 수동 테스트** — 실제 Firebase 프로젝트로 전체 플로우 테스트 (OAuth → 다운로드 → Sender Config → SA 등록)
2. **PR 생성** — main 브랜치로 PR 생성 및 리뷰 요청

### 식별된 리스크
- Sender Config 권한 불일치 → 명시적 에러 매핑으로 완화
- FirebaseWizard phase 회귀 → transition-map 강제 + path 테스트로 완화
- 동시 fetch 부분 실패 → UI 폴백으로 완화
- OAuth 환경 드리프트 → debug 로그로 완화
