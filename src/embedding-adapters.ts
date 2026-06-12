import { requestUrl } from "obsidian";
import { EmbeddingProvider, getEffectiveEmbeddingModel, PluginSettings } from "./types";

export interface EmbeddingProviderAdapter {
	readonly provider: EmbeddingProvider;
	readonly batchSize: number;
	embed(texts: string[]): Promise<number[][]>;
}

export function createEmbeddingProviderAdapter(settings: PluginSettings): EmbeddingProviderAdapter {
	switch (settings.embeddingProvider) {
		case "ollama":
			return new OllamaEmbeddingAdapter(settings);
		case "openai":
			return new OpenAIEmbeddingAdapter(settings);
	}
}

abstract class BaseEmbeddingAdapter implements EmbeddingProviderAdapter {
	abstract readonly provider: EmbeddingProvider;
	readonly batchSize: number = 100;
	protected readonly settings: PluginSettings;
	protected readonly modelId: string;

	constructor(settings: PluginSettings) {
		this.settings = settings;
		this.modelId = getEffectiveEmbeddingModel(settings);
	}

	abstract embed(texts: string[]): Promise<number[][]>;
}

interface OpenAIEmbeddingResponse {
	data?: { index: number; embedding: number[] }[];
	error?: { message?: string };
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

		const body = response.json as OpenAIEmbeddingResponse;
		if (response.status !== 200) {
			throw new Error(
				`OpenAI API error (${response.status}): ${body?.error?.message || "Unknown error"}`
			);
		}

		const data = body?.data;
		if (!Array.isArray(data) || data.length !== texts.length) {
			throw new Error("OpenAI returned an unexpected embedding response.");
		}
		return data
			.sort((a, b) => a.index - b.index)
			.map((item) => item.embedding);
	}
}

interface OllamaEmbedResponse {
	embeddings?: number[][];
	error?: string;
}

class OllamaEmbeddingAdapter extends BaseEmbeddingAdapter {
	readonly provider = "ollama" as const;
	readonly batchSize = 16;

	async embed(texts: string[]): Promise<number[][]> {
		const endpoint = this.settings.ollamaEndpoint.trim().replace(/\/+$/, "");
		const response = await requestUrl({
			url: `${endpoint}/api/embed`,
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: this.modelId,
				input: texts,
			}),
			throw: false,
		});

		if (response.status !== 200) {
			let detail = "";
			try {
				detail = (response.json as OllamaEmbedResponse)?.error ?? "";
			} catch {
				// Non-JSON error body
			}
			throw new Error(
				`Ollama API error (${response.status}): ${detail || "Is Ollama running and the model pulled?"}`
			);
		}

		const embeddings = (response.json as OllamaEmbedResponse)?.embeddings;
		if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
			throw new Error("Ollama returned an unexpected embedding response.");
		}
		return embeddings;
	}
}

