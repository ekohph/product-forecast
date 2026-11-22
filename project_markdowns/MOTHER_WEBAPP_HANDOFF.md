# Product Forecast: mother webapp 통합 작업 지침

이 파일을 읽는 Codex에게: 현재 저장소의 Product Forecast를 기존 mother webapp에 통합하라. 먼저 양쪽 코드를 조사하고, 기존 기능과 데이터를 유지하는 최소 변경으로 구현·검증까지 완료할 것. 이 문서는 통합 작업 지침이며, mother webapp 통합이 이미 구현되었다는 의미가 아니다.

## 1. 작업 시작과 모델 역할

- 주 담당: 사용자가 지정한 **GPT-6.1 Sol**. 조사 결과 통합, 계획, 코드 검토, 최종 검증을 담당한다.
- 하위 에이전트: 사용자가 지정한 **GPT-6.1 Luna**, effort **high**. 독립적으로 수행 가능한 frontend 통합 조사와 backend/배포 조사에 사용한다. 같은 파일을 동시에 수정하지 않는다.
- 모델의 실제 선택 가능 여부와 식별자는 해당 PC에서 확인한다. 이름을 추측하여 API 식별자를 만들거나 실제로 사용하지 않은 모델을 사용했다고 보고하지 않는다. Luna를 사용할 수 없으면 사용자에게 알리고 주 담당 모델로 독립 작업을 진행한다.
- 이 저장소의 기존 AGENTS.md에 GPT-6 Luna로 적힌 부분은 이 통합 작업에서 사용자가 지정한 GPT-6.1 Luna 요청을 우선한다. mother webapp의 AGENTS.md와 적용 범위도 확인한다.
- 다음 순서로 읽을 것: 이 파일 → 양쪽 AGENTS.md → README.md → project_markdowns/product_forecast.md → 실제 소스와 테스트. 규약 문서의 이전 변경 이력에 과거 UI 설명이 남아 있으므로 현재 코드와 아래 기능 목록을 함께 확인한다.
- 사용자 미커밋 변경을 보존하고 별도 작업 브랜치를 사용한다. 다른 저장소를 통째로 덮어쓰거나 기존 DB를 초기화하지 않는다.
- 사용자는 스크롤을 극도로 싫어한다. 넓은 여백보다 정보 밀도를 우선하며 현재 타임라인의 조밀한 배치를 유지한다.

## 2. 먼저 조사할 사항

mother webapp의 위치가 작업 공간에 없으면 경로 또는 저장소 URL을 요청한다. 존재한다면 직접 조사하고 중복 질문하지 않는다.

1. frontend 프레임워크·버전, 라우팅, 공통 레이아웃/메뉴, CSS 범위, 빌드 방식.
2. backend·인증·권한·세션, reverse proxy, 도메인, HTTPS, 프로세스 관리, 배포 환경.
3. `/product-forecast` 및 API 경로 충돌 여부, persistent storage 위치와 백업 방식.
4. 사용자가 말한 embed가 메뉴 안의 iframe인지, 별도 경로 서비스인지, React 컴포넌트 직접 병합인지 기존 구조에서 판단한다.

조사 후 선택한 방식과 변경 파일을 짧게 설명하고 구현한다. 기존 서비스 배포는 구체적인 변경과 검증 결과를 준비한 후 해당 환경의 배포 권한 범위에 따라 진행한다.

## 3. 권장 통합 방식과 경로 계약

기본안은 **별도 Next.js/FastAPI 프로세스를 유지하고 mother webapp과 같은 도메인의 하위 경로로 서비스**하는 것이다. mother webapp의 프레임워크가 달라도 기존 기능을 유지하기 쉽다.

| 외부 요청 | 전달 대상 |
| --- | --- |
| `/product-forecast/api/v1` 및 하위 경로 | FastAPI, 내부 기본 포트 8000 |
| `/product-forecast`, 그 하위 페이지·정적 자산 | Next.js, 내부 기본 포트 3000 |
| 나머지 경로 | 기존 mother webapp |

