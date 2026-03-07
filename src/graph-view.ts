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
			this.setStatus("Building graph...");
			const graphData = buildGraphData(this.app, this.settings);

			if (graphData.nodes.length === 0) {
				this.showError("No markdown files found in vault.");
				return;
			}

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

						const posMap = new Map<string, [number, number, number]>();
						paths.forEach((p, i) => posMap.set(p, coords[i] as [number, number, number]));

						this.scalePositions(posMap, 250);
						this.enforceMinDistance(posMap, 15);

						for (const node of graphData.nodes) {
							const pos = posMap.get(node.path);
							if (pos) {
								node.x = pos[0]; node.y = pos[1]; node.z = pos[2];
								node.fx = pos[0]; node.fy = pos[1]; node.fz = pos[2];
							}
						}
					}
				} catch (embErr: any) {
					console.warn("Embedding step failed:", embErr?.message);
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

	/** Scale UMAP coordinates to fit within ±targetRange */
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
						a[0] -= dx * push; a[1] -= dy * push; a[2] -= dz * push;
						b[0] += dx * push; b[1] += dy * push; b[2] += dz * push;
						moved = true;
					} else if (dist === 0) {
						a[0] += (Math.random() - 0.5) * minDist;
						a[1] += (Math.random() - 0.5) * minDist;
						a[2] += (Math.random() - 0.5) * minDist;
						moved = true;
					}
				}
			}
			if (!moved) break;
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
