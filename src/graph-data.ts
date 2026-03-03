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
	settings: PluginSettings
): GraphData {
	const nodes: GraphNode[] = [];
	const colorMap = new Map<string, string>();
	let colorIndex = 0;

	const files = app.vault.getMarkdownFiles().filter((file) => {
		return !settings.excludeFolders.some(
			(folder) => file.path.startsWith(folder + "/") || file.path === folder
		);
	});

	const nodeSet = new Set<string>();

	for (const file of files) {
		const groupKey = getGroupKey(app, file, settings.nodeColorBy);
		if (!colorMap.has(groupKey)) {
			colorMap.set(groupKey, FOLDER_COLORS[colorIndex % FOLDER_COLORS.length]);
			colorIndex++;
		}

		const stat = file.stat;
		const size = Math.max(2, Math.min(8, Math.log2(stat.size / 100 + 1) + 2));

		nodes.push({
			id: file.path,
			name: file.basename,
			path: file.path,
			color: colorMap.get(groupKey)!,
			size,
		});

		nodeSet.add(file.path);
	}

	// Build links from Obsidian's actual wiki-links
	const links: GraphLink[] = [];
	const resolvedLinks = app.metadataCache.resolvedLinks;
	const seen = new Set<string>();

	for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
		if (!nodeSet.has(sourcePath)) continue;
		for (const targetPath of Object.keys(targets)) {
			if (!nodeSet.has(targetPath)) continue;
			const key = [sourcePath, targetPath].sort().join("|");
			if (seen.has(key)) continue;
			seen.add(key);
			links.push({ source: sourcePath, target: targetPath, similarity: 1 });
		}
	}

	return { nodes, links };
}

function getGroupKey(app: App, file: TFile, colorBy: "folder" | "tag"): string {
	if (colorBy === "tag") {
		const cache = app.metadataCache.getFileCache(file);
		if (cache?.tags && cache.tags.length > 0) return cache.tags[0].tag;
		if (cache?.frontmatter?.tags) {
			const tags = cache.frontmatter.tags;
			if (Array.isArray(tags) && tags.length > 0) return "#" + tags[0];
			if (typeof tags === "string") return "#" + tags;
		}
		return "(untagged)";
	}
	return file.parent?.path || "/";
}
