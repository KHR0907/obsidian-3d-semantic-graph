export type EmbeddingProvider = "openai" | "ollama";

export type SceneThemeSetting = "auto" | "dark" | "light";

export const GRAPH_GROUP_COLORS: readonly string[] = [
	"#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#8b5cf6",
	"#ef4444", "#22c55e", "#3b82f6", "#f97316", "#06b6d4",
];

export interface PluginSettings {
	embeddingProvider: EmbeddingProvider;
	embeddingApiKey: string;
	embeddingModel: string;
	ollamaEndpoint: string;
	uploadedVectorsFileName: string;
	suggestedLinkCount: number;
	neighborCount: number;
	projectionMethod: "umap" | "pca";
	umapNNeighbors: number;
	umapMinDist: number;
	nodeColorBy: "folder" | "tag";
	showLinks: boolean;
	showGrid: boolean;
	showClusters: "on" | "hover" | "off";
	sceneTheme: SceneThemeSetting;
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
		embeddingProvider: "openai",
		embeddingApiKey: "",
		embeddingModel: "text-embedding-3-large",
		ollamaEndpoint: "http://localhost:11434",
		uploadedVectorsFileName: "",
		suggestedLinkCount: 20,
		neighborCount: 10,
		projectionMethod: "umap",
		umapNNeighbors: 40,
		umapMinDist: 0.8,
		nodeColorBy: "folder",
		showLinks: false,
		showGrid: true,
		showClusters: "hover",
		sceneTheme: "auto",
		nodeOpacity: 1,
		nodeSizeScale: 1.5,
		dragSensitivity: 1,
		autoOrbitSpeed: 0.2,
		layoutSeed: generateRandomLayoutSeed(),
		excludeFolders: [],
	};
}

export function clonePluginSettings(settings: PluginSettings): PluginSettings {
	return {
		...settings,
		excludeFolders: [...settings.excludeFolders],
	};
}

export const EMBEDDING_PROVIDER_LABELS: Record<EmbeddingProvider, string> = {
	openai: "OpenAI",
	ollama: "Ollama (local)",
};

export const PRESET_EMBEDDING_MODELS: Record<EmbeddingProvider, readonly string[]> = {
	openai: [
		"text-embedding-3-small",
		"text-embedding-3-large",
		"text-embedding-ada-002",
	],
	ollama: [
		"nomic-embed-text",
		"mxbai-embed-large",
		"bge-m3",
	],
};

export function getDefaultEmbeddingModel(provider: EmbeddingProvider): string {
	return PRESET_EMBEDDING_MODELS[provider][0] ?? "";
}

export function isPresetEmbeddingModel(provider: EmbeddingProvider, model: string): boolean {
	return PRESET_EMBEDDING_MODELS[provider].includes(model);
}

export function getEffectiveEmbeddingModel(settings: PluginSettings): string {
	return settings.embeddingModel;
}

export function getEmbeddingCacheModelId(settings: PluginSettings): string {
	return `${settings.embeddingProvider}::${settings.embeddingModel}`;
}

export function canGenerateEmbeddings(settings: PluginSettings): boolean {
	if (settings.uploadedVectorsFileName.trim()) {
		return true;
	}
	if (settings.embeddingProvider === "ollama") {
		return Boolean(settings.ollamaEndpoint.trim());
	}
	return Boolean(settings.embeddingApiKey.trim());
}

export function getNodePath(nodeRef: string | GraphNode): string | null {
	if (typeof nodeRef === "string") return nodeRef;
	return nodeRef?.path ?? nodeRef?.id ?? null;
}

export function isPathExcluded(path: string, excludeFolders: string[]): boolean {
	return excludeFolders.some(
		(folder) => path.startsWith(`${folder}/`) || path === folder
	);
}

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
	ctime?: number;
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
