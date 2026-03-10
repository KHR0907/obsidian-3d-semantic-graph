export interface PluginSettings {
	openaiApiKey: string;
	embeddingModel: string;
	projectionMethod: "umap" | "pca";
	sphereizeData: boolean;
	umapNNeighbors: number;
	umapMinDist: number;
	nodeColorBy: "folder" | "tag";
	showLinks: boolean;
	showGrid: boolean;
	sceneTheme: "dark" | "light";
	nodeOpacity: number;
	nodeSizeScale: number;
	dragSensitivity: number;
	autoOrbitSpeed: number;
	layoutSeed: number;
	excludeFolders: string[];
}

export function generateRandomLayoutSeed(): number {
	return Math.floor(Math.random() * 2147483647);
}

export function createDefaultSettings(): PluginSettings {
	return {
		openaiApiKey: "",
		embeddingModel: "text-embedding-3-large",
		projectionMethod: "umap",
		sphereizeData: false,
		umapNNeighbors: 30,
		umapMinDist: 0.8,
		nodeColorBy: "folder",
		showLinks: false,
		showGrid: true,
		sceneTheme: "light",
		nodeOpacity: 1,
		nodeSizeScale: 1.5,
		dragSensitivity: 1,
		autoOrbitSpeed: 0.2,
		layoutSeed: generateRandomLayoutSeed(),
		excludeFolders: [],
	};
}

export const DEFAULT_SETTINGS: PluginSettings = createDefaultSettings();

export interface GraphVisualOptions {
	sceneTheme: "dark" | "light";
	nodeOpacity: number;
	nodeSizeScale: number;
	dragSensitivity: number;
	showGrid: boolean;
	autoOrbitSpeed: number;
	sceneExtent: number;
}

export interface EmbeddingCacheEntry {
	contentHash: string;
	embedding: number[];
	lastModified: number;
}

export interface EmbeddingCache {
	modelId: string;
	version: number;
	entries: Record<string, EmbeddingCacheEntry>;
}

export interface GraphNode {
	id: string;
	name: string;
	path: string;
	color: string;
	size: number;
	x?: number;
	y?: number;
	z?: number;
	fx?: number;
	fy?: number;
	fz?: number;
}

export interface GraphLink {
	source: string;
	target: string;
}

export interface GraphData {
	nodes: GraphNode[];
	links: GraphLink[];
}
