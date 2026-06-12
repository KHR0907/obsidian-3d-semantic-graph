import { ItemView, TFile, WorkspaceLeaf, setIcon, setTooltip } from "obsidian";
import { computeNeighbors, NeighborEntry } from "./insights";
import { GraphData, GraphNode, GraphVisualOptions, PluginSettings } from "./types";

export const NEIGHBORS_VIEW_TYPE = "semantic-graph-neighbors";

const MINI_SCENE_EXTENT = 960;
const CENTER_NODE_COLOR = "#f59e0b";
const NEIGHBOR_NODE_COLOR = "#6366f1";
const REFRESH_DEBOUNCE_MS = 250;

export class NeighborsView extends ItemView {
	private settings: PluginSettings;
	private pluginDir: string;
	private getLatestSettings: () => PluginSettings;
	private renderer: import("./graph-renderer").GraphRenderer | null = null;
	private vectors: Map<string, number[]> | null = null;
	private miniGraphEl: HTMLElement | null = null;
	private listEl: HTMLElement | null = null;
	private hintEl: HTMLElement | null = null;
	private renderedPath: string | null = null;
	private refreshTimer: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		settings: PluginSettings,
		pluginDir: string,
		getLatestSettings: () => PluginSettings
	) {
		super(leaf);
		this.settings = settings;
		this.pluginDir = pluginDir;
		this.getLatestSettings = getLatestSettings;
	}

	getViewType(): string { return NEIGHBORS_VIEW_TYPE; }
	getDisplayText(): string { return "Semantic neighbors"; }
	getIcon(): string { return "orbit"; }

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("semantic-neighbors-container");

		const header = container.createDiv({ cls: "semantic-neighbors-header" });
		header.createSpan({ cls: "semantic-neighbors-title", text: "Semantic neighbors" });
		const reloadBtn = header.createEl("button", {
			cls: "semantic-graph-btn semantic-graph-icon-btn",
			attr: { type: "button", "aria-label": "Reload vectors" },
		});
		setIcon(reloadBtn, "refresh-ccw");
		setTooltip(reloadBtn, "Reload vectors", { delay: 150 });
		reloadBtn.addEventListener("click", () => {
			this.vectors = null;
			this.renderedPath = null;
			void this.refresh();
		});

		this.miniGraphEl = container.createDiv({ cls: "semantic-neighbors-graph" });
		this.hintEl = container.createDiv({ cls: "semantic-neighbors-hint" });
		this.listEl = container.createDiv({ cls: "semantic-neighbors-list" });

		this.registerEvent(this.app.workspace.on("file-open", () => this.scheduleRefresh()));
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleRefresh()));

		await this.refresh();
	}

	onClose(): Promise<void> {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}
		this.renderer?.dispose();
		this.renderer = null;
		return Promise.resolve();
	}

	updateSettings(settings: PluginSettings): void {
		const previous = this.settings;
		this.settings = settings;
		if (previous.neighborCount !== settings.neighborCount) {
			this.renderedPath = null;
			this.scheduleRefresh();
		}
	}

	private scheduleRefresh(): void {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
		}
		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			void this.refresh();
		}, REFRESH_DEBOUNCE_MS);
	}

	private async refresh(): Promise<void> {
		if (!this.miniGraphEl || !this.listEl || !this.hintEl) return;
		this.settings = this.getLatestSettings();

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== "md") {
			this.showHint("Open a note to see its semantic neighbors.");
			return;
		}
		if (activeFile.path === this.renderedPath) return;

		const vectors = await this.loadVectors();
		if (!vectors || vectors.size < 2) {
			this.showHint("No embeddings available. Open the graph view with an embedding provider configured to generate them.");
			return;
		}
		if (!vectors.has(activeFile.path)) {
			this.showHint("No embedding for this note yet. Refresh the graph view to embed new notes.");
			return;
		}

		const neighbors = computeNeighbors(vectors, activeFile.path, this.settings.neighborCount);
		if (neighbors.length === 0) {
			this.showHint("No neighbors found.");
			return;
		}

		this.renderedPath = activeFile.path;
		this.hintEl.hide();
		this.renderList(neighbors);
		await this.renderMiniGraph(activeFile, neighbors);
	}

	private showHint(text: string): void {
		this.renderedPath = null;
		this.renderer?.dispose();
		this.renderer = null;
		this.miniGraphEl?.hide();
		if (this.listEl) this.listEl.empty();
		if (this.hintEl) {
			this.hintEl.show();
			this.hintEl.setText(text);
		}
	}

	private async loadVectors(): Promise<Map<string, number[]> | null> {
		if (this.vectors) return this.vectors;

		try {
			if (this.settings.uploadedVectorsFileName.trim()) {
				const { readUploadedVectors } = await import("./uploaded-vectors");
				this.vectors = await readUploadedVectors(this.app, this.pluginDir);
			} else {
				const { EmbeddingService } = await import("./embedding");
				const service = new EmbeddingService(this.app, this.settings, this.pluginDir);
				this.vectors = await service.loadCachedEmbeddings();
			}
		} catch {
			this.vectors = null;
		}
		return this.vectors;
	}

	private renderList(neighbors: NeighborEntry[]): void {
		if (!this.listEl) return;
		this.listEl.empty();

		for (const neighbor of neighbors) {
			const row = this.listEl.createDiv({ cls: "semantic-neighbors-row" });
			const name = row.createEl("a", {
				cls: "semantic-neighbors-note",
				text: this.basename(neighbor.path),
				attr: { title: neighbor.path },
			});
			name.addEventListener("click", (event) => {
				event.preventDefault();
				this.openNote(neighbor.path);
			});
			const meter = row.createDiv({ cls: "semantic-neighbors-meter" });
			meter.createDiv({ cls: "semantic-neighbors-meter-fill" }).style.width =
				`${Math.round(Math.max(0, Math.min(1, neighbor.similarity)) * 100)}%`;
			row.createSpan({
				cls: "semantic-neighbors-score",
				text: `${Math.round(neighbor.similarity * 100)}%`,
			});
		}
	}

	private async renderMiniGraph(activeFile: TFile, neighbors: NeighborEntry[]): Promise<void> {
		if (!this.miniGraphEl) return;
		this.miniGraphEl.show();

		const data = this.buildMiniGraphData(activeFile, neighbors);
		this.renderer?.dispose();
		const { GraphRenderer } = await import("./graph-renderer");
		this.renderer = new GraphRenderer(
			this.miniGraphEl,
			(node) => {
				if (node) this.openNote(node.path);
			},
			(node) => this.openNote(node.path),
			this.getVisualOptions(),
			true
		);
		this.renderer.render(data);
		this.renderer.resize(this.miniGraphEl.clientWidth, this.miniGraphEl.clientHeight);
	}

	private buildMiniGraphData(activeFile: TFile, neighbors: NeighborEntry[]): GraphData {
		const nodes: GraphNode[] = [];
		const center: GraphNode = {
			id: activeFile.path,
			name: activeFile.basename,
			path: activeFile.path,
			color: CENTER_NODE_COLOR,
			size: 7,
		};
		this.placeNode(center, [0, 0, 0]);
		nodes.push(center);

		const similarities = neighbors.map((n) => n.similarity);
		const maxSimilarity = Math.max(...similarities);
		const minSimilarity = Math.min(...similarities);
		const span = maxSimilarity - minSimilarity;
		const goldenAngle = Math.PI * (3 - Math.sqrt(5));

		for (let i = 0; i < neighbors.length; i++) {
			const neighbor = neighbors[i];
			// Closest neighbor sits nearest to the center; distances are normalized
			// within the result set because similarity scales differ per model.
			const t = span > 0 ? (maxSimilarity - neighbor.similarity) / span : 0.5;
			const radius = MINI_SCENE_EXTENT * (0.18 + 0.45 * t);

			const u = (i + 0.5) / neighbors.length;
			const y = 1 - 2 * u;
			const ring = Math.sqrt(Math.max(0, 1 - y * y));
			const theta = goldenAngle * i;

			const node: GraphNode = {
				id: neighbor.path,
				name: this.basename(neighbor.path),
				path: neighbor.path,
				color: NEIGHBOR_NODE_COLOR,
				size: 4,
			};
			this.placeNode(node, [
				Math.cos(theta) * ring * radius,
				y * radius,
				Math.sin(theta) * ring * radius,
			]);
			nodes.push(node);
		}

		return {
			nodes,
			links: neighbors.map((neighbor) => ({ source: activeFile.path, target: neighbor.path })),
		};
	}

	private placeNode(node: GraphNode, position: [number, number, number]): void {
		node.x = position[0];
		node.y = position[1];
		node.z = position[2];
		node.fx = position[0];
		node.fy = position[1];
		node.fz = position[2];
	}

	private getVisualOptions(): GraphVisualOptions {
		const settings = this.settings;
		const sceneTheme =
			settings.sceneTheme === "dark" || settings.sceneTheme === "light"
				? settings.sceneTheme
				: activeDocument.body.classList.contains("theme-dark")
					? "dark"
					: "light";
		return {
			sceneTheme,
			nodeOpacity: 1,
			nodeSizeScale: 1,
			dragSensitivity: settings.dragSensitivity,
			showGrid: false,
			autoOrbitSpeed: 0.3,
			sceneExtent: MINI_SCENE_EXTENT,
		};
	}

	private basename(path: string): string {
		const file = path.includes("/") ? path.substring(path.lastIndexOf("/") + 1) : path;
		return file.endsWith(".md") ? file.slice(0, -3) : file;
	}

	private openNote(path: string): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
	}
}