- API 규칙을 페이지 규칙보다 우선한다. 전달 시 `/product-forecast` prefix를 제거하지 않는다. 쿼리 문자열을 보존한다.
- `frontend/src/lib/paths.ts`: BASE_PATH와 API_PATH. `frontend/next.config.ts`: Next basePath 및 개발/서비스 rewrite. `backend/app/core/config.py`: API_PREFIX.
- 경로를 바꾸면 세 위치, 프록시, 공유 링크, smoke 테스트, 문서를 함께 바꾸고 frontend를 재빌드한다.
- 브라우저는 동일 출처 API를 호출한다. BACKEND_ORIGIN은 서버 전용 환경변수이며 공개 브라우저 설정에 내부 주소를 노출하지 않는다.
- iframe이 필요한 경우 mother 페이지에 적절한 title을 가진 iframe으로 이 경로를 열고 폭·높이와 중첩 스크롤을 검증한다. `sandbox`를 쓰면 script, same-origin, 다운로드 등 필요한 기능을 실제 환경에서 시험한다. 임의로 CSP를 전체 해제하지 않는다.
- iframe 내부의 링크 복사는 현재 Product Forecast 직접 URL을 만든다. mother shell까지 함께 열어야 한다면 mother 진입 URL과 선택값 전달 규칙을 정하고 공유 URL 생성/복원 테스트를 추가한다.
- 프록시의 CSP/frame-ancestors와 X-Frame-Options가 의도한 mother origin에서 임베딩을 허용하는지 확인한다. 다른 origin이면 쿠키, 인증, clipboard 정책을 따로 검증한다.
- 직접 React 병합이 적합한 경우 `RoadmapWorkspace`가 화면 진입점이다. 전역 globals.css를 그대로 mother 전체에 적용하지 말고 범위를 한정한다. 독립 Next 앱의 basePath와 mother 라우터를 혼용하지 않는다.

## 4. 현재 구성과 읽어야 할 코드

| 역할 | 파일 |
| --- | --- |
| 페이지/탭 | frontend/src/app/page.tsx, features/plans/roadmap-workspace.tsx |
| 제품·Phase·Version 선택 | frontend/src/features/plans/selection-bar.tsx |
| 제품별 Build 관리 | frontend/src/features/plans/build-manager.tsx |
| 편집/Phase 복사 등록 | frontend/src/features/plans/phase-editor.tsx, build-table.tsx, saved-build-table.tsx |
| 기간·날짜·정렬/다중 이동 | frontend/src/features/plans/roadmap-items.ts, roadmap-item-bar.tsx |
| 타임라인/배치 | frontend/src/features/plans/roadmap-timeline.tsx, timeline-labels.ts |
| 비교/다운로드 UI | frontend/src/features/plans/roadmap-comparison.tsx, comparison-results.tsx, roadmap-overlay.tsx |
| PNG/편집 가능한 PPTX | frontend/src/features/plans/timeline-export.ts, timeline-pptx.ts |
| 공유 URL | frontend/src/features/plans/roadmap-link.ts, roadmap-share.tsx |
| 미저장 이동 경고 | frontend/src/features/plans/unsaved-changes.ts |
| API 클라이언트/타입 | frontend/src/lib/api.ts, frontend/src/types/roadmaps.ts |
| API·schema·DB | backend/app/api/v1/roadmaps.py, schemas/roadmaps.py, services/roadmaps.py |

frontend는 Node.js 22 이상, Next.js/React/TypeScript이며 정확한 버전은 package-lock.json이 기준이다. backend는 Python 3.12.x이고 3.13 환경을 복사하지 않는다. PptxGenJS와 JSZip은 frontend 의존성이다. Python 패키지는 pyproject.toml을 기준으로 설치하고 다른 PC의 실제 해결 버전으로 검증한다.

## 5. 반드시 보존할 기능

