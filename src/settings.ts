import {
	App,
	Notice,
	Setting,
	normalizePath,
	PluginSettingTab,
	TFile,
} from "obsidian";
import SemanticGraphPlugin from "./main";
import { EmbeddingService } from "./embedding";
import { t } from "./i18n";
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

	/**
	 * 1.13 declarative-settings hook: lets Obsidian index this tab's settings
	 * for the settings search. Harmless on older versions (never called there);
	 * rendering itself always goes through {@link display}.
	 */
	getSettingDefinitions() {
		return this.buildSettingDefinitions();
	}

	/**
	 * Declarative description of the settings pane. This is the single source of
	 * truth for {@link display}; it deliberately avoids the 1.13
	 * `SettingDefinitionItem` type so the plugin stays within the API surface
	 * its declared `minAppVersion` supports.
	 */
	private buildSettingDefinitions(): SettingDefinitionEntry[] {
		const settings = this.plugin.settings;

		return [
			{
				type: "group",
				heading: t("settings.general.heading"),
				items: [
					{
						name: t("settings.language.name"),
						desc: t("settings.language.desc"),
						control: {
							type: "dropdown",
							key: "language",
							options: {
								auto: t("settings.language.auto"),
								en: "English",
								ko: "한국어",
							},
						},
					},
				],
			},
			{
				type: "group",
				heading: t("settings.embeddings.heading"),
				items: [
					{
						name: t("settings.provider.name"),
						desc: t("settings.provider.desc"),
						control: {
							type: "dropdown",
							key: "embeddingProvider",
							options: { ...EMBEDDING_PROVIDER_LABELS },
						},
					},
					{
						name: t("settings.ollamaEndpoint.name"),
						desc: t("settings.ollamaEndpoint.desc"),
						visible: () => this.plugin.settings.embeddingProvider === "ollama",
						control: {
							type: "text",
							key: "ollamaEndpoint",
							placeholder: "http://localhost:11434",
						},
					},
					{
						name: t("settings.accessKey.name"),
						desc: t("settings.accessKey.desc"),
						visible: () => this.plugin.settings.embeddingProvider !== "ollama",
						render: (setting: Setting) => {
							setting.addText((text) =>
								text
									.setPlaceholder(t("settings.accessKey.placeholder"))
									.setValue(this.plugin.settings.embeddingApiKey)
									.then((input) => (input.inputEl.type = "password"))
									.onChange(async (value) => {
										await this.patchSettings({ embeddingApiKey: value.trim() });
									})
							);
						},
					},
					{
						name: t("settings.model.name"),
						desc:
							settings.embeddingProvider === "ollama"
								? t("settings.model.descOllama")
								: t("settings.model.desc"),
						control: {
							type: "dropdown",
							key: "embeddingModel",
							options: Object.fromEntries(
								PRESET_EMBEDDING_MODELS[settings.embeddingProvider].map((model) => [model, model])
							),
						},
					},
					{
						name: t("settings.vectorFile.name"),
						desc: t("settings.vectorFile.desc"),
						render: (setting: Setting) => {
							setting
								.addButton((button) =>
									button
										.setButtonText(t("settings.vectorFile.export"))
										.setTooltip(t("settings.vectorFile.exportTooltip"))
										.onClick(() => void this.exportVectorsJson())
								)
								.addButton((button) =>
									button
										.setButtonText(
											this.plugin.settings.uploadedVectorsFileName
												? t("settings.vectorFile.uploadAgain")
												: t("settings.vectorFile.upload")
										)
										.onClick(() => void this.uploadVectorsJson())
								)
								.addText((text) =>
									text
										.setPlaceholder(t("settings.vectorFile.placeholder"))
										.setValue(this.plugin.settings.uploadedVectorsFileName)
										.setDisabled(true)
								)
								.addExtraButton((button) =>
									button
										.setIcon("cross")
										.setTooltip(t("settings.vectorFile.clearTooltip"))
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
				heading: t("settings.graph.heading"),
				items: [
					{
						name: t("settings.nodeColorBy.name"),
						desc: t("settings.nodeColorBy.desc"),
						control: {
							type: "dropdown",
							key: "nodeColorBy",
							options: {
								folder: t("settings.nodeColorBy.folder"),
								tag: t("settings.nodeColorBy.tag"),
							},
						},
					},
					{
						name: t("settings.projection.name"),
						desc: t("settings.projection.desc"),
						control: {
							type: "dropdown",
							key: "projectionMethod",
							options: {
								umap: t("settings.projection.umap"),
								pca: t("settings.projection.pca"),
							},
						},
					},
					{
						name: t("settings.layoutSeed.name"),
						desc: t("settings.layoutSeed.desc"),
						render: (setting: Setting) => {
							setting
								.addButton((button) =>
									button.setButtonText(t("settings.layoutSeed.random")).onClick(async () => {
										await this.patchSettings({ layoutSeed: generateRandomLayoutSeed() });
										this.update();
									})
								)
								.addText((text) =>
									text
										.setPlaceholder("12345")
										.setValue(String(this.plugin.settings.layoutSeed))
										.then((input) => (input.inputEl.type = "number"))
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
						name: t("settings.showLinks.name"),
						desc: t("settings.showLinks.desc"),
						control: { type: "toggle", key: "showLinks" },
					},
					{
						name: t("settings.showGrid.name"),
						desc: t("settings.showGrid.desc"),
						control: { type: "toggle", key: "showGrid" },
					},
					{
						name: t("settings.clusterSource.name"),
						desc: t("settings.clusterSource.desc"),
						control: {
							type: "dropdown",
							key: "clusterSource",
							options: {
								semantic: t("settings.clusterSource.semantic"),
								folder: t("settings.clusterSource.folder"),
							},
						},
					},
					{
						name: t("settings.timelineSource.name"),
						desc: t("settings.timelineSource.desc"),
						control: {
							type: "dropdown",
							key: "timelineDateSource",
							options: {
								ctime: t("settings.timelineSource.ctime"),
								frontmatter: t("settings.timelineSource.frontmatter"),
							},
						},
					},
				],
			},
			{
				type: "group",
				heading: t("settings.appearance.heading"),
				items: [
					{
						name: t("settings.sceneTheme.name"),
						desc: t("settings.sceneTheme.desc"),
						control: {
							type: "dropdown",
							key: "sceneTheme",
							options: {
								auto: t("settings.sceneTheme.auto"),
								dark: t("settings.sceneTheme.dark"),
								light: t("settings.sceneTheme.light"),
							},
						},
					},
					{
						name: t("settings.nodeOpacity.name"),
						desc: t("settings.nodeOpacity.desc"),
						control: { type: "slider", key: "nodeOpacity", min: 0.15, max: 1, step: 0.05 },
					},
					{
						name: t("settings.nodeSize.name"),
						desc: t("settings.nodeSize.desc"),
						control: { type: "slider", key: "nodeSizeScale", min: 0.4, max: 2, step: 0.05 },
					},
					{
						name: t("settings.dragSensitivity.name"),
						desc: t("settings.dragSensitivity.desc"),
						control: { type: "slider", key: "dragSensitivity", min: 0.2, max: 3, step: 0.1 },
					},
					{
						name: t("settings.autoOrbit.name"),
						desc: t("settings.autoOrbit.desc"),
						control: { type: "slider", key: "autoOrbitSpeed", min: 0, max: 3, step: 0.1 },
					},
					{
						name: t("settings.entryAnimation.name"),
						desc: t("settings.entryAnimation.desc"),
						control: { type: "toggle", key: "entryAnimation" },
					},
					{
						name: t("settings.suggestedLinks.name"),
						desc: t("settings.suggestedLinks.desc"),
						control: { type: "slider", key: "suggestedLinkCount", min: 5, max: 100, step: 5 },
					},
					{
						name: t("settings.neighborCount.name"),
						desc: t("settings.neighborCount.desc"),
						control: { type: "slider", key: "neighborCount", min: 3, max: 30, step: 1 },
					},
					{
						name: t("settings.excludeFolders.name"),
						desc: t("settings.excludeFolders.desc"),
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
				heading: t("settings.tuning.heading"),
				items: [
					{
						name: t("settings.umapNeighbors.name"),
						desc: t("settings.umapNeighbors.desc"),
						control: { type: "slider", key: "umapNNeighbors", min: 5, max: 50, step: 1 },
					},
					{
						name: t("settings.umapMinDist.name"),
						desc: t("settings.umapMinDist.desc"),
						control: { type: "slider", key: "umapMinDist", min: 0, max: 0.99, step: 0.01 },
					},
				],
			},
			{
				type: "group",
				heading: t("settings.reset.heading"),
				items: [
					{
						name: t("settings.reset.name"),
						desc: t("settings.reset.desc"),
						render: (setting: Setting) => {
							setting.addButton((button) =>
								button
									.setButtonText(t("settings.reset.button"))
									// mod-warning class directly: setDestructive() is 1.13-only
									// (above minAppVersion 1.11.0) and setWarning() is deprecated.
									.then((b) => b.buttonEl.addClass("mod-warning"))
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

	/**
	 * Render the settings pane from {@link buildSettingDefinitions}.
	 *
	 * The pane is described declaratively but rendered here with the stable
	 * `Setting` API rather than Obsidian 1.13's `getSettingDefinitions()`
	 * auto-render, so the plugin works on every version at or above its declared
	 * `minAppVersion`. This walker only draws the subset of the declarative
	 * schema the plugin actually uses.
	 */
	display(): void {
		this.renderPane();
	}

	/** Re-render the whole pane; called after structural setting changes. */
	update(): void {
		this.renderPane();
	}

	private renderPane(): void {
		this.containerEl.empty();
		for (const item of this.buildSettingDefinitions()) {
			if (item.type === "group" || item.type === "list") {
				if (item.heading) {
					new Setting(this.containerEl).setName(item.heading).setHeading();
				}
				for (const child of item.items ?? []) {
					this.renderDefinitionRow(child);
				}
				continue;
			}
			this.renderDefinitionRow(item);
		}
	}

	private renderDefinitionRow(def: SettingDefinitionRow): void {
		if (!resolveVisible(def.visible)) return;

		const setting = new Setting(this.containerEl);
		if (def.name) setting.setName(def.name);
		if (def.desc) setting.setDesc(def.desc);

		if (typeof def.render === "function") {
			// This plugin's render callbacks only use the Setting argument; the
			// SettingGroup param is never read, so an undefined shim is safe.
			def.render(setting, undefined);
			return;
		}

		if (def.control) {
			this.applyControl(setting, def.control);
		}
	}

	private applyControl(setting: Setting, control: SettingControlSpec): void {
		const key = control.key;
		if (control.type === "dropdown") {
			setting.addDropdown((dropdown) =>
				dropdown
					.addOptions(control.options)
					.setValue(controlText(this.getControlValue(key)))
					.onChange((value) => void this.setControlValue(key, value))
			);
		} else if (control.type === "text") {
			setting.addText((text) =>
				text
					.setPlaceholder(control.placeholder ?? "")
					.setValue(controlText(this.getControlValue(key)))
					.onChange((value) => void this.setControlValue(key, value))
			);
		} else if (control.type === "toggle") {
			setting.addToggle((toggle) =>
				toggle
					.setValue(Boolean(this.getControlValue(key)))
					.onChange((value) => void this.setControlValue(key, value))
			);
		} else if (control.type === "slider") {
			setting.addSlider((slider) => {
				slider
					.setLimits(control.min, control.max, control.step)
					.setValue(Number(this.getControlValue(key)))
					.onChange((value) => {
						// Native tooltip as value feedback; on Obsidian < 1.13 the
						// slider does not show its value inline.
						slider.sliderEl.title = String(value);
						void this.setControlValue(key, value);
					});
				slider.sliderEl.title = String(Number(this.getControlValue(key)));
			});
		}
		// Any other control type is skipped rather than blanking the whole pane.
	}

	getControlValue(key: string): unknown {
		if (key === "excludeFolders") {
			return this.plugin.settings.excludeFolders.join(", ");
		}
		return (this.plugin.settings as unknown as Record<string, unknown>)[key];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === "language") {
			await this.patchSettings({ language: value as PluginSettings["language"] });
			// saveSettings re-applies the locale; re-render so the tab itself switches language.
			this.update();
			return;
		}
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
		await this.patchSettings({ [key]: value });
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
		const input = activeDocument.createEl("input");
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
				new Notice(t("notice.vectorsUploaded"));
			} catch (error) {
				new Notice(t("notice.vectorsUploadFailed", { message: errorMessage(error) }));
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
				noticeMessage = t("notice.vectorsExported.uploaded");
			} else {
				const s = this.plugin.settings;
				const canGenerate = s.embeddingProvider === "ollama"
					? Boolean(s.ollamaEndpoint.trim())
					: Boolean(s.embeddingApiKey.trim());
				if (canGenerate) {
					new Notice(t("notice.vectorsGenerating"));
					const service = new EmbeddingService(this.app, this.plugin.settings, this.plugin.manifest.dir!);
					const embeddings = await service.getEmbeddings();
					raw = serializeUploadedVectors(embeddings.entries());
					fileName = "exported-vectors.json";
					noticeMessage = t("notice.vectorsExported.generated");
				} else {
					raw = this.getUploadedVectorsTemplateJson();
					fileName = "vectors-template.json";
					noticeMessage = t("notice.vectorsExported.template");
				}
			}

			this.downloadJsonFile(fileName, raw);
			const vaultPath = await this.writeVectorsPreviewFile(fileName, raw);
			new Notice(t("notice.vectorsExported.createdInVault", { message: noticeMessage, path: vaultPath }));
		} catch (error) {
			new Notice(t("notice.vectorsExportFailed", { message: errorMessage(error) }));
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
		const anchor = activeDocument.createEl("a");
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

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Coerce a control value to display text without relying on Object stringification. */
function controlText(value: unknown): string {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return "";
}

/** Evaluate a declarative `visible` value (boolean or `() => boolean`). */
function resolveVisible(visible: boolean | (() => boolean) | undefined): boolean {
	if (visible === undefined) return true;
	return typeof visible === "function" ? visible() : visible;
}

/**
 * The subset of the declarative setting schema this plugin uses. Kept local
 * (structurally compatible with the 1.13 `SettingDefinitionItem` union, but
 * without referencing 1.13-only type exports) so the source stays within the
 * API surface of the declared `minAppVersion` while `getSettingDefinitions()`
 * still satisfies the base-class signature on 1.13 typings.
 */
interface SettingRowBase {
	name: string;
	desc?: string | DocumentFragment;
	visible?: boolean | (() => boolean);
}

interface SettingRowControl extends SettingRowBase {
	control: SettingControlSpec;
	render?: never;
	action?: never;
}

interface SettingRowRender extends SettingRowBase {
	render: (setting: Setting, group: unknown) => void;
	control?: never;
	action?: never;
}

type SettingDefinitionRow = SettingRowControl | SettingRowRender;

type SettingControlSpec =
	| { type: "dropdown"; key: string; options: Record<string, string> }
	| { type: "text"; key: string; placeholder?: string }
	| { type: "toggle"; key: string }
	| { type: "slider"; key: string; min: number; max: number; step: number };

/** A top-level entry from `buildSettingDefinitions()`: a group/list or a bare row. */
type SettingDefinitionEntry =
	| { type: "group"; heading?: string; items?: SettingDefinitionRow[] }
	| { type: "list"; heading?: string; items?: SettingDefinitionRow[] }
	| ({ type?: undefined } & SettingDefinitionRow);
