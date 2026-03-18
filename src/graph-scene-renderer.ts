import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { GraphData, GraphLink, GraphNode, GraphVisualOptions } from "./types";
import { ClusterRegion } from "./clustered-sphere-layout";

const BASE_LINK_OPACITY = 0.2;
const DIMMED_LINK_OPACITY = 0.03;
const HIGHLIGHT_LINK_OPACITY = 0.9;
const DIMMED_NODE_OPACITY_FACTOR = 0.16;
const AUTO_ROTATE_BASE_SPEED = 0.00028;
const AUTO_ROTATE_INITIAL_ANGLE = Math.PI / 4;
const CAMERA_BASE_HEIGHT_RATIO = 0.42;
const CAMERA_WOBBLE_HEIGHT = 110;
const SPHERE_SIZE_MULTIPLIER = 0.68;
const MIN_GRID_DIVISIONS = 24;
const RESET_VIEW_DURATION_MS = 1000;
const ORIGIN = new THREE.Vector3(0, 0, 0);
const INITIAL_CAMERA_UP = new THREE.Vector3(0, 1, 0);

interface SceneControls {
	enabled?: boolean;
	target?: THREE.Vector3;
	rotateSpeed?: number;
	update?: () => void;
	saveState?: () => void;
}

interface CameraViewState {
	position: THREE.Vector3;
	target: THREE.Vector3;
	up: THREE.Vector3;
}

interface OrbitViewState {
	azimuth: number;
	radius: number;
	height: number;
}

interface SceneThemePalette {
	background: string;
	baseLinkColor: string;
	dimLinkColor: string;
	highlightLinkColor: string;
	gridColor: string;
	gridCenterColor: string;
}

const SCENE_THEMES: Record<GraphVisualOptions["sceneTheme"], SceneThemePalette> = {
	dark: {
		background: "#0f172a",
		baseLinkColor: "#94a3b8",
		dimLinkColor: "#334155",
		highlightLinkColor: "#f8fafc",
		gridColor: "#334155",
		gridCenterColor: "#cbd5e1",
	},
	light: {
		background: "#f8fafc",
		baseLinkColor: "#64748b",
		dimLinkColor: "#cbd5e1",
		highlightLinkColor: "#0f172a",
		gridColor: "#cbd5e1",
		gridCenterColor: "#334155",
	},
};

export class GraphSceneRenderer {
	private graph: ReturnType<typeof ForceGraph3D> | null = null;
	private container: HTMLElement;
	private onNodeSelect: (node: GraphNode | null) => void;
	private onNodeOpen: (node: GraphNode) => void;
	private linksVisible = true;
	private nodeObjects = new Map<string, THREE.Object3D>();
	private currentData: GraphData | null = null;
	private adjacency = new Map<string, Set<string>>();
	private selectedNodePath: string | null = null;
	private highlightedNodes = new Set<string>();
	private visualOptions: GraphVisualOptions;
	private helperObjects: THREE.Object3D[] = [];
	private clusterObjects: THREE.Object3D[] = [];
	private nodePathToClusterIdx = new Map<string, number>();
	private clustersMode: "on" | "hover" | "off" = "hover";
	private hoverRaycaster = new THREE.Raycaster();
	private hoverMouse = new THREE.Vector2();
	private readonly handleClusterHover: EventListener;
	private autoRotateFrame: number | null = null;
	private autoRotateResumeTimeout: number | null = null;
	private resetViewAnimationFrame: number | null = null;
	private autoRotateStart = 0;
	private hasUserInteracted = false;
	private initialCameraState: CameraViewState | null = null;
	private isCameraMoving = false;
	private readonly stopAutoRotateOnInteraction: EventListener;

