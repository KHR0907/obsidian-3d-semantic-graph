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
	nodeAssetMode: "3d" | "2d";
	nodeOpacity: number;
	dragSensitivity: number;
	autoOrbitSpeed: number;
	layoutSeed: number;
	excludeFolders: string[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
	openaiApiKey: "",
	embeddingModel: "text-embedding-3-small",
	projectionMethod: "umap",
	sphereizeData: true,
	umapNNeighbors: 15,
	umapMinDist: 0.1,
	nodeColorBy: "folder",
	showLinks: true,
	showGrid: true,
	sceneTheme: "dark",
	nodeAssetMode: "3d",
	nodeOpacity: 0.9,
	dragSensitivity: 1,
	autoOrbitSpeed: 1,
	layoutSeed: 12345,
	excludeFolders: [],
};

export interface GraphVisualOptions {
	sceneTheme: "dark" | "light";
	nodeAssetMode: "3d" | "2d";
	nodeOpacity: number;
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
