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

	getViewType(): string { return VIEW_TYPE; }
	getDisplayText(): string { return "3D Semantic Graph"; }
	getIcon(): string { return "network"; }

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("semantic-graph-container");

		this.toolbar = container.createDiv({ cls: "semantic-graph-toolbar" });
		this.toolbar.createEl("button", { text: "Refresh", cls: "semantic-graph-btn" })
			.addEventListener("click", () => this.loadGraph());
		this.toolbar.createEl("button", { text: "Reset View", cls: "semantic-graph-btn" })
			.addEventListener("click", () => this.renderer?.resetView());

		this.statusEl = this.toolbar.createSpan({ cls: "semantic-graph-status" });
		this.graphContainer = container.createDiv({ cls: "semantic-graph-canvas" });

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
		if (this.statusEl) this.statusEl.setText(text);
	}

	async loadGraph(): Promise<void> {
		if (!this.graphContainer) return;

		try {
			// Step 1: Build graph (all vault files + Obsidian wikilinks)
			this.setStatus("Building graph...");
			const graphData = buildGraphData(this.app, this.settings);

			if (graphData.nodes.length === 0) {
				this.showError("No markdown files found in vault.");
				return;
			}

			// Step 2: Semantic positioning via embeddings + UMAP (only if API key set)
			if (this.settings.openaiApiKey) {
				try {
					this.setStatus("Generating embeddings...");
					const embeddingService = new EmbeddingService(this.app, this.settings, this.pluginDir);
					const embeddings = await embeddingService.getEmbeddings((current, total) => {
						this.setStatus(`Embedding... ${current}/${total}`);
					});

					if (embeddings.size >= 3) {
						this.setStatus("Running UMAP...");
						const paths = Array.from(embeddings.keys());
						const vectors = paths.map((p) => embeddings.get(p)!);

						const reducer = new UmapReducer({
							nNeighbors: this.settings.umapNNeighbors,
							minDist: this.settings.umapMinDist,
						});

						const coords = await reducer.reduce(vectors, (epoch, total) => {
							this.setStatus(`UMAP: ${epoch}/${total}`);
						});

						// Scale UMAP output to ±180 range
						const posMap = new Map<string, [number, number, number]>();
						paths.forEach((p, i) => posMap.set(p, coords[i] as [number, number, number]));
						this.scalePositions(posMap, 180);

						// Apply as initial positions (not pinned — force sim runs freely)
						for (const node of graphData.nodes) {
							const pos = posMap.get(node.path);
							if (pos) {
								node.x = pos[0];
								node.y = pos[1];
								node.z = pos[2];
							}
						}
					}
				} catch (embErr: any) {
					// Embedding failed — fall back to sphere distribution silently
					console.warn("Embedding step failed, using sphere layout:", embErr?.message);
				}
			}

			this.setStatus(`${graphData.nodes.length} notes, ${graphData.links.length} links`);

			this.renderer?.dispose();
			this.renderer = new GraphRenderer(this.graphContainer, (path) => {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file) this.app.workspace.getLeaf(false).openFile(file as any);
			});
			this.renderer.render(graphData);
		} catch (err: any) {
			console.error("Semantic Graph error:", err);
			const msg = err?.message || String(err);
			this.showError(`Error: ${msg}`);
			new Notice(`3D Semantic Graph: ${msg}`);
		}
	}

	/** Scale UMAP coordinates to fit within ±targetRange on the longest axis */
	private scalePositions(
		posMap: Map<string, [number, number, number]>,
		targetRange: number
	): void {
		let minX = Infinity, maxX = -Infinity;
		let minY = Infinity, maxY = -Infinity;
		let minZ = Infinity, maxZ = -Infinity;

		for (const [x, y, z] of posMap.values()) {
			if (x < minX) minX = x; if (x > maxX) maxX = x;
			if (y < minY) minY = y; if (y > maxY) maxY = y;
			if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
		}

		const maxRange = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
		const scale = targetRange / maxRange;
		const cx = (minX + maxX) / 2;
		const cy = (minY + maxY) / 2;
		const cz = (minZ + maxZ) / 2;

		for (const [path, [x, y, z]] of posMap) {
			posMap.set(path, [(x - cx) * scale, (y - cy) * scale, (z - cz) * scale]);
		}
	}

	private showError(message: string): void {
		if (!this.graphContainer) return;
		this.renderer?.dispose();
		this.renderer = null;
		this.graphContainer.empty();
		this.setStatus("");
		this.graphContainer.createDiv({ cls: "semantic-graph-error" })
			.createEl("p", { text: message });
	}
}
