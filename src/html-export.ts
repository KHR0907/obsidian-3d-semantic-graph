import { GraphData, getNodePath } from "./types";
import { t } from "./i18n";

export interface GraphExportOptions {
	vaultName: string;
	sceneTheme: "dark" | "light";
}

const FORCE_GRAPH_CDN = "https://unpkg.com/3d-force-graph@1.73.0/dist/3d-force-graph.min.js";

// Link alphas match the live scene's blended-visibility floor (see SCENE_THEMES
// in graph-scene-renderer.ts): recessive but clearly separable from the backdrop.
const EXPORT_THEMES = {
	dark: { background: "#0f172a", text: "#e2e8f0", link: "rgba(174, 188, 205, 0.5)" },
	light: { background: "#f8fafc", text: "#0f172a", link: "rgba(82, 96, 117, 0.5)" },
} as const;

interface ExportNode {
	id: string;
	name: string;
	path: string;
	color: string;
	size: number;
	x: number;
	y: number;
	z: number;
	fx: number;
	fy: number;
	fz: number;
}

/**
 * Build a standalone HTML document reproducing the current graph. Positions are
 * baked in; the 3d-force-graph library is loaded from a CDN, so viewing the file
 * requires an internet connection. Node clicks deep-link back into the vault.
 */
export function buildGraphExportHtml(data: GraphData, options: GraphExportOptions): string {
	const theme = EXPORT_THEMES[options.sceneTheme];

	const nodes: ExportNode[] = [];
	for (const node of data.nodes) {
		if (node.x == null || node.y == null || node.z == null) continue;
		nodes.push({
			id: node.id,
			name: node.name,
			path: node.path,
			color: node.color,
			size: node.size,
			x: node.x,
			y: node.y,
			z: node.z,
			fx: node.x,
			fy: node.y,
			fz: node.z,
		});
	}

	const nodeIds = new Set(nodes.map((node) => node.id));
	const links: { source: string; target: string }[] = [];
	for (const link of data.links) {
		// The live force-graph mutates link endpoints into node object references.
		const source = getNodePath(link.source);
		const target = getNodePath(link.target);
		if (source && target && nodeIds.has(source) && nodeIds.has(target)) {
			links.push({ source, target });
		}
	}

	const payload = serializeForScriptTag({ nodes, links });
	const vaultName = serializeForScriptTag(options.vaultName);
	const exportedAt = new Date().toISOString().slice(0, 10);

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>3D Semantic Graph — ${escapeHtml(options.vaultName)}</title>
<style>
	html, body { margin: 0; height: 100%; overflow: hidden; background: ${theme.background}; }
	#info {
		position: fixed; top: 12px; left: 16px; z-index: 10;
		font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
		color: ${theme.text}; opacity: 0.8; pointer-events: none;
	}
	#info strong { font-size: 15px; }
	.scene-tooltip { font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
</style>
</head>
<body>
<div id="info">
	<strong>${escapeHtml(options.vaultName)}</strong><br>
	${escapeHtml(t("export.stats", { notes: nodes.length, links: links.length, date: exportedAt }))}<br>
	${escapeHtml(t("export.clickHint"))}
</div>
<div id="graph"></div>
<script src="${FORCE_GRAPH_CDN}"></script>
<script>
const data = ${payload};
const vaultName = ${vaultName};
const graph = ForceGraph3D()(document.getElementById("graph"))
	.width(window.innerWidth)
	.height(window.innerHeight)
	.backgroundColor("${theme.background}")
	.graphData(data)
	.nodeLabel((node) => node.name)
	.nodeColor((node) => node.color)
	.nodeVal((node) => node.size)
	.nodeOpacity(0.95)
	.linkColor(() => "${theme.link}")
	.linkOpacity(1)
	.linkWidth(0.5)
	.enableNodeDrag(false)
	.cooldownTicks(0)
	.onNodeClick((node) => {
		window.location.href =
			"obsidian://open?vault=" + encodeURIComponent(vaultName) +
			"&file=" + encodeURIComponent(node.path);
	});
window.addEventListener("resize", () => {
	graph.width(window.innerWidth).height(window.innerHeight);
});
</script>
</body>
</html>
`;
}

/** JSON-stringify for embedding inside a <script> tag without closing it early. */
function serializeForScriptTag(value: unknown): string {
	return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