	constructor(
		container: HTMLElement,
		onNodeSelect: (node: GraphNode | null) => void,
		onNodeOpen: (node: GraphNode) => void,
		visualOptions: GraphVisualOptions
	) {
		this.container = container;
		this.onNodeSelect = onNodeSelect;
		this.onNodeOpen = onNodeOpen;
		this.visualOptions = { ...visualOptions };
		this.stopAutoRotateOnInteraction = () => {
			this.hasUserInteracted = true;
			this.stopResetViewAnimation();
			this.stopAutoRotate();
		};
		this.handleClusterHover = (event: Event) => this.raycastClusters(event as MouseEvent);
		this.container.addEventListener("pointerdown", (e) => {
			this.stopAutoRotateOnInteraction(e);
			this.isCameraMoving = true;
			this.hideAllClusters();
		}, { passive: true });
		this.container.addEventListener("pointerup", () => { this.isCameraMoving = false; }, { passive: true });
		this.container.addEventListener("pointerleave", () => { this.isCameraMoving = false; }, { passive: true });
		this.container.addEventListener("wheel", (e) => {
			this.stopAutoRotateOnInteraction(e);
			this.hideAllClusters();
		}, { passive: true });
		this.container.addEventListener("touchstart", this.stopAutoRotateOnInteraction, { passive: true });
		this.container.addEventListener("pointermove", this.handleClusterHover, { passive: true });
	}

	render(data: GraphData): void {
		this.disposeGraph();
		this.currentData = data;
		this.adjacency = this.buildAdjacency(data);

		this.graph = ForceGraph3D()(this.container)
			.width(this.container.clientWidth)
			.height(this.container.clientHeight)
			.backgroundColor(this.getPalette().background)
			.graphData(data)
			.nodeLabel((node: object) => (node as GraphNode).name)
			.nodeThreeObject((node: object) => this.buildNodeObject(node as GraphNode))
			.nodeThreeObjectExtend(false)
			.linkWidth(0.5)
			.linkVisibility(() => this.linksVisible)
			.linkOpacity((link: object) => this.getLinkOpacity(link as GraphLink))
			.linkColor((link: object) => this.getLinkColor(link as GraphLink))
			.enableNodeDrag(false)
			.cooldownTicks(0)
			.onNodeClick((node: object, event?: MouseEvent) => {
				this.handleNodeClick(node as GraphNode, event);
			})
			.onBackgroundClick(() => {
				this.clearSelection();
			});

		this.applyControlSensitivity();
		this.initialCameraState = this.getInitialCameraState();
		this.applyCameraViewState(this.initialCameraState, true);
		this.enableAutoRotate();
		this.installSceneHelpers();
		this.syncNodeAppearance();
	}

	resize(width: number, height: number): void {
		if (this.graph) this.graph.width(width).height(height);
	}

	resetView(): void {
		if (this.graph) {
			this.hasUserInteracted = false;
			this.stopResetViewAnimation();
			this.stopAutoRotate();
			const initialCameraState = this.getInitialCameraState();
			this.initialCameraState = this.cloneCameraViewState(initialCameraState);
			const currentCameraState = this.getCurrentCameraState();
			if (!currentCameraState) {
				this.applyCameraViewState(initialCameraState, true);
				this.scheduleAutoRotateResume();
				return;
			}

			this.animateCameraViewState(
				currentCameraState,
				initialCameraState,
				RESET_VIEW_DURATION_MS,
				true,
				() => {
					this.scheduleAutoRotateResume();
				}
			);
		}
	}

	setLinksVisible(visible: boolean): void {
		this.linksVisible = visible;
		this.graph?.refresh();
	}

	updateVisualOptions(visualOptions: GraphVisualOptions): void {
		const previous = this.visualOptions;
		this.visualOptions = { ...visualOptions };
		this.initialCameraState = this.getInitialCameraState();

		if (!this.graph) return;
		if (previous.nodeSizeScale !== this.visualOptions.nodeSizeScale && this.currentData) {
			this.render(this.currentData);
			this.setLinksVisible(this.linksVisible);
			return;
		}

		this.applyControlSensitivity();
		this.syncAutoRotate();
		this.graph.backgroundColor(this.getPalette().background);
		this.installSceneHelpers();
		this.syncNodeAppearance();
		this.graph.refresh();
	}

	dispose(): void {
		this.disposeGraph();
		this.container.removeEventListener("pointerdown", this.stopAutoRotateOnInteraction);
		this.container.removeEventListener("wheel", this.stopAutoRotateOnInteraction);
		this.container.removeEventListener("touchstart", this.stopAutoRotateOnInteraction);
		this.container.removeEventListener("pointermove", this.handleClusterHover);
		this.container.replaceChildren();
	}

