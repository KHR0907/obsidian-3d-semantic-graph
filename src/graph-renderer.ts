import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
import { GraphData, GraphNode } from "./types";

export class GraphRenderer {
	private graph: ReturnType<typeof ForceGraph3D> | null = null;
	private container: HTMLElement;
	private onNodeClick: (path: string) => void;

	constructor(container: HTMLElement, onNodeClick: (path: string) => void) {
		this.container = container;
		this.onNodeClick = onNodeClick;
	}

	render(data: GraphData): void {
		this.dispose();

		this.graph = ForceGraph3D()(this.container)
			.width(this.container.clientWidth)
			.height(this.container.clientHeight)
			.backgroundColor("#1e1e2e")
			.graphData(data)
			.nodeLabel((node: object) => (node as GraphNode).name)
			.nodeColor((node: object) => (node as GraphNode).color)
			.nodeVal((node: object) => (node as GraphNode).size)
			.nodeOpacity(0.9)
			.linkWidth(0.5)
			.linkOpacity(0.2)
			.linkColor(() => "#aaaaaa")
			.enableNodeDrag(false)
			.cooldownTicks(0)
			.onNodeClick((node: object) => {
				this.onNodeClick((node as GraphNode).path);
			});

		// ±250 boundary wireframe box
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

	dispose(): void {
		if (this.graph) {
			this.graph._destructor();
			this.graph = null;
		}
	}
}
