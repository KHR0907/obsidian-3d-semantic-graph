import { ItemView, Notice, TFile, WorkspaceLeaf, setIcon, setTooltip } from "obsidian";
import { canGenerateEmbeddings, clonePluginSettings, GraphNode, GraphVisualOptions, PluginSettings } from "./types";
import { createSeededRandom } from "./seeded-rng";
import { buildGraphData } from "./graph-data";
import { createClusteredSphereLayout, buildClusterRegions } from "./clustered-sphere-layout";

export const VIEW_TYPE = "semantic-graph-3d";

const MIN_SCENE_EXTENT = 960;
const LAYOUT_RADIUS_RATIO = 0.45;
const MIN_NODE_DISTANCE = 14;
const TOOLTIP_DELAY_MS = 150;
const CLUSTERS_MODE_TOOLTIPS = {
	on: "Clusters on",
	off: "Clusters off",
	hover: "Clusters hover",
} as const;
type ClustersMode = PluginSettings["showClusters"];

export class SemanticGraphView extends ItemView {
	private settings: PluginSettings;
	private pluginDir: string;
	private getLatestSettings: () => PluginSettings;
	private persistSettings: (settings: PluginSettings, sourceView?: SemanticGraphView) => Promise<void>;
	private renderer: import("./graph-renderer").GraphRenderer | null = null;
	private toolbar: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private graphContainer: HTMLElement | null = null;
	private graphStage: HTMLElement | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private linksToggleBtn: HTMLButtonElement | null = null;
	private gridToggleBtn: HTMLButtonElement | null = null;
	private clustersToggleBtn: HTMLButtonElement | null = null;
	private loadRequestId = 0;

	constructor(
		leaf: WorkspaceLeaf,
		settings: PluginSettings,
		pluginDir: string,
		getLatestSettings: () => PluginSettings,
		persistSettings: (settings: PluginSettings, sourceView?: SemanticGraphView) => Promise<void>
	) {
		super(leaf);
		this.settings = clonePluginSettings(settings);
		this.pluginDir = pluginDir;
		this.getLatestSettings = getLatestSettings;
		this.persistSettings = persistSettings;
	}

	getViewType(): string { return VIEW_TYPE; }
	getDisplayText(): string { return "3D semantic graph"; }
	getIcon(): string { return "network"; }

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("semantic-graph-container");

		this.toolbar = container.createDiv({ cls: "semantic-graph-toolbar" });
		const refreshBtn = this.toolbar.createEl("button", {
			cls: "semantic-graph-btn semantic-graph-icon-btn",
			attr: {
				type: "button",
				"aria-label": "Refresh graph",
			},
		});
		setIcon(refreshBtn, "refresh-ccw");
		this.setToolbarTooltip(refreshBtn, "Refresh");
		refreshBtn.addEventListener("click", () => void this.loadGraph());

		const resetViewBtn = this.toolbar.createEl("button", {
			cls: "semantic-graph-btn semantic-graph-icon-btn semantic-graph-icon-pair-btn",
			attr: {
				type: "button",
				"aria-label": "Reset view",
			},
		});
		const resetCameraIcon = resetViewBtn.createSpan({ cls: "semantic-graph-icon-slot" });
		const resetRotateIcon = resetViewBtn.createSpan({ cls: "semantic-graph-icon-slot" });
		setIcon(resetCameraIcon, "camera");
		setIcon(resetRotateIcon, "rotate-ccw");
		this.setToolbarTooltip(resetViewBtn, "Reset camera view");
		resetViewBtn.addEventListener("click", () => this.renderer?.resetView());

		this.linksToggleBtn = this.toolbar.createEl("button", { cls: "semantic-graph-btn" });
		this.linksToggleBtn.addEventListener("click", () => void this.toggleLinks());
		this.gridToggleBtn = this.toolbar.createEl("button", { cls: "semantic-graph-btn" });
		this.gridToggleBtn.addEventListener("click", () => void this.toggleGrid());
		this.clustersToggleBtn = this.toolbar.createEl("button", {
			cls: "semantic-graph-btn semantic-graph-icon-btn semantic-graph-clusters-btn",
			attr: {
				type: "button",
				"aria-label": "Clusters mode",
			},
		});
		this.clustersToggleBtn.addEventListener("click", () => void this.toggleClusters());
		this.updateLinksToggleButton();
		this.updateGridToggleButton();
		this.updateClustersToggleButton();

