# Product Forecast

Next.js + TypeScript 프런트엔드와 FastAPI 백엔드로 구성한 웹앱입니다.
작업 규약과 설계 기준은 [product_forecast.md](project_markdowns/product_forecast.md)를 참고하세요.
다른 PC의 Codex에서 기존 웹앱에 통합할 때는 [mother webapp 통합 지침](project_markdowns/MOTHER_WEBAPP_HANDOFF.md)을 먼저 읽으세요.

## 실행

Node.js 22 이상, Python 3.12.x가 필요합니다. 현재 백엔드는 Python 3.12.16으로 검증했습니다. 두 터미널에서 각각 실행합니다.

```powershell
# ROOT/backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```powershell
# ROOT/frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

환경 파일 복사는 최초 설정 시에만 수행합니다.

Build는 제품별로 관리합니다. 신규 제품의 기본 목록은 `POC, P1, EVT, DVT`이며, 공통·비교 셀렉터에서 Build를 선택하지 않으며 편집 탭의 Build 관리에서 이름을 확인합니다. Build 관리에서 추가·삭제·이름 변경·정렬한 결과는 해당 제품에만 저장합니다. 삭제는 사용 목록에서 제외하는 동작이며 과거 로드맵은 보존합니다. 제품별 목록은 자동 생성되는 DuckDB `product_build_catalog` 테이블에 저장합니다.

Version은 Phase별로 관리하며 셀렉터에는 `0.0`처럼 번호만, 관리 패널에는 `Plan_0.0`처럼 표시합니다. 목록 관리에서 추가한 버전은 즉시 DuckDB에 등록됩니다. 행의 삭제 버튼은 선택된 Phase의 모든 제품·Build에서 해당 버전을 삭제하며, 저장 내용이 있으면 경고 후 확인해야 진행합니다. 다른 Phase의 같은 버전은 유지합니다. Phase별 등록·삭제 상태는 `phase_versions` 테이블에 저장되며 백엔드가 자동 생성하므로 별도 마이그레이션 명령은 필요하지 않습니다.

버전 추가 버튼을 누르면 신규 번호와 내용 선택 패널이 표시됩니다. 빈 버전 또는 같은 Phase의 기존 버전 복사를 선택한 뒤 `버전 생성`을 누르면 저장됩니다. 복사는 원본의 모든 제품·Build에 저장된 로드맵을 대상으로 합니다. 목록의 마지막 업데이트 시각은 한국 시간 `yyyy-mm-dd hh:mm:ss`로 표시하며, 등록·저장 이력이 없는 기본 버전은 `—`로 표시합니다.

Version 목록의 `내용` 컬럼에서 최대 200자의 메모를 작성하고 행별 `저장` 버튼으로 저장합니다. 메모는 Phase·버전별로 유지되며 저장 시 마지막 업데이트 시각도 갱신됩니다. 저장하지 않고 닫으면 경고하며, 메모만 있는 버전도 삭제 확인을 받습니다. 메모 테이블 `phase_version_notes`는 자동 생성됩니다.

편집 탭의 Phase / Version 오른쪽 `다음 Phase로 등록`에서 대상 Phase와 신규 Version을 선택할 수 있습니다. 대상 Phase의 0.0에 항목·마일스톤이 없으면 0.0을 사용합니다. 내용이 있으면 최고 버전의 다음 Minor가 기본값이고 다음 Major가 두 번째 옵션입니다. `복사하여 저장`하면 현재 제품의 모든 Build 편집 내용을 새 Phase에 저장하고 해당 버전으로 전환합니다. 기존 Phase의 저장본은 유지하며 내용이 있는 대상 버전은 덮어쓰지 않습니다.