	private disposeGraph(): void {
		this.stopAutoRotate();
		this.stopResetViewAnimation();
		this.clearClusterObjects();
		this.clearHelperObjects();
		this.disposeNodeObjects();

		if (this.graph) {
			this.graph._destructor();
			this.graph = null;
		}

		this.currentData = null;
		this.adjacency.clear();
		this.selectedNodePath = null;
		this.highlightedNodes.clear();
	}

	private buildAdjacency(data: GraphData): Map<string, Set<string>> {
		const adjacency = new Map<string, Set<string>>();

		for (const node of data.nodes) {
			adjacency.set(node.path, new Set([node.path]));
		}

		for (const link of data.links) {
			const source = this.getNodePath(link.source);
			const target = this.getNodePath(link.target);
			if (!source || !target) continue;

			adjacency.get(source)?.add(target);
			adjacency.get(target)?.add(source);
		}

		return adjacency;
	}

	private handleNodeClick(node: GraphNode, event?: MouseEvent): void {
		if (event?.shiftKey) {
			this.onNodeOpen(node);
			return;
		}

		this.selectedNodePath = node.path;
		this.highlightedNodes = new Set(this.adjacency.get(node.path) ?? [node.path]);
		this.syncNodeAppearance();
		this.graph?.refresh();
		this.onNodeSelect(node);
	}

	private clearSelection(): void {
		if (!this.selectedNodePath) return;
		this.selectedNodePath = null;
		this.highlightedNodes.clear();
		this.syncNodeAppearance();
		this.graph?.refresh();
		this.onNodeSelect(null);
	}

	private buildNodeObject(node: GraphNode): THREE.Object3D {
		const object = this.createSphereNode(node);
		object.userData.path = node.path;
		object.userData.baseColor = node.color;
		this.nodeObjects.set(node.path, object);
		return object;
	}

	private createSphereNode(node: GraphNode): THREE.Mesh {
		const radius = Math.max(1.5, node.size * SPHERE_SIZE_MULTIPLIER * this.visualOptions.nodeSizeScale);
		const geometry = new THREE.IcosahedronGeometry(radius, 2);
		const material = new THREE.MeshStandardMaterial({
			color: node.color,
			roughness: 0.34,
			metalness: 0.08,
			transparent: true,
			opacity: this.getNodeOpacity(node.path),
		});
		return new THREE.Mesh(geometry, material);
	}

	private syncNodeAppearance(): void {
		for (const [path, object] of this.nodeObjects) {
			const baseColor = object.userData.baseColor as string | undefined;
			if (!baseColor) continue;

			const opacity = this.getNodeOpacity(path);
			const color = this.getNodeColor(path, baseColor);
			object.traverse((child) => {
				const resource = child as THREE.Object3D & {
					material?: THREE.Material | THREE.Material[];
				};
				if (!resource.material) return;
				const materials = Array.isArray(resource.material) ? resource.material : [resource.material];
				for (const material of materials) {
					if ("color" in material) {
						(material as THREE.MeshStandardMaterial).color.set(color);
					}
					material.transparent = opacity < 1;
					material.opacity = opacity;
					material.needsUpdate = true;
				}
			});
		}
	}

	private installSceneHelpers(): void {
		if (!this.graph) return;

		this.clearHelperObjects();
		const scene = (this.graph as any).scene() as THREE.Scene;
		const palette = this.getPalette();
		const axes = new THREE.AxesHelper(this.getAxesLength());
		const axisMaterials = Array.isArray(axes.material) ? axes.material : [axes.material];
		for (const material of axisMaterials) {
			material.transparent = true;
			material.opacity = this.visualOptions.sceneTheme === "dark" ? 0.85 : 0.95;
		}
		scene.add(axes);
		this.helperObjects.push(axes);

		if (!this.visualOptions.showGrid) return;

		const grid = new THREE.GridHelper(this.getGridSize(), this.getGridDivisions(), palette.gridCenterColor, palette.gridColor);
		const gridMaterial = grid.material as THREE.Material & { opacity: number; transparent: boolean; depthWrite?: boolean };
		gridMaterial.transparent = true;
		gridMaterial.opacity = this.visualOptions.sceneTheme === "dark" ? 0.38 : 0.62;
		gridMaterial.depthWrite = false;
		grid.position.set(0, -1, 0);
		scene.add(grid);
		this.helperObjects.push(grid);
	}