- 공통/비교 셀렉터는 제품·Phase·Version만 표시한다. Build 셀렉터를 다시 만들지 않는다. 조회/편집은 선택된 제품·Phase·Version의 모든 활성 Build를 표시한다.
- Build는 제품별 관리이며 신규 제품 기본값은 POC, P1, EVT, DVT다. 추가/삭제/이름/순서 변경이 다른 제품에 영향을 주지 않아야 한다. Build 삭제는 사용 목록 제외이며 과거 데이터는 보존한다.
- Version은 Phase별로 관리한다. 셀렉터에는 숫자만 표시한다. Minor 증가 규칙은 0.8→0.9→0.91→…→0.99→0.991이며 Major는 정수부 +1, 소수부 0이다. 임의로 semver 규칙으로 바꾸지 않는다.
- 버전 메모 최대 200자, 한국 시간 업데이트 시각, 기존 버전 복사 기본 선택, 내림차순 원본 목록, 내용이 있는 버전 삭제 확인을 유지한다. 버전 삭제 범위는 해당 Phase의 모든 제품·Build다.
- 조회는 Build별 타임라인, 편집은 Build별 표이며 기본 압축 타임라인/Expand 상세 행을 제공한다. 컨텍스트 메뉴, 항목·마일스톤, 날짜 resize, Shift 다중 선택 이동, 저장 정렬, Save Changes/Cancel/Saved 시각을 보존한다.
- `다음 Phase로 등록`은 기존 Phase를 유지하고 현재 제품의 모든 활성 Build 내용을 복사한다. 대상 0.0이 비어 있으면 재사용, 아니면 다음 Minor/다음 Major 선택을 제공한다. 서버 충돌 검증과 원자적 저장을 유지한다.
- 미저장 편집의 탭/선택 변경·페이지 이탈 경고를 보존한다. mother 메뉴 이동과 iframe 제거가 기존 guard를 우회할 수 있으므로 실제 메뉴 이동도 검증하고 필요 시 명시적 dirty-state 연동을 구현한다. postMessage가 필요하면 origin과 메시지 형식을 검증한다.
- 비교는 양쪽 Build 합집합, 한쪽만 있는 Build, 동일 조합 차단, 회색 기준 중첩/파랑 유지/주황 변경/녹색 추가/점선 삭제와 건수를 제공한다.
- 조회와 비교의 Build 개별·전체 선택, PNG 미리보기, PNG/PPTX 각각 다운로드를 유지한다. PPTX는 bitmap 한 장으로 바꾸지 않고 편집 가능한 도형/텍스트, 전체/Build별 그룹을 유지한다.
- 타임라인 항목 시작·종료 날짜는 MM/DD, 가까운 날짜는 좌우 조정과 점선 연결이다. 시작/종료 세로선과 기간 안쪽에서 바깥 세로선을 향하는 화살촉을 유지한다. 기간 선·화살촉·항목명은 RGB(0,0,0)이다.
- 겹치는 화살표는 공통 축 기준 0,+4,-4,+8,-8px 순으로 배치한다. 이름은 묶음 아래에 14px 줄 간격으로 배치한다. 변경 시 PNG/PPTX도 같은 배치를 유지해야 한다.
- 공유 링크 `/product-forecast?product=4175&phase=Plan&version=0.0`는 조회 탭의 최신 저장본을 연다. 미저장 draft를 공유하지 않는다. 잘못된 링크를 다른 제품으로 조용히 대체하지 않는다. 한글·특수문자와 삭제된 버전을 검사한다.

## 6. 데이터·인증·운영

