import { Plugin, WorkspaceLeaf } from "obsidian";
import {
	clonePluginSettings,
	createDefaultSettings,
	isPresetEmbeddingModel,
	PluginSettings,
} from "./types";
import { SemanticGraphSettingTab } from "./settings";
import { SemanticGraphView, VIEW_TYPE } from "./graph-view";
import { NeighborsView, NEIGHBORS_VIEW_TYPE } from "./neighbors-view";
import { applyLanguageSetting, t } from "./i18n";

export default class SemanticGraphPlugin extends Plugin {
	settings: PluginSettings = createDefaultSettings();

	async onload() {
		await this.loadSettings();
		applyLanguageSetting(this.settings.language);

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

		this.registerView(NEIGHBORS_VIEW_TYPE, (leaf: WorkspaceLeaf) => {
			return new NeighborsView(
				leaf,
				clonePluginSettings(this.settings),
				this.manifest.dir!,
				() => clonePluginSettings(this.settings)
			);
		});

		this.addRibbonIcon("network", t("view.graph.title"), () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-semantic-graph",
			name: t("command.openGraph"),
			callback: () => {
				void this.activateView();
			},
		});

		this.addCommand({
			id: "open-semantic-neighbors",
			name: t("command.openNeighbors"),
			callback: () => {
				void this.activateNeighborsView();
			},
		});

		this.addSettingTab(new SemanticGraphSettingTab(this.app, this));
	}

	async loadSettings() {
		const loadedData: unknown = await this.loadData();
		const loaded = (loadedData ?? {}) as Partial<PluginSettings> & {
			nodeAssetMode?: unknown;
			openaiApiKey?: unknown;
		};
		this.settings = clonePluginSettings(Object.assign({}, createDefaultSettings(), loaded));

		// Migrate legacy openaiApiKey field
		if (typeof loaded.openaiApiKey === "string" && !this.settings.embeddingApiKey) {
			this.settings.embeddingApiKey = loaded.openaiApiKey;
		}

		if (!["openai", "ollama"].includes(this.settings.embeddingProvider)) {
			this.settings.embeddingProvider = "openai";
		}

		if (!isPresetEmbeddingModel(this.settings.embeddingProvider, this.settings.embeddingModel)) {
			this.settings.embeddingModel =
				this.settings.embeddingProvider === "ollama" ? "nomic-embed-text" : "text-embedding-3-large";
		}

		if (!["auto", "dark", "light"].includes(this.settings.sceneTheme)) {
			this.settings.sceneTheme = "auto";
		}

		if (!["auto", "en", "ko"].includes(this.settings.language)) {
			this.settings.language = "auto";
		}

		if (!["ctime", "frontmatter"].includes(this.settings.timelineDateSource)) {
			this.settings.timelineDateSource = "ctime";
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
		applyLanguageSetting(nextSettings.language);
		// Update existing views with new settings
		this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
			if (leaf.view instanceof SemanticGraphView) {
				leaf.view.updateSettings(clonePluginSettings(nextSettings));
			}
		});
		this.app.workspace.getLeavesOfType(NEIGHBORS_VIEW_TYPE).forEach((leaf) => {
			if (leaf.view instanceof NeighborsView) {
				leaf.view.updateSettings(clonePluginSettings(this.settings));
			}
		});
	}

	async activateNeighborsView() {
		const existing = this.app.workspace.getLeavesOfType(NEIGHBORS_VIEW_TYPE);
		if (existing.length > 0) {
			await this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({
			type: NEIGHBORS_VIEW_TYPE,
			active: true,
		});
		await this.app.workspace.revealLeaf(leaf);
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
