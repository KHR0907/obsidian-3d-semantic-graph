export class PcaReducer {
	async reduce(
		embeddings: number[][],
		onProgress?: (step: number, totalSteps: number) => void
	): Promise<number[][]> {
		const sampleCount = embeddings.length;
		if (sampleCount === 0) return [];
		if (sampleCount === 1) return [[0, 0, 0]];
		if (sampleCount === 2) {
			return [
				[-1, 0, 0],
				[1, 0, 0],
			];
		}

		const dimension = embeddings[0]?.length ?? 0;
		if (dimension === 0) return embeddings.map(() => [0, 0, 0]);

		const centered = this.centerEmbeddings(embeddings, dimension);
		const componentCount = Math.min(3, dimension);
		const iterations = 24;
		const basis: number[][] = [];

		for (let componentIndex = 0; componentIndex < componentCount; componentIndex++) {
			let vector = this.createSeedVector(dimension, componentIndex);

			for (let iteration = 0; iteration < iterations; iteration++) {
				let next = this.applyCovariance(centered, vector);
				next = this.orthogonalize(next, basis);
				const norm = this.normalize(next);

				if (norm === 0) {
					next = this.createFallbackVector(dimension, basis);
					this.normalize(next);
				}

				vector = next;
				onProgress?.(componentIndex * iterations + iteration + 1, componentCount * iterations);
			}

			basis.push(vector);
		}

		const projected = centered.map((row) => {
			const coords = basis.map((component) => this.dot(row, component));
			while (coords.length < 3) coords.push(0);
			return coords;
		});

		onProgress?.(componentCount * iterations, componentCount * iterations);
		return projected;
	}

	private centerEmbeddings(embeddings: number[][], dimension: number): number[][] {
		const means = new Array<number>(dimension).fill(0);

		for (const row of embeddings) {
			for (let i = 0; i < dimension; i++) {
				means[i] += row[i];
			}
		}

		for (let i = 0; i < dimension; i++) {
			means[i] /= embeddings.length;
		}

		return embeddings.map((row) => row.map((value, i) => value - means[i]));
	}

	private applyCovariance(centered: number[][], vector: number[]): number[] {
		const scores = centered.map((row) => this.dot(row, vector));
		const result = new Array<number>(vector.length).fill(0);

		for (let rowIndex = 0; rowIndex < centered.length; rowIndex++) {
			const row = centered[rowIndex];
			const score = scores[rowIndex];
			for (let i = 0; i < result.length; i++) {
				result[i] += row[i] * score;
			}
		}

		return result;
	}

	private orthogonalize(vector: number[], basis: number[][]): number[] {
		const result = [...vector];

		for (const component of basis) {
			const projection = this.dot(result, component);
			for (let i = 0; i < result.length; i++) {
				result[i] -= component[i] * projection;
			}
		}

		return result;
	}

	private normalize(vector: number[]): number {
		const norm = Math.sqrt(this.dot(vector, vector));
		if (norm === 0) return 0;
		for (let i = 0; i < vector.length; i++) {
			vector[i] /= norm;
		}
		return norm;
	}

	private createSeedVector(dimension: number, offset: number): number[] {
		const vector = new Array<number>(dimension).fill(0);
		for (let i = 0; i < dimension; i++) {
			vector[i] = Math.sin((i + 1) * (offset + 1) * 1.61803398875);
		}
		return vector;
	}

	private createFallbackVector(dimension: number, basis: number[][]): number[] {
		const vector = new Array<number>(dimension).fill(0);

		for (let i = 0; i < dimension; i++) {
			vector[i] = 1;
			const candidate = this.orthogonalize(vector, basis);
			if (this.normalize(candidate) > 0) return candidate;
			vector[i] = 0;
		}

		return vector;
	}

	private dot(a: number[], b: number[]): number {
		let sum = 0;
		for (let i = 0; i < a.length; i++) {
			sum += a[i] * b[i];
		}
		return sum;
	}
}
