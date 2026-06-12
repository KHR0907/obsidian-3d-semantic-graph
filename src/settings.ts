import {
	App,
	Notice,
	Setting,
	SettingDefinitionItem,
	normalizePath,
	PluginSettingTab,
	TFile,
} from "obsidian";
import SemanticGraphPlugin from "./main";
import { EmbeddingService } from "./embedding";
import {
	clonePluginSettings,
	createDefaultSettings,
	EMBEDDING_PROVIDER_LABELS,
	EmbeddingProvider,
	generateRandomLayoutSeed,
	getDefaultEmbeddingModel,
	isPathExcluded,
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

	getSettingDefinitions(): SettingDefinitionItem[] {
		const settings = this.plugin.settings;

		return [
			{
				type: "group",
				heading: "Embeddings",
				items: [
					{
						name: "Embedding provider",
						desc: "OpenAI requires an access key. Ollama runs locally without a key.",
						control: {
							type: "dropdown",
							key: "embeddingProvider",
							options: { ...EMBEDDING_PROVIDER_LABELS },
						},
					},
					{
						name: "Ollama endpoint",
						desc: "Base URL of the local Ollama server. Default: http://localhost:11434.",
						visible: () => this.plugin.settings.embeddingProvider === "ollama",
						control: {
							type: "text",
							key: "ollamaEndpoint",
							placeholder: "http://localhost:11434",
						},
					},
					{
						name: "Access key",
						desc: "Access key for generating embeddings. Leave blank to use the sphere layout without semantic positioning.",
						visible: () => this.plugin.settings.embeddingProvider !== "ollama",
						render: (setting: Setting) => {
							setting.addText((text) =>
								text
									.setPlaceholder("Paste your access key")
									.setValue(this.plugin.settings.embeddingApiKey)
									.then((t) => (t.inputEl.type = "password"))
									.onChange(async (value) => {
										await this.patchSettings({ embeddingApiKey: value.trim() });
									})
							);
						},
					},
					{
						name: "Embedding model",
						desc:
							settings.embeddingProvider === "ollama"
								? "Choose which model to use for embeddings. Pull it first with `ollama pull <model>`."
								: "Choose which model to use for embeddings.",
						control: {
							type: "dropdown",
							key: "embeddingModel",
							options: Object.fromEntries(
								PRESET_EMBEDDING_MODELS[settings.embeddingProvider].map((model) => [model, model])
							),
						},
					},
					{
						name: "Vector file",
						desc: "Use an uploaded vector file instead of generated embeddings.",
						render: (setting: Setting) => {
							setting
								.addButton((button) =>
									button
										.setButtonText("Export")
										.setTooltip("Download vectors as a compatible file")
										.onClick(() => void this.exportVectorsJson())
								)
								.addButton((button) =>
									button
										.setButtonText(this.plugin.settings.uploadedVectorsFileName ? "Upload again" : "Upload")
										.onClick(() => void this.uploadVectorsJson())
								)
								.addText((text) =>
									text
										.setPlaceholder("Uploaded file name")
										.setValue(this.plugin.settings.uploadedVectorsFileName)
										.setDisabled(true)
								)
								.addExtraButton((button) =>
									button
										.setIcon("cross")
										.setTooltip("Clear uploaded vectors reference")
										.onClick(async () => {
											await this.patchSettings({ uploadedVectorsFileName: "" });
											this.update();
										})
								);
						},
					},
				],
			},
			{
				type: "group",
				heading: "Graph",
				items: [
					{
						name: "Node color by",
						desc: "How to assign colors to nodes. Default: folder.",
						control: {
							type: "dropdown",
							key: "nodeColorBy",
							options: { folder: "Folder", tag: "First tag" },
						},
					},
					{
						name: "Projection method",
						desc: "Choose how embeddings are projected into space. Default: mapped layout.",
						control: {
							type: "dropdown",
							key: "projectionMethod",
							options: { umap: "Mapped layout", pca: "Principal components" },
						},
					},
					{
						name: "Layout seed",
						desc: "Seed used for layout steps and overlap resolution. Using the same seed makes the layout more repeatable. Default: random.",
						render: (setting: Setting) => {
							setting
								.addButton((button) =>
									button.setButtonText("Random").onClick(async () => {
										await this.patchSettings({ layoutSeed: generateRandomLayoutSeed() });
										this.update();
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
						},
					},
					{
						name: "Show links",
						desc: "Display connection lines between nodes. Default: off.",
						control: { type: "toggle", key: "showLinks" },
					},
					{
						name: "Show grid",
						desc: "Display a solid square grid on the ground plane. Default: on.",
						control: { type: "toggle", key: "showGrid" },
					},
				],
			},
			{
				type: "group",
				heading: "Appearance",
				items: [
					{
						name: "Scene theme",
						desc: "Choose the background style for the scene. Auto follows the app theme. Default: auto.",
						control: {
							type: "dropdown",
							key: "sceneTheme",
							options: { auto: "Auto", dark: "Dark", light: "Light" },
						},
					},
					{
						name: "Node opacity",
						desc: "Adjust node transparency. Default: 1.0.",
						control: { type: "slider", key: "nodeOpacity", min: 0.15, max: 1, step: 0.05 },
					},
					{
						name: "Node size",
						desc: "Adjust the size of nodes. Default: 1.5.",
						control: { type: "slider", key: "nodeSizeScale", min: 0.4, max: 2, step: 0.05 },
					},
					{
						name: "Drag sensitivity",
						desc: "Adjust how strongly the camera responds when dragging the graph. Default: 1.0.",
						control: { type: "slider", key: "dragSensitivity", min: 0.2, max: 3, step: 0.1 },
					},
					{
						name: "Auto orbit speed",
						desc: "Adjust the idle camera orbit speed. Set to 0 to disable automatic camera movement. Default: 0.2.",
						control: { type: "slider", key: "autoOrbitSpeed", min: 0, max: 3, step: 0.1 },
					},
					{
						name: "Suggested links",
						desc: "Maximum number of suggested links shown in the insights panel. Default: 20.",
						control: { type: "slider", key: "suggestedLinkCount", min: 5, max: 100, step: 5 },
					},
					{
						name: "Neighbor count",
						desc: "Number of notes shown in the semantic neighbors sidebar. Default: 10.",
						control: { type: "slider", key: "neighborCount", min: 3, max: 30, step: 1 },
					},
					{
						name: "Exclude folders",
						desc: "Comma-separated list of folders to exclude from the graph.",
						control: {
							type: "text",
							key: "excludeFolders",
							placeholder: "Templates, daily-notes",
						},
					},
				],
			},
			{
				type: "group",
				heading: "Projection tuning",
				items: [
					{
						name: "Number of neighbors",
						desc: "Controls local vs global structure (5-50). Lower = tighter clusters, higher = broader spread. Default: 30.",
						control: { type: "slider", key: "umapNNeighbors", min: 5, max: 50, step: 1 },
					},
					{
						name: "Minimum distance",
						desc: "How tightly similar points are packed (0.0-0.99). Lower values create tighter clusters. Default: 0.80.",
						control: { type: "slider", key: "umapMinDist", min: 0, max: 0.99, step: 0.01 },
					},
				],
			},
			{
				type: "group",
				heading: "Reset",
				items: [
					{
						name: "Reset to defaults",
						desc: "Restore all settings to their default values. The access key is preserved.",
						render: (setting: Setting) => {
							setting.addButton((button) =>
								button
									.setButtonText("Reset")
									.setDestructive()
									.onClick(async () => {
										const apiKey = this.plugin.settings.embeddingApiKey;
										await this.replaceSettings({
											...createDefaultSettings(),
											embeddingApiKey: apiKey,
										});
										this.update();
									})
							);
						},
					},
				],
			},
		];
	}

	getControlValue(key: string): unknown {
		if (key === "excludeFolders") {
			return this.plugin.settings.excludeFolders.join(", ");
		}
		return (this.plugin.settings as unknown as Record<string, unknown>)[key];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === "embeddingProvider") {
			const provider = value as EmbeddingProvider;
			await this.patchSettings({
				embeddingProvider: provider,
				embeddingModel: getDefaultEmbeddingModel(provider),
			});
			// Model presets and endpoint/key visibility are structural — re-render.
			this.update();
			return;
		}
		if (key === "excludeFolders") {
			await this.patchSettings({
				excludeFolders: String(value)
					.split(",")
					.map((s) => s.trim())
					.filter((s) => s.length > 0),
			});
			return;
		}
		await this.patchSettings({ [key]: value } as Partial<PluginSettings>);
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

	private uploadVectorsJson(): void {
		const input = activeDocument.createElement("input");
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
				this.update();
				new Notice("Uploaded vector file saved.");
			} catch (error) {
				new Notice(`Failed to upload vector file: ${error instanceof Error ? error.message : String(error)}`);
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
				noticeMessage = "Uploaded vector file exported.";
			} else {
				const s = this.plugin.settings;
				const canGenerate = s.embeddingProvider === "ollama"
					? Boolean(s.ollamaEndpoint.trim())
					: Boolean(s.embeddingApiKey.trim());
				if (canGenerate) {
					new Notice("Generating vector file...");
					const service = new EmbeddingService(this.app, this.plugin.settings, this.plugin.manifest.dir!);
					const embeddings = await service.getEmbeddings();
					raw = serializeUploadedVectors(embeddings.entries());
					fileName = "exported-vectors.json";
					noticeMessage = "Generated vector file exported.";
				} else {
					raw = this.getUploadedVectorsTemplateJson();
					fileName = "vectors-template.json";
					noticeMessage = "Template vector file exported.";
				}
			}

			this.downloadJsonFile(fileName, raw);
			const vaultPath = await this.writeVectorsPreviewFile(fileName, raw);
			new Notice(`${noticeMessage} Created ${vaultPath} in the vault.`);
		} catch (error) {
			new Notice(`Failed to export vector file: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private getUploadedVectorsTemplateJson(): string {
		const entries = this.app.vault
			.getMarkdownFiles()
			.filter((file) => {
				return !isPathExcluded(file.path, this.plugin.settings.excludeFolders);
			})
			.map((file) => [file.path, { embedding: [] as number[] }] as const);
		return JSON.stringify({ entries: Object.fromEntries(entries) }, null, 2);
	}

	private downloadJsonFile(fileName: string, raw: string): void {
		const blob = new Blob([raw], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const anchor = activeDocument.createElement("a");
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
