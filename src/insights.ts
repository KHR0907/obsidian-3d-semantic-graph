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

/**
 * Rank all unlinked note pairs by cosine similarity and return the top `maxCount`.
 * Ranking (instead of an absolute threshold) stays meaningful across embedding
 * models whose similarity scales differ.
 */
export function computeSuggestedLinks(
	embeddings: Map<string, number[]>,
	existingLinks: GraphLink[],
	maxCount: number
): SuggestedLink[] {
	if (embeddings.size < 2 || embeddings.size > MAX_PAIRWISE_NODES || maxCount <= 0) return [];

	const { paths, vectors } = normalizeVectors(embeddings);
	const linked = buildLinkKeySet(existingLinks);
	const suggestions: SuggestedLink[] = [];

	for (let i = 0; i < paths.length; i++) {
		for (let j = i + 1; j < paths.length; j++) {
			if (linked.has(pairKey(paths[i], paths[j]))) continue;
			const similarity = dot(vectors[i], vectors[j]);
			if (suggestions.length < maxCount) {
				suggestions.push({ source: paths[i], target: paths[j], similarity });
				if (suggestions.length === maxCount) {
					suggestions.sort((a, b) => b.similarity - a.similarity);
				}
				continue;
			}
			if (similarity <= suggestions[maxCount - 1].similarity) continue;
			suggestions[maxCount - 1] = { source: paths[i], target: paths[j], similarity };
			let k = maxCount - 1;
			while (k > 0 && suggestions[k].similarity > suggestions[k - 1].similarity) {
				const tmp = suggestions[k];
				suggestions[k] = suggestions[k - 1];
				suggestions[k - 1] = tmp;
				k--;
			}
		}
	}

	suggestions.sort((a, b) => b.similarity - a.similarity);
	return suggestions;
}

/** Near-identical note pairs (cosine similarity at or above the threshold). */
export function computeDuplicates(
	embeddings: Map<string, number[]>,
	threshold: number = DUPLICATE_SIMILARITY_THRESHOLD
): DuplicatePair[] {
	if (embeddings.size < 2 || embeddings.size > MAX_PAIRWISE_NODES) return [];

	const { paths, vectors } = normalizeVectors(embeddings);
	const duplicates: DuplicatePair[] = [];

	for (let i = 0; i < paths.length; i++) {
		for (let j = i + 1; j < paths.length; j++) {
			const similarity = dot(vectors[i], vectors[j]);
			if (similarity >= threshold) {
				duplicates.push({ a: paths[i], b: paths[j], similarity });
			}
		}
	}

	duplicates.sort((a, b) => b.similarity - a.similarity);
	return duplicates;
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