조회 탭 맨 위에는 현재 제품의 활성 Build를 합친 전체 타임라인이 표시됩니다. 전체와 개별 Build가 같은 날짜 축을 사용하고, 일정이 없는 구간은 비워 둡니다. 제품명과 각 Build 왼쪽의 체크박스로 다운로드 대상을 별도로 선택합니다. 조회의 **표시 크기**에서 마일스톤 원 지름, 날짜 글자, Phase 글자, 항목 글자를 각각 조절할 수 있으며 PNG/PPTX에도 반영됩니다. Download에서 이미지 미리보기를 확인한 뒤 PNG 다운로드 또는 PPTX 다운로드 버튼을 누릅니다. PPTX는 원·선·텍스트를 편집 가능한 PowerPoint 개체로 내보냅니다. 전체 타임라인 그룹 안에 Build별 그룹이 들어 있으며, 그룹 안의 개체를 선택하거나 그룹 해제하여 위치·색상·텍스트를 수정할 수 있습니다. PNG는 미리보기 이미지 그대로 저장합니다. 기존 프런트엔드 환경은 `npm ci`로 새 의존성을 반영합니다.

현재 PC에는 Python 3.12.16과 uv를 ROOT의 `.tools/`에 준비했고, `backend/.venv`도 3.12로 생성하여
의존성 설치도 완료했습니다. 이 PC에서는 초기 설치 없이 위 Uvicorn 실행 명령을 바로
사용할 수 있습니다. 이 가상환경은 uv로 생성되어 pip가 없으므로 의존성 변경 시
ROOT에서 `.\.tools\uv\uv.exe pip install --python backend\.venv\Scripts\python.exe -e './backend[dev]'`를
사용합니다. `.tools/`와 `.venv/`는 Git에 포함하지 않는 로컬 환경입니다. `backend/.python-version`은 3.12, `pyproject.toml`은 `>=3.12,<3.13`으로 지정합니다. 기존 3.13 가상환경은 `.tools/backend-venv313-backup-20261122`에 보관했습니다. 가상환경은 복사해서 재사용하지 말고 해당 Python 버전으로 새로 생성하세요.

- 화면: http://127.0.0.1:3000/product-forecast
- 동일 출처 API: http://127.0.0.1:3000/product-forecast/api/v1/health
- API 문서: http://127.0.0.1:3000/product-forecast/api/v1/docs

## 검증

```powershell
# ROOT/backend
.\.venv\Scripts\python.exe -m pytest

# ROOT/frontend
npm run build
npm run typecheck
# 프런트엔드와 백엔드가 실행 중일 때
npm run test:smoke
```

프런트엔드 프로덕션 실행은 `npm run build` 후 `npm start`를 사용합니다.
실제 배포, 기존 메뉴 수정, 인증과 예측 기능 구현은 후속 작업입니다.

## 제품 계획 관리

탭 옆 **링크 복사**를 누르면 현재 제품·Phase·Version을 지정한 공유 URL을 복사합니다. 예: `/product-forecast?product=4175&phase=Plan&version=0.0`. 링크를 열면 모든 Build의 저장된 로드맵이 조회 탭에 표시됩니다. 미저장 변경은 포함하지 않습니다. 다른 PC에 공유하려면 localhost 대신 상대방이 접속 가능한 서버 주소에서 복사하세요.

화면 상단에서 제품·Phase·Version을 선택하고 조회/편집/비교 탭으로 이동합니다. 네 번째 탭 **모아보기**에서는 공통 Phase·Version의 제품별 합산 일정을 같은 날짜 축에서 비교합니다. 제품 체크박스로 선택한 행을 PNG 한 장이나 편집 가능한 PPTX 한 파일로 함께 내려받습니다.
조회에서는 모든 Build의 타임라인을, 편집에서는 Build별 표를 표시합니다. Build 목록은 편집 탭 제품명 옆 `Build 관리` 버튼으로 관리합니다.
빈 표의 기간은 한국 시간 기준 이번 달부터 다음 분기 말까지입니다. 비교에서는 양쪽 제품의 모든 Build를 중첩 비교하며 한쪽에만 있는 Build도 표시합니다.
표 상단 또는 빈 영역에서 우클릭하면 항목 추가, 월 열 삭제, 지난 달/다음 달 삽입 메뉴가 열립니다.
먼저 해당 표 오른쪽 위의 `Edit`을 누르세요. `Save Changes`는 변경사항이 있을 때 활성화되며,
클릭하면 서버 로컬 DuckDB에 저장합니다. `Cancel`은 미저장 변경을 버리고 최신 저장본을 다시 불러옵니다.
다음 달 열이 이미 있으면 삽입은 비활성화됩니다. 저장한 표는 새로고침하거나 다른 사용자가 접속해도
동일한 제품·Build·Phase·Version을 선택하면 복원됩니다. 저장 실패 시 편집 내용은 유지됩니다.
항목은 선택한 달 1일~말일의 하늘색 박스로 생성됩니다. 박스 양끝을 드래그하면
시작일·종료일이 변경됩니다. 항목 우클릭으로 이름 편집/삭제가 가능하며 이름 편집은
Enter 또는 Tab으로 저장하고 Esc로 취소합니다.
기존 계획 생성·버전 관리 API는 유지되며 API 문서에서 확인할 수 있습니다.

