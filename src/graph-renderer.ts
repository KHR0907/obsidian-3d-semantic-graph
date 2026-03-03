import ForceGraph3D from "3d-force-graph";
import { GraphData, GraphNode, GraphLink } from "./types";

export class GraphRenderer {
	private graph: ReturnType<typeof ForceGraph3D> | null = null;
	private container: HTMLElement;
	private onNodeClick: (path: string) => void;
	private adjacency = new Map<string, Set<string>>();

	constructor(container: HTMLElement, onNodeClick: (path: string) => void) {
		this.container = container;
		this.onNodeClick = onNodeClick;
	}

	private buildAdjacency(links: GraphLink[]): void {
		this.adjacency.clear();
		for (const link of links) {
			const s = typeof link.source === "object"
				? (link.source as GraphNode).id
				: (link.source as string);
			const t = typeof link.target === "object"
				? (link.target as GraphNode).id
				: (link.target as string);
			if (!this.adjacency.has(s)) this.adjacency.set(s, new Set());
			if (!this.adjacency.has(t)) this.adjacency.set(t, new Set());
			this.adjacency.get(s)!.add(t);
			this.adjacency.get(t)!.add(s);
		}
	}

	render(data: GraphData): void {
		this.dispose();

		// Nodes with UMAP positions keep those coordinates.
		// Nodes without positions get Fibonacci sphere distribution.
		const r = Math.max(80, Math.cbrt(data.nodes.length) * 50);
		const unpositioned = data.nodes.filter(
			(n) => n.x === undefined || n.y === undefined || n.z === undefined
		);
		const golden = Math.PI * (3 - Math.sqrt(5));
		for (let i = 0; i < unpositioned.length; i++) {
			const node = unpositioned[i];
			const y = 1 - (i / Math.max(unpositioned.length - 1, 1)) * 2;
			const radius = Math.sqrt(1 - y * y);
			const theta = golden * i;
			node.x = r * radius * Math.cos(theta);
			node.y = r * y;
			node.z = r * radius * Math.sin(theta);
		}

		this.buildAdjacency(data.links);

		this.graph = ForceGraph3D()(this.container)
			.width(this.container.clientWidth)
			.height(this.container.clientHeight)
			.backgroundColor("#1e1e2e")
			.graphData(data)
			// Dynamic simulation — nodes start at semantic positions, then evolve
			.d3AlphaDecay(0.02)
			.d3VelocityDecay(0.3)
			// Node styling
			.nodeLabel((node: object) => (node as GraphNode).name)
			.nodeColor((node: object) => (node as GraphNode).color)
			.nodeVal((node: object) => (node as GraphNode).size)
			.nodeOpacity(0.9)
			// Link styling
			.linkWidth(1)
			.linkOpacity(0.35)
			.linkColor(() => "#aaaaaa")
			// Drag: move dragged node + direct neighbors together
			.onNodeDrag((node: object, translate: { x: number; y: number; z: number }) => {
				const dragged = node as GraphNode;
				const neighbors = this.adjacency.get(dragged.id) ?? new Set<string>();

				for (const n of this.graph!.graphData().nodes) {
					const gn = n as GraphNode;
					if (neighbors.has(gn.id)) {
						gn.fx = (gn.fx ?? gn.x ?? 0) + translate.x;
						gn.fy = (gn.fy ?? gn.y ?? 0) + translate.y;
						gn.fz = (gn.fz ?? gn.z ?? 0) + translate.z;
					}
				}
			})
			// Release neighbors on drag end — simulation resumes from new positions
			.onNodeDragEnd((_node: object) => {
				const dragged = _node as GraphNode;
				const neighbors = this.adjacency.get(dragged.id) ?? new Set<string>();

				for (const n of this.graph!.graphData().nodes) {
					const gn = n as GraphNode;
					if (neighbors.has(gn.id)) {
						gn.x = gn.fx ?? gn.x;
						gn.y = gn.fy ?? gn.y;
						gn.z = gn.fz ?? gn.z;
						gn.fx = undefined;
						gn.fy = undefined;
						gn.fz = undefined;
					}
				}
			})
			.onNodeClick((node: object) => {
				this.onNodeClick((node as GraphNode).path);
			});

		// Tune forces after initialization
		const g = this.graph as any;
		if (g.d3Force) {
			const charge = g.d3Force("charge");
			if (charge?.strength) charge.strength(-120);

			const link = g.d3Force("link");
			if (link?.distance) link.distance(60);
			if (link?.strength) link.strength(0.4);
		}
	}

	resize(width: number, height: number): void {
		if (this.graph) this.graph.width(width).height(height);
	}

	resetView(): void {
		if (this.graph) {
			this.graph.cameraPosition({ x: 0, y: 0, z: 400 }, { x: 0, y: 0, z: 0 }, 1000);
		}
	}

	dispose(): void {
		if (this.graph) {
			this.graph._destructor();
			this.graph = null;
		}
		this.adjacency.clear();
	}
}