		this.statusEl = this.toolbar.createSpan({ cls: "semantic-graph-status" });
		this.graphContainer = container.createDiv({ cls: "semantic-graph-canvas" });
		this.graphStage = this.graphContainer.createDiv({ cls: "semantic-graph-stage" });

		this.resizeObserver = new ResizeObserver(() => {
			if (this.renderer && this.graphStage) {
				this.renderer.resize(this.graphStage.clientWidth, this.graphStage.clientHeight);
				this.renderer.updateVisualOptions(this.getVisualOptions());
			}
		});
		this.resizeObserver.observe(this.graphContainer);

		await this.loadGraph();
	}

	onClose(): void {
		this.resizeObserver?.disconnect();
		this.renderer?.dispose();
		this.renderer = null;
	}

	updateSettings(settings: PluginSettings): void {
		const previous = this.settings;
		this.settings = clonePluginSettings(settings);
		this.renderer?.setLinksVisible(this.settings.showLinks);
		this.renderer?.setClustersMode(this.getClustersMode());
		this.renderer?.updateVisualOptions(this.getVisualOptions());
		this.updateLinksToggleButton();
		this.updateGridToggleButton();
		this.updateClustersToggleButton();

		if (
			previous.projectionMethod !== settings.projectionMethod ||
			previous.layoutSeed !== settings.layoutSeed
		) {
			void this.loadGraph();
		}
	}

	private setStatus(text: string): void {
		if (this.statusEl) this.statusEl.setText(text);
	}

	private updateLinksToggleButton(): void {
		if (!this.linksToggleBtn) return;

		this.linksToggleBtn.empty();
		setIcon(this.linksToggleBtn, "map");
		this.setToolbarTooltip(this.linksToggleBtn, this.settings.showLinks ? "Links on" : "Links off");
		this.linksToggleBtn.classList.toggle("is-active", this.settings.showLinks);
	}

	private updateGridToggleButton(): void {
		if (!this.gridToggleBtn) return;

		this.gridToggleBtn.empty();
		setIcon(this.gridToggleBtn, "layout-grid");
		this.setToolbarTooltip(this.gridToggleBtn, this.settings.showGrid ? "Grid on" : "Grid off");
		this.gridToggleBtn.classList.toggle("is-active", this.settings.showGrid);
	}

	private async toggleLinks(): Promise<void> {
		this.settings = {
			...this.settings,
			showLinks: !this.settings.showLinks,
		};

		this.renderer?.setLinksVisible(this.settings.showLinks);
		this.updateLinksToggleButton();
		await this.persistSettings(this.settings, this);
	}

	private async toggleGrid(): Promise<void> {
		this.settings = {
			...this.settings,
			showGrid: !this.settings.showGrid,
		};

		this.renderer?.updateVisualOptions(this.getVisualOptions());
		this.updateGridToggleButton();
		await this.persistSettings(this.settings, this);
	}

	private getClustersMode(settings: PluginSettings = this.settings): ClustersMode {
		const v = settings.showClusters;
		if (v === "on" || v === "hover" || v === "off") return v;
		return "hover";
	}

	private updateClustersToggleButton(): void {
		if (!this.clustersToggleBtn) return;
		const mode = this.getClustersMode();
		this.clustersToggleBtn.empty();
		setIcon(this.clustersToggleBtn, "layers");
		this.setToolbarTooltip(this.clustersToggleBtn, CLUSTERS_MODE_TOOLTIPS[mode]);
		this.clustersToggleBtn.setAttribute("aria-label", CLUSTERS_MODE_TOOLTIPS[mode]);
		this.clustersToggleBtn.classList.toggle("is-active", mode === "on");
		this.clustersToggleBtn.classList.toggle("is-hover", mode === "hover");
		this.clustersToggleBtn.classList.toggle("is-off", mode === "off");
	}

	private setToolbarTooltip(element: HTMLElement, text: string): void {
		setTooltip(element, text, { delay: TOOLTIP_DELAY_MS });
	}

	private async toggleClusters(): Promise<void> {
		const cycle = { on: "hover", hover: "off", off: "on" } as const;
		await this.setClustersMode(cycle[this.getClustersMode()]);
	}

	private async setClustersMode(mode: ClustersMode): Promise<void> {
		this.settings = {
			...this.settings,
			showClusters: mode,
		};

		this.renderer?.setClustersMode(this.settings.showClusters);
		this.updateClustersToggleButton();
		await this.persistSettings(this.settings, this);
	}

	private openNote(path: string): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
	}

	private syncSettingsFromSource(): void {
		this.settings = clonePluginSettings(this.getLatestSettings());
		this.renderer?.setLinksVisible(this.settings.showLinks);
		this.renderer?.setClustersMode(this.getClustersMode(this.settings));
		this.renderer?.updateVisualOptions(this.getVisualOptions(this.settings));
		this.updateLinksToggleButton();
		this.updateGridToggleButton();
		this.updateClustersToggleButton();
	}

	private async reduceEmbeddings(vectors: number[][], settings: PluginSettings): Promise<number[][]> {
		if (settings.projectionMethod === "pca") {
			this.setStatus("Running PCA...");
			const { PcaReducer } = await import("./pca-reducer");
			const reducer = new PcaReducer();
			return reducer.reduce(vectors, (step, total) => {
				this.setStatus(`PCA: ${step}/${total}`);
			});
		}

		this.setStatus("Running UMAP...");
		const { UmapReducer } = await import("./umap-reducer");
		const reducer = new UmapReducer({
			nNeighbors: settings.umapNNeighbors,
			minDist: settings.umapMinDist,
			seed: settings.layoutSeed,
		});
		return reducer.reduce(vectors, (epoch, total) => {
			this.setStatus(`UMAP: ${epoch}/${total}`);
		});
	}

	async loadGraph(): Promise<void> {
		if (!this.graphStage) return;
		this.syncSettingsFromSource();
		const settings = clonePluginSettings(this.settings);
		const requestId = ++this.loadRequestId;
		const isCurrentRequest = () => requestId === this.loadRequestId;

		try {
			this.setStatus("Building graph...");
			const graphData = buildGraphData(this.app, settings);
			const layoutRadius = this.getLayoutRadius();

			if (graphData.nodes.length === 0) {
				if (isCurrentRequest()) {
					this.showError("No markdown files found in vault.");
				}
				return;
			}

			const spherePositions = this.createSphereLayout(graphData.nodes, layoutRadius, settings);
			let finalPositions = spherePositions;
			let clusterResult: import("./clustered-sphere-layout").ClusteredSphereResult | null = null;

			if (canGenerateEmbeddings(settings)) {
				try {
					const embeddings = settings.uploadedVectorsFileName.trim()
						? await this.loadUploadedEmbeddingVectors()
						: await this.loadProviderEmbeddings(settings);
					if (!isCurrentRequest()) return;

					if (embeddings.size >= 3) {
						const paths = Array.from(embeddings.keys());
						const vectors = paths.map((p) => embeddings.get(p)!);
						const coords = await this.reduceEmbeddings(vectors, settings);
						if (!isCurrentRequest()) return;

						const semanticPositions = new Map<string, [number, number, number]>();
						paths.forEach((p, i) => semanticPositions.set(p, coords[i] as [number, number, number]));

						finalPositions = this.createSemanticLayout(
								graphData.nodes,
								spherePositions,
								semanticPositions,
								layoutRadius
							);
					} else {
						this.setStatus("Using clustered sphere layout...");
						clusterResult = createClusteredSphereLayout(
							graphData.nodes, layoutRadius, settings.layoutSeed
						);
						finalPositions = clusterResult.positions;
					}
				} catch (embErr: unknown) {
					if (!isCurrentRequest()) return;
					console.warn("Embedding step failed:", embErr instanceof Error ? embErr.message : String(embErr));
					this.setStatus("Embedding failed, using clustered sphere layout...");
					clusterResult = createClusteredSphereLayout(
						graphData.nodes, layoutRadius, settings.layoutSeed
					);
					finalPositions = clusterResult.positions;
				}
			} else {
				this.setStatus("Using clustered sphere layout...");
				clusterResult = createClusteredSphereLayout(
					graphData.nodes, layoutRadius, settings.layoutSeed
				);
				finalPositions = clusterResult.positions;
			}

			// Apply cluster colors to nodes
			if (clusterResult) {
				for (const node of graphData.nodes) {
					const color = clusterResult.nodeColors.get(node.path);
					if (color) node.color = color;
				}
			}

			this.enforceMinDistance(
				finalPositions,
				MIN_NODE_DISTANCE,
				createSeededRandom(settings.layoutSeed)
			);
			this.applyPositions(graphData.nodes, finalPositions);

			this.setStatus(`${graphData.nodes.length} notes, ${graphData.links.length} links`);
			if (!isCurrentRequest()) return;

			this.renderer?.dispose();
			const { GraphRenderer } = await import("./graph-renderer");
			if (!isCurrentRequest()) return;
			this.renderer = new GraphRenderer(
				this.graphStage,
				() => {},
				(node) => this.openNote(node.path),
				this.getVisualOptions(settings),
				settings.showLinks
			);
			this.renderer.render(graphData);
			this.renderer.setLinksVisible(settings.showLinks);
			const regions = clusterResult
				? clusterResult.regions
				: buildClusterRegions(graphData.nodes);
			this.renderer.setClusterRegions(regions);
			this.renderer.setClustersMode(this.getClustersMode(settings));
		} catch (err: unknown) {
			if (!isCurrentRequest()) return;
			console.error("Semantic Graph error:", err);
			const msg = err instanceof Error ? err.message : String(err);
			this.showError(`Error: ${msg}`);
			new Notice(`3D semantic graph: ${msg}`);
		}
	}

	private async loadProviderEmbeddings(settings: PluginSettings): Promise<Map<string, number[]>> {
		this.setStatus("Generating embeddings...");
		const { EmbeddingService } = await import("./embedding");
		const embeddingService = new EmbeddingService(this.app, settings, this.pluginDir);
		return embeddingService.getEmbeddings((current, total) => {
			this.setStatus(`Embedding... ${current}/${total}`);
		});
	}

	private async loadUploadedEmbeddingVectors(): Promise<Map<string, number[]>> {
		this.setStatus("Loading uploaded vectors...");
		const { readUploadedVectors } = await import("./uploaded-vectors");
		return readUploadedVectors(this.app, this.pluginDir);
	}

	private createSphereLayout(
		nodes: GraphNode[],
		targetRadius: number,
		settings: PluginSettings
	): Map<string, [number, number, number]> {
		const positions = new Map<string, [number, number, number]>();
		const orderedNodes = [...nodes].sort((a, b) => {
			const hashDiff = this.hashPath(a.path) - this.hashPath(b.path);
			return hashDiff !== 0 ? hashDiff : a.path.localeCompare(b.path);
		});
		const total = orderedNodes.length;

		if (total === 0) return positions;
		if (total === 1) {
			positions.set(orderedNodes[0].path, [0, 0, 0]);
			return positions;
		}

		const goldenAngle = Math.PI * (3 - Math.sqrt(5));

		for (let i = 0; i < total; i++) {
			const node = orderedNodes[i];
			const t = (i + 0.5) / total;
			const y = 1 - 2 * t;
			const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
			const theta = goldenAngle * i;
			const radialT = this.hashToUnitInterval(`${node.path}:${settings.layoutSeed}:radius`);
			const radius = targetRadius * Math.cbrt(radialT);

			positions.set(node.path, [
				Math.cos(theta) * ringRadius * radius,
				y * radius,
				Math.sin(theta) * ringRadius * radius,
			]);
		}

		return positions;
	}

	private createSemanticLayout(
		nodes: GraphNode[],
		spherePositions: Map<string, [number, number, number]>,
		semanticPositions: Map<string, [number, number, number]>,
		targetRadius: number
	): Map<string, [number, number, number]> {
		const semanticLayout = new Map<string, [number, number, number]>();
		const centeredPositions = new Map<string, [number, number, number]>();
		const available = nodes
			.map((node) => semanticPositions.get(node.path))
			.filter((pos): pos is [number, number, number] => !!pos);

		if (available.length === 0) return semanticLayout;

		const centroid: [number, number, number] = [0, 0, 0];
		for (const [x, y, z] of available) {
			centroid[0] += x;
			centroid[1] += y;
			centroid[2] += z;
		}
		centroid[0] /= available.length;
		centroid[1] /= available.length;
		centroid[2] /= available.length;

		for (const node of nodes) {
			const semanticPos = semanticPositions.get(node.path);
			if (!semanticPos) continue;

			centeredPositions.set(node.path, [
				semanticPos[0] - centroid[0],
				semanticPos[1] - centroid[1],
				semanticPos[2] - centroid[2],
			]);
		}

		this.scalePositions(centeredPositions, targetRadius * 0.9);

		for (const node of nodes) {
			const centeredPos = centeredPositions.get(node.path);
			semanticLayout.set(node.path, centeredPos ?? spherePositions.get(node.path) ?? [0, 0, 0]);
		}

		return semanticLayout;
	}

	private applyPositions(
		nodes: GraphNode[],
		posMap: Map<string, [number, number, number]>
	): void {
		for (const node of nodes) {
			const pos = posMap.get(node.path);
			if (!pos) continue;

			node.x = pos[0];
			node.y = pos[1];
			node.z = pos[2];
			node.fx = pos[0];
			node.fy = pos[1];
			node.fz = pos[2];
		}
	}

	private vectorLength([x, y, z]: [number, number, number]): number {
		return Math.sqrt(x * x + y * y + z * z);
	}

	private hashPath(path: string): number {
		let hash = 2166136261;

		for (let i = 0; i < path.length; i++) {
			hash ^= path.charCodeAt(i);
			hash = Math.imul(hash, 16777619);
		}

		return hash >>> 0;
	}

	private hashToUnitInterval(value: string): number {
		return (this.hashPath(value) + 0.5) / 4294967296;
	}

	private getVisualOptions(settings: PluginSettings = this.settings): GraphVisualOptions {
		return {
			sceneTheme: settings.sceneTheme,
			nodeOpacity: settings.nodeOpacity,
			nodeSizeScale: settings.nodeSizeScale,
			dragSensitivity: settings.dragSensitivity,
			showGrid: settings.showGrid,
			autoOrbitSpeed: settings.autoOrbitSpeed,
			sceneExtent: this.getSceneExtent(),
		};
	}

	private getSceneExtent(): number {
		if (!this.graphStage) return MIN_SCENE_EXTENT;
		return Math.max(MIN_SCENE_EXTENT, this.graphStage.clientWidth, this.graphStage.clientHeight);
	}

	private getLayoutRadius(): number {
		return this.getSceneExtent() * LAYOUT_RADIUS_RATIO;
	}

	/** Scale coordinates to fit within targetRange */
	private scalePositions(
		posMap: Map<string, [number, number, number]>,
		targetRange: number
	): void {
		let minX = Infinity, maxX = -Infinity;
		let minY = Infinity, maxY = -Infinity;
		let minZ = Infinity, maxZ = -Infinity;

		for (const [x, y, z] of posMap.values()) {
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
			if (z < minZ) minZ = z;
			if (z > maxZ) maxZ = z;
		}

		const maxRange = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
		const scale = (targetRange * 2) / maxRange;
		const cx = (minX + maxX) / 2;
		const cy = (minY + maxY) / 2;
		const cz = (minZ + maxZ) / 2;

		for (const [path, [x, y, z]] of posMap) {
			posMap.set(path, [(x - cx) * scale, (y - cy) * scale, (z - cz) * scale]);
		}
	}

	/** Push apart nodes closer than minDist */
	private enforceMinDistance(
		posMap: Map<string, [number, number, number]>,
		minDist: number,
		random: () => number,
		maxIterations = 30
	): void {
		const entries = Array.from(posMap.entries());
		for (let iter = 0; iter < maxIterations; iter++) {
			let moved = false;
			for (let i = 0; i < entries.length; i++) {
				for (let j = i + 1; j < entries.length; j++) {
					const [, a] = entries[i];
					const [, b] = entries[j];
					const dx = b[0] - a[0];
					const dy = b[1] - a[1];
					const dz = b[2] - a[2];
					const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
					if (dist < minDist && dist > 0) {
						const push = (minDist - dist) / dist / 2;
						a[0] -= dx * push;
						a[1] -= dy * push;
						a[2] -= dz * push;
						b[0] += dx * push;
						b[1] += dy * push;
						b[2] += dz * push;
						moved = true;
					} else if (dist === 0) {
						a[0] += (random() - 0.5) * minDist;
						a[1] += (random() - 0.5) * minDist;
						a[2] += (random() - 0.5) * minDist;
						moved = true;
					}
				}
			}
			if (!moved) break;
		}
	}

	private showError(message: string): void {
		if (!this.graphStage) return;
		this.renderer?.dispose();
		this.renderer = null;
		this.graphStage.empty();
		this.setStatus("");
		this.graphStage.createDiv({ cls: "semantic-graph-error" })
			.createEl("p", { text: message });
	}
}
