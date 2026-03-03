import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { PluginSettings } from "./types";
import { EmbeddingService } from "./embedding";
import { UmapReducer } from "./umap-reducer";
import { buildGraphData } from "./graph-data";
import { GraphRenderer } from "./graph-renderer";

export const VIEW_TYPE = "semantic-graph-3d";

export class SemanticGraphView extends ItemView {
	private settings: PluginSettings;
	private pluginDir: string;
	private renderer: GraphRenderer | null = null;
	private toolbar: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private graphContainer: HTMLElement | null = null;
	private resizeObserver: ResizeObserver | null = null;

	constructor(leaf: WorkspaceLeaf, settings: PluginSettings, pluginDir: string) {
		super(leaf);
		this.settings = settings;
		this.pluginDir = pluginDir;
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "3D Semantic Graph";
	}

	getIcon(): string {
		return "network";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("semantic-graph-container");

		// Toolbar
		this.toolbar = container.createDiv({ cls: "semantic-graph-toolbar" });

		const refreshBtn = this.toolbar.createEl("button", { text: "Refresh", cls: "semantic-graph-btn" });
		refreshBtn.addEventListener("click", () => this.loadGraph());

		const resetBtn = this.toolbar.createEl("button", { text: "Reset View", cls: "semantic-graph-btn" });
		resetBtn.addEventListener("click", () => this.renderer?.resetView());

		this.statusEl = this.toolbar.createSpan({ cls: "semantic-graph-status" });

		// Graph container
		this.graphContainer = container.createDiv({ cls: "semantic-graph-canvas" });

		// Resize observer
		this.resizeObserver = new ResizeObserver(() => {
			if (this.renderer && this.graphContainer) {
				this.renderer.resize(this.graphContainer.clientWidth, this.graphContainer.clientHeight);
			}
		});
		this.resizeObserver.observe(this.graphContainer);

		await this.loadGraph();
	}

	async onClose(): Promise<void> {
		this.resizeObserver?.disconnect();
		this.renderer?.dispose();
		this.renderer = null;
	}

	updateSettings(settings: PluginSettings): void {
		this.settings = settings;
	}

	private setStatus(text: string): void {
		if (this.statusEl) {
			this.statusEl.setText(text);
		}
	}

	async loadGraph(): Promise<void> {
		if (!this.graphContainer) return;

		// Check API key
		if (!this.settings.openaiApiKey) {
			this.showError(
				"OpenAI API key not configured. Go to Settings → 3D Semantic Graph to add your API key."
			);
			return;
		}

		try {
			this.setStatus("Generating embeddings...");

			// Step 1: Get embeddings
			const embeddingService = new EmbeddingService(this.app, this.settings, this.pluginDir);
			const embeddings = await embeddingService.getEmbeddings((current, total) => {
				this.setStatus(`Embedding notes... ${current}/${total}`);
			});

			if (embeddings.size === 0) {
				this.showError("No markdown files found in vault, or all files are excluded.");
				return;
			}

			// Step 2: UMAP dimension reduction
			this.setStatus("Running UMAP...");
			const paths = Array.from(embeddings.keys());
			const vectors = paths.map((p) => embeddings.get(p)!);

			const reducer = new UmapReducer({
				nNeighbors: this.settings.umapNNeighbors,
				minDist: this.settings.umapMinDist,
			});

			const coords3d = await reducer.reduce(vectors, (epoch, total) => {
				this.setStatus(`UMAP: ${epoch}/${total} epochs`);
			});

			// Build position map
			const positions = new Map<string, [number, number, number]>();
			for (let i = 0; i < paths.length; i++) {
				positions.set(paths[i], coords3d[i] as [number, number, number]);
			}

			// Step 3: Build graph data
			this.setStatus("Building graph...");
			const graphData = buildGraphData(this.app, this.settings, embeddings, positions);

			// Scale UMAP coordinates for better visualization
			this.scalePositions(graphData.nodes);

			// Step 4: Render
			this.setStatus(`${graphData.nodes.length} notes, ${graphData.links.length} links`);

			this.renderer?.dispose();
			this.renderer = new GraphRenderer(this.graphContainer, (path) => {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file) {
					this.app.workspace.getLeaf(false).openFile(file as any);
				}
			});
			this.renderer.render(graphData);
		} catch (err: any) {
			console.error("Semantic Graph error:", err);
			const msg = err?.message || String(err);
			this.showError(`Error: ${msg}`);
			new Notice(`3D Semantic Graph: ${msg}`);
		}
	}

	private scalePositions(nodes: { x?: number; y?: number; z?: number }[]): void {
		if (nodes.length === 0) return;

		// Find bounding box
		let minX = Infinity, maxX = -Infinity;
		let minY = Infinity, maxY = -Infinity;
		let minZ = Infinity, maxZ = -Infinity;

		for (const n of nodes) {
			if (n.x !== undefined) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); }
			if (n.y !== undefined) { minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); }
			if (n.z !== undefined) { minZ = Math.min(minZ, n.z); maxZ = Math.max(maxZ, n.z); }
		}

		const rangeX = maxX - minX || 1;
		const rangeY = maxY - minY || 1;
		const rangeZ = maxZ - minZ || 1;
		const maxRange = Math.max(rangeX, rangeY, rangeZ);
		const scale = 200 / maxRange; // fit into 200-unit cube

		for (const n of nodes) {
			if (n.x !== undefined) n.x = (n.x - (minX + maxX) / 2) * scale;
			if (n.y !== undefined) n.y = (n.y - (minY + maxY) / 2) * scale;
			if (n.z !== undefined) n.z = (n.z - (minZ + maxZ) / 2) * scale;
		}
	}

	private showError(message: string): void {
		if (!this.graphContainer) return;
		this.renderer?.dispose();
		this.renderer = null;
		this.graphContainer.empty();
		this.setStatus("");

		const errorDiv = this.graphContainer.createDiv({ cls: "semantic-graph-error" });
		errorDiv.createEl("p", { text: message });
	}
}
