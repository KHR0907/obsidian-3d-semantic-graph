import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { GraphNode, PluginSettings } from "./types";
import { EmbeddingService } from "./embedding";
import { GraphInspectorPanel } from "./graph-inspector";
import { UmapReducer } from "./umap-reducer";
import { buildGraphData } from "./graph-data";
import { GraphRenderer } from "./graph-renderer";

export const VIEW_TYPE = "semantic-graph-3d";

const SPHERE_LAYOUT_RADIUS = 250;
const MIN_NODE_DISTANCE = 12;
const SPHEREIZE_BASE_BLEND = 0.22;

export class SemanticGraphView extends ItemView {
	private settings: PluginSettings;
	private pluginDir: string;
	private persistSettings: (settings: PluginSettings) => Promise<void>;
	private renderer: GraphRenderer | null = null;
	private inspector: GraphInspectorPanel | null = null;
	private toolbar: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private graphContainer: HTMLElement | null = null;
	private graphStage: HTMLElement | null = null;
	private inspectorContainer: HTMLElement | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private linksToggleBtn: HTMLButtonElement | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		settings: PluginSettings,
		pluginDir: string,
		persistSettings: (settings: PluginSettings) => Promise<void>
	) {
		super(leaf);
		this.settings = settings;
		this.pluginDir = pluginDir;
		this.persistSettings = persistSettings;
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
		this.linksToggleBtn = this.toolbar.createEl("button", { cls: "semantic-graph-btn" });
		this.linksToggleBtn.addEventListener("click", () => void this.toggleLinks());
		this.updateLinksToggleButton();

		this.statusEl = this.toolbar.createSpan({ cls: "semantic-graph-status" });
		this.graphContainer = container.createDiv({ cls: "semantic-graph-canvas" });
		this.graphStage = this.graphContainer.createDiv({ cls: "semantic-graph-stage" });
		this.inspectorContainer = this.graphContainer.createDiv({ cls: "semantic-graph-inspector" });
		this.inspector = new GraphInspectorPanel(this.inspectorContainer, (path) => this.openNote(path));

		this.resizeObserver = new ResizeObserver(() => {
			if (this.renderer && this.graphStage) {
				this.renderer.resize(this.graphStage.clientWidth, this.graphStage.clientHeight);
			}
		});
		this.resizeObserver.observe(this.graphContainer);

		await this.loadGraph();
	}

	async onClose(): Promise<void> {
		this.resizeObserver?.disconnect();
		this.renderer?.dispose();
		this.inspector?.dispose();
		this.renderer = null;
		this.inspector = null;
	}

	updateSettings(settings: PluginSettings): void {
		this.settings = settings;
		this.renderer?.setLinksVisible(this.settings.showLinks);
		this.updateLinksToggleButton();
	}

	private setStatus(text: string): void {
		if (this.statusEl) this.statusEl.setText(text);
	}

	private updateLinksToggleButton(): void {
		if (!this.linksToggleBtn) return;

		this.linksToggleBtn.setText(this.settings.showLinks ? "Links On" : "Links Off");
		this.linksToggleBtn.classList.toggle("is-active", this.settings.showLinks);
	}

	private async toggleLinks(): Promise<void> {
		this.settings = {
			...this.settings,
			showLinks: !this.settings.showLinks,
		};

		this.renderer?.setLinksVisible(this.settings.showLinks);
		this.updateLinksToggleButton();
		await this.persistSettings(this.settings);
	}

	private openNote(path: string): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file) this.app.workspace.getLeaf(false).openFile(file as any);
	}

	async loadGraph(): Promise<void> {
		if (!this.graphStage || !this.inspector) return;

		try {
			this.setStatus("Building graph...");
			const graphData = buildGraphData(this.app, this.settings);

			if (graphData.nodes.length === 0) {
				this.showError("No markdown files found in vault.");
				return;
			}

			const spherePositions = this.createSphereLayout(graphData.nodes, SPHERE_LAYOUT_RADIUS);
			let finalPositions = spherePositions;

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

						const semanticPositions = new Map<string, [number, number, number]>();
						paths.forEach((p, i) => semanticPositions.set(p, coords[i] as [number, number, number]));

						finalPositions = this.sphereizePositions(
							graphData.nodes,
							spherePositions,
							semanticPositions,
							SPHERE_LAYOUT_RADIUS
						);
					} else {
						this.setStatus("Using sphere layout...");
					}
				} catch (embErr: any) {
					console.warn("Embedding step failed:", embErr?.message);
					this.setStatus("Embedding failed, using sphere layout...");
				}
			} else {
				this.setStatus("Using sphere layout...");
			}

			this.enforceMinDistance(finalPositions, MIN_NODE_DISTANCE);
			this.applyPositions(graphData.nodes, finalPositions);

			this.setStatus(`${graphData.nodes.length} notes, ${graphData.links.length} links`);
			this.inspector.setGraphData(graphData);

			this.renderer?.dispose();
			this.renderer = new GraphRenderer(
				this.graphStage,
				(node) => {
					this.inspector?.setSelectedNode(node);
					this.openNote(node.path);
				},
				(node) => this.inspector?.setHoveredNode(node)
			);
			this.renderer.render(graphData);
			this.renderer.setLinksVisible(this.settings.showLinks);
		} catch (err: any) {
			console.error("Semantic Graph error:", err);
			const msg = err?.message || String(err);
			this.showError(`Error: ${msg}`);
			new Notice(`3D Semantic Graph: ${msg}`);
		}
	}

	private createSphereLayout(
		nodes: GraphNode[],
		targetRadius: number
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
			const radius = targetRadius * Math.cbrt(t);

			positions.set(node.path, [
				Math.cos(theta) * ringRadius * radius,
				y * radius,
				Math.sin(theta) * ringRadius * radius,
			]);
		}

		return positions;
	}

	private sphereizePositions(
		nodes: GraphNode[],
		spherePositions: Map<string, [number, number, number]>,
		semanticPositions: Map<string, [number, number, number]>,
		targetRadius: number
	): Map<string, [number, number, number]> {
		const sphereized = new Map<string, [number, number, number]>();
		const available = nodes
			.map((node) => semanticPositions.get(node.path))
			.filter((pos): pos is [number, number, number] => !!pos);

		if (available.length === 0) return sphereized;

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
			const spherePos = spherePositions.get(node.path) ?? [0, 0, targetRadius];
			const semanticPos = semanticPositions.get(node.path);
			if (!semanticPos) {
				sphereized.set(node.path, [...spherePos]);
				continue;
			}

			const centered: [number, number, number] = [
				semanticPos[0] - centroid[0],
				semanticPos[1] - centroid[1],
				semanticPos[2] - centroid[2],
			];
			const length = this.vectorLength(centered);

			const semanticDirection: [number, number, number] =
				length === 0
					? [0, 0, 1]
					: [centered[0] / length, centered[1] / length, centered[2] / length];

			const sphereLength = this.vectorLength(spherePos);
			const sphereDirection: [number, number, number] =
				sphereLength === 0
					? [0, 0, 1]
					: [spherePos[0] / sphereLength, spherePos[1] / sphereLength, spherePos[2] / sphereLength];

			const blended: [number, number, number] = [
				semanticDirection[0] * (1 - SPHEREIZE_BASE_BLEND) + sphereDirection[0] * SPHEREIZE_BASE_BLEND,
				semanticDirection[1] * (1 - SPHEREIZE_BASE_BLEND) + sphereDirection[1] * SPHEREIZE_BASE_BLEND,
				semanticDirection[2] * (1 - SPHEREIZE_BASE_BLEND) + sphereDirection[2] * SPHEREIZE_BASE_BLEND,
			];
			const blendedLength = this.vectorLength(blended) || 1;

			sphereized.set(node.path, [
				(blended[0] / blendedLength) * targetRadius,
				(blended[1] / blendedLength) * targetRadius,
				(blended[2] / blendedLength) * targetRadius,
			]);
		}

		return sphereized;
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
		if (!this.graphStage) return;
		this.renderer?.dispose();
		this.renderer = null;
		this.graphStage.empty();
		this.setStatus("");
		this.graphStage.createDiv({ cls: "semantic-graph-error" })
			.createEl("p", { text: message });
	}
}
