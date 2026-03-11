import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
import { GraphData, GraphLink, GraphNode, GraphVisualOptions } from "./types";

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
	private autoRotateFrame: number | null = null;
	private autoRotateResumeTimeout: number | null = null;
	private resetViewSyncTimeout: number | null = null;
	private autoRotateStart = 0;
	private hasUserInteracted = false;
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
			this.clearResetViewSyncTimeout();
			this.stopAutoRotate();
		};
		this.container.addEventListener("pointerdown", this.stopAutoRotateOnInteraction, { passive: true });
		this.container.addEventListener("wheel", this.stopAutoRotateOnInteraction, { passive: true });
		this.container.addEventListener("touchstart", this.stopAutoRotateOnInteraction, { passive: true });
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
		this.applyCameraViewState(this.getInitialCameraPosition(), true);
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
			this.clearResetViewSyncTimeout();
			this.stopAutoRotate();
			const initialCameraPosition = this.getInitialCameraPosition();
			this.graph.cameraPosition(initialCameraPosition, ORIGIN, RESET_VIEW_DURATION_MS);
			this.resetViewSyncTimeout = window.setTimeout(() => {
				this.resetViewSyncTimeout = null;
				this.applyCameraViewState(initialCameraPosition, true);
			}, RESET_VIEW_DURATION_MS);
			this.scheduleAutoRotateResume();
		}
	}

	setLinksVisible(visible: boolean): void {
		this.linksVisible = visible;
		this.graph?.refresh();
	}

	updateVisualOptions(visualOptions: GraphVisualOptions): void {
		const previous = this.visualOptions;
		this.visualOptions = { ...visualOptions };

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
		this.container.replaceChildren();
	}

	private disposeGraph(): void {
		this.stopAutoRotate();
		this.clearResetViewSyncTimeout();
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
			const orbitRadius = this.getAutoRotateRadius();
			const y = orbitRadius * CAMERA_BASE_HEIGHT_RATIO + Math.sin(angle * 0.4) * CAMERA_WOBBLE_HEIGHT;

			this.graph.cameraPosition(
				{
					x: Math.cos(angle) * orbitRadius,
					y,
					z: Math.sin(angle) * orbitRadius,
				},
				{ x: 0, y: 0, z: 0 }
			);

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

	private getInitialCameraPosition(): { x: number; y: number; z: number } {
		return this.getOrbitCameraPosition(AUTO_ROTATE_INITIAL_ANGLE, this.getResetCameraDistance());
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
		cameraPosition: { x: number; y: number; z: number },
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

		camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
		camera.up.copy(INITIAL_CAMERA_UP);
		camera.lookAt(ORIGIN);
		camera.updateProjectionMatrix?.();

		if (controls?.target) {
			controls.target.copy(ORIGIN);
		}
		controls?.update?.();
		if (persistAsResetState) {
			controls?.saveState?.();
		}
	}

	private getControls(): SceneControls | null {
		return this.graph ? this.graph.controls() as SceneControls : null;
	}

	private clearResetViewSyncTimeout(): void {
		if (this.resetViewSyncTimeout !== null) {
			window.clearTimeout(this.resetViewSyncTimeout);
			this.resetViewSyncTimeout = null;
		}
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
