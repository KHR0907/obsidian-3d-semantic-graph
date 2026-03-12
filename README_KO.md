# Obsidian 3D Semantic Graph

Obsidian 데스크톱 전용 플러그인입니다. OpenAI API 키를 설정하면 노트 내용을 임베딩한 뒤 UMAP 또는 PCA로 3차원 좌표로 투영해 의미적으로 가까운 노트가 서로 가깝게 배치됩니다. API 키가 없으면 결정적인 구형 레이아웃으로 동작합니다.

[English](./README.md) | [日本語](./README_JA.md) | [中文](./README_ZH.md)

## 주요 기능

- OpenAI 임베딩 기반 의미적 3D 배치
- UMAP 또는 PCA 기반 3D 투영
- 시드 기반 재현 가능한 레이아웃과 선택적 sphereize 배치
- Obsidian 실제 노트 링크 기반 연결선 표시
- 라이트/다크 씬 테마, 그리드 표시, 자동 회전, 뷰 리셋
- 폴더 또는 첫 번째 태그 기준 노드 색상 지정
- 변경되지 않은 노트는 재사용하는 임베딩 캐시
- 그래프와 임베딩 생성 모두에 적용되는 제외 폴더 설정

## 동작 방식

1. 설정에서 제외한 폴더를 빼고 vault의 마크다운 파일을 읽습니다.
2. 각 노트를 노드로 만들고, Obsidian의 resolved links로 연결선을 생성합니다.
3. OpenAI API 키가 있으면 본문을 정리한 뒤 임베딩하고, 캐시에 저장하며, 선택한 투영 방식으로 3D 좌표를 만듭니다.
4. API 키가 없거나 임베딩 요청이 실패하면 결정적인 구형 레이아웃으로 대체합니다.
5. 구형 레이아웃 모드에서는 경로 해시 기반의 안정적인 순서와 golden-angle 간격을 사용해 노드를 3D 구 내부에 분포시키므로, 새로고침해도 같은 배치를 재현할 수 있지만 의미 기반 배치는 아닙니다.

## 설치

### 소스에서 빌드

```bash
git clone <repository-url>
cd obsidian-3d-semantic-graph
npm install
npm run build
```

빌드 후 `main.js`, `manifest.json`, `styles.css`를 아래 경로에 복사합니다.

```text
<your-vault>/.obsidian/plugins/3d-semantic-graph/
```

그다음 Obsidian을 다시 시작하고 **설정 > 커뮤니티 플러그인**에서 **3D Semantic Graph**를 활성화하면 됩니다.

## 개발

```bash
npm run dev
npm run build
```

저장소에는 특정 로컬 vault 경로로 산출물을 복사하는 `scripts/deploy-to-vault.ps1` 스크립트도 포함되어 있습니다.

## 사용 방법

1. **설정 > 3D Semantic Graph**를 엽니다.
2. 의미 기반 배치를 쓰려면 OpenAI API 키를 입력합니다.
3. 리본 아이콘이나 **Open 3D Semantic Graph** 명령으로 뷰를 엽니다.
4. 툴바에서 새로고침, 카메라 리셋, 링크/그리드 토글을 사용할 수 있습니다.
5. 노트를 바로 열려면 노드를 `Shift+클릭`합니다.

## 설정 항목

| 설정 | 설명 | 기본값 |
| --- | --- | --- |
| API Key | OpenAI API 키. 비워 두면 의미 임베딩 대신 결정적인 구형 레이아웃 fallback을 사용합니다. | 비어 있음 |
| Embedding Model | 의미 레이아웃에 사용할 OpenAI 임베딩 모델 | `text-embedding-3-large` |
| Projection Method | 3D 좌표 생성에 사용할 차원 축소 방식 | `umap` |
| Layout Seed | UMAP 및 노드 겹침 해소에 사용하는 시드 | 랜덤 |
| Sphereize Data | 의미 좌표를 구 표면 방향으로 일부 섞습니다. | `false` |
| Node Color By | 폴더 또는 첫 번째 태그 기준으로 색상 지정 | `folder` |
| Show Links | 노트 간 연결선을 표시합니다. | `false` |
| Show Grid | XZ 평면 그리드를 표시합니다. | `true` |
| Scene Theme | 씬 배경 테마 | `light` |
| Node Opacity | 노드 투명도 | `1.0` |
| Node Size | 노드 크기 배율 | `1.5` |
| Drag Sensitivity | 카메라 회전 감도 | `1.0` |
| Auto Orbit Speed | 유휴 상태 자동 회전 속도. `0`이면 비활성화 | `0.2` |
| Exclude Folders | 제외할 폴더 목록(쉼표 구분) | 비어 있음 |
| Number of Neighbors | UMAP의 로컬/전역 균형 값 | `30` |
| Minimum Distance | UMAP 군집 거리 | `0.80` |

## 임베딩 캐시

- 캐시 파일: `embeddings-cache.json`
- 플러그인 디렉터리에 저장
- 임베딩 모델이 바뀌거나 노트 내용이 바뀌면 자동 무효화

## 기술 스택

- `3d-force-graph`
- `three`
- `umap-js`
- `esbuild`
- 임베딩 요청에는 Obsidian `requestUrl` API 사용

## 라이선스

MIT
