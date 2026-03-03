import ForceGraph3D from "3d-force-graph";
import { GraphData, GraphNode } from "./types";

const INITIAL_FIX_DURATION = 3000; // ms to keep UMAP positions fixed

export class GraphRenderer {
	private graph: ReturnType<typeof ForceGraph3D> | null = null;
	private container: HTMLElement;
	private onNodeClick: (path: string) => void;
	private fixTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(container: HTMLElement, onNodeClick: (path: string) => void) {
		this.container = container;
		this.onNodeClick = onNodeClick;
	}

	render(data: GraphData): void {
		this.dispose();

		const width = this.container.clientWidth;
		const height = this.container.clientHeight;

		// Fix nodes at UMAP positions initially
		for (const node of data.nodes) {
			node.fx = node.x;
			node.fy = node.y;
			node.fz = node.z;
		}

		this.graph = ForceGraph3D()(this.container)
			.width(width)
			.height(height)
			.backgroundColor("#1e1e2e")
			.graphData(data)
			// Node styling
			.nodeLabel((node: object) => (node as GraphNode).name)
			.nodeColor((node: object) => (node as GraphNode).color)
			.nodeVal((node: object) => (node as GraphNode).size)
			.nodeOpacity(0.9)
			// Link styling
			.linkWidth((link: object) => {
				const l = link as { similarity: number };
				return l.similarity * 2;
			})
			.linkOpacity(0.3)
			.linkColor(() => "#888888")
			// Interaction
			.onNodeClick((node: object) => {
				const n = node as GraphNode;
				this.onNodeClick(n.path);
			});

		// After initial period, release fixed positions for force simulation
		this.fixTimer = setTimeout(() => {
			if (this.graph) {
				const graphData = this.graph.graphData();
				for (const node of graphData.nodes) {
					const n = node as GraphNode;
					n.fx = undefined;
					n.fy = undefined;
					n.fz = undefined;
				}
				this.graph.graphData(graphData);
			}
		}, INITIAL_FIX_DURATION);
	}

	resize(width: number, height: number): void {
		if (this.graph) {
			this.graph.width(width).height(height);
		}
	}

	resetView(): void {
		if (this.graph) {
			this.graph.cameraPosition({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 0 }, 1000);
		}
	}

	dispose(): void {
		if (this.fixTimer) {
			clearTimeout(this.fixTimer);
			this.fixTimer = null;
		}
		if (this.graph) {
			this.graph._destructor();
			this.graph = null;
		}
	}
}
