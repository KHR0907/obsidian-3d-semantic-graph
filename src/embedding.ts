import { App, TFile, requestUrl } from "obsidian";
import { EmbeddingCache, EmbeddingCacheEntry, PluginSettings } from "./types";

const CACHE_FILE = "embeddings-cache.json";
const CACHE_VERSION = 1;
const BATCH_SIZE = 100;
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
		this.cache = { modelId: settings.embeddingModel, version: CACHE_VERSION, entries: {} };
	}

	async loadCache(): Promise<void> {
		try {
			const path = this.pluginDir + "/" + CACHE_FILE;
			const adapter = this.app.vault.adapter;
			if (await adapter.exists(path)) {
				const data = await adapter.read(path);
				const parsed: EmbeddingCache = JSON.parse(data);
				if (parsed.modelId === this.settings.embeddingModel && parsed.version === CACHE_VERSION) {
					this.cache = parsed;
				} else {
					// Model changed or version mismatch — invalidate cache
					this.cache = { modelId: this.settings.embeddingModel, version: CACHE_VERSION, entries: {} };
				}
			}
		} catch {
			this.cache = { modelId: this.settings.embeddingModel, version: CACHE_VERSION, entries: {} };
		}
	}

	async saveCache(): Promise<void> {
		const path = this.pluginDir + "/" + CACHE_FILE;
		await this.app.vault.adapter.write(path, JSON.stringify(this.cache));
	}

	/**
	 * Get embeddings for all eligible markdown files.
	 * Returns a map of file path → embedding vector.
	 */
	async getEmbeddings(
		onProgress?: (current: number, total: number) => void
	): Promise<Map<string, number[]>> {
		await this.loadCache();

		const files = this.getEligibleFiles();
		const result = new Map<string, number[]>();

		// Remove deleted files from cache
		const filePaths = new Set(files.map((f) => f.path));
		for (const cachedPath of Object.keys(this.cache.entries)) {
			if (!filePaths.has(cachedPath)) {
				delete this.cache.entries[cachedPath];
			}
		}

		// Determine which files need embedding
		const toEmbed: { file: TFile; text: string }[] = [];
		for (const file of files) {
			const content = await this.app.vault.cachedRead(file);
			const hash = this.hashContent(content);
			const cached = this.cache.entries[file.path];
			if (cached && cached.contentHash === hash) {
				result.set(file.path, cached.embedding);
			} else {
				const cleaned = this.extractText(content);
				if (cleaned.length > 0) {
					toEmbed.push({ file, text: cleaned });
				}
			}
		}

		if (toEmbed.length === 0) {
			onProgress?.(files.length, files.length);
			return result;
		}

		// Batch embed
		let completed = result.size;
		const total = result.size + toEmbed.length;
		onProgress?.(completed, total);

		for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
			const batch = toEmbed.slice(i, i + BATCH_SIZE);
			const texts = batch.map((b) => b.text);
			const embeddings = await this.fetchEmbeddings(texts);

			for (let j = 0; j < batch.length; j++) {
				const { file } = batch[j];
				const content = await this.app.vault.cachedRead(file);
				const entry: EmbeddingCacheEntry = {
					contentHash: this.hashContent(content),
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
			return !this.settings.excludeFolders.some(
				(folder) => file.path.startsWith(folder + "/") || file.path === folder
			);
		});
	}

	/** Strip frontmatter and markdown syntax, truncate to token limit */
	extractText(content: string): string {
		let text = content;

		// Remove YAML frontmatter
		text = text.replace(/^---[\s\S]*?---\n?/, "");

		// Remove code blocks
		text = text.replace(/```[\s\S]*?```/g, "");

		// Remove inline code
		text = text.replace(/`[^`]*`/g, "");

		// Remove images
		text = text.replace(/!\[.*?\]\(.*?\)/g, "");

		// Remove links but keep text
		text = text.replace(/\[([^\]]*)\]\(.*?\)/g, "$1");

		// Remove wikilinks but keep text
		text = text.replace(/\[\[([^\]|]*?)(?:\|([^\]]*?))?\]\]/g, (_, target, alias) => alias || target);

		// Remove HTML tags
		text = text.replace(/<[^>]+>/g, "");

		// Remove heading markers
		text = text.replace(/^#{1,6}\s+/gm, "");

		// Remove emphasis markers
		text = text.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1");

		// Collapse whitespace
		text = text.replace(/\s+/g, " ").trim();

		// Truncate to approximate token limit
		if (text.length > MAX_TOKENS_APPROX) {
			text = text.substring(0, MAX_TOKENS_APPROX);
		}

		return text;
	}

	/** Simple string hash for change detection */
	private hashContent(content: string): string {
		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i);
			hash = ((hash << 5) - hash + char) | 0;
		}
		return hash.toString(36);
	}

	private async fetchEmbeddings(texts: string[]): Promise<number[][]> {
		const response = await requestUrl({
			url: "https://api.openai.com/v1/embeddings",
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.settings.openaiApiKey}`,
			},
			body: JSON.stringify({
				model: this.settings.embeddingModel,
				input: texts,
			}),
		});

		if (response.status !== 200) {
			const errorBody = response.json;
			throw new Error(
				`OpenAI API error (${response.status}): ${errorBody?.error?.message || "Unknown error"}`
			);
		}

		const data = response.json;
		// Sort by index to maintain order
		const sorted = data.data.sort(
			(a: { index: number }, b: { index: number }) => a.index - b.index
		);
		return sorted.map((item: { embedding: number[] }) => item.embedding);
	}
}
