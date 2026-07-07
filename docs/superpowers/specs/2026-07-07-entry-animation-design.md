# 3D 그래프 진입 애니메이션 디자인

날짜: 2026-07-07
상태: 승인됨

## 목적

Obsidian 기본 그래프 뷰를 열 때 노드가 퍼지며 정착하는 것과 같은 진입 인터랙션을 3D semantic graph 최초 진입 시 제공한다. 현재는 `render()`가 노드를 최종 위치에 즉시 표시하고 자동 궤도 회전을 바로 시작하므로 진입 연출이 전혀 없다.

## 배경 제약

- 노드 위치는 UMAP/PCA 또는 폴더 구형 레이아웃으로 미리 계산되어 고정되고, `cooldownTicks(0)`으로 d3 물리 시뮬레이션이 꺼져 있다. 시뮬레이션 정착을 그대로 재생할 수 없으므로 그 느낌을 연출한다.
- 그리드·축 헬퍼(`installSceneHelpers`)는 그래프 노드와 같은 scene에 직접 추가된다. scene 전체가 아니라 노드·링크가 담긴 force-graph 그룹만 스케일해야 한다.
- 재사용 인프라: `animateCameraViewState`(이징 카메라 보간), `getOrbitCameraViewState` / `getInitialCameraState`(궤도 카메라 상태), `stopAutoRotateOnInteraction`(사용자 조작 시 자동 회전 중단), `autoRotateFrame` rAF 정리 패턴.

## 동작 설계

`GraphSceneRenderer.render()` 마지막에 `playEntryAnimation()`을 호출한다.

1. **노드 확산**: scene에서 `__graphObjType` 오브젝트(노드/링크)를 담은 force-graph 그룹을 찾아 `scale`을 0.04 → 1.0으로 약 1.4초, ease-out cubic으로 확대한다. 원점 기준 스케일이므로 노드가 중심에서 최종 위치로 퍼져나가는 연출이 되고, 링크는 같은 그룹에 속해 자동으로 따라온다.
2. **카메라 플라이인**: 동시에 초기 카메라 거리(`getResetCameraDistance()`)의 약 1.7배 지점(같은 방위각)에서 `getInitialCameraState()`까지 기존 `animateCameraViewState`로 이동한다.
3. **자동 회전 시작 시점 변경**: 현재 `render()`에서 즉시 시작하는 `enableAutoRotate()`를 진입 애니메이션 완료 콜백으로 옮긴다.

## 중단 처리

애니메이션 중 사용자가 포인터/휠 조작을 하면(기존 `stopAutoRotateOnInteraction` 지점에 연결) 그룹 scale을 즉시 1로 스냅하고 카메라 애니메이션을 중단한다. 사용자 제어가 항상 우선한다.

## 실행 조건

- `render()`가 호출될 때마다 재생한다: 최초 진입, 새로고침 버튼. 타임라인 재생·외형 옵션 변경은 `render()`를 다시 타지 않으므로 영향 없다.
- `prefers-reduced-motion: reduce`이면 애니메이션을 건너뛰고 현재처럼 즉시 표시한다.
- 설정에 **진입 애니메이션 토글**(기본 켜짐)을 추가한다: `GraphVisualOptions`(types.ts), settings.ts UI 1항목, i18n.ts 한/영 문자열. 기존 외형 설정 패턴을 따른다.

## 리소스 정리

진입 애니메이션 rAF 핸들을 별도 필드로 보관하고 `dispose()` 및 재`render()` 시 취소한다(기존 `autoRotateFrame` 패턴과 동일).

## 스코프 제외

- HTML 내보내기(html-export.ts) 독립 실행 파일에는 적용하지 않는다.
- 시맨틱 이웃 사이드바 미니 3D 뷰에는 적용하지 않는다.

## 검토한 대안

- **카메라 플라이인만**: 구현이 가장 가볍지만 노드가 정지해 있어 연출이 약함.
- **노드별 위치 보간**(원점→최종 좌표): 엔진이 꺼진 상태에서 링크 지오메트리를 매 프레임 수동 갱신해야 해 복잡도·성능 부담이 큼. 기각.

## 검증

프로젝트에 자동 테스트가 없으므로 `npm run build` 후 Obsidian에서 수동 확인한다:

- 임베딩 레이아웃 / 폴더 구형 레이아웃 각각에서 진입 애니메이션 재생
- 새로고침 버튼 반복 시 매번 재생
- 애니메이션 중 마우스 드래그·휠 조작 시 즉시 정상 상태로 스냅
- OS reduced-motion 설정 시 애니메이션 생략
- 설정 토글 끄면 즉시 표시
- 자동 궤도 회전이 애니메이션 완료 후 시작되는지, 그리드·축이 스케일 애니메이션의 영향을 받지 않는지
