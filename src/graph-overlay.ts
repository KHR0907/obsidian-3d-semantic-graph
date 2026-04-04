import { GraphNode } from "./types";

interface HoverInfo {
	node: GraphNode;
	connectionCount: number;
}

export class GraphStageOverlay {
	private container: HTMLElement;
	private cardEl: HTMLDivElement;
	private titleEl: HTMLDivElement;
	private pathEl: HTMLDivElement;
	private metaEl: HTMLDivElement;

	constructor(container: HTMLElement) {
		this.container = container;
		this.container.classList.add("semantic-graph-overlay-layer");

		this.cardEl = this.container.createDiv({ cls: "semantic-graph-hover-card" });

		this.titleEl = this.cardEl.createDiv({ cls: "semantic-graph-hover-title" });

		this.pathEl = this.cardEl.createDiv({ cls: "semantic-graph-hover-path" });

		this.metaEl = this.cardEl.createDiv({ cls: "semantic-graph-hover-meta" });
	}

	show(info: HoverInfo): void {
		this.titleEl.textContent = info.node.name;
		this.pathEl.textContent = info.node.path;
		this.metaEl.textContent = `Connections ${info.connectionCount}  |  Node size ${info.node.size.toFixed(1)}`;
		this.cardEl.classList.add("is-visible");
	}

	hide(): void {
		this.cardEl.classList.remove("is-visible");
	}

	dispose(): void {
		this.container.replaceChildren();
	}
}
