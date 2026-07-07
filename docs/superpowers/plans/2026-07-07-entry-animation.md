# 3D 그래프 진입 애니메이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 그래프 뷰 진입 시 노드가 중심에서 퍼져나가고 카메라가 플라이인하는 진입 애니메이션을 추가한다 (스펙: `docs/superpowers/specs/2026-07-07-entry-animation-design.md`).

**Architecture:** `GraphSceneRenderer.render()` 마지막의 즉시 카메라 배치 + 자동 회전 시작을 `playEntryAnimation()`으로 대체한다. force-graph 그룹 scale 0.04→1.0 (1.4초, ease-out cubic)과 기존 `animateCameraViewState`를 이용한 카메라 플라이인(1.7배 거리→초기 위치)을 동시에 재생하고, 완료 콜백에서 자동 회전을 시작한다. 설정 토글 `entryAnimation`(기본 켜짐)과 `prefers-reduced-motion`을 존중한다.

**Tech Stack:** TypeScript, three.js, 3d-force-graph, Obsidian plugin API, esbuild. 자동 테스트 없음 — `npm run build`와 수동 확인으로 검증.

---

### Task 1: 설정 플럼빙 (`entryAnimation` 토글)

**Files:**
- Modify: `src/types.ts` (PluginSettings ~L31, createDefaultSettings ~L62, GraphVisualOptions ~L136)
- Modify: `src/i18n.ts` (~L241, autoOrbit.desc 뒤)
- Modify: `src/settings.ts` (~L276, autoOrbit 슬라이더 뒤)
- Modify: `src/graph-view.ts` (getVisualOptions ~L779)

- [ ] **Step 1: `src/types.ts` — PluginSettings에 필드 추가**

`autoOrbitSpeed: number;` (L31) 바로 아래에:

```ts
	entryAnimation: boolean;
```

- [ ] **Step 2: `src/types.ts` — 기본값 추가**

`createDefaultSettings()`의 `autoOrbitSpeed: 0.2,` (L62) 바로 아래에:

```ts
		entryAnimation: true,
```

- [ ] **Step 3: `src/types.ts` — GraphVisualOptions에 필드 추가**

`autoOrbitSpeed: number;` (GraphVisualOptions 내부, L136) 바로 아래에:

```ts
	entryAnimation: boolean;
```

- [ ] **Step 4: `src/i18n.ts` — 문자열 추가**

`"settings.autoOrbit.desc"` 항목 (L238-241) 바로 아래에:

```ts
	"settings.entryAnimation.name": { en: "Entry animation", ko: "진입 애니메이션" },
	"settings.entryAnimation.desc": {
		en: "Play an expand-and-fly-in animation when the graph opens. Default: on.",
		ko: "그래프를 열 때 노드 확산과 카메라 진입 애니메이션을 재생합니다. 기본값: 켬.",
	},
```

- [ ] **Step 5: `src/settings.ts` — 토글 UI 추가**

autoOrbit 슬라이더 항목 (L272-276) 바로 아래에:

```ts
					{
						name: t("settings.entryAnimation.name"),
						desc: t("settings.entryAnimation.desc"),
						control: { type: "toggle", key: "entryAnimation" },
					},
```

- [ ] **Step 6: `src/graph-view.ts` — getVisualOptions에 전달**

`autoOrbitSpeed: settings.autoOrbitSpeed,` (L779) 바로 아래에:

```ts
			entryAnimation: settings.entryAnimation,
```

- [ ] **Step 7: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 종료 (main.js 생성)

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/i18n.ts src/settings.ts src/graph-view.ts
git commit -m "feat: add entry animation setting toggle"
```

### Task 2: 렌더러 진입 애니메이션

**Files:**
- Modify: `src/graph-scene-renderer.ts` (상수 ~L22, 필드 ~L119, 인터랙션 핸들러 ~L138, render ~L199, disposeGraph ~L352, private 메서드 추가)

- [ ] **Step 1: 상수 추가**

`const RESET_VIEW_DURATION_MS = 1000;` (L22) 바로 아래에:

```ts
const ENTRY_ANIMATION_DURATION_MS = 1400;
const ENTRY_START_SCALE = 0.04;
const ENTRY_CAMERA_DISTANCE_RATIO = 1.7;
```

- [ ] **Step 2: 필드 추가**

`private resetViewAnimationFrame: number | null = null;` (L119) 바로 아래에:

```ts
	private entryScaleFrame: number | null = null;
	private entryScaleGroup: THREE.Object3D | null = null;
```

- [ ] **Step 3: 사용자 조작 시 애니메이션 스냅**

constructor의 `stopAutoRotateOnInteraction` 핸들러 (L138-142)를 다음으로 교체:

```ts
		this.stopAutoRotateOnInteraction = () => {
			this.hasUserInteracted = true;
			this.stopEntryScaleAnimation();
			this.stopResetViewAnimation();
			this.stopAutoRotate();
		};
```

(카메라 플라이인은 `resetViewAnimationFrame`을 공유하므로 기존 `stopResetViewAnimation()`이 함께 중단하고, `stopEntryScaleAnimation()`이 scale을 1로 스냅한다.)

- [ ] **Step 4: render()에서 진입 애니메이션 호출**

`render()` 내부 (L199-201):

```ts
		this.initialCameraState = this.getInitialCameraState();
		this.applyCameraViewState(this.initialCameraState, true);
		this.enableAutoRotate();
