import { NetworkRequest, RequestMethod, ResourceType } from '../types';
import { StateManager } from '../core/StateManager';

export class NetworkTable {
  private container: HTMLElement;
  private stateManager: StateManager;
  private rowHeight: number = 28; // Estimated height of each row in pixels (will be measured)
  private actualRowHeight: number = 28; // Measured actual height of each row in pixels
  private visibleRows: number = 0; // Number of rows that fit in viewport
  private scrollTop: number = 0;
  private lastScrollTop: number = 0;
  private lastRenderedRequests: NetworkRequest[] = [];
  private lastSelectedIndex: number = -1;
  private hasMeasuredHeight: boolean = false; // Track if we've measured actual height
  
  // DOM recycling - reuse row elements instead of recreating
  private rowPool: HTMLElement[] = [];
  private activeRows: HTMLElement[] = [];
  
  // RAF batching to prevent layout thrashing
  private rafId: number | null = null;

  constructor(container: HTMLElement, stateManager: StateManager) {
    this.container = container;
    this.stateManager = stateManager;
    
    // Calculate visible rows based on container height
    this.calculateVisibleRows();
    
    // Listen for scroll events
    this.setupScrollListener();
    
    // Listen for resize events
    window.addEventListener('resize', () => this.calculateVisibleRows());
    
    // Subscribe to state changes with RAF batching
    this.stateManager.subscribe((state) => {
      if (!this.rafId) {
        this.rafId = requestAnimationFrame(() => {
          this.render(state);
          this.rafId = null;
        });
      }
    });
    
    // Initial render
    this.render(this.stateManager.getState());
    
    // Measure actual row height after first render
    this.measureActualRowHeight();
  }

  private calculateVisibleRows(): void {
    // Use the scroll container (network-table) height, not the table body
    // The container is the actual scrollable element with overflow-y: auto
    const headerHeight = 32; // Table header height
    const containerHeight = this.container.clientHeight || 600; // Default 600px if not rendered yet
    const availableHeight = containerHeight - headerHeight;
    const heightToUse = this.hasMeasuredHeight ? this.actualRowHeight : this.rowHeight;
    this.visibleRows = Math.ceil(availableHeight / heightToUse) + 3; // Smaller buffer for better performance
  }

  private measureActualRowHeight(): void {
    const tableBody = this.container.querySelector('#table-body') as HTMLElement;
    if (!tableBody) return;

    // Try to measure from an existing rendered row first
    const existingRow = tableBody.querySelector('.table-row') as HTMLElement;
    if (existingRow) {
      const rect = existingRow.getBoundingClientRect();
      if (rect.height > 0) {
        this.actualRowHeight = Math.ceil(rect.height);
        this.hasMeasuredHeight = true;
        this.rowHeight = this.actualRowHeight; // Update estimated height too
        return;
      }
    }

    // If no row exists, create a temporary one to measure
    const sampleRequest: NetworkRequest = {
      id: 'temp-measure',
      name: 'sample-request-name.js',
      url: 'https://example.com/sample-request-name.js',
      method: RequestMethod.GET,
      status: 200,
      statusText: 'OK',
      type: ResourceType.JS,
      size: 1024,
      duration: 100,
      timestamp: Date.now(),
      requestHeaders: {},
      responseHeaders: {}
    };

    const tempRow = this.createRow(sampleRequest, 0, false);
    tempRow.style.visibility = 'hidden';
    tempRow.style.position = 'absolute';
    tempRow.style.top = '-9999px';
    tempRow.style.width = '100%';
    
    tableBody.appendChild(tempRow);
    const rect = tempRow.getBoundingClientRect();
    this.actualRowHeight = Math.ceil(rect.height);
    this.hasMeasuredHeight = true;
    this.rowHeight = this.actualRowHeight; // Update estimated height too
    tableBody.removeChild(tempRow);
  }

  private setupScrollListener(): void {
    // Listen on the scroll container (network-table), not table-body
    // The container has overflow-y: auto and is the actual scrollable element
    this.container.addEventListener('scroll', () => {
      this.scrollTop = this.container.scrollTop;
      // Debounce scroll rendering with RAF
      if (!this.rafId) {
        this.rafId = requestAnimationFrame(() => {
          this.render(this.stateManager.getState());
          this.rafId = null;
        });
      }
    }, { passive: true });
  }

