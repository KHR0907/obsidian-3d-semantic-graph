import { Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, PluginSettings } from "./types";
import { SemanticGraphSettingTab } from "./settings";
import { SemanticGraphView, VIEW_TYPE } from "./graph-view";

export default class SemanticGraphPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;

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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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
