import { App, Notice, normalizePath, PluginSettingTab, Setting, TFile } from "obsidian";
import SemanticGraphPlugin from "./main";
import { EmbeddingService } from "./embedding";
import {
	clonePluginSettings,
	createDefaultSettings,
	EMBEDDING_PROVIDER_LABELS,
	generateRandomLayoutSeed,
	PluginSettings,
	PRESET_EMBEDDING_MODELS,
} from "./types";
import { serializeUploadedVectors, UPLOADED_VECTORS_FILE } from "./uploaded-vectors";

export class SemanticGraphSettingTab extends PluginSettingTab {
	plugin: SemanticGraphPlugin;

	constructor(app: App, plugin: SemanticGraphPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("3D semantic graph settings").setHeading();

		// --- API Settings ---
		new Setting(containerEl).setName("Embedding API").setHeading();
		new Setting(containerEl)
			.setName("API key")
			.setDesc("API key for generating embeddings. Leave empty to use sphere layout without semantic positioning.")
			.addText((text) =>
				text
					.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.embeddingApiKey)
					.then((t) => (t.inputEl.type = "password"))
					.onChange(async (value) => {
						await this.patchSettings({ embeddingApiKey: value.trim() });
					})
			);

		new Setting(containerEl)
			.setName("Embedding model")
			.setDesc("Choose an OpenAI embedding model.")
			.addDropdown((dropdown) =>
				this.addEmbeddingModelOptions(dropdown)
					.setValue(this.getSelectedEmbeddingOptionValue())
					.onChange(async (value) => {
						await this.patchSettings({
							embeddingProvider: "openai",
							embeddingModel: value,
						});
					})
			);

		new Setting(containerEl)
			.setName("Custom vector JSON")
			.setDesc("Use uploaded vectors instead of API embeddings.")
			.addButton((button) =>
				button
					.setButtonText("Export")
					.setTooltip("Download vectors in the uploaded-vectors JSON format")
					.onClick(() => void this.exportVectorsJson())
			)
			.addButton((button) =>
				button
					.setButtonText(this.plugin.settings.uploadedVectorsFileName ? "Upload again" : "Upload")
					.onClick(() => void this.uploadVectorsJson())
			)
			.addText((text) =>
				text
					.setPlaceholder("upload_file_name.json")
					.setValue(this.plugin.settings.uploadedVectorsFileName)
					.setDisabled(true)
			)
			.addExtraButton((button) =>
				button
					.setIcon("cross")
					.setTooltip("Clear uploaded vectors reference")
					.onClick(async () => {
						await this.patchSettings({ uploadedVectorsFileName: "" });
						this.display();
					})
			);

		// --- Graph Settings ---
		new Setting(containerEl).setName("Graph").setHeading();

		new Setting(containerEl)
			.setName("Node color by")
			.setDesc("How to assign colors to nodes. Default: folder.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("folder", "Folder")
					.addOption("tag", "First tag")
					.setValue(this.plugin.settings.nodeColorBy)
					.onChange(async (value: "folder" | "tag") => {
						await this.patchSettings({ nodeColorBy: value });
					})
			);

		new Setting(containerEl)
			.setName("Projection method")
			.setDesc("Choose the algorithm used to project embeddings into 3D. Default: UMAP.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("umap", "UMAP")
					.addOption("pca", "PCA")
					.setValue(this.plugin.settings.projectionMethod)
					.onChange(async (value: "umap" | "pca") => {
						await this.patchSettings({ projectionMethod: value });
					})
			);

		new Setting(containerEl)
			.setName("Layout seed")
			.setDesc("Seed used for stochastic layout steps like UMAP and overlap resolution. Same seed gives the same layout more reliably. Default: random.")
			.addButton((button) =>
				button
					.setButtonText("Random")
					.onClick(async () => {
						const nextSeed = generateRandomLayoutSeed();
						await this.patchSettings({ layoutSeed: nextSeed });
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
						await this.patchSettings({
							layoutSeed: Number.isFinite(parsed) ? parsed : generateRandomLayoutSeed(),
						});
					})
			);

