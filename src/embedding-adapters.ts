import { requestUrl } from "obsidian";
import { EmbeddingProvider, getEffectiveEmbeddingModel, PluginSettings } from "./types";

export interface EmbeddingProviderAdapter {
	readonly provider: EmbeddingProvider;
	readonly batchSize: number;
	embed(texts: string[]): Promise<number[][]>;
}

export function createEmbeddingProviderAdapter(settings: PluginSettings): EmbeddingProviderAdapter {
	// Keep the adapter factory shape so additional providers can be added later
	// without changing callers.
	switch (settings.embeddingProvider) {
		case "openai":
			return new OpenAIEmbeddingAdapter(settings);
	}
}

abstract class BaseEmbeddingAdapter implements EmbeddingProviderAdapter {
	abstract readonly provider: EmbeddingProvider;
	readonly batchSize = 100;
	protected readonly settings: PluginSettings;
	protected readonly modelId: string;

	constructor(settings: PluginSettings) {
		this.settings = settings;
		this.modelId = getEffectiveEmbeddingModel(settings);
	}

	abstract embed(texts: string[]): Promise<number[][]>;
}

class OpenAIEmbeddingAdapter extends BaseEmbeddingAdapter {
	readonly provider = "openai" as const;

	async embed(texts: string[]): Promise<number[][]> {
		const response = await requestUrl({
			url: "https://api.openai.com/v1/embeddings",
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.settings.embeddingApiKey}`,
			},
			body: JSON.stringify({
				model: this.modelId,
				input: texts,
			}),
		});

		if (response.status !== 200) {
			const errorBody = response.json;
			throw new Error(
				`OpenAI API error (${response.status}): ${errorBody?.error?.message || "Unknown error"}`
			);
		}

		return response.json.data
			.sort((a: { index: number }, b: { index: number }) => a.index - b.index)
			.map((item: { embedding: number[] }) => item.embedding);
	}
}

