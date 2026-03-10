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
const SPRITE_SIZE_MULTIPLIER = 4.6;
const SPRITE_BORDER_SCALE = 1.28;
const SPRITE_FILL_SCALE = 0.78;
const SPHERE_SIZE_MULTIPLIER = 0.68;
const MIN_GRID_DIVISIONS = 24;

interface SceneThemePalette {
	background: string;
	baseLinkColor: string;
	dimLinkColor: string;
	highlightLinkColor: string;
	gridColor: string;
	gridCenterColor: string;
	nodeOutlineColor: string;
}

const SCENE_THEMES: Record<GraphVisualOptions["sceneTheme"], SceneThemePalette> = {
	dark: {
		background: "#0f172a",
		baseLinkColor: "#94a3b8",
		dimLinkColor: "#334155",
		highlightLinkColor: "#f8fafc",
		gridColor: "#334155",
		gridCenterColor: "#cbd5e1",
		nodeOutlineColor: "#e2e8f0",
	},
	light: {
		background: "#f8fafc",
		baseLinkColor: "#64748b",
		dimLinkColor: "#cbd5e1",
		highlightLinkColor: "#0f172a",
		gridColor: "#cbd5e1",
		gridCenterColor: "#334155",
		nodeOutlineColor: "#0f172a",
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
	private spriteTexture: THREE.Texture | null = null;
	private autoRotateFrame: number | null = null;
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
			this.graph.cameraPosition(this.getDefaultCameraPosition(this.getResetCameraDistance()), { x: 0, y: 0, z: 0 }, 1000);
			this.syncAutoRotate();
		}
	}

	setLinksVisible(visible: boolean): void {
		this.linksVisible = visible;
		this.graph?.refresh();
	}

	updateVisualOptions(visualOptions: GraphVisualOptions): void {
		const previousMode = this.visualOptions.nodeAssetMode;
		this.visualOptions = { ...visualOptions };

		if (!this.graph) return;

		if (previousMode !== visualOptions.nodeAssetMode && this.currentData) {
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
		this.spriteTexture?.dispose();
		this.spriteTexture = null;
	}

	private disposeGraph(): void {
		this.stopAutoRotate();
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
		const object = this.visualOptions.nodeAssetMode === "2d"
			? this.createSpriteNode(node)
			: this.createSphereNode(node);

		object.userData.path = node.path;
		object.userData.baseColor = node.color;
		this.nodeObjects.set(node.path, object);
		return object;
	}

	private createSphereNode(node: GraphNode): THREE.Mesh {
		const geometry = new THREE.IcosahedronGeometry(Math.max(1.35, node.size * SPHERE_SIZE_MULTIPLIER), 2);
		const material = new THREE.MeshStandardMaterial({
			color: node.color,
			roughness: 0.34,
			metalness: 0.08,
			transparent: true,
			opacity: this.getNodeOpacity(node.path),
		});
		return new THREE.Mesh(geometry, material);
	}

	private createSpriteNode(node: GraphNode): THREE.Group {
		const borderMaterial = new THREE.SpriteMaterial({
			map: this.getSpriteTexture(),
			color: this.getPalette().nodeOutlineColor,
			transparent: true,
			opacity: this.getNodeOpacity(node.path),
			depthWrite: false,
		});
		const fillMaterial = new THREE.SpriteMaterial({
			map: this.getSpriteTexture(),
			color: node.color,
			transparent: true,
			opacity: this.getNodeOpacity(node.path),
			depthWrite: false,
		});
		const size = Math.max(7, node.size * SPRITE_SIZE_MULTIPLIER);

		const group = new THREE.Group();
		const borderSprite = new THREE.Sprite(borderMaterial);
		borderSprite.userData.kind = "border";
		borderSprite.scale.set(size * SPRITE_BORDER_SCALE, size * SPRITE_BORDER_SCALE, 1);

		const fillSprite = new THREE.Sprite(fillMaterial);
		fillSprite.userData.kind = "fill";
		fillSprite.scale.set(size * SPRITE_FILL_SCALE, size * SPRITE_FILL_SCALE, 1);

		group.add(borderSprite);
		group.add(fillSprite);
		return group;
	}

	private getSpriteTexture(): THREE.Texture {
		if (this.spriteTexture) return this.spriteTexture;

		const canvas = document.createElement("canvas");
		canvas.width = 64;
		canvas.height = 64;
		const context = canvas.getContext("2d");
		if (!context) {
			this.spriteTexture = new THREE.Texture();
			return this.spriteTexture;
		}

		const gradient = context.createRadialGradient(32, 32, 6, 32, 32, 28);
		gradient.addColorStop(0, "rgba(255,255,255,1)");
		gradient.addColorStop(0.78, "rgba(255,255,255,0.98)");
		gradient.addColorStop(0.92, "rgba(255,255,255,0.9)");
		gradient.addColorStop(1, "rgba(255,255,255,0)");
		context.fillStyle = gradient;
		context.beginPath();
		context.arc(32, 32, 28, 0, Math.PI * 2);
		context.fill();

		this.spriteTexture = new THREE.CanvasTexture(canvas);
		return this.spriteTexture;
	}

	private syncNodeAppearance(): void {
		for (const [path, object] of this.nodeObjects) {
			const baseColor = object.userData.baseColor as string | undefined;
			if (!baseColor) continue;

			const opacity = this.getNodeOpacity(path);
			const color = this.getNodeColor(path, baseColor);
			const outlineColor = this.getNodeOutlineColor(path);
			object.traverse((child) => {
				const resource = child as THREE.Object3D & {
					material?: THREE.Material | THREE.Material[];
					userData: { kind?: string };
				};
				if (!resource.material) return;
				const materials = Array.isArray(resource.material) ? resource.material : [resource.material];
				for (const material of materials) {
					if ("color" in material) {
						const nextColor = resource.userData.kind === "border" ? outlineColor : color;
						(material as THREE.MeshStandardMaterial | THREE.SpriteMaterial).color.set(nextColor);
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

	private getDefaultCameraPosition(distance: number): { x: number; y: number; z: number } {
		const baseVector: [number, number, number] = [1, CAMERA_BASE_HEIGHT_RATIO, 1];
		const length = Math.sqrt(
			baseVector[0] * baseVector[0] +
			baseVector[1] * baseVector[1] +
			baseVector[2] * baseVector[2]
		) || 1;

		return {
			x: (baseVector[0] / length) * distance,
			y: (baseVector[1] / length) * distance,
			z: (baseVector[2] / length) * distance,
		};
	}

	private stopAutoRotate(): void {
		if (this.autoRotateFrame !== null) {
			window.cancelAnimationFrame(this.autoRotateFrame);
			this.autoRotateFrame = null;
		}
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

	private getNodeOutlineColor(path: string): string {
		const outline = this.getPalette().nodeOutlineColor;
		if (!this.selectedNodePath) return outline;
		return this.highlightedNodes.has(path)
			? outline
			: this.mixColor(outline, this.visualOptions.sceneTheme === "dark" ? "#182338" : "#dbe4ef", 0.7);
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
		if (!this.graph) return;

		const controls = this.graph.controls() as {
			rotateSpeed?: number;
			update?: () => void;
		};

		controls.rotateSpeed = this.visualOptions.dragSensitivity;
		controls.update?.();
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
