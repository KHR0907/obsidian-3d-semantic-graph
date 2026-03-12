import { requestUrl } from "obsidian";
import { EmbeddingProvider, getEffectiveEmbeddingModel, PluginSettings } from "./types";

export interface EmbeddingProviderAdapter {
	readonly provider: EmbeddingProvider;
	readonly batchSize: number;
	embed(texts: string[]): Promise<number[][]>;
}

export function createEmbeddingProviderAdapter(settings: PluginSettings): EmbeddingProviderAdapter {
	switch (settings.embeddingProvider) {
		case "openai":
			return new OpenAIEmbeddingAdapter(settings);
		case "gemini":
			return new GeminiEmbeddingAdapter(settings);
		case "cohere":
			return new CohereEmbeddingAdapter(settings);
		case "voyage":
			return new VoyageEmbeddingAdapter(settings);
		case "custom":
			return new CustomEmbeddingAdapter(settings);
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

class VoyageEmbeddingAdapter extends BaseEmbeddingAdapter {
	readonly provider = "voyage" as const;

	async embed(texts: string[]): Promise<number[][]> {
		const response = await requestUrl({
			url: "https://api.voyageai.com/v1/embeddings",
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.settings.embeddingApiKey}`,
			},
			body: JSON.stringify({
				model: this.modelId,
				input: texts,
				input_type: "document",
			}),
		});

		if (response.status !== 200) {
			const errorBody = response.json;
			throw new Error(
				`Voyage AI API error (${response.status}): ${errorBody?.detail || errorBody?.message || "Unknown error"}`
			);
		}

		const data = response.json;
		const embeddings = Array.isArray(data?.data)
			? data.data
				.sort((a: { index: number }, b: { index: number }) => a.index - b.index)
				.map((item: { embedding: number[] }) => item.embedding)
			: data?.embeddings;
		if (!Array.isArray(embeddings)) {
			throw new Error("Voyage AI API returned an unexpected embeddings response.");
		}
		return embeddings;
	}
}

class CohereEmbeddingAdapter extends BaseEmbeddingAdapter {
	readonly provider = "cohere" as const;
	override readonly batchSize = 96;

	async embed(texts: string[]): Promise<number[][]> {
		const response = await requestUrl({
			url: "https://api.cohere.com/v2/embed",
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.settings.embeddingApiKey}`,
			},
			body: JSON.stringify({
				model: this.modelId,
				input_type: "search_document",
				texts,
				embedding_types: ["float"],
			}),
		});

		if (response.status !== 200) {
			const errorBody = response.json;
			throw new Error(
				`Cohere API error (${response.status}): ${errorBody?.message || "Unknown error"}`
			);
		}

		const embeddings = response.json?.embeddings?.float;
		if (!Array.isArray(embeddings)) {
			throw new Error("Cohere API returned an unexpected embeddings response.");
		}
		return embeddings;
	}
}

class GeminiEmbeddingAdapter extends BaseEmbeddingAdapter {
	readonly provider = "gemini" as const;

	async embed(texts: string[]): Promise<number[][]> {
		const response = await requestUrl({
			url: `https://generativelanguage.googleapis.com/v1beta/models/${this.modelId}:batchEmbedContents`,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-goog-api-key": this.settings.embeddingApiKey,
			},
			body: JSON.stringify({
				requests: texts.map((text) => ({
					model: `models/${this.modelId}`,
					taskType: "RETRIEVAL_DOCUMENT",
					content: {
						parts: [{ text }],
					},
				})),
			}),
		});

		if (response.status !== 200) {
			const errorBody = response.json;
			throw new Error(
				`Google Gemini API error (${response.status}): ${errorBody?.error?.message || "Unknown error"}`
			);
		}

		const embeddings = response.json?.embeddings?.map((item: { values: number[] }) => item.values);
		if (!Array.isArray(embeddings)) {
			throw new Error("Google Gemini API returned an unexpected embeddings response.");
		}
		return embeddings;
	}
}

class CustomEmbeddingAdapter extends BaseEmbeddingAdapter {
	readonly provider = "custom" as const;

	async embed(texts: string[]): Promise<number[][]> {
		const endpoint = this.settings.customEmbeddingEndpoint.trim();
		if (!endpoint) {
			throw new Error("Custom embedding endpoint is required when using a custom embedding model.");
		}

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (this.settings.embeddingApiKey.trim()) {
			headers.Authorization = `Bearer ${this.settings.embeddingApiKey}`;
		}

		const response = await requestUrl({
			url: endpoint,
			method: "POST",
			headers,
			body: JSON.stringify({
				model: this.modelId,
				input: texts,
			}),
		});

		if (response.status !== 200) {
			const errorBody = response.json;
			throw new Error(
				`Custom embeddings API error (${response.status}): ${errorBody?.error?.message || errorBody?.message || "Unknown error"}`
			);
		}

		const data = response.json;
		if (Array.isArray(data?.data)) {
			return data.data
				.sort((a: { index: number }, b: { index: number }) => a.index - b.index)
				.map((item: { embedding: number[] }) => item.embedding);
		}
		if (Array.isArray(data?.embeddings)) {
			return data.embeddings;
		}

		throw new Error("Custom embeddings endpoint returned an unexpected response. Expected an OpenAI-compatible embeddings payload.");
	}
}
