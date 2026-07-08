import { ItemView, Notice, TFile, WorkspaceLeaf, setIcon, setTooltip } from "obsidian";
import { canGenerateEmbeddings, clonePluginSettings, GraphData, GraphNode, GraphVisualOptions, PluginSettings } from "./types";
import { createSeededRandom } from "./seeded-rng";
import { buildGraphData } from "./graph-data";
import { createClusteredSphereLayout, buildClusterRegions } from "./clustered-sphere-layout";
import { SemanticCluster, buildSemanticClusterRegions, computeSemanticClusters } from "./semantic-clusters";
import { InsightsPanel } from "./insights-panel";
import { SuggestedLink } from "./insights";
import { SuggestionSegment } from "./graph-scene-renderer";
import { t } from "./i18n";

export const VIEW_TYPE = "semantic-graph-3d";

const MIN_SCENE_EXTENT = 960;
const LAYOUT_RADIUS_RATIO = 0.45;
const MIN_NODE_DISTANCE = 14;
const TOOLTIP_DELAY_MS = 150;
const TIMELINE_RESOLUTION = 1000;
const TIMELINE_PLAY_DURATION_MS = 15000;
type ClustersMode = PluginSettings["showClusters"];

function clustersModeTooltip(mode: ClustersMode): string {
	switch (mode) {
		case "on": return t("toolbar.clustersOn");
		case "off": return t("toolbar.clustersOff");
		default: return t("toolbar.clustersHover");
	}
}

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
	private insightsBtn: HTMLButtonElement | null = null;
	private insightsPanel: InsightsPanel | null = null;
	private lastGraphData: GraphData | null = null;
	private timelineBtn: HTMLButtonElement | null = null;
	private timelineBar: HTMLElement | null = null;
	private timelineSlider: HTMLInputElement | null = null;
	private timelineLabel: HTMLElement | null = null;
	private timelinePlayBtn: HTMLButtonElement | null = null;
	private timelinePlaying = false;
	private timelineFrame: number | null = null;
	private loadRequestId = 0;
	private loadedEmbeddings: Map<string, number[]> | null = null;
	private embeddingsFetchPromise: Promise<Map<string, number[]> | null> | null = null;

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
	getDisplayText(): string { return t("view.graph.title"); }
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
				"aria-label": t("toolbar.refreshAria"),
			},
		});
		setIcon(refreshBtn, "refresh-ccw");
		this.setToolbarTooltip(refreshBtn, t("toolbar.refresh"));
		refreshBtn.addEventListener("click", () => void this.loadGraph());

		const resetViewBtn = this.toolbar.createEl("button", {
			cls: "semantic-graph-btn semantic-graph-icon-btn semantic-graph-icon-pair-btn",
			attr: {
				type: "button",
				"aria-label": t("toolbar.resetViewAria"),
			},
		});
		const resetCameraIcon = resetViewBtn.createSpan({ cls: "semantic-graph-icon-slot" });
		const resetRotateIcon = resetViewBtn.createSpan({ cls: "semantic-graph-icon-slot" });
		setIcon(resetCameraIcon, "camera");
		setIcon(resetRotateIcon, "rotate-ccw");
		this.setToolbarTooltip(resetViewBtn, t("toolbar.resetView"));
		resetViewBtn.addEventListener("click", () => this.renderer?.resetView());

		this.linksToggleBtn = this.toolbar.createEl("button", {
			cls: "semantic-graph-btn semantic-graph-icon-btn",
			attr: {
				type: "button",
				"aria-label": t("toolbar.toggleLinks"),
			},
		});
		this.linksToggleBtn.addEventListener("click", () => void this.toggleLinks());
		this.gridToggleBtn = this.toolbar.createEl("button", {
			cls: "semantic-graph-btn semantic-graph-icon-btn",
			attr: {
				type: "button",
				"aria-label": t("toolbar.toggleGrid"),
			},
		});
		this.gridToggleBtn.addEventListener("click", () => void this.toggleGrid());
		this.clustersToggleBtn = this.toolbar.createEl("button", {
			cls: "semantic-graph-btn semantic-graph-icon-btn semantic-graph-clusters-btn",
			attr: {
				type: "button",
				"aria-label": t("toolbar.clustersAria"),
			},
		});
		this.clustersToggleBtn.addEventListener("click", () => void this.toggleClusters());
		this.insightsBtn = this.toolbar.createEl("button", {
			cls: "semantic-graph-btn semantic-graph-icon-btn",
			attr: {
				type: "button",
				"aria-label": t("toolbar.insightsAria"),
			},
		});
		setIcon(this.insightsBtn, "lightbulb");
		this.setToolbarTooltip(this.insightsBtn, t("toolbar.insights"));
		this.insightsBtn.addEventListener("click", () => this.insightsPanel?.toggle());
		this.timelineBtn = this.toolbar.createEl("button", {
			cls: "semantic-graph-btn semantic-graph-icon-btn",
			attr: {
				type: "button",
				"aria-label": t("toolbar.timelineAria"),
			},
		});
		setIcon(this.timelineBtn, "history");
		this.setToolbarTooltip(this.timelineBtn, t("toolbar.timeline"));
		this.timelineBtn.addEventListener("click", () => this.toggleTimeline());
		const exportBtn = this.toolbar.createEl("button", {
			cls: "semantic-graph-btn semantic-graph-icon-btn",
			attr: {
				type: "button",
				"aria-label": t("toolbar.exportAria"),
			},
		});
		setIcon(exportBtn, "download");
		this.setToolbarTooltip(exportBtn, t("toolbar.export"));
		exportBtn.addEventListener("click", () => void this.exportGraphHtml());
		this.updateLinksToggleButton();
		this.updateGridToggleButton();
		this.updateClustersToggleButton();

		this.statusEl = this.toolbar.createSpan({ cls: "semantic-graph-status" });
		this.graphContainer = container.createDiv({ cls: "semantic-graph-canvas" });
		this.graphStage = this.graphContainer.createDiv({ cls: "semantic-graph-stage" });
		this.insightsPanel = new InsightsPanel(this.app, this.graphContainer, {
			onOpenNote: (path) => this.openNote(path),
			onSuggestions: (suggestions) => this.applySuggestionOverlay(suggestions),
			onVisibilityChange: (open) => {
				this.renderer?.setSuggestionsVisible(open);
				this.insightsBtn?.classList.toggle("is-active", open);
			},
		});

		this.timelineBar = container.createDiv({ cls: "semantic-graph-timeline" });
		this.timelineBar.hide();
		this.timelinePlayBtn = this.timelineBar.createEl("button", {
			cls: "semantic-graph-btn semantic-graph-icon-btn",
			attr: {
				type: "button",
				"aria-label": t("timeline.play"),
			},
		});
		setIcon(this.timelinePlayBtn, "play");
		this.timelinePlayBtn.addEventListener("click", () => this.toggleTimelinePlayback());
		this.timelineSlider = this.timelineBar.createEl("input", {
			cls: "semantic-graph-timeline-slider",
			attr: {
				type: "range",
				min: "0",
				max: String(TIMELINE_RESOLUTION),
				value: String(TIMELINE_RESOLUTION),
			},
		});
		this.timelineSlider.addEventListener("input", () => {
			this.stopTimelinePlayback();
			this.applyTimelineFromSlider();
		});
		this.timelineLabel = this.timelineBar.createSpan({ cls: "semantic-graph-timeline-label" });

		this.resizeObserver = new ResizeObserver(() => {
			if (this.renderer && this.graphStage) {
				this.renderer.resize(this.graphStage.clientWidth, this.graphStage.clientHeight);
				this.renderer.updateVisualOptions(this.getVisualOptions());
			}
		});
		this.resizeObserver.observe(this.graphContainer);

		this.registerEvent(
			this.app.workspace.on("css-change", () => {
				if (this.settings.sceneTheme === "auto") {
					this.renderer?.updateVisualOptions(this.getVisualOptions());
				}
			})
		);

		await this.loadGraph();
	}

	onClose(): Promise<void> {
		this.resizeObserver?.disconnect();
		this.stopTimelinePlayback();
		this.insightsPanel?.dispose();
		this.insightsPanel = null;
		this.renderer?.dispose();
		this.renderer = null;
		return Promise.resolve();
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
			previous.layoutSeed !== settings.layoutSeed ||
			previous.timelineDateSource !== settings.timelineDateSource ||
			previous.clusterSource !== settings.clusterSource
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
		setIcon(this.linksToggleBtn, "link");
		const linksLabel = this.settings.showLinks ? t("toolbar.linksOn") : t("toolbar.linksOff");
		this.setToolbarTooltip(this.linksToggleBtn, linksLabel);
		this.linksToggleBtn.setAttribute("aria-label", linksLabel);
		this.linksToggleBtn.setAttribute("aria-pressed", String(this.settings.showLinks));
		this.linksToggleBtn.classList.toggle("is-active", this.settings.showLinks);
	}

	private updateGridToggleButton(): void {
		if (!this.gridToggleBtn) return;

		this.gridToggleBtn.empty();
		setIcon(this.gridToggleBtn, "layout-grid");
		const gridLabel = this.settings.showGrid ? t("toolbar.gridOn") : t("toolbar.gridOff");
		this.setToolbarTooltip(this.gridToggleBtn, gridLabel);
		this.gridToggleBtn.setAttribute("aria-label", gridLabel);
		this.gridToggleBtn.setAttribute("aria-pressed", String(this.settings.showGrid));
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
		this.setToolbarTooltip(this.clustersToggleBtn, clustersModeTooltip(mode));
		this.clustersToggleBtn.setAttribute("aria-label", clustersModeTooltip(mode));
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

	private async exportGraphHtml(): Promise<void> {
		if (!this.lastGraphData || this.lastGraphData.nodes.length === 0) {
			new Notice(t("export.loadFirst"));
			return;
		}

		try {
			const { buildGraphExportHtml } = await import("./html-export");
			const html = buildGraphExportHtml(this.lastGraphData, {
				vaultName: this.app.vault.getName(),
				sceneTheme: this.resolveSceneTheme(),
			});

			const blob = new Blob([html], { type: "text/html" });
			const url = URL.createObjectURL(blob);
			const anchor = activeDocument.createEl("a");
			anchor.href = url;
			anchor.download = "semantic-graph.html";
			anchor.click();
			URL.revokeObjectURL(url);
			new Notice(t("export.done"));
		} catch (error) {
			new Notice(t("export.failed", { message: error instanceof Error ? error.message : String(error) }));
		}
	}

	private toggleTimeline(): void {
		if (!this.timelineBar) return;

		if (this.timelineBar.isShown()) {
			this.stopTimelinePlayback();
			this.timelineBar.hide();
			this.timelineBtn?.classList.remove("is-active");
			this.renderer?.setTimeFilter(null);
		} else {
			this.timelineBar.show();
			this.timelineBtn?.classList.add("is-active");
			this.applyTimelineFromSlider();
		}
	}

	private getTimelineRange(): { min: number; max: number } | null {
		let min = Infinity;
		let max = -Infinity;
		for (const node of this.lastGraphData?.nodes ?? []) {
			if (node.ctime === undefined) continue;
			if (node.ctime < min) min = node.ctime;
			if (node.ctime > max) max = node.ctime;
		}
		if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return null;
		return { min, max };
	}

	private applyTimelineFromSlider(): void {
		if (!this.timelineSlider || !this.renderer) return;

		const range = this.getTimelineRange();
		if (!range) {
			this.renderer.setTimeFilter(null);
			this.timelineLabel?.setText(t("timeline.noDates"));
			return;
		}

		const progress = Number(this.timelineSlider.value) / TIMELINE_RESOLUTION;
		const cutoff = range.min + (range.max - range.min) * progress;
		this.renderer.setTimeFilter(progress >= 1 ? null : cutoff);
		this.timelineLabel?.setText(new Date(cutoff).toLocaleDateString());
	}

	private toggleTimelinePlayback(): void {
		if (this.timelinePlaying) {
			this.stopTimelinePlayback();
			return;
		}
		if (!this.timelineSlider) return;

		this.timelinePlaying = true;
		if (this.timelinePlayBtn) setIcon(this.timelinePlayBtn, "pause");

		let startValue = Number(this.timelineSlider.value);
		if (startValue >= TIMELINE_RESOLUTION) startValue = 0;
		const startTime = performance.now();

		const tick = (now: number) => {
			if (!this.timelinePlaying || !this.timelineSlider) return;

			const progress = ((now - startTime) / TIMELINE_PLAY_DURATION_MS) * TIMELINE_RESOLUTION;
			const value = Math.min(TIMELINE_RESOLUTION, startValue + progress);
			this.timelineSlider.value = String(Math.round(value));
			this.applyTimelineFromSlider();

			if (value >= TIMELINE_RESOLUTION) {
				this.stopTimelinePlayback();
				return;
			}
			this.timelineFrame = window.requestAnimationFrame(tick);
		};
		this.timelineFrame = window.requestAnimationFrame(tick);
	}

	private stopTimelinePlayback(): void {
		this.timelinePlaying = false;
		if (this.timelineFrame !== null) {
			window.cancelAnimationFrame(this.timelineFrame);
			this.timelineFrame = null;
		}
		if (this.timelinePlayBtn) setIcon(this.timelinePlayBtn, "play");
	}

	private applySuggestionOverlay(suggestions: SuggestedLink[]): void {
		if (!this.renderer || !this.lastGraphData) return;

		const positions = new Map<string, [number, number, number]>();
		for (const node of this.lastGraphData.nodes) {
			if (node.x != null && node.y != null && node.z != null) {
				positions.set(node.path, [node.x, node.y, node.z]);
			}
		}

		const segments: SuggestionSegment[] = [];
		for (const suggestion of suggestions) {
			const from = positions.get(suggestion.source);
			const to = positions.get(suggestion.target);
			if (from && to) {
				segments.push({ source: suggestion.source, target: suggestion.target, from, to });
			}
		}
		this.renderer.setSuggestionLinks(segments);
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
			this.setStatus(t("status.pca"));
			const { PcaReducer } = await import("./pca-reducer");
			const reducer = new PcaReducer();
			return reducer.reduce(vectors, (step, total) => {
				this.setStatus(t("status.pcaProgress", { step, total }));
			});
		}

		this.setStatus(t("status.umap"));
		const { UmapReducer } = await import("./umap-reducer");
		const reducer = new UmapReducer({
			nNeighbors: settings.umapNNeighbors,
			minDist: settings.umapMinDist,
			seed: settings.layoutSeed,
		});
		return reducer.reduce(vectors, (epoch, total) => {
			this.setStatus(t("status.umapProgress", { epoch, total }));
		});
	}

	async loadGraph(): Promise<void> {
		if (!this.graphStage) return;
		this.syncSettingsFromSource();
		const settings = clonePluginSettings(this.settings);
		const requestId = ++this.loadRequestId;
		const isCurrentRequest = () => requestId === this.loadRequestId;
		this.loadedEmbeddings = null;
		this.embeddingsFetchPromise = null;

		try {
			this.setStatus(t("status.building"));
			const graphData = buildGraphData(this.app, settings);
			const layoutRadius = this.getLayoutRadius();

			if (graphData.nodes.length === 0) {
				if (isCurrentRequest()) {
					this.showError(t("error.noFiles"));
				}
				return;
			}

			const spherePositions = this.createSphereLayout(graphData.nodes, layoutRadius, settings);
			let finalPositions = spherePositions;
			let clusterResult: import("./clustered-sphere-layout").ClusteredSphereResult | null = null;
			let semanticClusters: SemanticCluster[] | null = null;

			if (canGenerateEmbeddings(settings)) {
				try {
					const { buildLayoutCacheKey, readLayoutCache, writeLayoutCache } = await import("./layout-cache");
					let semanticPositions: Map<string, [number, number, number]> | null = null;

					// Fast path: validate the vault against the lightweight hash file
					// and reuse the cached layout without loading any vectors.
					if (!settings.uploadedVectorsFileName.trim()) {
						this.setStatus(t("status.embeddingCache"));
						const { EmbeddingService } = await import("./embedding");
						const service = new EmbeddingService(this.app, settings, this.pluginDir);
						const quick = await service.checkVaultFingerprint();
						if (!isCurrentRequest()) return;
						if (quick?.upToDate) {
							const cachedLayout = await readLayoutCache(
								this.app,
								this.pluginDir,
								buildLayoutCacheKey(quick.fingerprint, settings)
							);
							if (!isCurrentRequest()) return;
							if (cachedLayout) {
								semanticPositions = cachedLayout.coords;
								semanticClusters = cachedLayout.clusters;
							}
						}
					}

					if (!semanticPositions || semanticPositions.size < 3) {
						semanticPositions = null;
						semanticClusters = null;
						let embeddings: Map<string, number[]>;
						let layoutFingerprint: string | null = null;
						if (settings.uploadedVectorsFileName.trim()) {
							embeddings = await this.loadUploadedEmbeddingVectors();
						} else {
							const loaded = await this.loadProviderEmbeddings(settings);
							embeddings = loaded.embeddings;
							layoutFingerprint = loaded.layoutFingerprint;
						}
						if (!isCurrentRequest()) return;
						this.loadedEmbeddings = embeddings;

						if (embeddings.size >= 3) {
							const paths = Array.from(embeddings.keys());
							const layoutKey = layoutFingerprint
								? buildLayoutCacheKey(layoutFingerprint, settings)
								: null;
							const cachedLayout = layoutKey
								? await readLayoutCache(this.app, this.pluginDir, layoutKey)
								: null;
							if (!isCurrentRequest()) return;

							if (cachedLayout) {
								semanticPositions = cachedLayout.coords;
								semanticClusters = cachedLayout.clusters;
							} else {
								const vectors = paths.map((p) => embeddings.get(p)!);
								const coords = await this.reduceEmbeddings(vectors, settings);
								if (!isCurrentRequest()) return;

								const computedPositions = new Map<string, [number, number, number]>();
								paths.forEach((p, i) => computedPositions.set(p, coords[i] as [number, number, number]));
								semanticPositions = computedPositions;

								const notesMeta = new Map(
									graphData.nodes.map((node) => [
										node.path,
										{ path: node.path, name: node.name, tags: node.tags ?? [] },
									])
								);
								semanticClusters = computeSemanticClusters(embeddings, notesMeta, settings.layoutSeed);
								if (layoutKey) {
									await writeLayoutCache(this.app, this.pluginDir, layoutKey, computedPositions, semanticClusters);
									if (!isCurrentRequest()) return;
								}
							}
						}
					}

					if (semanticPositions && semanticPositions.size >= 3) {
						finalPositions = this.createSemanticLayout(
								graphData.nodes,
								spherePositions,
								semanticPositions,
								layoutRadius
							);
					} else {
						this.setStatus(t("status.clusteredSphere"));
						clusterResult = createClusteredSphereLayout(
							graphData.nodes, layoutRadius, settings.layoutSeed
						);
						finalPositions = clusterResult.positions;
					}
				} catch (embErr: unknown) {
					if (!isCurrentRequest()) return;
					console.warn("Embedding step failed:", embErr instanceof Error ? embErr.message : String(embErr));
					this.setStatus(t("status.embeddingFailed"));
					clusterResult = createClusteredSphereLayout(
						graphData.nodes, layoutRadius, settings.layoutSeed
					);
					finalPositions = clusterResult.positions;
				}
			} else {
				this.setStatus(t("status.clusteredSphere"));
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

			this.setStatus(t("status.summary", { notes: graphData.nodes.length, links: graphData.links.length }));
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
				: settings.clusterSource === "semantic" && semanticClusters && semanticClusters.length > 0
					? buildSemanticClusterRegions(graphData.nodes, semanticClusters)
					: buildClusterRegions(graphData.nodes);
			this.renderer.setClusterRegions(regions);
			this.renderer.setClustersMode(this.getClustersMode(settings));

			this.lastGraphData = graphData;
			this.renderer.setSuggestionsVisible(this.insightsPanel?.isOpen() ?? false);
			this.insightsPanel?.setData({
				graphData,
				getEmbeddings: () => this.getEmbeddingsLazy(settings),
				regions,
				maxSuggestions: settings.suggestedLinkCount,
			});
			if (this.timelineBar?.isShown()) {
				this.applyTimelineFromSlider();
			}
		} catch (err: unknown) {
			if (!isCurrentRequest()) return;
			console.error("Semantic Graph error:", err);
			const msg = err instanceof Error ? err.message : String(err);
			this.showError(t("error.generic", { message: msg }));
			new Notice(t("notice.graphError", { message: msg }));
		}
	}

	/**
	 * Vectors for on-demand consumers (insights, search). Reuses the map from a
	 * slow-path load when present; otherwise reads the vector cache from disk
	 * once per load and memoizes.
	 */
	private getEmbeddingsLazy(settings: PluginSettings): Promise<Map<string, number[]> | null> {
		if (this.loadedEmbeddings) return Promise.resolve(this.loadedEmbeddings);
		if (!this.embeddingsFetchPromise) {
			this.embeddingsFetchPromise = (async () => {
				try {
					if (settings.uploadedVectorsFileName.trim()) {
						const { readUploadedVectors } = await import("./uploaded-vectors");
						return await readUploadedVectors(this.app, this.pluginDir);
					}
					const { EmbeddingService } = await import("./embedding");
					const service = new EmbeddingService(this.app, settings, this.pluginDir);
					const cached = await service.loadCachedEmbeddings();
					return cached.size > 0 ? cached : null;
				} catch {
					return null;
				}
			})();
		}
		return this.embeddingsFetchPromise;
	}

	private async loadProviderEmbeddings(
		settings: PluginSettings
	): Promise<{ embeddings: Map<string, number[]>; layoutFingerprint: string }> {
		this.setStatus(t("status.embeddingCache"));
		const { EmbeddingService } = await import("./embedding");
		const embeddingService = new EmbeddingService(this.app, settings, this.pluginDir);
		const embeddings = await embeddingService.getEmbeddings((current, total) => {
			if (current < total) {
				this.setStatus(t("status.embeddingProgress", { current, total }));
			}
		});
		return { embeddings, layoutFingerprint: embeddingService.getFingerprintFor(embeddings.keys()) };
	}

	private async loadUploadedEmbeddingVectors(): Promise<Map<string, number[]>> {
		this.setStatus(t("status.loadingVectors"));
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

	private resolveSceneTheme(settings: PluginSettings = this.settings): "dark" | "light" {
		if (settings.sceneTheme === "dark" || settings.sceneTheme === "light") {
			return settings.sceneTheme;
		}
		return activeDocument.body.classList.contains("theme-dark") ? "dark" : "light";
	}

	private getVisualOptions(settings: PluginSettings = this.settings): GraphVisualOptions {
		return {
			sceneTheme: this.resolveSceneTheme(settings),
			nodeOpacity: settings.nodeOpacity,
			nodeSizeScale: settings.nodeSizeScale,
			dragSensitivity: settings.dragSensitivity,
			showGrid: settings.showGrid,
			autoOrbitSpeed: settings.autoOrbitSpeed,
			entryAnimation: settings.entryAnimation,
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
