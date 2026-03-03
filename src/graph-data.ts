import { App, TFile } from "obsidian";
import { GraphData, GraphNode, GraphLink, PluginSettings } from "./types";

const FOLDER_COLORS = [
	"#6366f1", // indigo
	"#ec4899", // pink
	"#14b8a6", // teal
	"#f59e0b", // amber
	"#8b5cf6", // violet
	"#ef4444", // red
	"#22c55e", // green
	"#3b82f6", // blue
	"#f97316", // orange
	"#06b6d4", // cyan
];

export function buildGraphData(
	app: App,
	settings: PluginSettings,
	embeddings: Map<string, number[]>,
	positions: Map<string, [number, number, number]>
): GraphData {
	const nodes: GraphNode[] = [];
	const colorMap = new Map<string, string>();
	let colorIndex = 0;

	// Build nodes
	for (const [path, embedding] of embeddings) {
		const file = app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) continue;

		const name = file.basename;
		const groupKey = getGroupKey(app, file, settings.nodeColorBy);

		if (!colorMap.has(groupKey)) {
			colorMap.set(groupKey, FOLDER_COLORS[colorIndex % FOLDER_COLORS.length]);
			colorIndex++;
		}

		const pos = positions.get(path);
		const stat = file.stat;
		const size = Math.max(2, Math.min(8, Math.log2(stat.size / 100 + 1) + 2));

		const node: GraphNode = {
			id: path,
			name,
			path,
			color: colorMap.get(groupKey)!,
			size,
		};

		if (pos) {
			node.x = pos[0];
			node.y = pos[1];
			node.z = pos[2];
		}

		nodes.push(node);
	}

	// Build links based on cosine similarity
	const links: GraphLink[] = [];
	const paths = Array.from(embeddings.keys());
	const vectors = paths.map((p) => embeddings.get(p)!);

	for (let i = 0; i < paths.length; i++) {
		for (let j = i + 1; j < paths.length; j++) {
			const sim = cosineSimilarity(vectors[i], vectors[j]);
			if (sim >= settings.similarityThreshold) {
				links.push({
					source: paths[i],
					target: paths[j],
					similarity: sim,
				});
			}
		}
	}

	return { nodes, links };
}

function getGroupKey(app: App, file: TFile, colorBy: "folder" | "tag"): string {
	if (colorBy === "tag") {
		const cache = app.metadataCache.getFileCache(file);
		if (cache?.tags && cache.tags.length > 0) {
			return cache.tags[0].tag;
		}
		if (cache?.frontmatter?.tags) {
			const tags = cache.frontmatter.tags;
			if (Array.isArray(tags) && tags.length > 0) return "#" + tags[0];
			if (typeof tags === "string") return "#" + tags;
		}
		return "(untagged)";
	}
	// folder
	return file.parent?.path || "/";
}

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	if (denom === 0) return 0;
	return dot / denom;
}