		new Setting(containerEl)
			.setName("Show links")
			.setDesc("Display connection lines between nodes. Default: off.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showLinks)
					.onChange(async (value) => {
						await this.patchSettings({ showLinks: value });
					})
			);

		new Setting(containerEl)
			.setName("Show grid")
			.setDesc("Display a solid square grid on the XZ coordinate plane. Default: on.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showGrid)
					.onChange(async (value) => {
						await this.patchSettings({ showGrid: value });
					})
			);

		new Setting(containerEl).setName("Appearance").setHeading();

		new Setting(containerEl)
			.setName("Scene theme")
			.setDesc("Choose the background style for the 3D stage. Default: light.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("dark", "Dark")
					.addOption("light", "Light")
					.setValue(this.plugin.settings.sceneTheme)
					.onChange(async (value: "dark" | "light") => {
						await this.patchSettings({ sceneTheme: value });
					})
			);

		new Setting(containerEl)
			.setName("Node opacity")
			.setDesc("Adjust node transparency. Default: 1.0.")
			.addSlider((slider) =>
				slider
					.setLimits(0.15, 1, 0.05)
					.setValue(this.plugin.settings.nodeOpacity)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.patchSettings({ nodeOpacity: value });
					})
			);

		new Setting(containerEl)
			.setName("Node size")
			.setDesc("Adjust the size of 3D nodes. Default: 1.5.")
			.addSlider((slider) =>
				slider
					.setLimits(0.4, 2, 0.05)
					.setValue(this.plugin.settings.nodeSizeScale)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.patchSettings({ nodeSizeScale: value });
					})
			);

		new Setting(containerEl)
			.setName("Drag sensitivity")
			.setDesc("Adjust how strongly the camera responds when dragging the graph. Default: 1.0.")
			.addSlider((slider) =>
				slider
					.setLimits(0.2, 3, 0.1)
					.setValue(this.plugin.settings.dragSensitivity)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.patchSettings({ dragSensitivity: value });
					})
			);

		new Setting(containerEl)
			.setName("Auto orbit speed")
			.setDesc("Adjust the idle camera orbit speed. Set to 0 to disable automatic camera movement. Default: 0.2.")
			.addSlider((slider) =>
				slider
					.setLimits(0, 3, 0.1)
					.setValue(this.plugin.settings.autoOrbitSpeed)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.patchSettings({ autoOrbitSpeed: value });
					})
			);

		new Setting(containerEl)
			.setName("Exclude folders")
			.setDesc("Comma-separated list of folders to exclude from the graph.")
			.addText((text) =>
				text
					.setPlaceholder("templates, daily-notes")
					.setValue(this.plugin.settings.excludeFolders.join(", "))
					.onChange(async (value) => {
						await this.patchSettings({
							excludeFolders: value
								.split(",")
								.map((s) => s.trim())
								.filter((s) => s.length > 0),
						});
					})
			);

		// --- UMAP Settings ---
		new Setting(containerEl).setName("UMAP parameters").setHeading();

		new Setting(containerEl)
			.setName("Number of neighbors")
			.setDesc("Controls local vs global structure (5-50). Lower = tighter clusters, higher = broader spread. Default: 30.")
			.addSlider((slider) =>
				slider
					.setLimits(5, 50, 1)
					.setValue(this.plugin.settings.umapNNeighbors)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.patchSettings({ umapNNeighbors: value });
					})
			);

		new Setting(containerEl)
			.setName("Minimum distance")
			.setDesc("How tightly UMAP packs similar points (0.0-0.99). Lower = more clustered. Default: 0.80.")
			.addSlider((slider) =>
				slider
					.setLimits(0, 0.99, 0.01)
					.setValue(this.plugin.settings.umapMinDist)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.patchSettings({ umapMinDist: value });
					})
			);

		// --- Reset ---
		new Setting(containerEl).setName("Reset").setHeading();

		new Setting(containerEl)
			.setName("Reset to defaults")
			.setDesc("Restore all settings to their default values (API key is preserved).")
			.addButton((btn) =>
				btn
					.setButtonText("Reset")
					.setWarning()
					.onClick(async () => {
						const apiKey = this.plugin.settings.embeddingApiKey;
						await this.replaceSettings({
							...createDefaultSettings(),
							embeddingApiKey: apiKey,
						});
						this.display();
					})
			);
	}

	private async patchSettings(patch: Partial<PluginSettings>): Promise<void> {
		this.plugin.settings = {
			...clonePluginSettings(this.plugin.settings),
			...patch,
		};
		await this.plugin.saveSettings();
	}

	private async replaceSettings(settings: PluginSettings): Promise<void> {
		this.plugin.settings = clonePluginSettings(settings);
		await this.plugin.saveSettings();
	}

	private addEmbeddingModelOptions(dropdown: import("obsidian").DropdownComponent) {
		PRESET_EMBEDDING_MODELS.openai.forEach((model) => {
			dropdown.addOption(model, `${EMBEDDING_PROVIDER_LABELS.openai} - ${model}`);
		});
		return dropdown;
	}

	private getSelectedEmbeddingOptionValue(): string {
		return PRESET_EMBEDDING_MODELS.openai.includes(this.plugin.settings.embeddingModel)
			? this.plugin.settings.embeddingModel
			: PRESET_EMBEDDING_MODELS.openai[0];
	}

	private uploadVectorsJson(): void {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "application/json,.json";
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			try {
				const raw = await file.text();
				JSON.parse(raw);
				const path = `${this.plugin.manifest.dir}/${UPLOADED_VECTORS_FILE}`;
				await this.app.vault.adapter.write(path, raw);
				await this.patchSettings({ uploadedVectorsFileName: file.name });
				this.display();
				new Notice("Uploaded vectors JSON saved.");
			} catch (error) {
				new Notice(`Failed to upload vectors JSON: ${error instanceof Error ? error.message : String(error)}`);
			}
		};
		input.click();
	}

	private async exportVectorsJson(): Promise<void> {
		try {
			const uploadedPath = `${this.plugin.manifest.dir}/${UPLOADED_VECTORS_FILE}`;
			const adapter = this.app.vault.adapter;
			let raw: string;
			let fileName: string;
			let noticeMessage: string;

			if (await adapter.exists(uploadedPath)) {
				raw = await adapter.read(uploadedPath);
				fileName = this.plugin.settings.uploadedVectorsFileName || UPLOADED_VECTORS_FILE;
				noticeMessage = "Existing uploaded vectors exported.";
			} else {
				if (this.plugin.settings.embeddingApiKey.trim()) {
					new Notice("Generating vectors JSON...");
					const service = new EmbeddingService(this.app, this.plugin.settings, this.plugin.manifest.dir!);
					const embeddings = await service.getEmbeddings();
					raw = serializeUploadedVectors(embeddings.entries());
					fileName = "exported-vectors.json";
					noticeMessage = "Generated vectors exported.";
				} else {
					raw = this.getUploadedVectorsTemplateJson();
					fileName = "vectors-template.json";
					noticeMessage = "Template vectors JSON exported.";
				}
			}

			this.downloadJsonFile(fileName, raw);
			const vaultPath = await this.writeVectorsPreviewFile(fileName, raw);
			new Notice(`${noticeMessage} Created ${vaultPath} in the vault.`);
		} catch (error) {
			new Notice(`Failed to extract vectors JSON: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private getUploadedVectorsTemplateJson(): string {
		const entries = this.app.vault
			.getMarkdownFiles()
			.filter((file) => {
				return !this.plugin.settings.excludeFolders.some(
					(folder) => file.path.startsWith(`${folder}/`) || file.path === folder
				);
			})
			.map((file) => [file.path, { embedding: [] as number[] }] as const);
		return JSON.stringify({ entries: Object.fromEntries(entries) }, null, 2);
	}

	private downloadJsonFile(fileName: string, raw: string): void {
		const blob = new Blob([raw], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = fileName;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	private async writeVectorsPreviewFile(fileName: string, raw: string): Promise<string> {
		const vaultPath = normalizePath(fileName);
		const existing = this.app.vault.getAbstractFileByPath(vaultPath);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, raw);
			return vaultPath;
		}
		if (existing) {
			throw new Error(`Cannot write exported vectors to "${vaultPath}" because a folder already exists there.`);
		}
		await this.app.vault.create(vaultPath, raw);
		return vaultPath;
	}
}
