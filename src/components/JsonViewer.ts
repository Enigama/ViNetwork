import { StateManager } from '../core/StateManager';
import { JsonNode } from '../types';
import { safeStringify } from '../utils/safeJson';

type JsonNodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export class JsonViewer {
  private container: HTMLElement;
  private stateManager: StateManager;
  private currentData: unknown = null;

  constructor(container: HTMLElement, stateManager: StateManager) {
    this.container = container;
    this.stateManager = stateManager;
    this.stateManager.subscribe(this.onStateChange.bind(this));
  }

  // Re-render selection when state changes
  private onStateChange(): void {
    this.updateSelectionVisual();
  }

  // Update only the visual selection without re-rendering the entire tree
  private updateSelectionVisual(): void {
    const state = this.stateManager.getState();
    const nodes = this.container.querySelectorAll('.json-node');
    
    nodes.forEach((node, index) => {
      if (index === state.jsonSelectedIndex) {
        node.classList.add('selected');
        // Scroll into view if needed
        this.scrollNodeIntoView(node as HTMLElement);
      } else {
        node.classList.remove('selected');
      }
    });
  }

  // Scroll the selected node into view
  private scrollNodeIntoView(element: HTMLElement): void {
    // Use scrollIntoView with 'nearest' - only scrolls if element is out of view
    // and scrolls minimally to make it visible
    element.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }

  render(data: unknown): void {
    this.currentData = data;
    this.container.innerHTML = '';
    const nodes = this.flattenJson(data, '', 0);
    
    // Update state with flattened nodes
    this.stateManager.setState({ flattenedJsonNodes: nodes });
    
    const state = this.stateManager.getState();
    
    nodes.forEach((node, index) => {
      const element = this.createNodeElement(node, index === state.jsonSelectedIndex);
      this.container.appendChild(element);
    });
  }

  // Convert nested JSON into flat array of nodes
  private flattenJson(obj: unknown, path: string, level: number): JsonNode[] {
    const nodes: JsonNode[] = [];
    const state = this.stateManager.getState();

    if (obj === null) {
      return [{
        key: path.split('.').pop() || 'null',
        value: null,
        type: 'null',
        path: path || 'root',
        isExpanded: false,
        level: level
      }];
    }

    if (typeof obj !== 'object') {
      return [{
        key: path.split('.').pop() || '',
        value: obj,
        type: this.getValueType(obj),
        path: path || 'root',
        isExpanded: false,
        level: level
      }];
    }

    const entries = Array.isArray(obj) 
      ? obj.map((v, i) => [String(i), v] as const)
      : Object.entries(obj as Record<string, unknown>);

    for (const [key, value] of entries) {
      const isArrayItem = Array.isArray(obj);
      const nodePath = path 
        ? (isArrayItem ? `${path}[${key}]` : `${path}.${key}`)
        : key;
      const isExpanded = state.jsonExpanded.get(nodePath) ?? true; // Default expanded

      const node: JsonNode = {
        key: key,
        value: value,
        type: this.getValueType(value),
        path: nodePath,
        isExpanded: isExpanded,
        level: level
      };

      nodes.push(node);

      // Recursively add children if expanded
      if (isExpanded && value !== null && typeof value === 'object') {
        nodes.push(...this.flattenJson(value, nodePath, level + 1));
      }
    }

    return nodes;
  }

  // Get proper type for a value
  private getValueType(value: unknown): JsonNodeType {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    const type = typeof value;
    if (type === 'object') return 'object';
    if (type === 'string') return 'string';
    if (type === 'number') return 'number';
    if (type === 'boolean') return 'boolean';
    return 'string'; // fallback
  }

  // Create DOM element for a JSON node
  private createNodeElement(node: JsonNode, isSelected: boolean): HTMLElement {
    const element = document.createElement('div');
    element.className = `json-node json-node-${node.type}${isSelected ? ' selected' : ''}`;
    element.style.paddingLeft = `${node.level * 20}px`;
    element.dataset.path = node.path;

    // Add expand/collapse icon for objects and arrays
    if (node.type === 'object' || node.type === 'array') {
      const icon = document.createElement('span');
      icon.className = 'json-icon';
      icon.textContent = node.isExpanded ? '▼' : '▶';
      element.appendChild(icon);

      element.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleNode(node.path);
      });
    }

    // Key
    const keySpan = document.createElement('span');
    keySpan.className = 'json-key';
    keySpan.textContent = node.key + ': ';
    element.appendChild(keySpan);

    // Value (for primitives)
    if (node.type !== 'object' && node.type !== 'array') {
      const valueSpan = document.createElement('span');
      valueSpan.className = `json-value json-value-${node.type}`;
      valueSpan.textContent = safeStringify(node.value);
      element.appendChild(valueSpan);
    } else {
      // Show count for collapsed objects/arrays
      if (!node.isExpanded) {
        const count = Array.isArray(node.value) 
          ? (node.value as unknown[]).length 
          : Object.keys(node.value as Record<string, unknown>).length;
        const countSpan = document.createElement('span');
        countSpan.className = 'json-count';
        const bracket = node.type === 'array' ? `[${count} items]` : `{${count} items}`;
        countSpan.textContent = bracket;
        element.appendChild(countSpan);
      }
    }

    return element;
  }

  // Toggle expansion state of a node
  private toggleNode(path: string): void {
    const state = this.stateManager.getState();
    const currentState = state.jsonExpanded.get(path) ?? true;
    
    state.jsonExpanded.set(path, !currentState);
    this.stateManager.setState({ jsonExpanded: state.jsonExpanded });
    
    // Re-render to update the tree structure
    if (this.currentData !== null) {
      this.render(this.currentData);
    }
  }

  // Move selection by delta
  moveSelection(delta: number): void {
    const state = this.stateManager.getState();
    const maxIndex = state.flattenedJsonNodes.length - 1;
    
    if (maxIndex < 0) return;
    
    const newIndex = Math.max(0, Math.min(maxIndex, state.jsonSelectedIndex + delta));
    this.stateManager.setState({ jsonSelectedIndex: newIndex });
  }

  // Navigate to first or last node
  navigateTo(position: 'first' | 'last'): void {
    const state = this.stateManager.getState();
    const maxIndex = state.flattenedJsonNodes.length - 1;
    
    if (maxIndex < 0) return;
    
    const newIndex = position === 'first' ? 0 : maxIndex;
    this.stateManager.setState({ jsonSelectedIndex: newIndex });
  }

  // Get currently selected node
  getCurrentNode(): JsonNode | null {
    const state = this.stateManager.getState();
    return state.flattenedJsonNodes[state.jsonSelectedIndex] ?? null;
  }

  // Get value of current node as string (for copying)
  getCurrentValue(): string {
    const node = this.getCurrentNode();
    if (!node) return '';
    
    if (node.type === 'object' || node.type === 'array') {
      return safeStringify(node.value, 2);
    }
    
    if (node.type === 'string') {
      // Return raw string without quotes
      return node.value as string;
    }
    
    return String(node.value);
  }

  // Get the full value of current node as JSON (for yy command)
  getCurrentNodeAsJson(): string {
    const node = this.getCurrentNode();
    if (!node) return '';
    return safeStringify(node.value, 2);
  }

  // Get the path of current node (for yp command)
  getCurrentPath(): string {
    const node = this.getCurrentNode();
    return node?.path ?? '';
  }

  // Expand current node (called by 'l' key)
  expandCurrentNode(): void {
    const node = this.getCurrentNode();
    if (!node || (node.type !== 'object' && node.type !== 'array')) return;
    
    const state = this.stateManager.getState();
    state.jsonExpanded.set(node.path, true);
    this.stateManager.setState({ jsonExpanded: state.jsonExpanded });
    
    // Re-render to show children
    if (this.currentData !== null) {
      this.render(this.currentData);
    }
  }

  // Collapse current node (called by 'h' key)
  collapseCurrentNode(): void {
    const node = this.getCurrentNode();
    if (!node) return;
    
    // If current node is expandable, collapse it
    if (node.type === 'object' || node.type === 'array') {
      const state = this.stateManager.getState();
      state.jsonExpanded.set(node.path, false);
      this.stateManager.setState({ jsonExpanded: state.jsonExpanded });
      
      // Re-render to hide children
      if (this.currentData !== null) {
        this.render(this.currentData);
      }
    } else {
      // If it's a primitive, move to parent
      this.moveToParent();
    }
  }

  // Move selection to parent node
  private moveToParent(): void {
    const node = this.getCurrentNode();
    if (!node) return;
    
    // Find parent path
    const path = node.path;
    let parentPath: string;
    
    // Handle array index notation
    const bracketMatch = path.match(/^(.+)\[\d+\]$/);
    if (bracketMatch) {
      parentPath = bracketMatch[1];
    } else {
      // Handle dot notation
      const lastDot = path.lastIndexOf('.');
      if (lastDot === -1) return; // Already at root
      parentPath = path.substring(0, lastDot);
    }
    
    // Find parent node index
    const state = this.stateManager.getState();
    const parentIndex = state.flattenedJsonNodes.findIndex(n => n.path === parentPath);
    
    if (parentIndex !== -1) {
      this.stateManager.setState({ jsonSelectedIndex: parentIndex });
    }
  }

  // Expand node by path (called by 'l' key)
  expandNode(path: string): void {
    const state = this.stateManager.getState();
    state.jsonExpanded.set(path, true);
    this.stateManager.setState({ jsonExpanded: state.jsonExpanded });
    
    if (this.currentData !== null) {
      this.render(this.currentData);
    }
  }

  // Collapse node by path (called by 'h' key)
  collapseNode(path: string): void {
    const state = this.stateManager.getState();
    state.jsonExpanded.set(path, false);
    this.stateManager.setState({ jsonExpanded: state.jsonExpanded });
    
    if (this.currentData !== null) {
      this.render(this.currentData);
    }
  }
}