	private enableAutoRotate(): void {
		if (!this.graph || this.hasUserInteracted || this.visualOptions.autoOrbitSpeed <= 0) return;

		this.stopAutoRotate();
		this.autoRotateStart = performance.now();

		const tick = (now: number) => {
			if (!this.graph) return;

			const elapsed = now - this.autoRotateStart;
			const angle = AUTO_ROTATE_INITIAL_ANGLE + elapsed * AUTO_ROTATE_BASE_SPEED * this.visualOptions.autoOrbitSpeed;
			const cameraState = this.getOrbitCameraViewState(angle, this.getAutoRotateRadius());
			this.applyCameraViewState(cameraState);

			this.autoRotateFrame = window.requestAnimationFrame(tick);
		};

		this.autoRotateFrame = window.requestAnimationFrame(tick);
	}

	private syncAutoRotate(): void {
		if (!this.graph) return;
		if (this.hasUserInteracted || this.visualOptions.autoOrbitSpeed <= 0) {
			this.stopAutoRotate();
			return;
		}

		this.enableAutoRotate();
	}

	private getSceneExtent(): number {
		return Math.max(960, this.visualOptions.sceneExtent);
	}

	private getAxesLength(): number {
		return this.getSceneExtent() * 0.55;
	}

	private getGridSize(): number {
		return this.getSceneExtent();
	}

	private getGridDivisions(): number {
		return Math.max(MIN_GRID_DIVISIONS, Math.round(this.getSceneExtent() / 40));
	}

	private getResetCameraDistance(): number {
		return this.getSceneExtent() * 1.35;
	}

	private getAutoRotateRadius(): number {
		return this.getSceneExtent() * 1.35;
	}

	private getInitialCameraState(): CameraViewState {
		return this.getOrbitCameraViewState(AUTO_ROTATE_INITIAL_ANGLE, this.getResetCameraDistance());
	}

	private getOrbitCameraViewState(angle: number, orbitRadius: number): CameraViewState {
		const position = this.getOrbitCameraPosition(angle, orbitRadius);
		return {
			position: new THREE.Vector3(position.x, position.y, position.z),
			target: ORIGIN.clone(),
			up: INITIAL_CAMERA_UP.clone(),
		};
	}

	private getOrbitCameraPosition(angle: number, orbitRadius: number): { x: number; y: number; z: number } {
		return {
			x: Math.cos(angle) * orbitRadius,
			y: orbitRadius * CAMERA_BASE_HEIGHT_RATIO + Math.sin(angle * 0.4) * CAMERA_WOBBLE_HEIGHT,
			z: Math.sin(angle) * orbitRadius,
		};
	}

	private stopAutoRotate(): void {
		if (this.autoRotateFrame !== null) {
			window.cancelAnimationFrame(this.autoRotateFrame);
			this.autoRotateFrame = null;
		}
		if (this.autoRotateResumeTimeout !== null) {
			window.clearTimeout(this.autoRotateResumeTimeout);
			this.autoRotateResumeTimeout = null;
		}
	}

	private getCurrentCameraState(): CameraViewState | null {
		if (!this.graph) return null;

		const camera = this.graph.camera() as THREE.Camera & {
			position: THREE.Vector3;
		};
		const controls = this.getControls();
		return {
			position: camera.position.clone(),
			target: controls?.target?.clone() ?? ORIGIN.clone(),
			up: camera.up.clone(),
		};
	}

