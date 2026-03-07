import { GraphData, GraphNode } from "./types";

export class GraphInspectorPanel {
	private container: HTMLElement;
	private onOpenNote: (path: string) => void;
	private hoveredNode: GraphNode | null = null;
	private selectedNode: GraphNode | null = null;
	private nodeByPath = new Map<string, GraphNode>();
	private adjacency = new Map<string, Set<string>>();
	private statusEl: HTMLDivElement;
	private titleEl: HTMLDivElement;
	private pathEl: HTMLDivElement;
	private statsEl: HTMLDivElement;
	private linksEl: HTMLDivElement;
	private listEl: HTMLUListElement;
	private openButton: HTMLButtonElement;
	private clearButton: HTMLButtonElement;

	constructor(container: HTMLElement, onOpenNote: (path: string) => void) {
		this.container = container;
		this.onOpenNote = onOpenNote;
		this.container.replaceChildren();
		this.container.addClass("semantic-graph-inspector-panel");

		const headerEl = this.container.createDiv({ cls: "semantic-graph-inspector-header" });
		headerEl.createDiv({ cls: "semantic-graph-inspector-kicker", text: "Inspector" });

		this.statusEl = headerEl.createDiv({ cls: "semantic-graph-inspector-status" });
		this.titleEl = this.container.createDiv({ cls: "semantic-graph-inspector-title" });
		this.pathEl = this.container.createDiv({ cls: "semantic-graph-inspector-path" });
		this.statsEl = this.container.createDiv({ cls: "semantic-graph-inspector-stats" });

		const actionsEl = this.container.createDiv({ cls: "semantic-graph-inspector-actions" });
		this.openButton = actionsEl.createEl("button", {
			cls: "semantic-graph-btn semantic-graph-btn-small",
			text: "Open Note",
		});
		this.openButton.addEventListener("click", () => {
			const activeNode = this.getActiveNode();
			if (activeNode) this.onOpenNote(activeNode.path);
		});

		this.clearButton = actionsEl.createEl("button", {
			cls: "semantic-graph-btn semantic-graph-btn-small",
			text: "Clear",
		});
		this.clearButton.addEventListener("click", () => {
			this.selectedNode = null;
			this.render();
		});

		this.linksEl = this.container.createDiv({ cls: "semantic-graph-inspector-links-title" });
		this.listEl = this.container.createEl("ul", { cls: "semantic-graph-inspector-links" });

		this.render();
	}

	setGraphData(data: GraphData): void {
		this.nodeByPath.clear();
		this.adjacency.clear();

		for (const node of data.nodes) {
			this.nodeByPath.set(node.path, node);
			this.adjacency.set(node.path, new Set());
		}

		for (const link of data.links) {
			const source = this.getNodePath(link.source);
			const target = this.getNodePath(link.target);
			if (!source || !target) continue;

			this.adjacency.get(source)?.add(target);
			this.adjacency.get(target)?.add(source);
		}

		if (this.selectedNode) {
			this.selectedNode = this.nodeByPath.get(this.selectedNode.path) ?? null;
		}
		if (this.hoveredNode) {
			this.hoveredNode = this.nodeByPath.get(this.hoveredNode.path) ?? null;
		}

		this.render();
	}

	setHoveredNode(node: GraphNode | null): void {
		this.hoveredNode = node;
		this.render();
	}

	setSelectedNode(node: GraphNode | null): void {
		this.selectedNode = node;
		this.render();
	}

	dispose(): void {
		this.container.replaceChildren();
	}

	private render(): void {
		const activeNode = this.getActiveNode();
		const isSelected = !!this.selectedNode;

		if (!activeNode) {
			this.statusEl.setText("No node selected");
			this.titleEl.setText("Hover or click a node");
			this.pathEl.setText("The inspector keeps the last clicked node pinned here.");
			this.statsEl.setText("");
			this.linksEl.setText("");
			this.listEl.replaceChildren();
			this.openButton.disabled = true;
			this.clearButton.disabled = true;
			return;
		}

		this.statusEl.setText(isSelected ? "Pinned selection" : "Hover preview");
		this.titleEl.setText(activeNode.name);
		this.pathEl.setText(activeNode.path);

		const neighbors = Array.from(this.adjacency.get(activeNode.path) ?? []);
		this.statsEl.setText(`Connections ${neighbors.length}  |  Node size ${activeNode.size.toFixed(1)}`);
		this.linksEl.setText(neighbors.length > 0 ? "Connected notes" : "Connected notes: none");
		this.openButton.disabled = false;
		this.clearButton.disabled = !isSelected;

		const items = neighbors
			.map((path) => this.nodeByPath.get(path))
			.filter((node): node is GraphNode => !!node)
			.sort((a, b) => a.name.localeCompare(b.name))
			.slice(0, 12);

		this.listEl.replaceChildren();
		for (const node of items) {
			const itemEl = document.createElement("li");
			itemEl.className = "semantic-graph-inspector-link-item";

			const buttonEl = document.createElement("button");
			buttonEl.className = "semantic-graph-inspector-link-btn";
			buttonEl.type = "button";
			buttonEl.textContent = node.name;
			buttonEl.addEventListener("click", () => {
				this.selectedNode = node;
				this.render();
			});

			const pathEl = document.createElement("div");
			pathEl.className = "semantic-graph-inspector-link-path";
			pathEl.textContent = node.path;

			itemEl.append(buttonEl, pathEl);
			this.listEl.append(itemEl);
		}
	}

	private getActiveNode(): GraphNode | null {
		return this.selectedNode ?? this.hoveredNode;
	}

	private getNodePath(nodeRef: string | GraphNode): string | null {
		if (typeof nodeRef === "string") return nodeRef;
		return nodeRef?.path ?? nodeRef?.id ?? null;
	}
}
