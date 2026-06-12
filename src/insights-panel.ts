import { App, Notice, TFile, setIcon } from "obsidian";
import { ClusterRegion } from "./clustered-sphere-layout";
import {
	DuplicatePair,
	MAX_PAIRWISE_NODES,
	SuggestedLink,
	computeOrphans,
	computePairInsights,
} from "./insights";
import { GraphData } from "./types";
import { t } from "./i18n";

export interface InsightsPanelData {
	graphData: GraphData;
	embeddings: Map<string, number[]> | null;
	regions: ClusterRegion[];
	maxSuggestions: number;
}

interface ComputedInsights {
	suggestions: SuggestedLink[];
	duplicates: DuplicatePair[];
	orphans: string[];
}

export interface InsightsPanelCallbacks {
	onOpenNote: (path: string) => void;
	onSuggestions: (suggestions: SuggestedLink[]) => void;
	onVisibilityChange: (open: boolean) => void;
}

export class InsightsPanel {
	private app: App;
	private callbacks: InsightsPanelCallbacks;
	private rootEl: HTMLElement;
	private bodyEl: HTMLElement;
	private data: InsightsPanelData | null = null;
	private computed: ComputedInsights | null = null;
	private open = false;
	private computeRequestId = 0;
	private computingStatusEl: HTMLElement | null = null;

	constructor(app: App, parentEl: HTMLElement, callbacks: InsightsPanelCallbacks) {
		this.app = app;
		this.callbacks = callbacks;

		this.rootEl = parentEl.createDiv({ cls: "semantic-graph-insights" });
		this.rootEl.hide();

		const header = this.rootEl.createDiv({ cls: "semantic-graph-insights-header" });
		header.createSpan({ text: t("insights.title") });
		const closeBtn = header.createEl("button", {
			cls: "semantic-graph-btn semantic-graph-icon-btn",
			attr: { type: "button", "aria-label": t("insights.closeAria") },
		});
		setIcon(closeBtn, "x");
		closeBtn.addEventListener("click", () => this.hide());

		this.bodyEl = this.rootEl.createDiv({ cls: "semantic-graph-insights-body" });
	}

	setData(data: InsightsPanelData): void {
		this.data = data;
		this.computed = null;
		if (this.open) {
			this.computeAndRender();
		}
	}

	isOpen(): boolean {
		return this.open;
	}

	toggle(): void {
		if (this.open) {
			this.hide();
		} else {
			this.show();
		}
	}

	show(): void {
		if (this.open) return;
		this.open = true;
		this.rootEl.show();
		this.computeAndRender();
		this.callbacks.onVisibilityChange(true);
	}

	hide(): void {
		if (!this.open) return;
		this.open = false;
		this.rootEl.hide();
		this.callbacks.onVisibilityChange(false);
	}

	dispose(): void {
		this.rootEl.remove();
	}

	private computeAndRender(): void {
		if (!this.data) {
			this.bodyEl.empty();
			this.bodyEl.createDiv({ cls: "semantic-graph-insights-hint", text: t("insights.loadFirst") });
			return;
		}

		if (this.computed) {
			this.render();
			return;
		}
		void this.runComputation();
	}

	private async runComputation(): Promise<void> {
		if (!this.data) return;
		const requestId = ++this.computeRequestId;
		const { graphData, embeddings, maxSuggestions } = this.data;

		const orphans = computeOrphans(graphData.nodes, graphData.links);
		let suggestions: SuggestedLink[] = [];
		let duplicates: DuplicatePair[] = [];

		if (embeddings && embeddings.size >= 2 && embeddings.size <= MAX_PAIRWISE_NODES) {
			this.showComputing();
			const result = await computePairInsights(embeddings, graphData.links, maxSuggestions, {
				onProgress: (done, total) => {
					if (requestId === this.computeRequestId && total > 0) {
						this.computingStatusEl?.setText(
							t("insights.computing", { percent: Math.round((done / total) * 100) })
						);
					}
				},
			});
			// A newer setData() superseded this run while it was yielding.
			if (requestId !== this.computeRequestId) return;
			suggestions = result.suggestions;
			duplicates = result.duplicates;
		}

		this.computed = { suggestions, duplicates, orphans };
		this.computingStatusEl = null;
		this.callbacks.onSuggestions(suggestions);
		if (this.open) {
			this.render();
		}
	}

