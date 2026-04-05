export type EmbeddingProvider = "openai";

export interface PluginSettings {
	embeddingProvider: EmbeddingProvider;
	embeddingApiKey: string;
	embeddingModel: string;
	uploadedVectorsFileName: string;
	projectionMethod: "umap" | "pca";
	umapNNeighbors: number;
	umapMinDist: number;
	nodeColorBy: "folder" | "tag";
	showLinks: boolean;
	showGrid: boolean;
	showClusters: "on" | "hover" | "off";
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
		embeddingProvider: "openai",
		embeddingApiKey: "",
		embeddingModel: "text-embedding-3-large",
		uploadedVectorsFileName: "",
		projectionMethod: "umap",
		umapNNeighbors: 40,
		umapMinDist: 0.8,
		nodeColorBy: "folder",
		showLinks: false,
		showGrid: true,
		showClusters: "hover",
		sceneTheme: "light",
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

export const DEFAULT_SETTINGS: PluginSettings = createDefaultSettings();

export const EMBEDDING_PROVIDER_LABELS: Record<EmbeddingProvider, string> = {
	openai: "OpenAI",
};

export const PRESET_EMBEDDING_MODELS: Record<EmbeddingProvider, readonly string[]> = {
	openai: [
		"text-embedding-3-small",
		"text-embedding-3-large",
		"text-embedding-ada-002",
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
	return Boolean(settings.embeddingApiKey.trim());
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