- 로드맵: 서버 로컬 DuckDB, `PF_ROADMAP_DATABASE_PATH`. 기존 계획 API: SQLite, `PF_DATABASE_PATH`. 공개 Git에는 DB가 포함되지 않으므로 fresh clone은 기존 사용자 데이터를 갖고 있지 않다.
- 데이터 이전이 필요하면 서버를 정상 종료하고 백업 후 별도의 비공개 경로로 전송한다. DB/WAL을 서비스 중 임의로 복사하거나 공개 저장소에 올리지 않는다. 새 서버에서는 절대 경로 persistent storage를 지정한다.
- DuckDB backend는 단일 worker로 운영한다. 여러 worker/서버가 한 파일에 쓰도록 구성하지 않는다. 기존 revision 기반 충돌 처리(409)와 transaction을 유지한다.
- 현재 앱 자체에는 인증·사용자별 접근 제어가 없다. mother의 인증을 UI뿐 아니라 API 모든 경로에도 적용한다. iframe을 감추는 것만으로 접근 제어가 되지 않는다. 공유 링크도 동일한 접근 정책을 거치게 한다.
- 현재 Version은 Phase별 공유이고 product/build 범위와 다르다. mother가 조직/tenant별 격리를 요구하면 현재 DB 스키마가 이를 제공한다고 가정하지 말고 별도 설계를 사용자에게 제시한다.
- GitHub 공개는 소스 공개이며 운영 앱 배포가 아니다. GitHub Pages만으로 이 Next.js/FastAPI/DuckDB 앱이 실행되지 않는다.

## 7. 다른 PC에서 기동 및 검증

저장소 ROOT 기준, Windows PowerShell 예시다. 설치된 가상환경·node_modules·.next를 다른 PC에서 복사하지 않는다. .env.example을 검토해 최초 한 번만 복사하고 기존 설정은 덮어쓰지 않는다.

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

다른 터미널:

```powershell
cd frontend
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run build
npm.cmd run typecheck
node --experimental-strip-types --test tests/roadmap-*.test.mjs tests/timeline-*.test.mjs tests/comparison-selection.test.mjs tests/unsaved-changes.test.mjs
npm.cmd start
```

양쪽 서버 실행 후 frontend에서 `npm.cmd run test:smoke`. mother 경유 검증은 `$env:SMOKE_ORIGIN='https://실제-mother-호스트'`를 설정하고 실행한다. 프록시에서 내부 loopback 서비스에 연결하는 구성이 기본이며 외부 접근이 필요한 bind/방화벽/포트는 mother 배포 구조에 맞게 설정한다.

브라우저에서 실제 mother 경유로 검증할 것:

1. 메뉴 진입, 새로고침, 공유 링크 직접 진입, 뒤로/앞으로, 자산/API 404 여부.
2. 시험용 제품에서 저장 후 재접속 복원, 다른 Phase/Version 격리, 두 탭 동시 저장 충돌.
3. 모든 Build 조회·편집, 날짜/마일스톤/다중 이동, 미저장 경고, Phase 복사와 원본 보존.
4. 비교 결과 및 한쪽만 있는 Build, PNG/PPTX 다운로드, 실제 PowerPoint의 그룹/텍스트/원/선 편집.
5. 좁은 화면, iframe 스크롤, 다운로드/clipboard 권한, 인증 만료/미로그인 API 차단, 서버 오류와 재시도.

기존 로컬 검증 기록은 참고 자료다. 해당 PC에서 실행하지 않은 테스트나 PowerPoint/UI 검증을 통과했다고 보고하지 않는다. 통합 후 변경 파일·실행 명령·실제 결과·미검증 사항·rollback 방법을 README 및 규약 문서에 기록한다.

## 8. 사용자에게 받을 첫 지시 예문

> project_markdowns/MOTHER_WEBAPP_HANDOFF.md를 읽고 이 Product Forecast를 현재 mother webapp에 통합해줘. 주 담당은 GPT-6.1 Sol, 하위 에이전트는 가능한 경우 GPT-6.1 Luna high를 사용해줘. mother webapp 경로는 [경로]야. 기존 데이터와 기능을 보존하고 테스트까지 완료해줘.

## 9. 완료 조건

- mother 메뉴에서 접근 가능하며 기존 서비스 메뉴·스타일·인증에 회귀가 없다.
- 위 기능 목록을 보존하고 공유 URL 및 다운로드가 mother 경유로 동작한다.
- 서버 데이터가 재시작/재배포 후 유지되며 비밀값과 실데이터가 Git에 없다.
- 양쪽 단위 테스트, 프로덕션 빌드, 실제 경로 smoke 및 브라우저 통합 시나리오를 검증했다.
- 설치/운영/백업/복구/변경 경로가 문서화되어 다음 담당자가 재현할 수 있다.