	private showComputing(): void {
		this.bodyEl.empty();
		this.computingStatusEl = this.bodyEl.createDiv({
			cls: "semantic-graph-insights-hint",
			text: t("insights.computing", { percent: 0 }),
		});
	}

	private render(): void {
		this.bodyEl.empty();
		if (!this.data || !this.computed) return;

		const { embeddings, regions } = this.data;
		const { suggestions, duplicates, orphans } = this.computed;
		const tooManyNotes = embeddings !== null && embeddings.size > MAX_PAIRWISE_NODES;

		// --- Suggested links ---
		const suggestionsSection = this.createSection(
			t("insights.suggested.title"),
			t("insights.suggested.desc")
		);
		if (!embeddings) {
			suggestionsSection.createDiv({
				cls: "semantic-graph-insights-hint",
				text: t("insights.requiresEmbeddings"),
			});
		} else if (tooManyNotes) {
			suggestionsSection.createDiv({
				cls: "semantic-graph-insights-hint",
				text: t("insights.skippedTooMany", { max: MAX_PAIRWISE_NODES }),
			});
		} else if (suggestions.length === 0) {
			suggestionsSection.createDiv({ cls: "semantic-graph-insights-hint", text: t("insights.noSuggestions") });
		} else {
			for (const suggestion of suggestions) {
				this.renderSuggestionRow(suggestionsSection, suggestion);
			}
		}

		// --- Duplicates ---
		const duplicatesSection = this.createSection(
			t("insights.duplicates.title"),
			t("insights.duplicates.desc")
		);
		if (!embeddings || tooManyNotes) {
			duplicatesSection.createDiv({ cls: "semantic-graph-insights-hint", text: t("insights.requiresEmbeddingsShort") });
		} else if (duplicates.length === 0) {
			duplicatesSection.createDiv({ cls: "semantic-graph-insights-hint", text: t("insights.noDuplicates") });
		} else {
			for (const duplicate of duplicates) {
				const row = duplicatesSection.createDiv({ cls: "semantic-graph-insights-row" });
				this.createNoteLink(row, duplicate.a);
				row.createSpan({ cls: "semantic-graph-insights-sep", text: "↔" });
				this.createNoteLink(row, duplicate.b);
				row.createSpan({
					cls: "semantic-graph-insights-score",
					text: `${Math.round(duplicate.similarity * 100)}%`,
				});
			}
		}

		// --- Orphans ---
		const orphansSection = this.createSection(t("insights.orphans.title"), t("insights.orphans.desc"));
		if (orphans.length === 0) {
			orphansSection.createDiv({ cls: "semantic-graph-insights-hint", text: t("insights.noOrphans") });
		} else {
			for (const path of orphans) {
				const row = orphansSection.createDiv({ cls: "semantic-graph-insights-row" });
				this.createNoteLink(row, path);
			}
		}

		// --- Clusters / MOC ---
		const clustersSection = this.createSection(
			t("insights.clusters.title"),
			t("insights.clusters.desc")
		);
		const usableRegions = regions.filter((region) => region.nodePaths.length > 1);
		if (usableRegions.length === 0) {
			clustersSection.createDiv({ cls: "semantic-graph-insights-hint", text: t("insights.noClusters") });
		} else {
			for (const region of usableRegions) {
				const row = clustersSection.createDiv({ cls: "semantic-graph-insights-row" });
				const label = region.folder === "/" ? t("insights.vaultRoot") : region.folder;
				row.createSpan({
					cls: "semantic-graph-insights-cluster-name",
					text: `${label} (${region.nodePaths.length})`,
				});
				const mocBtn = row.createEl("button", {
					cls: "semantic-graph-btn semantic-graph-insights-action",
					text: t("insights.createMoc"),
					attr: { type: "button" },
				});
				mocBtn.addEventListener("click", () => void this.createMoc(region, mocBtn));
			}
		}
	}