로드맵은 `backend/data/roadmaps.duckdb`에 저장되며 경로 변경은 `PF_ROADMAP_DATABASE_PATH`를 사용합니다.
기존 계획 API 데이터는 `backend/data/forecast.sqlite3`에 유지되며 `PF_DATABASE_PATH`로 경로를 설정합니다. 데이터 이전 시 서버를 중지하고 DB 파일을
복사합니다. 이 파일은 Git에 포함되지 않습니다. 아직 인증과 사용자별 접근 제어는 없습니다.
PowerShell에서 npm.ps1 실행 정책 오류가 발생하면 `npm` 대신 `npm.cmd`를 사용하세요.


## DuckDB 로드맵 저장

현재 PC에는 DuckDB 2.0.1을 설치했습니다. 다른 기존 개발 환경에서는 의존성을 갱신하세요.

```powershell
# ROOT
.\.tools\uv\uv.exe pip install --python backend\.venv\Scripts\python.exe -e './backend[dev]'
# 또는 ROOT/backend에서 표준 pip 가상환경 사용 시
# .\.venv\Scripts\python.exe -m pip install -e ".[dev]"
```

백엔드 재시작 후 기존 주소로 접속하면 됩니다. Uvicorn은 기본 단일 worker로 실행하세요.
DB 파일을 다른 프로세스에서 동시에 쓰지 않으며, 백업/이동 시 백엔드를 중지한 뒤 파일을 복사합니다.
다른 사용자는 같은 FastAPI 서버에 연결해야 동일한 로드맵을 볼 수 있습니다.

선택 목록은 기본값과 저장된 로드맵의 이름으로 복원됩니다. 옵션 목록만 추가/정렬/삭제한 변경은
영구 저장하지 않으며, 해당 이름으로 로드맵을 저장한 경우 다음 접속에도 나타납니다.
동시에 같은 로드맵을 수정하면 먼저 저장한 변경을 보호하기 위해 나중 요청을 거절합니다.
편집 내용을 확인하고 Cancel로 최신본을 다시 불러온 뒤 수정하세요.

## Chat 입력 테스트

로드맵의 **편집 → 편집 채팅**에서 현재 제품·Phase·Version을 보면서 입력창을 열 수 있습니다. 패널은 처음에 닫혀 있습니다. 독립 Chat 메뉴와 `/product-forecast/chat` 주소는 기본적으로 꺼져 있습니다. 독립 입력창이 필요하면 프런트엔드 환경에서 `NEXT_PUBLIC_ENABLE_STANDALONE_CHAT=true`를 설정하고 개발 서버를 다시 시작하거나 프로덕션 빌드를 다시 만드세요. ProseMirror 입력창에 가상 예시를 넣거나 직접 입력할 수 있습니다. Enter는 전송, Shift+Enter는 줄바꿈입니다. 전송은 화면에 입력을 표시하는 테스트 동작이며 API 호출이나 서버 저장은 하지 않습니다.

**+** 버튼이나 Ctrl+V로 이미지를 첨부할 수 있습니다. 전송 전에 미리보기에서 제거할 수 있고, 메시지당 최대 4장(각 8 MB 이하)입니다. 이미지 역시 현재 화면에만 표시합니다.
