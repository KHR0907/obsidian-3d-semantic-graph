export type EmbeddingProvider = "openai" | "gemini" | "cohere" | "voyage" | "custom";

export interface PluginSettings {
	embeddingProvider: EmbeddingProvider;
	embeddingApiKey: string;
	embeddingModel: string;
	useCustomEmbeddingModel: boolean;
	customEmbeddingModel: string;
	customEmbeddingEndpoint: string;
	uploadedVectorsFileName: string;
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
		embeddingProvider: "openai",
		embeddingApiKey: "",
		embeddingModel: "text-embedding-3-large",
		useCustomEmbeddingModel: false,
		customEmbeddingModel: "",
		customEmbeddingEndpoint: "",
		uploadedVectorsFileName: "",
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

export const EMBEDDING_PROVIDER_LABELS: Record<EmbeddingProvider, string> = {
	openai: "OpenAI",
	gemini: "Google Gemini",
	cohere: "Cohere",
	voyage: "Voyage AI",
	custom: "Custom",
};

export const PRESET_EMBEDDING_MODELS: Record<EmbeddingProvider, readonly string[]> = {
	openai: [
		"text-embedding-3-small",
		"text-embedding-3-large",
		"text-embedding-ada-002",
	],
	gemini: [
		"gemini-embedding-001",
		"gemini-embedding-2-preview",
	],
	cohere: [
		"embed-v4.0",
		"embed-english-v3.0",
		"embed-multilingual-v3.0",
	],
	voyage: [
		"voyage-4-lite",
		"voyage-4",
		"voyage-4-large",
		"voyage-code-3",
	],
	custom: [],
};

export function getDefaultEmbeddingModel(provider: EmbeddingProvider): string {
	return PRESET_EMBEDDING_MODELS[provider][0] ?? "";
}

export function isPresetEmbeddingModel(provider: EmbeddingProvider, model: string): boolean {
	return PRESET_EMBEDDING_MODELS[provider].includes(model);
}

export function getEffectiveEmbeddingModel(settings: PluginSettings): string {
	const customModel = settings.customEmbeddingModel.trim();
	return settings.useCustomEmbeddingModel
		? customModel || settings.embeddingModel
		: settings.embeddingModel;
}

export function getEmbeddingCacheModelId(settings: PluginSettings): string {
	const endpoint = settings.embeddingProvider === "custom"
		? settings.customEmbeddingEndpoint.trim()
		: "";
	return `${settings.embeddingProvider}:${endpoint}:${getEffectiveEmbeddingModel(settings)}`;
}

export function canGenerateEmbeddings(settings: PluginSettings): boolean {
	if (settings.uploadedVectorsFileName.trim()) {
		return Boolean(settings.uploadedVectorsFileName.trim());
	}
	if (settings.embeddingProvider === "custom") {
		return Boolean(settings.customEmbeddingEndpoint.trim() && getEffectiveEmbeddingModel(settings).trim());
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
