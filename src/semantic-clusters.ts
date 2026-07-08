import { createSeededRandom } from "./seeded-rng";
import { ClusterRegion } from "./clustered-sphere-layout";
import { GRAPH_GROUP_COLORS, GraphNode } from "./types";

export interface SemanticCluster {
	label: string;
	nodePaths: string[];
}

/** ConvexHull regions from semantic cluster groups over already-positioned nodes. */
export function buildSemanticClusterRegions(nodes: GraphNode[], clusters: SemanticCluster[]): ClusterRegion[] {
	const nodeByPath = new Map(nodes.map((node) => [node.path, node]));
	const regions: ClusterRegion[] = [];
	clusters.forEach((cluster, i) => {
		const points: [number, number, number][] = [];
		const nodePaths: string[] = [];
		for (const path of cluster.nodePaths) {
			const node = nodeByPath.get(path);
			if (node && node.x != null && node.y != null && node.z != null) {
				points.push([node.x, node.y, node.z]);
				nodePaths.push(path);
			}
		}
		if (points.length > 0) {
			regions.push({
				points,
				nodePaths,
				color: GRAPH_GROUP_COLORS[i % GRAPH_GROUP_COLORS.length],
				folder: cluster.label,
				mocFolder: "",
			});
		}
	});
	return regions;
}

export interface ClusterNoteMeta {
	path: string;
	name: string;
	tags: string[];
}

const KMEANS_MAX_ITERATIONS = 15;
const MIN_CLUSTERS = 3;
const MAX_CLUSTERS = 12;
const LABEL_TERMS = 3;
const MIN_TOKEN_LENGTH = 2;

// Tokens that appear in many note titles but carry no topical meaning.
const STOPWORDS = new Set([
	"the", "and", "for", "with", "from", "into", "about", "notes", "note",
	"draft", "todo", "index", "moc", "untitled",
	"그리고", "대한", "대해", "관한", "위한", "정리", "노트", "메모", "관련",
]);

/**
 * Seeded k-means over normalized embedding vectors, labeled by the top TF-IDF
 * terms of each cluster's note titles and tags. Deterministic for a given
 * (embeddings, seed) pair so cached layouts stay reproducible.
 */
export function computeSemanticClusters(
	embeddings: Map<string, number[]>,
	notesMeta: Map<string, ClusterNoteMeta>,
	seed: number
): SemanticCluster[] {
	const paths: string[] = [];
	const vectors: Float64Array[] = [];
	for (const [path, vector] of embeddings) {
		const normalized = normalize(vector);
		if (!normalized) continue;
		paths.push(path);
		vectors.push(normalized);
	}
	if (paths.length < MIN_CLUSTERS) return [];

	const k = Math.max(MIN_CLUSTERS, Math.min(MAX_CLUSTERS, Math.round(Math.sqrt(paths.length / 2))));
	const assignments = runKMeans(vectors, k, seed);

	const groups = new Map<number, string[]>();
	assignments.forEach((cluster, i) => {
		if (!groups.has(cluster)) groups.set(cluster, []);
		groups.get(cluster)!.push(paths[i]);
	});

	const clusterTokenLists: string[][] = [];
	const clusterPaths: string[][] = [];
	for (const group of groups.values()) {
		if (group.length === 0) continue;
		clusterPaths.push(group);
		clusterTokenLists.push(group.flatMap((path) => tokensForNote(notesMeta.get(path))));
	}

	const labels = labelClusters(clusterTokenLists);
	return clusterPaths.map((nodePaths, i) => ({
		label: labels[i] || `Cluster ${i + 1}`,
		nodePaths,
	}));
}

function normalize(vector: number[]): Float64Array | null {
	let norm = 0;
	for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i];
	norm = Math.sqrt(norm);
	if (norm === 0) return null;
	const out = new Float64Array(vector.length);
	for (let i = 0; i < vector.length; i++) out[i] = vector[i] / norm;
	return out;
}

/** k-means++ seeding followed by Lloyd iterations, all driven by a seeded RNG. */
function runKMeans(vectors: Float64Array[], k: number, seed: number): number[] {
	const rng = createSeededRandom(seed);
	const dim = vectors[0].length;

	const centroids: Float64Array[] = [vectors[Math.floor(rng() * vectors.length)].slice()];
	while (centroids.length < k) {
		const distances = vectors.map((v) => {
			let best = Infinity;
			for (const c of centroids) best = Math.min(best, squaredDistance(v, c));
			return best;
		});
		const total = distances.reduce((sum, d) => sum + d, 0);
		if (total === 0) {
			centroids.push(vectors[Math.floor(rng() * vectors.length)].slice());
			continue;
		}
		let target = rng() * total;
		let picked = vectors.length - 1;
		for (let i = 0; i < distances.length; i++) {
			target -= distances[i];
			if (target <= 0) {
				picked = i;
				break;
			}
		}
		centroids.push(vectors[picked].slice());
	}

	let assignments = new Array<number>(vectors.length).fill(0);
	for (let iter = 0; iter < KMEANS_MAX_ITERATIONS; iter++) {
		let changed = false;
		for (let i = 0; i < vectors.length; i++) {
			let best = 0;
			let bestDist = Infinity;
			for (let c = 0; c < centroids.length; c++) {
				const dist = squaredDistance(vectors[i], centroids[c]);
				if (dist < bestDist) {
					bestDist = dist;
					best = c;
				}
			}
			if (assignments[i] !== best) {
				assignments[i] = best;
				changed = true;
			}
		}
		if (!changed) break;

		const sums = centroids.map(() => new Float64Array(dim));
		const counts = new Array<number>(centroids.length).fill(0);
		for (let i = 0; i < vectors.length; i++) {
			const c = assignments[i];
			counts[c]++;
			const sum = sums[c];
			const v = vectors[i];
			for (let d = 0; d < dim; d++) sum[d] += v[d];
		}
		for (let c = 0; c < centroids.length; c++) {
			if (counts[c] === 0) continue;
			const centroid = centroids[c];
			const sum = sums[c];
			for (let d = 0; d < dim; d++) centroid[d] = sum[d] / counts[c];
		}
	}
	return assignments;
}

function squaredDistance(a: Float64Array, b: Float64Array): number {
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		const diff = a[i] - b[i];
		sum += diff * diff;
	}
	return sum;
}

function tokensForNote(meta: ClusterNoteMeta | undefined): string[] {
	if (!meta) return [];
	const raw = [meta.name, ...meta.tags.map((tag) => tag.replace(/^#/, ""))].join(" ");
	return raw
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter((token) => token.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(token) && !/^\d+$/.test(token));
}

/** Top TF-IDF terms per cluster, treating each cluster's token bag as one document. */
function labelClusters(clusterTokenLists: string[][]): string[] {
	const docCount = clusterTokenLists.length;
	const docFrequency = new Map<string, number>();
	for (const tokens of clusterTokenLists) {
		for (const token of new Set(tokens)) {
			docFrequency.set(token, (docFrequency.get(token) ?? 0) + 1);
		}
	}

	return clusterTokenLists.map((tokens) => {
		const termFrequency = new Map<string, number>();
		for (const token of tokens) {
			termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
		}
		const scored = Array.from(termFrequency.entries()).map(([token, tf]) => {
			const df = docFrequency.get(token) ?? 1;
			return { token, score: tf * Math.log(1 + docCount / df) };
		});
		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, LABEL_TERMS).map((entry) => entry.token).join(" · ");
	});
}
