import { App } from "obsidian";

export const UPLOADED_VECTORS_FILE = "uploaded-vectors.json";

interface UploadedVectorsJson {
	entries: Record<string, { embedding: number[] }>;
}

export async function readUploadedVectors(
	app: App,
	pluginDir: string
): Promise<Map<string, number[]>> {
	const path = `${pluginDir}/${UPLOADED_VECTORS_FILE}`;
	const adapter = app.vault.adapter;
	if (!(await adapter.exists(path))) {
		throw new Error("Uploaded vectors JSON file not found.");
	}

	const raw = await adapter.read(path);
	const parsed = JSON.parse(raw) as UploadedVectorsJson;
	if (!parsed || typeof parsed !== "object" || !parsed.entries || typeof parsed.entries !== "object") {
		throw new Error('Invalid uploaded vectors JSON. Expected {"entries": {"path/to/note.md": {"embedding": [...]}}}.');
	}

	const vectors = new Map<string, number[]>();
	for (const [pathKey, entry] of Object.entries(parsed.entries)) {
		const vector = entry?.embedding;
		if (!Array.isArray(vector) || vector.length === 0 || vector.some((value) => typeof value !== "number")) {
			throw new Error(`Invalid vector for "${pathKey}". Expected an array of numbers.`);
		}
		vectors.set(pathKey, vector);
	}

	return vectors;
}
