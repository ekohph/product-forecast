# GitHub 공개 저장소 게시

현재 이 프로젝트 디렉터리에 독립 Git 저장소와 main 브랜치를 준비했다. 상위 프로젝트 저장소의 origin을 변경하지 않는다. 공개 대상은 source, tests, 문서, 패키지 설정이며 DB·환경파일·캐시·가상환경은 제외한다. 아래 명령은 **이 프로젝트 ROOT**에서 실행한다.

## 로그인 후 신규 저장소 생성 및 push

```powershell
gh auth login --hostname github.com --git-protocol https --web
gh auth status
gh api user --jq .login
git rev-parse --show-toplevel
git status --short
```

로그인 계정과 프로젝트 경로가 의도한 값인지 확인한다. 인증 토큰이나 로그인 코드를 문서·채팅·Git에 붙여 넣지 않는다.

이 PC에서 `detected dubious ownership` 오류가 나면 Codex 작업 계정이 생성한 저장소와 사용자 계정이 달라서다. 현재 위치가 이 프로젝트 ROOT인지 확인한 후 아래처럼 **현재 저장소만** 신뢰 경로로 등록한다. 모든 경로를 허용하는 `*`는 사용하지 않는다. 다른 PC에서 직접 clone한 저장소에는 보통 필요하지 않다.

```powershell
git config --global --add safe.directory ((Get-Location).Path.Replace('\','/'))
```

```powershell
gh repo create product-forecast --public --source . --remote origin --push --description "Product roadmap management with Next.js, FastAPI and DuckDB"
gh repo view --json url,visibility
git ls-remote origin refs/heads/main
```

동일 이름이 이미 있으면 기존 저장소에 덮어쓰지 말고 새 이름을 정한다. 저장소 생성은 성공했으나 push만 실패했다면 재생성하지 않고 `git remote -v`를 확인한 후 `git push -u origin main`을 실행한다. force push는 필요하지 않다.

## 다른 PC에서 받기

```powershell
git clone https://github.com/실제계정/product-forecast.git
cd product-forecast
```

Codex에게 `project_markdowns/MOTHER_WEBAPP_HANDOFF.md`를 읽고 작업하도록 지시한다. GitHub 저장소에는 기존 사용자 로드맵 DB가 없으며 데이터 이전은 별도로 수행한다. 이 명령은 소스 게시이며 운영 앱 배포는 아니다. 라이선스는 사용자 선택 없이 임의로 부여하지 않았다.
