import { App, TFile } from "obsidian";
import { createEmbeddingProviderAdapter } from "./embedding-adapters";
import {
	EmbeddingCache,
	EmbeddingCacheEntry,
	getEmbeddingCacheModelId,
	isPathExcluded,
	PluginSettings,
} from "./types";

const CACHE_FILE = "embeddings-cache.json";
const CACHE_VERSION = 1;
const MAX_TOKENS_APPROX = 8000; // rough char limit (~4 chars per token)

export class EmbeddingService {
	private app: App;
	private settings: PluginSettings;
	private pluginDir: string;
	private cache: EmbeddingCache;

	constructor(app: App, settings: PluginSettings, pluginDir: string) {
		this.app = app;
		this.settings = settings;
		this.pluginDir = pluginDir;
		this.cache = { modelId: getEmbeddingCacheModelId(settings), version: CACHE_VERSION, entries: {} };
	}

	async loadCache(): Promise<void> {
		try {
			const path = `${this.pluginDir}/${CACHE_FILE}`;
			const adapter = this.app.vault.adapter;
			if (await adapter.exists(path)) {
				const data = await adapter.read(path);
				const parsed: EmbeddingCache = JSON.parse(data);
				if (parsed.modelId === getEmbeddingCacheModelId(this.settings) && parsed.version === CACHE_VERSION) {
					this.cache = parsed;
				} else {
					this.cache = { modelId: getEmbeddingCacheModelId(this.settings), version: CACHE_VERSION, entries: {} };
				}
			}
		} catch {
			this.cache = { modelId: getEmbeddingCacheModelId(this.settings), version: CACHE_VERSION, entries: {} };
		}
	}

	async saveCache(): Promise<void> {
		const path = `${this.pluginDir}/${CACHE_FILE}`;
		await this.app.vault.adapter.write(path, JSON.stringify(this.cache));
	}

	async getEmbeddings(
		onProgress?: (current: number, total: number) => void
	): Promise<Map<string, number[]>> {
		await this.loadCache();

		const files = this.getEligibleFiles();
		const result = new Map<string, number[]>();

		const filePaths = new Set(files.map((f) => f.path));
		for (const cachedPath of Object.keys(this.cache.entries)) {
			if (!filePaths.has(cachedPath)) {
				delete this.cache.entries[cachedPath];
			}
		}

		const toEmbed: { file: TFile; text: string; contentHash: string }[] = [];
		for (const file of files) {
			const content = await this.app.vault.cachedRead(file);
			const hash = this.hashContent(content);
			const cached = this.cache.entries[file.path];
			if (cached && cached.contentHash === hash) {
				result.set(file.path, cached.embedding);
				continue;
			}

			const cleaned = this.extractText(content);
			if (cleaned.length > 0) {
				toEmbed.push({ file, text: cleaned, contentHash: hash });
			}
		}

		if (toEmbed.length === 0) {
			onProgress?.(files.length, files.length);
			return result;
		}

		const adapter = createEmbeddingProviderAdapter(this.settings);
		let completed = result.size;
		const total = result.size + toEmbed.length;
		onProgress?.(completed, total);

		for (let i = 0; i < toEmbed.length; i += adapter.batchSize) {
			const batch = toEmbed.slice(i, i + adapter.batchSize);
			const embeddings = await adapter.embed(batch.map((item) => item.text));

			for (let j = 0; j < batch.length; j++) {
				const { file, contentHash } = batch[j];
				const entry: EmbeddingCacheEntry = {
					contentHash,
					embedding: embeddings[j],
					lastModified: file.stat.mtime,
				};
				this.cache.entries[file.path] = entry;
				result.set(file.path, embeddings[j]);
			}

			completed += batch.length;
			onProgress?.(completed, total);
		}

		await this.saveCache();
		return result;
	}

	private getEligibleFiles(): TFile[] {
		return this.app.vault.getMarkdownFiles().filter((file) => {
			return !isPathExcluded(file.path, this.settings.excludeFolders);
		});
	}

	extractText(content: string): string {
		let text = content;
		text = text.replace(/^---[\s\S]*?---\n?/, "");
		text = text.replace(/```[\s\S]*?```/g, "");
		text = text.replace(/`[^`]*`/g, "");
		text = text.replace(/!\[.*?\]\(.*?\)/g, "");
		text = text.replace(/\[([^\]]*)\]\(.*?\)/g, "$1");
		text = text.replace(/\[\[([^\]|]*?)(?:\|([^\]]*?))?\]\]/g, (_, target, alias) => alias || target);
		text = text.replace(/<[^>]+>/g, "");
		text = text.replace(/^#{1,6}\s+/gm, "");
		text = text.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1");
		text = text.replace(/\s+/g, " ").trim();
		if (text.length > MAX_TOKENS_APPROX) {
			text = text.substring(0, MAX_TOKENS_APPROX);
		}
		return text;
	}

	private hashContent(content: string): string {
		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i);
			hash = ((hash << 5) - hash + char) | 0;
		}
		return hash.toString(36);
	}
}
