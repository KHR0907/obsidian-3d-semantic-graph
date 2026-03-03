import { App, PluginSettingTab, Setting } from "obsidian";
import SemanticGraphPlugin from "./main";

export class SemanticGraphSettingTab extends PluginSettingTab {
	plugin: SemanticGraphPlugin;

	constructor(app: App, plugin: SemanticGraphPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "3D Semantic Graph Settings" });

		// --- API Settings ---
		containerEl.createEl("h3", { text: "OpenAI API" });

		new Setting(containerEl)
			.setName("API Key")
			.setDesc("Your OpenAI API key for generating embeddings.")
			.addText((text) =>
				text
					.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.openaiApiKey)
					.then((t) => (t.inputEl.type = "password"))
					.onChange(async (value) => {
						this.plugin.settings.openaiApiKey = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Embedding Model")
			.setDesc("OpenAI embedding model to use.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("text-embedding-3-small", "text-embedding-3-small (1536D, cheapest)")
					.addOption("text-embedding-3-large", "text-embedding-3-large (3072D)")
					.addOption("text-embedding-ada-002", "text-embedding-ada-002 (1536D, legacy)")
					.setValue(this.plugin.settings.embeddingModel)
					.onChange(async (value) => {
						this.plugin.settings.embeddingModel = value;
						await this.plugin.saveSettings();
					})
			);

		// --- Graph Settings ---
		containerEl.createEl("h3", { text: "Graph" });

		new Setting(containerEl)
			.setName("Similarity Threshold")
			.setDesc("Minimum cosine similarity to draw a link between notes (0.5–0.95).")
			.addSlider((slider) =>
				slider
					.setLimits(0.5, 0.95, 0.05)
					.setValue(this.plugin.settings.similarityThreshold)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.similarityThreshold = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Node Color By")
			.setDesc("How to assign colors to nodes.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("folder", "Folder")
					.addOption("tag", "First Tag")
					.setValue(this.plugin.settings.nodeColorBy)
					.onChange(async (value: "folder" | "tag") => {
						this.plugin.settings.nodeColorBy = value;
						await this.plugin.saveSettings();
					})
			);

		// --- UMAP Settings ---
		containerEl.createEl("h3", { text: "UMAP Parameters" });

		new Setting(containerEl)
			.setName("Number of Neighbors")
			.setDesc("Controls local vs global structure preservation (5–50, default 15).")
			.addSlider((slider) =>
				slider
					.setLimits(5, 50, 1)
					.setValue(this.plugin.settings.umapNNeighbors)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.umapNNeighbors = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Minimum Distance")
			.setDesc("Controls how tightly UMAP packs points (0.0–0.99, default 0.1).")
			.addSlider((slider) =>
				slider
					.setLimits(0, 0.99, 0.01)
					.setValue(this.plugin.settings.umapMinDist)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.umapMinDist = value;
						await this.plugin.saveSettings();
					})
			);

		// --- Exclude Folders ---
		containerEl.createEl("h3", { text: "Filters" });

		new Setting(containerEl)
			.setName("Exclude Folders")
			.setDesc("Comma-separated list of folders to exclude from the graph.")
			.addText((text) =>
				text
					.setPlaceholder("templates, daily-notes")
					.setValue(this.plugin.settings.excludeFolders.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.excludeFolders = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);
	}
}
