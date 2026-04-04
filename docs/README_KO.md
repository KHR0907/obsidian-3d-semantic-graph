# Obsidian 3D Semantic Graph

Obsidian 데스크톱 전용 플러그인으로, 노트를 인터랙티브 3D 공간에 시각화합니다. OpenAI 임베딩을 UMAP 또는 PCA로 3차원에 투영하여 의미적으로 가까운 노트가 서로 가깝게 배치됩니다. API 키가 없으면 폴더 기반 클러스터 구형 레이아웃과 ConvexHull 클러스터 영역이 표시됩니다.

[English](../README.md) | [日本語](./README_JA.md) | [中文](./README_ZH.md)

## 주요 기능

- **의미 기반 3D 배치** — OpenAI 임베딩을 UMAP 또는 PCA로 3D 좌표에 투영
- **클러스터 구형 폴백** — API 키 없이도 폴더 기반 클러스터 레이아웃과 색상 그룹 표시
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
3. OpenAI API 키 또는 업로드된 벡터가 있으면 임베딩을 UMAP 또는 PCA로 3D 좌표에 투영합니다.
4. 키와 벡터가 모두 없으면 폴더 기반 클러스터 구형 레이아웃과 ConvexHull 영역을 사용합니다.

## 설치

### 소스에서 빌드

```bash
git clone <repository-url>
cd obsidian-3d-semantic-graph
npm install
npm run build
```

빌드 후 `main.js`, `manifest.json`, `styles.css`를 아래 경로에 복사합니다.

```
<your-vault>/.obsidian/plugins/3d-semantic-graph/
```

그다음 Obsidian을 다시 시작하고 **설정 → 커뮤니티 플러그인**에서 **3D Semantic Graph**를 활성화하면 됩니다.

## 개발

```bash
npm run dev    # watch 모드
npm run build  # 프로덕션 빌드
```

## 사용 방법

1. **설정 → 3D Semantic Graph**에서 OpenAI API 키를 입력하거나 벡터를 업로드합니다(선택).
2. 리본 아이콘이나 **Open 3D Semantic Graph** 명령으로 그래프를 엽니다.
3. **툴바 컨트롤:**
   - **Refresh** — 그래프 전체 재빌드
   - **Reset Camera** — 초기 카메라 앵글로 복귀
   - **Links** — 연결선 표시/숨김 전환
   - **Grid** — XZ 그리드 표시/숨김 전환
   - **Clusters** — 클러스터 영역 모드 순환 (On → Hover → Off)
4. 노드를 클릭하면 선택됩니다. Shift+클릭으로 해당 노트를 엽니다.

## 설정 항목

| 설정 | 설명 | 기본값 |
| --- | --- | --- |
| API Key | OpenAI API 키 | 비어 있음 |
| Embedding Model | OpenAI 임베딩 모델 | `text-embedding-3-large` |
| Custom Vector JSON | API 임베딩 대신 사용할 벡터 JSON 업로드/내보내기 | 비어 있음 |
| Projection Method | UMAP 또는 PCA 차원 축소 방식 | `umap` |
| Layout Seed | 결정적 레이아웃을 위한 시드 | 랜덤 |
| Node Color By | 폴더 또는 첫 번째 태그 기준 색상 지정 | `folder` |
| Show Links | 노트 간 연결선 표시 | Off |
| Show Grid | XZ 평면 그리드 표시 | On |
| Show Clusters | ConvexHull 클러스터 영역 표시 모드 | `hover` |
| Scene Theme | 다크 또는 라이트 배경 | `light` |
| Node Opacity | 노드 투명도 (0.15–1.0) | `1.0` |
| Node Size | 노드 크기 배율 (0.4–2.0) | `1.5` |
| Drag Sensitivity | 카메라 회전 감도 (0.2–3.0) | `1.0` |
| Auto Orbit Speed | 유휴 상태 자동 회전 속도 (`0`이면 비활성화) | `0.2` |
| Exclude Folders | 제외할 폴더 목록(쉼표 구분) | 비어 있음 |
| Number of Neighbors | UMAP 로컬/전역 균형 (5–50) | `30` |
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
