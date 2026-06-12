# Obsidian 3D Semantic Graph

Obsidian 데스크톱 전용 플러그인으로, 노트를 인터랙티브 3D 공간에 시각화합니다. OpenAI 또는 로컬 Ollama 임베딩을 UMAP 또는 PCA로 3차원에 투영하여 의미적으로 가까운 노트가 서로 가깝게 배치됩니다. 임베딩이 없으면 폴더 기반 클러스터 구형 레이아웃과 ConvexHull 클러스터 영역이 표시됩니다.

[English](../README.md)

## 주요 기능

- **의미 기반 3D 배치** — OpenAI 또는 Ollama 임베딩을 UMAP 또는 PCA로 3D 좌표에 투영
- **로컬 임베딩 (Ollama)** — API 키 없이 로컬 Ollama 서버만으로 완전 오프라인 동작
- **인사이트 패널** — 링크 제안(의미적으로 가깝지만 연결되지 않은 노트 쌍을 점선으로 표시, 원클릭 링크 삽입), 중복 의심 노트, 고아 노트, 클러스터별 MOC(Map of Content) 생성
- **시맨틱 이웃 사이드바** — 활성 노트의 의미적 이웃을 미니 3D 뷰와 유사도 순위 리스트로 표시
- **타임라인 재생** — 노트 생성일 기준으로 vault의 성장 과정을 애니메이션으로 재생 (frontmatter `created` / `date created`가 있으면 우선, 없으면 파일 ctime)
- **인터랙티브 HTML 내보내기** — 현재 그래프를 단독 HTML 파일로 다운로드, 노드 클릭 시 Obsidian으로 딥링크
- **클러스터 구형 폴백** — 임베딩 없이도 폴더 기반 클러스터 레이아웃과 색상 그룹 표시
- **ConvexHull 클러스터 영역** — 폴더 클러스터를 감싸는 반투명 3D 볼록 껍질 (On / Hover / Off 전환)
- **노트 링크** — Obsidian의 실제 resolved links 기반 연결선, 툴바에서 토글 가능
- **노드 색상** — 폴더 또는 첫 번째 태그 기준 색상 지정
- **업로드 벡터** — API 임베딩 대신 커스텀 벡터 JSON 파일 가져오기/내보내기
- **외관 설정** — 라이트/다크 테마, 그리드, 자동 회전, 노드 크기, 투명도, 드래그 감도
- **결정적 시드** — 동일한 시드로 동일한 그래프 레이아웃 재현
- **임베딩 캐시** — 변경되지 않은 노트의 벡터를 재사용하여 API 호출 최소화
- **제외 폴더** — 지정한 폴더를 그래프 및 임베딩 생성에서 모두 제외

## 동작 방식

1. 설정에서 제외한 폴더를 빼고 vault의 마크다운 파일을 읽습니다.
2. 각 노트를 노드로 만들고, Obsidian의 resolved links로 연결선을 생성합니다.
3. 임베딩 프로바이더(OpenAI API 키 또는 로컬 Ollama)나 업로드된 벡터가 있으면 임베딩을 UMAP 또는 PCA로 3D 좌표에 투영합니다.
4. 둘 다 없으면 폴더 기반 클러스터 구형 레이아웃과 ConvexHull 영역을 사용합니다.

### Ollama 사용 (API 키 불필요)

