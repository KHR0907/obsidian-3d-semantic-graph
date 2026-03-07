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

		this.cardEl = document.createElement("div");
		this.cardEl.className = "semantic-graph-hover-card";

		this.titleEl = document.createElement("div");
		this.titleEl.className = "semantic-graph-hover-title";

		this.pathEl = document.createElement("div");
		this.pathEl.className = "semantic-graph-hover-path";

		this.metaEl = document.createElement("div");
		this.metaEl.className = "semantic-graph-hover-meta";

		this.cardEl.append(this.titleEl, this.pathEl, this.metaEl);
		this.container.append(this.cardEl);
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
