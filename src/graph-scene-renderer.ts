import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
import { GraphData, GraphLink, GraphNode } from "./types";

const BASE_NODE_OPACITY = 0.9;
const DIMMED_NODE_OPACITY = 0.12;
const BASE_LINK_OPACITY = 0.2;
const DIMMED_LINK_OPACITY = 0.03;
const HIGHLIGHT_LINK_OPACITY = 0.85;
const BASE_LINK_COLOR = "#aaaaaa";
const DIMMED_LINK_COLOR = "#3a3a4c";
const HIGHLIGHT_LINK_COLOR = "#ffffff";

export class GraphSceneRenderer {
	private graph: ReturnType<typeof ForceGraph3D> | null = null;
	private container: HTMLElement;
	private onNodeClick: (node: GraphNode) => void;
	private onNodeHover: (node: GraphNode | null) => void;
	private hoveredNode: GraphNode | null = null;
	private highlightedNodes = new Set<string>();
	private linksVisible = true;
	private adjacency = new Map<string, Set<string>>();

	constructor(
		container: HTMLElement,
		onNodeClick: (node: GraphNode) => void,
		onNodeHover: (node: GraphNode | null) => void
	) {
		this.container = container;
		this.onNodeClick = onNodeClick;
		this.onNodeHover = onNodeHover;
	}

	render(data: GraphData): void {
		this.disposeGraph();
		this.adjacency = this.buildAdjacency(data);

		this.graph = ForceGraph3D()(this.container)
			.width(this.container.clientWidth)
			.height(this.container.clientHeight)
			.backgroundColor("#1e1e2e")
			.graphData(data)
			.nodeLabel((node: object) => (node as GraphNode).name)
			.nodeColor((node: object) => this.getNodeColor(node as GraphNode))
			.nodeVal((node: object) => (node as GraphNode).size)
			.nodeOpacity(BASE_NODE_OPACITY)
			.linkWidth(0.5)
			.linkVisibility(() => this.linksVisible)
			.linkOpacity((link: object) => this.getLinkOpacity(link as GraphLink))
			.linkColor((link: object) => this.getLinkColor(link as GraphLink))
			.enableNodeDrag(false)
			.cooldownTicks(0)
			.onNodeHover((node: object | null) => {
				this.updateHoverState((node as GraphNode | null) ?? null);
			})
			.onNodeClick((node: object) => {
				this.onNodeClick(node as GraphNode);
			});

		const box = new THREE.BoxGeometry(500, 500, 500);
		const edges = new THREE.EdgesGeometry(box);
		const line = new THREE.LineSegments(
			edges,
			new THREE.LineBasicMaterial({ color: 0x444466, transparent: true, opacity: 0.3 })
		);
		(this.graph as any).scene().add(line);
	}

	resize(width: number, height: number): void {
		if (this.graph) this.graph.width(width).height(height);
	}

	resetView(): void {
		if (this.graph) {
			this.graph.cameraPosition({ x: 0, y: 0, z: 400 }, { x: 0, y: 0, z: 0 }, 1000);
		}
	}

	setLinksVisible(visible: boolean): void {
		this.linksVisible = visible;
		this.graph?.refresh();
	}

	dispose(): void {
		this.disposeGraph();
		this.container.replaceChildren();
	}

	private disposeGraph(): void {
		if (this.graph) {
			this.graph._destructor();
			this.graph = null;
		}

		this.hoveredNode = null;
		this.highlightedNodes.clear();
		this.adjacency.clear();
		this.onNodeHover(null);
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

	private updateHoverState(node: GraphNode | null): void {
		if (this.hoveredNode?.path === node?.path) return;

		this.hoveredNode = node;
		this.highlightedNodes.clear();

		if (node) {
			const connectedNodes = this.adjacency.get(node.path);
			if (connectedNodes) {
				for (const path of connectedNodes) {
					this.highlightedNodes.add(path);
				}
			}
		}

		this.onNodeHover(node);
		this.graph?.refresh();
	}

	private getNodeColor(node: GraphNode): string {
		if (!this.hoveredNode) return node.color;
		return this.highlightedNodes.has(node.path) ? node.color : this.withAlpha(node.color, DIMMED_NODE_OPACITY);
	}

	private getLinkColor(link: GraphLink): string {
		if (!this.hoveredNode) return BASE_LINK_COLOR;
		return this.isHighlightedLink(link) ? HIGHLIGHT_LINK_COLOR : DIMMED_LINK_COLOR;
	}

	private getLinkOpacity(link: GraphLink): number {
		if (!this.linksVisible) return 0;
		if (!this.hoveredNode) return BASE_LINK_OPACITY;
		return this.isHighlightedLink(link) ? HIGHLIGHT_LINK_OPACITY : DIMMED_LINK_OPACITY;
	}

	private isHighlightedLink(link: GraphLink): boolean {
		if (!this.hoveredNode) return false;

		const source = this.getNodePath(link.source);
		const target = this.getNodePath(link.target);
		if (!source || !target) return false;

		return source === this.hoveredNode.path || target === this.hoveredNode.path;
	}

	private getNodePath(nodeRef: string | GraphNode): string | null {
		if (typeof nodeRef === "string") return nodeRef;
		return nodeRef?.path ?? nodeRef?.id ?? null;
	}

	private withAlpha(color: string, alpha: number): string {
		const normalized = color.startsWith("#") ? color.slice(1) : color;
		if (normalized.length !== 6) return color;
		const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, "0");
		return `#${normalized}${alphaHex}`;
	}
}