	private animateCameraViewState(
		from: CameraViewState,
		to: CameraViewState,
		durationMs: number,
		persistFinalState = false,
		onComplete?: () => void
	): void {
		if (!this.graph) return;

		const controls = this.getControls();
		if (controls) {
			controls.enabled = false;
		}

		if (durationMs <= 0) {
			this.applyCameraViewState(to, persistFinalState);
			if (controls) {
				controls.enabled = true;
			}
			onComplete?.();
			return;
		}

		const startTime = performance.now();
		const tick = (now: number) => {
			if (!this.graph) return;

			const progress = Math.min(1, (now - startTime) / durationMs);
			const easedProgress = this.easeInOutCubic(progress);
			const target = from.target.clone().lerp(to.target, easedProgress);
			const orbitFrom = this.toOrbitViewState(from);
			const orbitTo = this.toOrbitViewState(to);
			const azimuth = this.interpolateAngle(orbitFrom.azimuth, orbitTo.azimuth, easedProgress);
			const radius = THREE.MathUtils.lerp(orbitFrom.radius, orbitTo.radius, easedProgress);
			const height = THREE.MathUtils.lerp(orbitFrom.height, orbitTo.height, easedProgress);
			const position = this.fromOrbitViewState(target, { azimuth, radius, height });
			const up = from.up.clone().lerp(to.up, easedProgress).normalize();

			this.applyCameraViewState({ position, target, up });
			if (progress < 1) {
				this.resetViewAnimationFrame = window.requestAnimationFrame(tick);
				return;
			}

			this.applyCameraViewState(to, persistFinalState);
			this.resetViewAnimationFrame = null;
			if (controls) {
				controls.enabled = true;
			}
			onComplete?.();
		};

		this.resetViewAnimationFrame = window.requestAnimationFrame(tick);
	}

	private stopResetViewAnimation(): void {
		if (this.resetViewAnimationFrame !== null) {
			window.cancelAnimationFrame(this.resetViewAnimationFrame);
			this.resetViewAnimationFrame = null;
		}

		const controls = this.getControls();
		if (controls) {
			controls.enabled = true;
		}
	}

	private scheduleAutoRotateResume(): void {
		if (this.hasUserInteracted || this.visualOptions.autoOrbitSpeed <= 0) return;
		this.stopAutoRotate();
		this.autoRotateResumeTimeout = window.setTimeout(() => {
			this.autoRotateResumeTimeout = null;
			if (!this.hasUserInteracted && this.visualOptions.autoOrbitSpeed > 0) {
				this.enableAutoRotate();
			}
		}, RESET_VIEW_DURATION_MS);
	}

	setClusterRegions(regions: ClusterRegion[]): void {
		this.clearClusterObjects();
		this.nodePathToClusterIdx.clear();
		if (!this.graph || regions.length === 0) return;

		const scene = (this.graph as any).scene() as THREE.Scene;
		const PADDING = 12;
		const MIN_HULL_POINTS = 4;

		for (let idx = 0; idx < regions.length; idx++) {
			const region = regions[idx];
			if (region.points.length === 0) continue;

			// Map node paths to this cluster index
			for (const path of region.nodePaths) {
				this.nodePathToClusterIdx.set(path, idx);
			}

			// Compute centroid
			const cx = region.points.reduce((s, p) => s + p[0], 0) / region.points.length;
			const cy = region.points.reduce((s, p) => s + p[1], 0) / region.points.length;
			const cz = region.points.reduce((s, p) => s + p[2], 0) / region.points.length;

			// Inflate points outward from centroid
			const inflated: THREE.Vector3[] = region.points.map((p) => {
				const dx = p[0] - cx, dy = p[1] - cy, dz = p[2] - cz;
				const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
				return new THREE.Vector3(
					p[0] + (dx / len) * PADDING,
					p[1] + (dy / len) * PADDING,
					p[2] + (dz / len) * PADDING,
				);
			});

			// ConvexGeometry needs at least 4 non-coplanar points
			if (inflated.length < MIN_HULL_POINTS) {
				const base = inflated[0] ?? new THREE.Vector3(cx, cy, cz);
				while (inflated.length < MIN_HULL_POINTS) {
					inflated.push(new THREE.Vector3(
						base.x + (Math.random() - 0.5) * PADDING * 2,
						base.y + (Math.random() - 0.5) * PADDING * 2,
						base.z + (Math.random() - 0.5) * PADDING * 2,
					));
				}
			}

			try {
				const geometry = new ConvexGeometry(inflated);
				const material = new THREE.MeshStandardMaterial({
					color: region.color,
					transparent: true,
					opacity: 0,
					roughness: 0.6,
					metalness: 0,
					side: THREE.DoubleSide,
					depthWrite: false,
				});
				const mesh = new THREE.Mesh(geometry, material);
				scene.add(mesh);
				this.clusterObjects.push(mesh);
			} catch {
				// Degenerate hull — push placeholder to keep indices aligned
				const placeholder = new THREE.Object3D();
				placeholder.visible = false;
				this.clusterObjects.push(placeholder);
			}
		}

		this.syncClusterVisibility();
	}

