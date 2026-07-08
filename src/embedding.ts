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
const HASHES_FILE = "embeddings-hashes.json";
const CACHE_VERSION = 1;
const MAX_TOKENS_APPROX = 8000; // rough char limit (~4 chars per token)

interface HashesFileData {
	modelId: string;
	version: number;
	hashes: Record<string, string>;
}

export interface VaultFingerprint {
	fingerprint: string;
	/** True when every eligible note matches the stored hash set exactly. */
	upToDate: boolean;
}

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
				const parsed = JSON.parse(data) as EmbeddingCache;
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
		await this.saveHashes();
	}

	/**
	 * Persist just the path→contentHash map so the next open can validate the
	 * vault without parsing the full vector cache.
	 */
	private async saveHashes(): Promise<void> {
		const hashes: Record<string, string> = {};
		for (const [path, entry] of Object.entries(this.cache.entries)) {
			hashes[path] = entry.contentHash;
		}
		const data: HashesFileData = { modelId: this.cache.modelId, version: CACHE_VERSION, hashes };
		try {
			await this.app.vault.adapter.write(`${this.pluginDir}/${HASHES_FILE}`, JSON.stringify(data));
		} catch {
			// Missing hash file only costs the slow path on the next open.
		}
	}

	private async loadHashes(): Promise<Record<string, string> | null> {
		try {
			const path = `${this.pluginDir}/${HASHES_FILE}`;
			const adapter = this.app.vault.adapter;
			if (!(await adapter.exists(path))) return null;
			const parsed = JSON.parse(await adapter.read(path)) as HashesFileData;
			if (parsed.modelId !== getEmbeddingCacheModelId(this.settings) || parsed.version !== CACHE_VERSION) {
				return null;
			}
			return parsed.hashes;
		} catch {
			return null;
		}
	}

	/**
	 * Fast vault check against the lightweight hash file — never touches the
	 * full vector cache. Returns null when no usable hash file exists.
	 */
	async checkVaultFingerprint(): Promise<VaultFingerprint | null> {
		const stored = await this.loadHashes();
		if (!stored) return null;

		const files = this.getEligibleFiles();
		let upToDate = true;
		const parts: string[] = [];
		for (const file of files) {
			const content = await this.app.vault.cachedRead(file);
			const hash = this.hashContent(content);
			const storedHash = stored[file.path];
			if (storedHash !== hash) {
				// New or changed note. Empty notes never enter the cache, so an
				// unhashed empty note still counts as up to date.
				if (this.extractText(content).length > 0) upToDate = false;
				if (storedHash !== undefined) upToDate = false;
				continue;
			}
			parts.push(`${file.path}:${hash}`);
		}
		const filePaths = new Set(files.map((f) => f.path));
		for (const path of Object.keys(stored)) {
			if (!filePaths.has(path)) upToDate = false;
		}

		parts.sort();
		const fingerprint = this.hashContent(`${getEmbeddingCacheModelId(this.settings)}|${parts.join("|")}`);
		return { fingerprint, upToDate };
	}

	/** Read cached embeddings from disk without triggering any provider requests. */
	async loadCachedEmbeddings(): Promise<Map<string, number[]>> {
		await this.loadCache();
		const result = new Map<string, number[]>();
		for (const [path, entry] of Object.entries(this.cache.entries)) {
			result.set(path, entry.embedding);
		}
		return result;
	}

	async getEmbeddings(
		onProgress?: (current: number, total: number) => void
	): Promise<Map<string, number[]>> {
		await this.loadCache();

		const files = this.getEligibleFiles();
		const result = new Map<string, number[]>();

		const filePaths = new Set(files.map((f) => f.path));
		let pruned = 0;
		for (const cachedPath of Object.keys(this.cache.entries)) {
			if (!filePaths.has(cachedPath)) {
				delete this.cache.entries[cachedPath];
				pruned++;
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
			// Persist pruned deletions, and (re)create the lightweight hash file
			// so the next open can take the fast no-vector-load path.
			if (pruned > 0) {
				await this.saveCache();
			} else {
				await this.saveHashes();
			}
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

	/**
	 * Stable fingerprint of the cached content hashes for the given paths.
	 * Call after getEmbeddings() so the in-memory entries are up to date.
	 */
	getFingerprintFor(paths: Iterable<string>): string {
		const parts: string[] = [];
		for (const path of paths) {
			const entry = this.cache.entries[path];
			parts.push(`${path}:${entry ? entry.contentHash : ""}`);
		}
		parts.sort();
		return this.hashContent(`${this.cache.modelId}|${parts.join("|")}`);
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
		text = text.replace(
			/\[\[([^\]|]*?)(?:\|([^\]]*?))?\]\]/g,
			(_match: string, target: string, alias: string | undefined) => alias || target
		);
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
