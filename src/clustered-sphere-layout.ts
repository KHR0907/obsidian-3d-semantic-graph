import { GraphNode } from "./types";
import { createSeededRandom } from "./seeded-rng";

const CLUSTER_COLORS = [
	"#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#8b5cf6",
	"#ef4444", "#22c55e", "#3b82f6", "#f97316", "#06b6d4",
];

export interface ClusterRegion {
	points: [number, number, number][];
	nodePaths: string[];
	color: string;
	folder: string;
}

export interface ClusteredSphereResult {
	positions: Map<string, [number, number, number]>;
	regions: ClusterRegion[];
	nodeColors: Map<string, string>;
}

export function createClusteredSphereLayout(
	nodes: GraphNode[],
	targetRadius: number,
	seed: number
): ClusteredSphereResult {
	const positions = new Map<string, [number, number, number]>();
	const regions: ClusterRegion[] = [];
	const nodeColors = new Map<string, string>();

	if (nodes.length === 0) return { positions, regions, nodeColors };
	if (nodes.length === 1) {
		const color = CLUSTER_COLORS[0];
		positions.set(nodes[0].path, [0, 0, 0]);
		nodeColors.set(nodes[0].path, color);
		return { positions, regions, nodeColors };
	}

	const random = createSeededRandom(seed);

	// --- Group by folder ---
	const folderGroups = new Map<string, GraphNode[]>();
	for (const node of nodes) {
		const folder = node.path.includes("/")
			? node.path.substring(0, node.path.lastIndexOf("/"))
			: "/";
		if (!folderGroups.has(folder)) folderGroups.set(folder, []);
		folderGroups.get(folder)!.push(node);
	}

	const folders = Array.from(folderGroups.keys()).sort();
	const numGroups = folders.length;

	// --- Fibonacci sphere centroids ---
	const goldenAngle = Math.PI * (3 - Math.sqrt(5));
	const centroids: [number, number, number][] = [];
	for (let i = 0; i < numGroups; i++) {
		const t = (i + 0.5) / numGroups;
		const y = 1 - 2 * t;
		const ring = Math.sqrt(Math.max(0, 1 - y * y));
		const theta = goldenAngle * i;
		centroids.push([Math.cos(theta) * ring, y, Math.sin(theta) * ring]);
	}

	// --- Adjacency: k nearest centroids on sphere ---
	const K = Math.min(4, numGroups - 1);
	const adjacency: number[][] = [];
	for (let i = 0; i < numGroups; i++) {
		const dists = centroids
			.map((c, j) => ({ j, d: vecDist(centroids[i], c) }))
			.filter((e) => e.j !== i)
			.sort((a, b) => a.d - b.d);
		adjacency.push(dists.slice(0, K).map((e) => e.j));
	}

	// --- Greedy graph coloring (non-adjacent same color) ---
	const colorIdx = new Array<number>(numGroups).fill(-1);
	for (let i = 0; i < numGroups; i++) {
		const used = new Set(adjacency[i].map((j) => colorIdx[j]).filter((c) => c >= 0));
		for (let c = 0; c < CLUSTER_COLORS.length; c++) {
			if (!used.has(c)) { colorIdx[i] = c; break; }
		}
		if (colorIdx[i] === -1) colorIdx[i] = i % CLUSTER_COLORS.length;
	}

	// --- Place nodes & build regions ---
	for (let g = 0; g < numGroups; g++) {
		const folder = folders[g];
		const group = folderGroups.get(folder)!;
		const [cx, cy, cz] = centroids[g];
		const color = CLUSTER_COLORS[colorIdx[g]];

		const t1 = tangent(cx, cy, cz);
		const t2 = cross([cx, cy, cz], t1);

		const fraction = group.length / nodes.length;
		const angularRadius = Math.PI * 0.35 * Math.sqrt(fraction) + 0.08;

		const groupPositions: [number, number, number][] = [];

		for (const node of group) {
			const angle = random() * Math.PI * 2;
			const mag = angularRadius * Math.sqrt(random());
			const dx = Math.cos(angle) * mag;
			const dy = Math.sin(angle) * mag;

			let nx = cx + t1[0] * dx + t2[0] * dy;
			let ny = cy + t1[1] * dx + t2[1] * dy;
			let nz = cz + t1[2] * dx + t2[2] * dy;

			const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
			const r = targetRadius * (0.90 + random() * 0.10);

			const pos: [number, number, number] = [
				(nx / len) * r,
				(ny / len) * r,
				(nz / len) * r,
			];

			positions.set(node.path, pos);
			nodeColors.set(node.path, color);
			groupPositions.push(pos);
		}

		regions.push({
			points: groupPositions,
			nodePaths: group.map((n) => n.path),
			color,
			folder,
		});
	}

	return { positions, regions, nodeColors };
}

function tangent(x: number, y: number, z: number): [number, number, number] {
	const up: [number, number, number] = Math.abs(y) < 0.9 ? [0, 1, 0] : [1, 0, 0];
	const t = cross([x, y, z], up);
	const len = Math.sqrt(t[0] * t[0] + t[1] * t[1] + t[2] * t[2]) || 1;
	return [t[0] / len, t[1] / len, t[2] / len];
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	];
}

function vecDist(a: [number, number, number], b: [number, number, number]): number {
	const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
	return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
