import { App } from "obsidian";
import { PluginSettings } from "./types";
import { SemanticCluster } from "./semantic-clusters";

const LAYOUT_CACHE_FILE = "layout-cache.json";
const LAYOUT_CACHE_VERSION = 2;

interface LayoutCacheData {
	version: number;
	key: string;
	coords: Record<string, [number, number, number]>;
	clusters: SemanticCluster[] | null;
}

export interface CachedLayout {
	coords: Map<string, [number, number, number]>;
	clusters: SemanticCluster[] | null;
}

/**
 * Cache key for reduced 3D coordinates. Any change to the embedded content
 * (via the embedding-cache fingerprint) or to the projection inputs produces
 * a different key, so a stale layout is never reused.
 */
export function buildLayoutCacheKey(embeddingFingerprint: string, settings: PluginSettings): string {
	return [
		embeddingFingerprint,
		settings.projectionMethod,
		settings.umapNNeighbors,
		settings.umapMinDist,
		settings.layoutSeed,
	].join("|");
}

export async function readLayoutCache(
	app: App,
	pluginDir: string,
	key: string
): Promise<CachedLayout | null> {
	try {
		const path = `${pluginDir}/${LAYOUT_CACHE_FILE}`;
		const adapter = app.vault.adapter;
		if (!(await adapter.exists(path))) return null;
		const parsed = JSON.parse(await adapter.read(path)) as LayoutCacheData;
		if (parsed.version !== LAYOUT_CACHE_VERSION || parsed.key !== key) return null;
		return {
			coords: new Map(Object.entries(parsed.coords)),
			clusters: parsed.clusters ?? null,
		};
	} catch {
		return null;
	}
}

export async function writeLayoutCache(
	app: App,
	pluginDir: string,
	key: string,
	coords: Map<string, [number, number, number]>,
	clusters: SemanticCluster[] | null
): Promise<void> {
	const data: LayoutCacheData = {
		version: LAYOUT_CACHE_VERSION,
		key,
		coords: Object.fromEntries(coords),
		clusters,
	};
	try {
		await app.vault.adapter.write(`${pluginDir}/${LAYOUT_CACHE_FILE}`, JSON.stringify(data));
	} catch {
		// Cache write failure only costs a recompute on the next load.
	}
}
