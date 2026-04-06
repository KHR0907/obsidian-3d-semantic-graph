import { Plugin, WorkspaceLeaf } from "obsidian";
import {
	clonePluginSettings,
	createDefaultSettings,
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
				clonePluginSettings(this.settings),
				this.manifest.dir!,
				() => clonePluginSettings(this.settings),
				async (nextSettings: PluginSettings, sourceView?: SemanticGraphView) => {
					this.settings = clonePluginSettings(nextSettings);
					await this.saveSettings(sourceView);
				}
			);
		});

		this.addRibbonIcon("network", "3D semantic graph", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-semantic-graph",
			name: "Open graph view",
			callback: () => {
				void this.activateView();
			},
		});

		this.addSettingTab(new SemanticGraphSettingTab(this.app, this));
	}

	async loadSettings() {
		const loadedData = await this.loadData();
		const loaded = (loadedData ?? {}) as Partial<PluginSettings> & {
			nodeAssetMode?: unknown;
			openaiApiKey?: unknown;
		};
		this.settings = clonePluginSettings(Object.assign({}, createDefaultSettings(), loaded));

		// Migrate legacy openaiApiKey field
		if (typeof loaded.openaiApiKey === "string" && !this.settings.embeddingApiKey) {
			this.settings.embeddingApiKey = loaded.openaiApiKey;
		}

		// Force provider to openai
		this.settings.embeddingProvider = "openai";

		if (!isPresetEmbeddingModel("openai", this.settings.embeddingModel)) {
			this.settings.embeddingModel = "text-embedding-3-large";
		}

		// Clean up legacy fields
		const s = this.settings as unknown as Record<string, unknown>;
		delete s.nodeAssetMode;
		delete s.openaiApiKey;
		delete s.useCustomEmbeddingModel;
		delete s.customEmbeddingModel;
		delete s.customEmbeddingEndpoint;
		delete s.sphereizeData;
	}

	async saveSettings(_sourceView?: SemanticGraphView) {
		const nextSettings = clonePluginSettings(this.settings);
		this.settings = nextSettings;
		await this.saveData(nextSettings);
		// Update existing views with new settings
		this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
			if (leaf.view instanceof SemanticGraphView) {
				leaf.view.updateSettings(clonePluginSettings(nextSettings));
			}
		});
	}

	async activateView() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
		if (existing.length > 0) {
			await this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({
			type: VIEW_TYPE,
			active: true,
		});
		await this.app.workspace.revealLeaf(leaf);
	}
}
