import { App, PluginSettingTab, Setting } from "obsidian";
import SemanticGraphPlugin from "./main";
import { DEFAULT_SETTINGS } from "./types";

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
			.setDesc("OpenAI API key for generating embeddings. Leave empty to use sphere layout without semantic positioning.")
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
					.addOption("text-embedding-3-small", "text-embedding-3-small (1536D, fast)")
					.addOption("text-embedding-3-large", "text-embedding-3-large (3072D, accurate)")
					.addOption("text-embedding-ada-002", "text-embedding-ada-002 (legacy)")
					.setValue(this.plugin.settings.embeddingModel)
					.onChange(async (value) => {
						this.plugin.settings.embeddingModel = value;
						await this.plugin.saveSettings();
					})
			);

		// --- Graph Settings ---
		containerEl.createEl("h3", { text: "Graph" });

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

		new Setting(containerEl)
			.setName("Projection Method")
			.setDesc("Choose the algorithm used to project embeddings into 3D.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("umap", "UMAP")
					.addOption("pca", "PCA")
					.setValue(this.plugin.settings.projectionMethod)
					.onChange(async (value: "umap" | "pca") => {
						this.plugin.settings.projectionMethod = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Layout Seed")
			.setDesc("Seed used for stochastic layout steps like UMAP and overlap resolution. Same seed gives the same layout more reliably.")
			.addButton((button) =>
				button
					.setButtonText("Random")
					.onClick(async () => {
						const nextSeed = Math.floor(Math.random() * 2147483647);
						this.plugin.settings.layoutSeed = nextSeed;
						await this.plugin.saveSettings();
						this.display();
					})
			)
			.addText((text) =>
				text
					.setPlaceholder("12345")
					.setValue(String(this.plugin.settings.layoutSeed))
					.then((t) => (t.inputEl.type = "number"))
					.onChange(async (value) => {
						const parsed = Number.parseInt(value, 10);
						this.plugin.settings.layoutSeed = Number.isFinite(parsed) ? parsed : DEFAULT_SETTINGS.layoutSeed;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Sphereize Data")
			.setDesc("Project reduced embedding coordinates toward a sphere surface. Turn off to keep points distributed inside the 3D volume.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.sphereizeData)
					.onChange(async (value) => {
						this.plugin.settings.sphereizeData = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show Links")
			.setDesc("Display connection lines between nodes.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showLinks)
					.onChange(async (value) => {
						this.plugin.settings.showLinks = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show Grid")
			.setDesc("Display a solid square grid on the XZ coordinate plane.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showGrid)
					.onChange(async (value) => {
						this.plugin.settings.showGrid = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Appearance" });

		new Setting(containerEl)
			.setName("Scene Theme")
			.setDesc("Choose the background style for the 3D stage.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("dark", "Dark")
					.addOption("light", "Light")
					.setValue(this.plugin.settings.sceneTheme)
					.onChange(async (value: "dark" | "light") => {
						this.plugin.settings.sceneTheme = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Node Asset")
			.setDesc("Render nodes as volumetric 3D meshes or billboarded 2D sprites.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("3d", "3D Asset")
					.addOption("2d", "2D Asset")
					.setValue(this.plugin.settings.nodeAssetMode)
					.onChange(async (value: "3d" | "2d") => {
						this.plugin.settings.nodeAssetMode = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Node Opacity")
			.setDesc("Adjust node transparency.")
			.addSlider((slider) =>
				slider
					.setLimits(0.15, 1, 0.05)
					.setValue(this.plugin.settings.nodeOpacity)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.nodeOpacity = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Drag Sensitivity")
			.setDesc("Adjust how strongly the camera responds when dragging the graph.")
			.addSlider((slider) =>
				slider
					.setLimits(0.2, 3, 0.1)
					.setValue(this.plugin.settings.dragSensitivity)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.dragSensitivity = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Auto Orbit Speed")
			.setDesc("Adjust the idle camera orbit speed. Set to 0 to disable automatic camera movement.")
			.addSlider((slider) =>
				slider
					.setLimits(0, 3, 0.1)
					.setValue(this.plugin.settings.autoOrbitSpeed)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.autoOrbitSpeed = value;
						await this.plugin.saveSettings();
					})
			);

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

		// --- UMAP Settings ---
		containerEl.createEl("h3", { text: "UMAP Parameters" });

		new Setting(containerEl)
			.setName("Number of Neighbors")
			.setDesc("Controls local vs global structure (5–50). Lower = tighter clusters, Higher = broader spread. Default: 15")
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
			.setDesc("How tightly UMAP packs similar points (0.0–0.99). Lower = more clustered. Default: 0.1")
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

		// --- Reset ---
		containerEl.createEl("h3", { text: "Reset" });

		new Setting(containerEl)
			.setName("Reset to Defaults")
			.setDesc("Restore all settings to their default values (API key is preserved).")
			.addButton((btn) =>
				btn
					.setButtonText("Reset")
					.setWarning()
					.onClick(async () => {
						const apiKey = this.plugin.settings.openaiApiKey;
						this.plugin.settings = { ...DEFAULT_SETTINGS, openaiApiKey: apiKey };
						await this.plugin.saveSettings();
						this.display();
					})
			);
	}
}
