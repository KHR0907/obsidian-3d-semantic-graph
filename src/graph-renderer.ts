import { GraphStageOverlay } from "./graph-overlay";
import { GraphSceneRenderer } from "./graph-scene-renderer";
import { GraphData, GraphNode } from "./types";

export class GraphRenderer {
	private container: HTMLElement;
	private sceneLayer: HTMLDivElement;
	private overlayLayer: HTMLDivElement;
	private sceneRenderer: GraphSceneRenderer;
	private overlay: GraphStageOverlay;
	private linksVisible = true;
	private connectionCounts = new Map<string, number>();

	constructor(
		container: HTMLElement,
		onNodeClick: (node: GraphNode) => void,
		onNodeHover?: (node: GraphNode | null) => void
	) {
		this.container = container;
		this.container.replaceChildren();

		this.sceneLayer = document.createElement("div");
		this.sceneLayer.className = "semantic-graph-scene-layer";

		this.overlayLayer = document.createElement("div");
		this.overlayLayer.className = "semantic-graph-overlay-layer";

		this.container.append(this.sceneLayer, this.overlayLayer);

		this.overlay = new GraphStageOverlay(this.overlayLayer);
		this.sceneRenderer = new GraphSceneRenderer(
			this.sceneLayer,
			onNodeClick,
			(node) => this.handleNodeHover(node, onNodeHover)
		);
	}

	render(data: GraphData): void {
		this.connectionCounts = this.buildConnectionCounts(data);
		this.overlay.hide();
		this.sceneRenderer.render(data);
		this.sceneRenderer.setLinksVisible(this.linksVisible);
	}

	resize(width: number, height: number): void {
		this.sceneRenderer.resize(width, height);
	}

	resetView(): void {
		this.sceneRenderer.resetView();
	}

	setLinksVisible(visible: boolean): void {
		this.linksVisible = visible;
		this.sceneRenderer.setLinksVisible(visible);
	}

	dispose(): void {
		this.sceneRenderer.dispose();
		this.overlay.dispose();
		this.container.replaceChildren();
	}

	private handleNodeHover(node: GraphNode | null, onNodeHover?: (node: GraphNode | null) => void): void {
		onNodeHover?.(node);

		if (!node) {
			this.overlay.hide();
			return;
		}

		this.overlay.show({
			node,
			connectionCount: this.connectionCounts.get(node.path) ?? 0,
		});
	}

	private buildConnectionCounts(data: GraphData): Map<string, number> {
		const counts = new Map<string, number>();

		for (const node of data.nodes) {
			counts.set(node.path, 0);
		}

		for (const link of data.links) {
			const source = this.getNodePath(link.source);
			const target = this.getNodePath(link.target);
			if (!source || !target) continue;

			counts.set(source, (counts.get(source) ?? 0) + 1);
			counts.set(target, (counts.get(target) ?? 0) + 1);
		}

		return counts;
	}

	private getNodePath(nodeRef: string | GraphNode): string | null {
		if (typeof nodeRef === "string") return nodeRef;
		return nodeRef?.path ?? nodeRef?.id ?? null;
	}
}