```

를 다음으로 교체:

```ts
		this.playEntryAnimation();
```

- [ ] **Step 5: 진입 애니메이션 메서드 추가**

`stopResetViewAnimation()` 메서드 (L700-710) 바로 아래에 추가:

```ts
	private playEntryAnimation(): void {
		if (!this.graph) return;

		const initialCameraState = this.getInitialCameraState();
		this.initialCameraState = this.cloneCameraViewState(initialCameraState);
		const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
		if (!this.visualOptions.entryAnimation || reduceMotion) {
			this.applyCameraViewState(initialCameraState, true);
			this.enableAutoRotate();
			return;
		}

		const farCameraState = this.getOrbitCameraViewState(
			AUTO_ROTATE_INITIAL_ANGLE,
			this.getResetCameraDistance() * ENTRY_CAMERA_DISTANCE_RATIO
		);
		this.applyCameraViewState(farCameraState, true);
		this.animateCameraViewState(farCameraState, initialCameraState, ENTRY_ANIMATION_DURATION_MS, true, () => {
			this.enableAutoRotate();
		});
		this.startEntryScaleAnimation();
	}

	// Node/link objects live in the force-graph group; helpers (grid, axes) are
	// siblings on the scene, so only this group is scaled during entry.
	private findForceGraphGroup(): THREE.Object3D | null {
		if (!this.graph) return null;
		const scene = this.getGraphScene();
		let group: THREE.Object3D | null = null;
		scene.traverse((object) => {
			if (group) return;
			if ((object as THREE.Object3D & { __graphObjType?: string }).__graphObjType) {
				let current: THREE.Object3D = object;
				while (current.parent && current.parent !== scene) {
					current = current.parent;
				}
				group = current;
			}
		});
		return group;
	}

	private startEntryScaleAnimation(): void {
		this.stopEntryScaleAnimation();

		const startTime = performance.now();
		this.entryScaleGroup = this.findForceGraphGroup();
		this.applyEntryScale(ENTRY_START_SCALE);

		const tick = (now: number) => {
			if (!this.graph) return;

			// The force-graph group may attach a frame late; keep resolving until found.
			if (!this.entryScaleGroup) {
				this.entryScaleGroup = this.findForceGraphGroup();
			}
			const progress = Math.min(1, (now - startTime) / ENTRY_ANIMATION_DURATION_MS);
			const eased = 1 - Math.pow(1 - progress, 3);
			this.applyEntryScale(ENTRY_START_SCALE + (1 - ENTRY_START_SCALE) * eased);

			if (progress < 1) {
				this.entryScaleFrame = window.requestAnimationFrame(tick);
				return;
			}

			this.entryScaleFrame = null;
			this.applyEntryScale(1);
			this.entryScaleGroup = null;
		};

		this.entryScaleFrame = window.requestAnimationFrame(tick);
	}

	// Cluster hulls and suggestion lines sit on the scene with world-space
	// geometry around the origin, so scaling them matches the group scale.
	private applyEntryScale(scale: number): void {
		this.entryScaleGroup?.scale.setScalar(scale);
		for (const object of this.clusterObjects) {
			object.scale.setScalar(scale);
		}
		for (const line of this.suggestionObjects) {
			line.scale.setScalar(scale);
		}
	}

	private stopEntryScaleAnimation(): void {
		if (this.entryScaleFrame !== null) {
			window.cancelAnimationFrame(this.entryScaleFrame);
			this.entryScaleFrame = null;
		}
		// Restore unconditionally: cluster/suggestion objects may have been
		// scaled even while the force-graph group was still unresolved.
		this.applyEntryScale(1);
		this.entryScaleGroup = null;
	}
```

- [ ] **Step 6: disposeGraph에서 정리**

`disposeGraph()` (L352-353)의 `this.stopAutoRotate();` 바로 아래에:

```ts
		this.stopEntryScaleAnimation();
```

- [ ] **Step 7: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 종료

- [ ] **Step 8: Commit**

```bash
git add src/graph-scene-renderer.ts
git commit -m "feat: play expand-and-fly-in entry animation on graph render"
```

### Task 3: 수동 검증 (Obsidian)

**Files:** 없음 (빌드 산출물 배포 후 확인)

- [ ] **Step 1: 프로덕션 빌드**

Run: `npm run build`
Expected: `main.js` 생성

- [ ] **Step 2: 로컬 vault 플러그인 폴더에 배포**

vault의 `.obsidian/plugins/<plugin-id>/`에 `main.js`, `manifest.json`, `styles.css`(있다면) 복사.

- [ ] **Step 3: Obsidian에서 확인 체크리스트**

- 그래프 뷰 진입/새로고침 시 노드 확산 + 카메라 플라이인 재생, 완료 후 자동 회전 시작
- 애니메이션 중 드래그·휠 조작 시 즉시 정상 상태 스냅
- 설정 토글 끄면 즉시 표시
- OS reduced-motion 설정 시 생략
- 그리드·축이 애니메이션 영향을 받지 않음