  private render(state: any): void {
    const requests = this.stateManager.getFilteredRequests();
    const tableBody = this.container.querySelector('#table-body') as HTMLElement;
    
    if (!tableBody) return;

    // Check what changed to decide if we need to re-render
    const requestsChanged = this.lastRenderedRequests !== requests;
    const selectionChanged = this.lastSelectedIndex !== state.selectedIndex;
    const scrollChanged = this.scrollTop !== this.lastScrollTop;

    if (!requestsChanged && !selectionChanged && !scrollChanged) {
      return; // No changes, skip render
    }

    // Store for next comparison
    this.lastRenderedRequests = requests;
    this.lastSelectedIndex = state.selectedIndex;
    this.lastScrollTop = this.scrollTop;

    // If in collapsed mode (isInspectExpanded), only render selected row
    if (state.isInspectExpanded) {
      this.renderSelectedOnly(requests, state.selectedIndex, tableBody);
    } else {
      // Only scroll to selected if selection changed (not on scroll events)
      if (selectionChanged) {
        this.scrollToSelectedInstant(state.selectedIndex, tableBody);
        this.scrollTop = this.container.scrollTop;
        this.lastScrollTop = this.scrollTop;
      }
      // Render rows at the current scroll position
      this.renderVirtualOptimized(requests, state.selectedIndex, tableBody);
    }
  }

  private renderSelectedOnly(requests: NetworkRequest[], selectedIndex: number, tableBody: HTMLElement): void {
    // In collapsed mode, only render the selected row
    const selectedRequest = requests[selectedIndex];
    
    if (!selectedRequest) {
      tableBody.innerHTML = '';
      return;
    }

    // Reuse first row if available
    let row = this.activeRows[0];
    if (!row) {
      row = this.createRow(selectedRequest, selectedIndex, true);
      tableBody.innerHTML = '';
      tableBody.appendChild(row);
      this.activeRows = [row];
    } else {
      this.updateRow(row, selectedRequest, selectedIndex, true);
    }
  }

  private renderVirtualOptimized(requests: NetworkRequest[], selectedIndex: number, tableBody: HTMLElement): void {
    // Measure actual row height if we haven't yet (after first render)
    if (!this.hasMeasuredHeight && requests.length > 0) {
      this.measureActualRowHeight();
    }

    // Use actual measured height for calculations
    const heightToUse = this.hasMeasuredHeight ? this.actualRowHeight : this.rowHeight;
    
    // Calculate which rows are visible based on current scroll position
    const startIndex = Math.max(0, Math.floor(this.scrollTop / heightToUse) - 1);
    const endIndex = Math.min(requests.length, startIndex + this.visibleRows + 2);
    const visibleCount = endIndex - startIndex;
    
    // Get existing rows
    const existingRows = Array.from(tableBody.querySelectorAll('.table-row')) as HTMLElement[];
    
    // Reuse or create rows
    for (let i = 0; i < visibleCount; i++) {
      const requestIndex = startIndex + i;
      const request = requests[requestIndex];
      
      let row: HTMLElement;
      if (i < existingRows.length) {
        // Reuse existing row (DOM recycling)
        row = existingRows[i];
        this.updateRow(row, request, requestIndex, selectedIndex === requestIndex);
      } else {
        // Create new row if needed
        row = this.createRow(request, requestIndex, selectedIndex === requestIndex);
        tableBody.appendChild(row);
      }
      
      // Position with transform (GPU accelerated)
      row.style.transform = `translateY(${(requestIndex * heightToUse)}px)`;
      row.style.position = 'absolute';
      row.style.width = '100%';
    }
    
    // Remove excess rows
    for (let i = visibleCount; i < existingRows.length; i++) {
      existingRows[i].remove();
    }
    
    // Calculate total height based on actual measured row height
    // If we have rendered rows, measure the actual total height
    let totalHeight: number;
    if (this.hasMeasuredHeight && requests.length > 0) {
      // Use measured height for calculation
      totalHeight = requests.length * this.actualRowHeight;
      
      // Double-check by measuring actual rendered content if we have enough rows
      const renderedRows = Array.from(tableBody.querySelectorAll('.table-row')) as HTMLElement[];
      if (renderedRows.length > 0) {
        // Measure from first to last rendered row to verify
        const firstRow = renderedRows[0];
        const lastRow = renderedRows[renderedRows.length - 1];
        if (firstRow && lastRow) {
          const firstTop = parseInt(firstRow.style.transform.match(/translateY\((\d+)px\)/)?.[1] || '0', 10);
          const lastTop = parseInt(lastRow.style.transform.match(/translateY\((\d+)px\)/)?.[1] || '0', 10);
          const lastRowHeight = lastRow.getBoundingClientRect().height;
          const measuredTotal = lastTop + lastRowHeight;
          
          // Use the larger of calculated or measured to ensure we don't cut off content
          totalHeight = Math.max(totalHeight, measuredTotal);
        }
      }
    } else {
      // Fallback to estimated height
      totalHeight = requests.length * this.rowHeight;
    }
    
    // Set container height for scrolling
    tableBody.style.position = 'relative';
    tableBody.style.height = `${totalHeight}px`;
  }