1. [Ollama](https://ollama.com)를 설치하고 임베딩 모델을 받습니다: `ollama pull nomic-embed-text`
2. **설정 → 3D Semantic Graph**에서 **Embedding provider**를 **Ollama (local)**로 변경합니다.
3. 그래프를 열면 임베딩이 로컬에서 생성되고 캐시됩니다.

## 설치

### 소스에서 빌드

```bash
git clone <repository-url>
cd 3d-semantic-graph
npm install
npm run build
```

빌드 후 `main.js`, `manifest.json`, `styles.css`를 아래 경로에 복사합니다.

```
<your-vault>/.obsidian/plugins/semantic-graph/
```

그다음 Obsidian을 다시 시작하고 **설정 → 커뮤니티 플러그인**에서 **3D Semantic Graph**를 활성화하면 됩니다.

## 개발

```bash
npm run dev    # watch 모드
npm run build  # 프로덕션 빌드
```

## 사용 방법

1. **설정 → 3D Semantic Graph**에서 임베딩 프로바이더(OpenAI 또는 Ollama)를 설정하거나 벡터를 업로드합니다(선택).
2. 리본 아이콘이나 **Open 3D Semantic Graph** 명령으로 그래프를 엽니다.
3. **툴바 컨트롤:**
   - **Refresh** — 그래프 전체 재빌드
   - **Reset Camera** — 초기 카메라 앵글로 복귀
   - **Links** — 연결선 표시/숨김 전환
   - **Grid** — XZ 그리드 표시/숨김 전환
   - **Clusters** — 클러스터 영역 모드 순환 (On → Hover → Off)
   - **Insights** — 인사이트 패널 열기 (링크 제안, 중복, 고아 노트, MOC)
   - **Timeline** — 노트 생성일 기준 vault 성장 재생
   - **Export HTML** — 단독 인터랙티브 HTML 스냅샷 다운로드
4. 노드를 클릭하면 선택됩니다. Shift+클릭으로 해당 노트를 엽니다.
5. **Open semantic neighbors** 명령으로 사이드바를 열면 활성 노트의 의미적 이웃을 볼 수 있습니다.

## 설정 항목

| 설정 | 설명 | 기본값 |
| --- | --- | --- |
| Embedding Provider | OpenAI(API 키) 또는 Ollama(로컬) | `openai` |
| API Key | OpenAI API 키 | 비어 있음 |
| Ollama Endpoint | 로컬 Ollama 서버 주소 | `http://localhost:11434` |
| Embedding Model | 선택한 프로바이더의 임베딩 모델 | `text-embedding-3-large` |
| Suggested Links | 인사이트 패널의 링크 제안 최대 개수 | `20` |
| Neighbor Count | 시맨틱 이웃 사이드바 노트 수 | `10` |
| Custom Vector JSON | API 임베딩 대신 사용할 벡터 JSON 업로드/내보내기 | 비어 있음 |
| Projection Method | UMAP 또는 PCA 차원 축소 방식 | `umap` |
| Layout Seed | 결정적 레이아웃을 위한 시드 | 랜덤 |
| Node Color By | 폴더 또는 첫 번째 태그 기준 색상 지정 | `folder` |
| Show Links | 노트 간 연결선 표시 | Off |
| Show Grid | XZ 평면 그리드 표시 | On |
| Show Clusters | ConvexHull 클러스터 영역 표시 모드 | `hover` |
| Scene Theme | 자동(앱 테마 따라가기), 다크, 라이트 배경 | `auto` |
| Node Opacity | 노드 투명도 (0.15–1.0) | `1.0` |
| Node Size | 노드 크기 배율 (0.4–2.0) | `1.5` |
| Drag Sensitivity | 카메라 회전 감도 (0.2–3.0) | `1.0` |
| Auto Orbit Speed | 유휴 상태 자동 회전 속도 (`0`이면 비활성화) | `0.2` |
| Exclude Folders | 제외할 폴더 목록(쉼표 구분) | 비어 있음 |
| Number of Neighbors | UMAP 로컬/전역 균형 (5–50) | `40` |
| Minimum Distance | UMAP 군집 거리 (0–0.99) | `0.80` |

## 임베딩 캐시

- 캐시 파일: `embeddings-cache.json` (플러그인 디렉터리에 저장)
- 임베딩 모델이 바뀌거나 노트 내용이 바뀌면 자동 무효화

## 기술 스택

- [3d-force-graph](https://github.com/vasturiano/3d-force-graph) — 3D 그래프 렌더링
- [Three.js](https://threejs.org/) — WebGL 씬, ConvexGeometry로 클러스터 껍질 생성
- [umap-js](https://github.com/PAIR-code/umap-js) — UMAP 차원 축소
- [esbuild](https://esbuild.github.io/) — 번들러
- Obsidian `requestUrl` API — 임베딩 HTTP 요청

## 라이선스

MIT
