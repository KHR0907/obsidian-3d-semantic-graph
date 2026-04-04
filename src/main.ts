import { Plugin, WorkspaceLeaf } from "obsidian";
import {
	createDefaultSettings,
	EmbeddingProvider,
	isPresetEmbeddingModel,
	PluginSettings,
} from "./types";
import { SemanticGraphSettingTab } from "./settings";
import { SemanticGraphView, VIEW_TYPE } from "./graph-view";

export default class SemanticGraphPlugin extends Plugin {
	settings: PluginSettings = createDefaultSettings();

	async onload() {
		await this.loadSettings();

		this.registerView(VIEW_TYPE, (leaf: WorkspaceLeaf) => {
			return new SemanticGraphView(
				leaf,
				this.settings,
				this.manifest.dir!,
				async (nextSettings: PluginSettings) => {
					this.settings = nextSettings;
					await this.saveSettings();
				}
			);
		});

		this.addRibbonIcon("network", "3D Semantic Graph", () => {
			this.activateView();
		});

		this.addCommand({
			id: "open-semantic-graph",
			name: "Open 3D Semantic Graph",
			callback: () => {
				this.activateView();
			},
		});

		this.addSettingTab(new SemanticGraphSettingTab(this.app, this));
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE);
	}

	async loadSettings() {
		const loadedData = await this.loadData();
		const loaded = (loadedData ?? {}) as Partial<PluginSettings> & {
			nodeAssetMode?: unknown;
			openaiApiKey?: unknown;
			embeddingProvider?: unknown;
			embeddingApiKey?: unknown;
			embeddingModel?: unknown;
			useCustomEmbeddingModel?: unknown;
			customEmbeddingModel?: unknown;
			customEmbeddingEndpoint?: unknown;
		};
		this.settings = Object.assign({}, createDefaultSettings(), loaded);

		if (typeof loaded.openaiApiKey === "string" && !this.settings.embeddingApiKey) {
			this.settings.embeddingApiKey = loaded.openaiApiKey;
		}

		const provider = loaded.embeddingProvider;
		if (provider !== "openai" && provider !== "gemini" && provider !== "cohere" && provider !== "voyage" && provider !== "custom") {
			this.settings.embeddingProvider = "openai";
		}

		if (this.settings.embeddingProvider === "custom") {
			this.settings.embeddingProvider = "openai";
			this.settings.embeddingModel = "text-embedding-3-large";
			this.settings.useCustomEmbeddingModel = false;
		}

		if (
			typeof loaded.embeddingModel === "string" &&
			typeof loaded.useCustomEmbeddingModel !== "boolean" &&
			typeof loaded.customEmbeddingModel !== "string"
		) {
			if (isPresetEmbeddingModel(this.settings.embeddingProvider as EmbeddingProvider, loaded.embeddingModel)) {
				this.settings.embeddingModel = loaded.embeddingModel;
			} else {
				this.settings.embeddingProvider = "openai";
				this.settings.embeddingModel = "text-embedding-3-large";
				this.settings.useCustomEmbeddingModel = false;
			}
		}

		delete (this.settings as PluginSettings & { nodeAssetMode?: unknown; openaiApiKey?: unknown }).nodeAssetMode;
		delete (this.settings as PluginSettings & { nodeAssetMode?: unknown; openaiApiKey?: unknown }).openaiApiKey;
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update existing views with new settings
		this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
			if (leaf.view instanceof SemanticGraphView) {
				leaf.view.updateSettings(this.settings);
			}
		});
	}

	async activateView() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({
			type: VIEW_TYPE,
			active: true,
		});
		this.app.workspace.revealLeaf(leaf);
	}
}
