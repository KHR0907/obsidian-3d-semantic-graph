import { App } from "obsidian";
import { PluginSettings } from "./types";

const LAYOUT_CACHE_FILE = "layout-cache.json";
const LAYOUT_CACHE_VERSION = 1;

interface LayoutCacheData {
	version: number;
	key: string;
	coords: Record<string, [number, number, number]>;
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
): Promise<Map<string, [number, number, number]> | null> {
	try {
		const path = `${pluginDir}/${LAYOUT_CACHE_FILE}`;
		const adapter = app.vault.adapter;
		if (!(await adapter.exists(path))) return null;
		const parsed = JSON.parse(await adapter.read(path)) as LayoutCacheData;
		if (parsed.version !== LAYOUT_CACHE_VERSION || parsed.key !== key) return null;
		return new Map(Object.entries(parsed.coords));
	} catch {
		return null;
	}
}

export async function writeLayoutCache(
	app: App,
	pluginDir: string,
	key: string,
	coords: Map<string, [number, number, number]>
): Promise<void> {
	const data: LayoutCacheData = {
		version: LAYOUT_CACHE_VERSION,
		key,
		coords: Object.fromEntries(coords),
	};
	try {
		await app.vault.adapter.write(`${pluginDir}/${LAYOUT_CACHE_FILE}`, JSON.stringify(data));
	} catch {
		// Cache write failure only costs a recompute on the next load.
	}
}
