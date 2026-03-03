import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
import { GraphData, GraphNode, GraphLink } from "./types";

// Per-node home force strengths
const HOME_STRENGTH_NODE = 0.05;
const HOME_STRENGTH_FOLDER = 0.12;

/** Custom d3-compatible force that pulls each node toward its homeX/Y/Z.
 *  Folder nodes receive stronger pull so they anchor their clusters. */
function createHomeForce() {
	let _nodes: GraphNode[] = [];

	const force = function (alpha: number) {
		for (const node of _nodes) {
			if (node.homeX === undefined) continue;
			const strength = node.isFolder ? HOME_STRENGTH_FOLDER : HOME_STRENGTH_NODE;
			const k = strength * alpha;
			(node as any).vx = ((node as any).vx ?? 0) + (node.homeX - (node.x ?? 0)) * k;
			(node as any).vy = ((node as any).vy ?? 0) + (node.homeY! - (node.y ?? 0)) * k;
			(node as any).vz = ((node as any).vz ?? 0) + (node.homeZ! - (node.z ?? 0)) * k;
		}
	};

	(force as any).initialize = (nodes: GraphNode[]) => { _nodes = nodes; };
	return force;
}

export class GraphRenderer {
	private graph: ReturnType<typeof ForceGraph3D> | null = null;
	private container: HTMLElement;
	private onNodeClick: (path: string) => void;
	private adjacency = new Map<string, Set<string>>();
	private semanticMode = false;
	private hoveredId: string | null = null;

	constructor(container: HTMLElement, onNodeClick: (path: string) => void) {
		this.container = container;
		this.onNodeClick = onNodeClick;
	}

	private buildAdjacency(links: GraphLink[]): void {
		this.adjacency.clear();
		for (const link of links) {
			const s = typeof link.source === "object"
				? (link.source as GraphNode).id : (link.source as string);
			const t = typeof link.target === "object"
				? (link.target as GraphNode).id : (link.target as string);
			if (!this.adjacency.has(s)) this.adjacency.set(s, new Set());
			if (!this.adjacency.has(t)) this.adjacency.set(t, new Set());
			this.adjacency.get(s)!.add(t);
			this.adjacency.get(t)!.add(s);
		}
	}

	private getNeighborSet(id: string | null): Set<string> {
		if (!id) return new Set();
		return new Set([id, ...(this.adjacency.get(id) ?? [])]);
	}

	// ── Link / node color helpers (shared between initial setup & hover) ──

	private getNodeColor = (node: object): string => {
		const gn = node as GraphNode;
		if (!this.hoveredId) return gn.color;
		return this.getNeighborSet(this.hoveredId).has(gn.id) ? gn.color : "#222233";
	};

	private getLinkColor = (link: object): string => {
		const l = link as any;
		if (!this.hoveredId) return l.isFolderLink ? "#444466" : "#aaaaaa";
		const s = typeof l.source === "object" ? l.source.id : l.source;
		const t = typeof l.target === "object" ? l.target.id : l.target;
		return (s === this.hoveredId || t === this.hoveredId) ? "#ffffff" : "#222233";
	};

	private getLinkWidth = (link: object): number => {
		const l = link as any;
		if (!this.hoveredId) return l.isFolderLink ? 0.5 : 1;
		const s = typeof l.source === "object" ? l.source.id : l.source;
		const t = typeof l.target === "object" ? l.target.id : l.target;
		if (s === this.hoveredId || t === this.hoveredId) return l.isFolderLink ? 1.5 : 2.5;
		return 0.3;
	};

	render(data: GraphData): void {
		this.dispose();

		this.semanticMode = data.nodes.some((n) => n.homeX !== undefined);

		if (!this.semanticMode) {
			// No embeddings — Fibonacci sphere initial distribution
			const r = Math.max(80, Math.cbrt(data.nodes.length) * 50);
			const golden = Math.PI * (3 - Math.sqrt(5));
			for (let i = 0; i < data.nodes.length; i++) {
				const node = data.nodes[i];
				const y = 1 - (i / Math.max(data.nodes.length - 1, 1)) * 2;
				const rad = Math.sqrt(1 - y * y);
				const theta = golden * i;
				node.x = r * rad * Math.cos(theta);
				node.y = r * y;
				node.z = r * rad * Math.sin(theta);
			}
		}

		this.buildAdjacency(data.links);

		this.graph = ForceGraph3D()(this.container)
			.width(this.container.clientWidth)
			.height(this.container.clientHeight)
			.backgroundColor("#1e1e2e")
			.graphData(data)
			.d3AlphaDecay(0.003)      // very slow cooldown → ~38s smooth animation
			.d3VelocityDecay(0.2)     // gentle damping for fluid movement
			// Node styling
			.nodeLabel((node: object) => {
				const gn = node as GraphNode;
				return gn.isFolder ? `[${gn.name}]` : gn.name;
			})
			.nodeColor(this.getNodeColor)
			.nodeVal((node: object) => (node as GraphNode).size)
			.nodeOpacity(0.9)
			// Custom 3D objects for folder nodes (wireframe sphere)
			.nodeThreeObject((node: object) => {
				const gn = node as GraphNode;
				if (!gn.isFolder) return undefined as any; // default sphere

				const group = new THREE.Group();

				// Outer wireframe icosahedron — "orbital ring" look
				const outerGeo = new THREE.IcosahedronGeometry(gn.size * 2.5, 1);
				const outerMat = new THREE.MeshBasicMaterial({
					color: new THREE.Color(gn.color),
					wireframe: true,
					transparent: true,
					opacity: 0.3,
				});
				group.add(new THREE.Mesh(outerGeo, outerMat));

				// Inner solid sphere
				const innerGeo = new THREE.SphereGeometry(gn.size * 1.0, 12, 12);
				const innerMat = new THREE.MeshBasicMaterial({
					color: new THREE.Color(gn.color),
					transparent: true,
					opacity: 0.85,
				});
				group.add(new THREE.Mesh(innerGeo, innerMat));

				return group;
			})
			// Link styling
			.linkWidth(this.getLinkWidth)
			.linkOpacity(0.35)
			.linkColor(this.getLinkColor)
			// Hover: highlight node + neighbors
			.onNodeHover((node: object | null) => {
				this.hoveredId = node ? (node as GraphNode).id : null;
				if (this.graph) {
					this.graph
						.nodeColor(this.getNodeColor)
						.linkColor(this.getLinkColor)
						.linkWidth(this.getLinkWidth);
				}
			})
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
			// Release: unpin neighbors and reheat simulation → spring back to home
			.onNodeDragEnd((_node: object) => {
				const neighbors = this.adjacency.get((_node as GraphNode).id) ?? new Set<string>();
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
				// Reheat so nodes animate back toward semantic positions
				(this.graph as any).d3ReheatSimulation?.();
			})
			.onNodeClick((node: object) => {
				this.onNodeClick((node as GraphNode).path);
			});

		// Tune forces
		const g = this.graph as any;
		if (g.d3Force) {
			// Home spring force (semantic mode only)
			if (this.semanticMode) {
				g.d3Force("home", createHomeForce());
			}

			const charge = g.d3Force("charge");
			if (charge?.strength) charge.strength(this.semanticMode ? -60 : -120);

			const link = g.d3Force("link");
			if (link?.distance) {
				link.distance((l: any) => {
					if (l.isFolderLink) return 50;
					return this.semanticMode ? 30 : 60;
				});
			}
			if (link?.strength) {
				link.strength((l: any) => {
					if (l.isFolderLink) return 0.15;
					return this.semanticMode ? 0.1 : 0.4;
				});
			}
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
