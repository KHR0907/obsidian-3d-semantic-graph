import { UMAP } from "umap-js";
import { createSeededRandom } from "./seeded-rng";

export interface UmapOptions {
	nNeighbors: number;
	minDist: number;
	seed: number;
}

export class UmapReducer {
	private options: UmapOptions;

	constructor(options: UmapOptions) {
		this.options = options;
	}

	/**
	 * Reduce high-dimensional embeddings to 3D coordinates.
	 * Returns array of [x, y, z] in the same order as input.
	 */
	reduce(
		embeddings: number[][],
		onProgress?: (epoch: number, totalEpochs: number) => void
	): number[][] {
		const n = embeddings.length;

		// Edge cases: fewer than 3 points
		if (n === 0) return [];
		if (n === 1) return [[0, 0, 0]];
		if (n === 2) {
			return [
				[-1, 0, 0],
				[1, 0, 0],
			];
		}

		const nNeighbors = Math.min(this.options.nNeighbors, n - 1);
		const random = createSeededRandom(this.options.seed);

		const umap = new UMAP({
			nComponents: 3,
			nNeighbors,
			minDist: this.options.minDist,
			distanceFn: cosineDistance,
			nEpochs: 200,
			random,
		});

		const totalEpochs = umap.initializeFit(embeddings);
		for (let i = 0; i < totalEpochs; i++) {
			umap.step();
			if (onProgress && i % 10 === 0) {
				onProgress(i, totalEpochs);
			}
		}
		onProgress?.(totalEpochs, totalEpochs);

		return umap.getEmbedding();
	}
}

/** Cosine distance = 1 - cosine_similarity */
function cosineDistance(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	if (denom === 0) return 1;
	return 1 - dot / denom;
}
