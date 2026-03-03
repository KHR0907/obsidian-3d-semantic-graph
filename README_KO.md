# Obsidian 3D Semantic Graph

Obsidian vault의 노트들을 OpenAI 임베딩으로 의미 분석하여, 유사한 의미를 가진 노트들이 3D 공간에서 가까이 위치하도록 시각화하는 플러그인.

[English](./README.md) | [中文](./README_ZH.md) | [日本語](./README_JA.md)

## 기능

- **의미 기반 3D 시각화**: OpenAI 임베딩(text-embedding-3-small)으로 노트 간 의미적 유사도를 분석하고, UMAP으로 3D 공간에 배치
- **인터랙션**: 노드 클릭→노트 열기, 호버→제목 표시, 드래그→회전, 스크롤→줌
- **임베딩 캐싱**: 변경된 노트만 재임베딩하여 API 비용 절약
- **커스터마이징**: 유사도 임계값, UMAP 파라미터, 노드 색상 기준(폴더/태그), 제외 폴더 설정

## 설치

1. 저장소 클론 및 빌드:
   ```bash
   git clone https://github.com/your-repo/obsidian-3d-semantic-graph.git
   cd obsidian-3d-semantic-graph
   npm install
   npm run build
   ```

2. `main.js`, `manifest.json`, `styles.css`를 vault의 `.obsidian/plugins/obsidian-3d-semantic-graph/`에 복사

3. Obsidian 재시작 → 설정 → 커뮤니티 플러그인 → "3D Semantic Graph" 활성화

## 사용법

1. 설정 → 3D Semantic Graph → OpenAI API 키 입력
2. 리본 아이콘(네트워크 모양) 클릭 또는 커맨드 팔레트에서 **Open 3D Semantic Graph** 실행
3. 노트들이 의미적 클러스터로 3D 공간에 표시됨

## 설정 항목

| 설정 | 설명 | 기본값 |
|------|------|--------|
| API Key | OpenAI API 키 | - |
| Embedding Model | 임베딩 모델 | text-embedding-3-small |
| Similarity Threshold | 링크 생성 최소 유사도 (0.5~0.95) | 0.7 |
| Node Color By | 노드 색상 기준 (폴더/태그) | Folder |
| UMAP nNeighbors | 로컬 구조 보존 정도 (5~50) | 15 |
| UMAP minDist | 클러스터 밀집도 (0.0~0.99) | 0.1 |
| Exclude Folders | 제외할 폴더 (쉼표 구분) | - |

## 기술 스택

- **3d-force-graph** (Three.js 기반) — 3D 그래프 렌더링
- **umap-js** — 고차원 임베딩을 3D로 차원 축소
- **OpenAI API** — `fetch()`로 직접 호출 (SDK 미사용, 번들 경량화)
- **esbuild** — Obsidian 공식 권장 번들러

## 라이선스

MIT