	private renderSuggestionRow(parent: HTMLElement, suggestion: SuggestedLink): void {
		const row = parent.createDiv({ cls: "semantic-graph-insights-row" });
		this.createNoteLink(row, suggestion.source);
		row.createSpan({ cls: "semantic-graph-insights-sep", text: "↔" });
		this.createNoteLink(row, suggestion.target);
		row.createSpan({
			cls: "semantic-graph-insights-score",
			text: `${Math.round(suggestion.similarity * 100)}%`,
		});
		const insertBtn = row.createEl("button", {
			cls: "semantic-graph-btn semantic-graph-icon-btn semantic-graph-insights-action",
			attr: { type: "button", "aria-label": t("insights.insertLinkAria") },
		});
		setIcon(insertBtn, "link");
		insertBtn.addEventListener("click", () => void this.insertLink(suggestion, row));
	}

	private createSection(title: string, description: string): HTMLElement {
		const section = this.bodyEl.createDiv({ cls: "semantic-graph-insights-section" });
		section.createDiv({ cls: "semantic-graph-insights-section-title", text: title });
		section.createDiv({ cls: "semantic-graph-insights-section-desc", text: description });
		return section;
	}

	private createNoteLink(parent: HTMLElement, path: string): void {
		const name = this.basename(path);
		const link = parent.createEl("a", {
			cls: "semantic-graph-insights-note",
			text: name,
			attr: { title: path },
		});
		link.addEventListener("click", (event) => {
			event.preventDefault();
			this.callbacks.onOpenNote(path);
		});
	}

	private basename(path: string): string {
		const file = path.includes("/") ? path.substring(path.lastIndexOf("/") + 1) : path;
		return file.endsWith(".md") ? file.slice(0, -3) : file;
	}

	private async insertLink(suggestion: SuggestedLink, row: HTMLElement): Promise<void> {
		try {
			const sourceFile = this.app.vault.getAbstractFileByPath(suggestion.source);
			const targetFile = this.app.vault.getAbstractFileByPath(suggestion.target);
			if (!(sourceFile instanceof TFile) || !(targetFile instanceof TFile)) {
				throw new Error("Note not found.");
			}

			const linkText = this.app.fileManager.generateMarkdownLink(targetFile, sourceFile.path);
			await this.app.vault.process(sourceFile, (content) => {
				return `${content.replace(/\n+$/, "")}\n\n${linkText}\n`;
			});

			new Notice(t("notice.linked", {
				source: this.basename(suggestion.source),
				target: this.basename(suggestion.target),
			}));
			row.addClass("is-done");

			if (this.computed) {
				this.computed.suggestions = this.computed.suggestions.filter((s) => s !== suggestion);
				this.callbacks.onSuggestions(this.computed.suggestions);
			}
		} catch (error) {
			new Notice(t("notice.linkFailed", { message: error instanceof Error ? error.message : String(error) }));
		}
	}

	private async createMoc(region: ClusterRegion, button: HTMLButtonElement): Promise<void> {
		try {
			button.disabled = true;
			const folderName = region.folder === "/" ? "Vault" : region.folder.split("/").pop() ?? region.folder;
			const basePath = region.folder === "/" ? "" : `${region.folder}/`;

			let mocPath = `${basePath}MOC - ${folderName}.md`;
			let suffix = 1;
			while (this.app.vault.getAbstractFileByPath(mocPath)) {
				mocPath = `${basePath}MOC - ${folderName} ${suffix}.md`;
				suffix++;
			}

			const lines: string[] = [`# MOC - ${folderName}`, ""];
			for (const path of region.nodePaths) {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) {
					lines.push(`- ${this.app.fileManager.generateMarkdownLink(file, mocPath)}`);
				}
			}

			const created = await this.app.vault.create(mocPath, `${lines.join("\n")}\n`);
			new Notice(t("notice.mocCreated", { path: created.path }));
			this.callbacks.onOpenNote(created.path);
		} catch (error) {
			new Notice(t("notice.mocFailed", { message: error instanceof Error ? error.message : String(error) }));
		} finally {
			button.disabled = false;
		}
	}
}
