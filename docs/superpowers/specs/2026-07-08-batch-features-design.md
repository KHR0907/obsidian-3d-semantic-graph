# 4개 기능 통합 디자인 (2026-07-08)

사용자 승인: 추천 목록 중 1·2·3·4번 "다 해줘". 구현 순서는 의존성 기준 ③→④→②→①.

## ③ 임베딩 해시 캐시 분리 + 지연 로딩

**문제**: 열 때마다 45MB `embeddings-cache.json` 전체 파싱(~1초). 레이아웃 캐시 히트 시에도 벡터는 검증 용도로만 쓰인다.

**설계**:
- `EmbeddingService`가 `embeddings-hashes.json`(= `{ modelId, version, hashes: {path: contentHash} }`)을 벡터 캐시와 함께 저장한다.
- 새 메서드 `checkVaultFingerprint()`: 해시 파일만 읽고 현재 노트들을 해시해 비교. 결과 `{ fingerprint, upToDate }`. 벡터 파일은 읽지 않는다.
- `loadGraph` 빠른 경로: `upToDate` && 레이아웃 캐시 히트 → **벡터 로드 없이 즉시 렌더**. 그 외에는 기존 `getEmbeddings()` 전체 경로(변경분 임베딩 + 두 캐시 파일 저장).
- 마이그레이션: 해시 파일이 없으면 전체 경로로 폴백하고, 임베딩할 것이 없어도 해시 파일을 생성한다.
- 인사이트 패널 지연화: `InsightsPanelData.embeddings`를 `getEmbeddings: () => Promise<Map|null>` 프로바이더로 교체. 패널을 열어 계산할 때만 45MB를 읽는다(뷰에서 결과 메모이즈). 이웃 사이드바는 기존대로.

## ④ 시맨틱 클러스터 자동 라벨링

**설계**:
- 새 모듈 `semantic-clusters.ts`: 정규화 벡터에 시드 기반 k-means(k = clamp(round(√(n/2)), 3, 12), k-means++ 초기화, 최대 15회 반복). 라벨은 클러스터 내 노트 **제목+태그** 토큰의 TF-IDF 상위 3개를 " · "로 연결(유니코드 토크나이저, 한/영 불용어 최소셋).
- 결과(`{label, nodePaths}[]`)는 UMAP과 같은 시점에 계산하고 **layout-cache v2**(`{version:2, key, coords, clusters}`)에 함께 저장. v1 캐시는 버전 불일치로 1회 재계산.
- 시맨틱 레이아웃일 때 ConvexHull 영역을 폴더 대신 클러스터 그룹으로 생성. `ClusterRegion.folder`에 라벨을 넣고, MOC 생성용으로 `mocFolder?: string`(시맨틱 클러스터는 vault 루트 `""`)을 추가. MOC 파일명은 라벨을 파일명 안전 문자로 정제.
- 설정 `clusterSource: "semantic" | "folder"`(기본 semantic, 임베딩 없으면 자동 폴더 폴백) + i18n 한/영.

## ② 추천 링크 하이브리드 신호

**설계**:
- `computePairInsights`에 선택적 `context` 추가: `{ tags: Map<path,string[]>, folders: Map<path,string>, neighbors: Map<path,Set<path>> }`.
- 랭킹 점수 = `cosine + 0.08·tagJaccard + 0.04·sameFolder + 0.08·coLinkJaccard`. **중복 감지는 순수 코사인 유지**. `SuggestedLink.similarity`는 코사인 그대로 표시하고 정렬만 하이브리드 점수 사용(`score` 필드 추가).
- graph-view가 metadataCache에서 노트별 전체 태그를 수집(`graph-data.ts`에 `getNoteTags` export)해 패널로 전달. neighbors는 graphData.links로부터 구성.

## ① 시맨틱 검색 + 카메라 플라이투

**설계**:
- 툴바에 검색 버튼 → 인라인 검색 입력(타임라인 바 패턴). Enter로 실행, Esc/지우기로 해제.
- 실행: 쿼리를 프로바이더로 임베딩(1건) → 지연 임베딩 맵과 코사인 → top 10. 결과 리스트 드롭다운 표시.
- 렌더러 신규 API: `setSearchHighlight(paths|null)`(기존 하이라이트/딤 메커니즘 재사용), `flyToNode(path)`(노드 위치로 `animateCameraViewState` 800ms, 자동 회전 중단). 첫 결과로 자동 플라이투, 리스트 클릭 시 해당 노드로.
- 임베딩 불가 설정이면 Notice(`insights.requiresEmbeddingsShort` 재사용). i18n: placeholder/결과 없음.

## 공통

- 테스트 인프라 없음 → 단계별 `tsc --noEmit` + `npm run build`, 완료 후 vault 배포·실사용 확인.
- 기능별 개별 커밋. HTML 내보내기·모바일은 스코프 제외.