	setClustersMode(mode: "on" | "hover" | "off"): void {
		this.clustersMode = mode;
		this.syncClusterVisibility();
	}

	private syncClusterVisibility(): void {
		for (const obj of this.clusterObjects) {
			if (this.clustersMode === "on") {
				obj.visible = true;
				this.setMeshOpacity(obj, 0.12);
			} else if (this.clustersMode === "off") {
				obj.visible = false;
			} else {
				// hover: visible for raycasting but transparent
				obj.visible = true;
				this.setMeshOpacity(obj, 0);
			}
		}
	}

	private hideAllClusters(): void {
		if (this.clustersMode !== "hover") return;
		for (const obj of this.clusterObjects) {
			this.setMeshOpacity(obj, 0);
		}
	}

	private raycastClusters(event: MouseEvent): void {
		if (this.clustersMode !== "hover" || this.isCameraMoving || !this.graph || this.clusterObjects.length === 0) return;

		const rect = this.container.getBoundingClientRect();
		this.hoverMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		this.hoverMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		const camera = this.graph.camera() as THREE.Camera;
		this.hoverRaycaster.setFromCamera(this.hoverMouse, camera);

		const intersects = this.hoverRaycaster.intersectObjects(this.clusterObjects, false);
		const hitObj = intersects.length > 0 ? intersects[0].object : null;

		for (const obj of this.clusterObjects) {
			this.setMeshOpacity(obj, obj === hitObj ? 0.12 : 0);
		}
	}

	private setMeshOpacity(obj: THREE.Object3D, opacity: number): void {
		obj.traverse((child) => {
			const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
			if (!mat || !("opacity" in mat)) return;
			mat.opacity = opacity;
			mat.transparent = true;
			mat.needsUpdate = true;
		});
	}

	private clearClusterObjects(): void {
		this.nodePathToClusterIdx.clear();
		if (!this.graph) {
			this.clusterObjects = [];
			return;
		}
		const scene = (this.graph as any).scene() as THREE.Scene;
		for (const obj of this.clusterObjects) {
			scene.remove(obj);
			this.disposeObject(obj);
		}
		this.clusterObjects = [];
	}

	private clearHelperObjects(): void {
		if (!this.graph) {
			this.helperObjects = [];
			return;
		}

		const scene = (this.graph as any).scene() as THREE.Scene;
		for (const object of this.helperObjects) {
			scene.remove(object);
			this.disposeObject(object);
		}
		this.helperObjects = [];
	}

	private disposeNodeObjects(): void {
		for (const object of this.nodeObjects.values()) {
			this.disposeObject(object);
		}
		this.nodeObjects.clear();
	}

	private disposeObject(object: THREE.Object3D): void {
		object.traverse((child) => {
			const resource = child as THREE.Object3D & {
				geometry?: { dispose?: () => void };
				material?: THREE.Material | THREE.Material[];
			};
			resource.geometry?.dispose?.();
			if (resource.material) {
				const materials = Array.isArray(resource.material) ? resource.material : [resource.material];
				for (const material of materials) {
					material.dispose();
				}
			}
		});
	}

	private getNodeColor(path: string, baseColor: string): string {
		if (!this.selectedNodePath) return baseColor;
		return this.highlightedNodes.has(path)
			? baseColor
			: this.mixColor(baseColor, this.visualOptions.sceneTheme === "dark" ? "#182338" : "#dbe4ef", 0.76);
	}

	private getNodeOpacity(path: string): number {
		if (!this.selectedNodePath) return this.visualOptions.nodeOpacity;
		return this.highlightedNodes.has(path)
			? this.visualOptions.nodeOpacity
			: Math.max(0.04, this.visualOptions.nodeOpacity * DIMMED_NODE_OPACITY_FACTOR);
	}

