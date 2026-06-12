import { GraphLink, GraphNode, getNodePath } from "./types";

export interface SuggestedLink {
	source: string;
	target: string;
	similarity: number;
}

export interface DuplicatePair {
	a: string;
	b: string;
	similarity: number;
}

export interface NeighborEntry {
	path: string;
	similarity: number;
}

export const DUPLICATE_SIMILARITY_THRESHOLD = 0.93;

/** Pairwise scans are O(n²·d); above this node count we skip them to keep the UI responsive. */
export const MAX_PAIRWISE_NODES = 3000;

export function cosineSimilarity(a: number[], b: number[]): number {
	const length = Math.min(a.length, b.length);
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom > 0 ? dot / denom : 0;
}

function normalizeVectors(embeddings: Map<string, number[]>): { paths: string[]; vectors: Float64Array[] } {
	const paths: string[] = [];
	const vectors: Float64Array[] = [];
	for (const [path, vector] of embeddings) {
		let norm = 0;
		for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i];
		norm = Math.sqrt(norm);
		if (norm === 0) continue;
		const normalized = new Float64Array(vector.length);
		for (let i = 0; i < vector.length; i++) normalized[i] = vector[i] / norm;
		paths.push(path);
		vectors.push(normalized);
	}
	return { paths, vectors };
}

function dot(a: Float64Array, b: Float64Array): number {
	const length = Math.min(a.length, b.length);
	let sum = 0;
	for (let i = 0; i < length; i++) sum += a[i] * b[i];
	return sum;
}

export function buildLinkKeySet(links: GraphLink[]): Set<string> {
	const keys = new Set<string>();
	for (const link of links) {
		const source = getNodePath(link.source);
		const target = getNodePath(link.target);
		if (!source || !target) continue;
		keys.add(pairKey(source, target));
	}
	return keys;
}

export function pairKey(a: string, b: string): string {
	return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface PairInsights {
	suggestions: SuggestedLink[];
	duplicates: DuplicatePair[];
}

export interface PairInsightsOptions {
	duplicateThreshold?: number;
	/** Called with (pairsDone, pairsTotal) whenever the computation yields to the event loop. */
	onProgress?: (done: number, total: number) => void;
}

/** Budget per synchronous chunk before yielding back to the UI thread. */
const TIME_SLICE_MS = 14;

/**
 * Single pairwise pass producing both link suggestions (top `maxSuggestions`
 * unlinked pairs by cosine similarity) and near-duplicate pairs. Suggestions use
 * ranking instead of an absolute threshold because similarity scales differ per
 * embedding model. The loop yields to the event loop periodically so large
 * vaults do not freeze the UI.
 */
export async function computePairInsights(
	embeddings: Map<string, number[]>,
	existingLinks: GraphLink[],
	maxSuggestions: number,
	options: PairInsightsOptions = {}
): Promise<PairInsights> {
	const suggestions: SuggestedLink[] = [];
	const duplicates: DuplicatePair[] = [];
	if (embeddings.size < 2 || embeddings.size > MAX_PAIRWISE_NODES) {
		return { suggestions, duplicates };
	}

	const duplicateThreshold = options.duplicateThreshold ?? DUPLICATE_SIMILARITY_THRESHOLD;
	const { paths, vectors } = normalizeVectors(embeddings);
	const linked = buildLinkKeySet(existingLinks);
	const totalPairs = (paths.length * (paths.length - 1)) / 2;
	let pairsDone = 0;
	let sliceStart = performance.now();

	for (let i = 0; i < paths.length; i++) {
		for (let j = i + 1; j < paths.length; j++) {
			const similarity = dot(vectors[i], vectors[j]);
			if (similarity >= duplicateThreshold) {
				duplicates.push({ a: paths[i], b: paths[j], similarity });
			}
			if (maxSuggestions > 0 && !linked.has(pairKey(paths[i], paths[j]))) {
				insertTopSuggestion(suggestions, maxSuggestions, paths[i], paths[j], similarity);
			}
		}
		pairsDone += paths.length - 1 - i;

		if (performance.now() - sliceStart > TIME_SLICE_MS) {
			options.onProgress?.(pairsDone, totalPairs);
			await yieldToEventLoop();
			sliceStart = performance.now();
		}
	}

	options.onProgress?.(totalPairs, totalPairs);
	suggestions.sort((a, b) => b.similarity - a.similarity);
	duplicates.sort((a, b) => b.similarity - a.similarity);
	return { suggestions, duplicates };
}

/** Keep `suggestions` as a bounded list sorted descending by similarity. */
function insertTopSuggestion(
	suggestions: SuggestedLink[],
	maxCount: number,
	source: string,
	target: string,
	similarity: number
): void {
	if (suggestions.length < maxCount) {
		suggestions.push({ source, target, similarity });
		if (suggestions.length === maxCount) {
			suggestions.sort((a, b) => b.similarity - a.similarity);
		}
		return;
	}
	if (similarity <= suggestions[maxCount - 1].similarity) return;

	suggestions[maxCount - 1] = { source, target, similarity };
	let k = maxCount - 1;
	while (k > 0 && suggestions[k].similarity > suggestions[k - 1].similarity) {
		const tmp = suggestions[k];
		suggestions[k] = suggestions[k - 1];
		suggestions[k - 1] = tmp;
		k--;
	}
}

function yieldToEventLoop(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Notes with no resolved links in either direction. */
export function computeOrphans(nodes: GraphNode[], links: GraphLink[]): string[] {
	const connected = new Set<string>();
	for (const link of links) {
		const source = getNodePath(link.source);
		const target = getNodePath(link.target);
		if (source) connected.add(source);
		if (target) connected.add(target);
	}
	return nodes.filter((node) => !connected.has(node.path)).map((node) => node.path);
}

/** Top-N semantic neighbors of one note. */
export function computeNeighbors(
	embeddings: Map<string, number[]>,
	activePath: string,
	count: number
): NeighborEntry[] {
	const activeVector = embeddings.get(activePath);
	if (!activeVector || count <= 0) return [];

	const neighbors: NeighborEntry[] = [];
	for (const [path, vector] of embeddings) {
		if (path === activePath) continue;
		neighbors.push({ path, similarity: cosineSimilarity(activeVector, vector) });
	}
	neighbors.sort((a, b) => b.similarity - a.similarity);
	return neighbors.slice(0, count);
}