  private scrollToSelectedInstant(selectedIndex: number, _tableBody: HTMLElement): void {
    // Use the scroll container (network-table) for scroll calculations
    // The container has overflow-y: auto and is the actual scrollable element
    const scrollContainer = this.container;
    const headerHeight = 32; // Table header height (sticky)
    const heightToUse = this.hasMeasuredHeight ? this.actualRowHeight : this.rowHeight;
    
    const selectedTop = selectedIndex * heightToUse;
    const viewportTop = scrollContainer.scrollTop;
    // Calculate visible viewport height (container height minus sticky header)
    const viewportHeight = scrollContainer.clientHeight - headerHeight;
    const viewportBottom = viewportTop + viewportHeight;
    
    // Only scroll if selected row is out of view
    if (selectedTop < viewportTop) {
      scrollContainer.scrollTop = selectedTop;
    } else if (selectedTop + heightToUse > viewportBottom) {
      scrollContainer.scrollTop = selectedTop - viewportHeight + heightToUse;
    }
  }

  private createRow(request: NetworkRequest, index: number, isSelected: boolean): HTMLElement {
    const row = document.createElement('div');
    row.className = `table-row ${isSelected ? 'selected' : ''}`;
    row.dataset.index = index.toString();

    // Create cells using array for faster manipulation
    const cells = [
      { className: 'col-name', content: request.name, title: request.url },
      { className: `col-status status-${Math.floor(request.status / 100)}00`, content: request.status > 0 ? request.status.toString() : 'Pending', title: undefined },
      { className: 'col-method', content: request.method, title: undefined },
      { className: 'col-type', content: request.type, title: undefined },
      { className: 'col-size', content: this.formatSize(request.size), title: undefined }
    ];

    // Use fragment for batch insertion
    const fragment = document.createDocumentFragment();
    cells.forEach(cell => {
      const div = document.createElement('div');
      div.className = cell.className;
      div.textContent = cell.content;
      if (cell.title) div.title = cell.title;
      fragment.appendChild(div);
    });
    
    row.appendChild(fragment);
    return row;
  }

  private updateRow(row: HTMLElement, request: NetworkRequest, index: number, isSelected: boolean): void {
    // Only update changed properties (micro-optimization)
    row.dataset.index = index.toString();
    row.classList.toggle('selected', isSelected);
    
    // Cache child elements
    const cells = row.children;
    
    // Update only if content changed
    const nameCell = cells[0] as HTMLElement;
    if (nameCell.textContent !== request.name) {
      nameCell.textContent = request.name;
      nameCell.title = request.url;
    }
    
    const statusCell = cells[1] as HTMLElement;
    const statusText = request.status > 0 ? request.status.toString() : 'Pending';
    if (statusCell.textContent !== statusText) {
      statusCell.textContent = statusText;
      statusCell.className = `col-status status-${Math.floor(request.status / 100)}00`;
    }
    
    const methodCell = cells[2] as HTMLElement;
    if (methodCell.textContent !== request.method) {
      methodCell.textContent = request.method;
    }
    
    const typeCell = cells[3] as HTMLElement;
    if (typeCell.textContent !== request.type) {
      typeCell.textContent = request.type;
    }
    
    const sizeCell = cells[4] as HTMLElement;
    const sizeText = this.formatSize(request.size);
    if (sizeCell.textContent !== sizeText) {
      sizeCell.textContent = sizeText;
    }
  }

  private formatSize(bytes: number): string {
    if (bytes === 0) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}