	private getLinkColor(link: GraphLink): string {
		const palette = this.getPalette();
		if (!this.selectedNodePath) return palette.baseLinkColor;
		return this.isHighlightedLink(link) ? palette.highlightLinkColor : palette.dimLinkColor;
	}

	private getLinkOpacity(link: GraphLink): number {
		if (!this.linksVisible) return 0;
		if (!this.selectedNodePath) return BASE_LINK_OPACITY;
		return this.isHighlightedLink(link) ? HIGHLIGHT_LINK_OPACITY : DIMMED_LINK_OPACITY;
	}

	private isHighlightedLink(link: GraphLink): boolean {
		if (!this.selectedNodePath) return false;

		const source = this.getNodePath(link.source);
		const target = this.getNodePath(link.target);
		if (!source || !target) return false;

		return source === this.selectedNodePath || target === this.selectedNodePath;
	}

	private applyControlSensitivity(): void {
		const controls = this.getControls();
		if (!controls) return;
		controls.rotateSpeed = this.visualOptions.dragSensitivity;
		controls.update?.();
	}

	private applyCameraViewState(
		cameraState: CameraViewState,
		persistAsResetState = false
	): void {
		if (!this.graph) return;

		const camera = this.graph.camera() as THREE.Camera & {
			position: THREE.Vector3;
			up: THREE.Vector3;
			updateProjectionMatrix?: () => void;
			lookAt: (target: THREE.Vector3) => void;
		};
		const controls = this.getControls();

		camera.position.copy(cameraState.position);
		camera.up.copy(cameraState.up);
		camera.lookAt(cameraState.target);
		camera.updateProjectionMatrix?.();

		if (controls?.target) {
			controls.target.copy(cameraState.target);
		}
		controls?.update?.();
		if (persistAsResetState) {
			controls?.saveState?.();
		}
	}

	private getControls(): SceneControls | null {
		return this.graph ? this.graph.controls() as SceneControls : null;
	}

	private cloneCameraViewState(cameraState: CameraViewState): CameraViewState {
		return {
			position: cameraState.position.clone(),
			target: cameraState.target.clone(),
			up: cameraState.up.clone(),
		};
	}

	private toOrbitViewState(cameraState: CameraViewState): OrbitViewState {
		const offset = cameraState.position.clone().sub(cameraState.target);
		return {
			azimuth: Math.atan2(offset.z, offset.x),
			radius: Math.hypot(offset.x, offset.z),
			height: offset.y,
		};
	}

	private fromOrbitViewState(target: THREE.Vector3, orbitState: OrbitViewState): THREE.Vector3 {
		return new THREE.Vector3(
			target.x + Math.cos(orbitState.azimuth) * orbitState.radius,
			target.y + orbitState.height,
			target.z + Math.sin(orbitState.azimuth) * orbitState.radius
		);
	}

	private interpolateAngle(from: number, to: number, progress: number): number {
		const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
		return from + delta * progress;
	}

	private easeInOutCubic(progress: number): number {
		return progress < 0.5
			? 4 * progress * progress * progress
			: 1 - Math.pow(-2 * progress + 2, 3) / 2;
	}

	private getNodePath(nodeRef: string | GraphNode): string | null {
		if (typeof nodeRef === "string") return nodeRef;
		return nodeRef?.path ?? nodeRef?.id ?? null;
	}

	private getPalette(): SceneThemePalette {
		return SCENE_THEMES[this.visualOptions.sceneTheme];
	}

	private mixColor(colorA: string, colorB: string, amount: number): string {
		const [r1, g1, b1] = this.hexToRgb(colorA);
		const [r2, g2, b2] = this.hexToRgb(colorB);
		const mix = (start: number, end: number) => Math.round(start + (end - start) * amount);
		return `#${[mix(r1, r2), mix(g1, g2), mix(b1, b2)]
			.map((value) => value.toString(16).padStart(2, "0"))
			.join("")}`;
	}

	private hexToRgb(color: string): [number, number, number] {
		const normalized = color.startsWith("#") ? color.slice(1) : color;
		if (normalized.length !== 6) return [255, 255, 255];
		return [
			parseInt(normalized.slice(0, 2), 16),
			parseInt(normalized.slice(2, 4), 16),
			parseInt(normalized.slice(4, 6), 16),
		];
	}
}
