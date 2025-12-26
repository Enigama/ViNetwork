import { NetworkRequest, InspectFocus } from '../types';
import { StateManager } from '../core/StateManager';

export interface HeaderItem {
  section: 'general' | 'request' | 'response';
  key: string;
  value: string;
  index: number;
}

export class HeadersList {
  private container: HTMLElement;
  private stateManager: StateManager;
  private headers: HeaderItem[] = [];
  private selectedIndex: number = 0;
  private collapsedSections: Set<string> = new Set();
  private lastRequestId: string = '';
  private lastSelectedIndex: number = -1;

  constructor(container: HTMLElement, stateManager: StateManager) {
    this.container = container;
    this.stateManager = stateManager;
    
    this.stateManager.subscribe(this.render.bind(this));
    this.render(this.stateManager.getState());
  }

  private buildHeadersList(request: NetworkRequest): HeaderItem[] {
    const items: HeaderItem[] = [];
    let index = 0;

    // Add general information
    if (!this.collapsedSections.has('general')) {
      const generalItems = this.getGeneralItems(request);
      generalItems.forEach(([key, value]) => {
        items.push({
          section: 'general',
          key,
          value,
          index: index++
        });
      });
    }

    // Add request headers
    if (!this.collapsedSections.has('request')) {
      Object.entries(request.requestHeaders).forEach(([key, value]) => {
        items.push({
          section: 'request',
          key,
          value,
          index: index++
        });
      });
    }

    // Add response headers
    if (!this.collapsedSections.has('response')) {
      Object.entries(request.responseHeaders).forEach(([key, value]) => {
        items.push({
          section: 'response',
          key,
          value,
          index: index++
        });
      });
    }

    return items;
  }

  private getGeneralItems(request: NetworkRequest): [string, string][] {
    const statusText = request.statusText || this.getStatusText(request.status);
    return [
      ['Request URL', request.url],
      ['Request Method', request.method],
      ['Status Code', `${request.status} ${statusText}`],
      ['Resource Type', request.type]
    ];
  }

  private getStatusText(status: number): string {
    const statusTexts: Record<number, string> = {
      200: 'OK',
      201: 'Created',
      204: 'No Content',
      301: 'Moved Permanently',
      302: 'Found',
      304: 'Not Modified',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable'
    };
    return statusTexts[status] || '';
  }

  private render(state: any): void {
    // Only render when headers tab is active
    if (state.previewTab !== 'headers') {
      return;
    }

    const requests = this.stateManager.getFilteredRequests();
    const selectedRequest = requests[state.selectedIndex];

    if (!selectedRequest) {
      this.renderEmpty();
      this.lastRequestId = '';
      return;
    }

    // Check if we can skip render (optimization)
    const requestChanged = this.lastRequestId !== selectedRequest.id;
    const selectionChanged = this.lastSelectedIndex !== state.headersSelectedIndex;

    if (!requestChanged && !selectionChanged) {
      return; // No changes, skip render
    }

    // Use the headersSelectedIndex from state if available
    if (state.headersSelectedIndex !== undefined) {
      this.selectedIndex = state.headersSelectedIndex;
    }

    // Only rebuild headers list if request changed
    if (requestChanged) {
      this.headers = this.buildHeadersList(selectedRequest);
      
      // Clamp selected index to valid range
      if (this.selectedIndex >= this.headers.length && this.headers.length > 0) {
        this.selectedIndex = this.headers.length - 1;
        this.stateManager.setState({ headersSelectedIndex: this.selectedIndex });
      }
      
      this.renderHeaders(selectedRequest);
      this.lastRequestId = selectedRequest.id;
    } else if (selectionChanged) {
      // Only update selection highlight (faster than full re-render)
      this.updateSelection();
    }
    
    this.lastSelectedIndex = state.headersSelectedIndex;
  }

  private updateSelection(): void {
    // Fast selection update without full re-render
    const items = this.container.querySelectorAll('.header-item');
    items.forEach((item, index) => {
      if (index === this.selectedIndex) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });
    
    this.scrollToSelected();
  }

  private renderHeaders(request: NetworkRequest): void {
    // Use DocumentFragment for batch DOM updates
    const fragment = document.createDocumentFragment();

    // Render General section first
    const generalSection = this.createGeneralSection(request);
    fragment.appendChild(generalSection);

    // Render Request Headers section
    const requestSection = this.createSection(
      'request',
      'Request Headers',
      request.requestHeaders
    );
    fragment.appendChild(requestSection);

    // Render Response Headers section
    const responseSection = this.createSection(
      'response',
      'Response Headers',
      request.responseHeaders
    );
    fragment.appendChild(responseSection);

    // Clear and append in one operation
    this.container.innerHTML = '';
    this.container.appendChild(fragment);

    // Scroll selected item into view
    this.scrollToSelected();
  }

  private createGeneralSection(request: NetworkRequest): HTMLElement {
    const isCollapsed = this.collapsedSections.has('general');
    const icon = isCollapsed ? '▶' : '▼';
    const generalItems = this.getGeneralItems(request);

    const sectionDiv = document.createElement('div');
    sectionDiv.className = 'headers-section';

    // Create section title
    const titleElement = document.createElement('h3');
    titleElement.className = 'headers-section-title';
    titleElement.dataset.section = 'general';
    titleElement.innerHTML = `
      <span class="collapse-icon">${icon}</span> General (${generalItems.length})
    `;

    // Add click handler for collapsing/expanding
    titleElement.addEventListener('click', () => {
      this.toggleSection('general');
    });

    sectionDiv.appendChild(titleElement);

    // Create general list container
    const listDiv = document.createElement('div');
    listDiv.className = `headers-list ${isCollapsed ? 'collapsed' : ''}`;

    if (!isCollapsed) {
      generalItems.forEach(([key, value]) => {
        const globalIndex = this.getGlobalIndex('general', key);
        const isSelected = globalIndex === this.selectedIndex;

        const itemDiv = document.createElement('div');
        itemDiv.className = `header-item ${isSelected ? 'selected' : ''}`;
        itemDiv.dataset.index = globalIndex.toString();

        const keySpan = document.createElement('span');
        keySpan.className = 'header-key';
        keySpan.textContent = key + ':';

        const valueSpan = document.createElement('span');
        valueSpan.className = 'header-value';
        
        // Add status-specific styling for Status Code
        if (key === 'Status Code') {
          const statusClass = this.getStatusClass(request.status);
          if (statusClass) {
            valueSpan.classList.add(statusClass);
          }
        }
        
        valueSpan.textContent = value;

        itemDiv.appendChild(keySpan);
        itemDiv.appendChild(valueSpan);

        // Add click handler for selection
        itemDiv.addEventListener('click', () => {
          this.selectedIndex = globalIndex;
          this.stateManager.setState({ headersSelectedIndex: globalIndex });
        });

        listDiv.appendChild(itemDiv);
      });
    }

    sectionDiv.appendChild(listDiv);
    return sectionDiv;
  }

  private getStatusClass(status: number): string {
    if (status >= 200 && status < 300) {
      return 'status-success';
    } else if (status >= 300 && status < 400) {
      return 'status-redirect';
    } else if (status >= 400) {
      return 'status-error';
    }
    return '';
  }

  private createSection(
    section: 'general' | 'request' | 'response',
    title: string,
    headers: Record<string, string>
  ): HTMLElement {
    const isCollapsed = this.collapsedSections.has(section);
    const icon = isCollapsed ? '▶' : '▼';

    const sectionDiv = document.createElement('div');
    sectionDiv.className = 'headers-section';

    // Create section title
    const titleElement = document.createElement('h3');
    titleElement.className = 'headers-section-title';
    titleElement.dataset.section = section;
    titleElement.innerHTML = `
      <span class="collapse-icon">${icon}</span> ${title} (${Object.keys(headers).length})
    `;
    
    // Add click handler for collapsing/expanding
    titleElement.addEventListener('click', () => {
      this.toggleSection(section);
    });

    sectionDiv.appendChild(titleElement);

    // Create headers list container
    const listDiv = document.createElement('div');
    listDiv.className = `headers-list ${isCollapsed ? 'collapsed' : ''}`;

    if (!isCollapsed) {
      Object.entries(headers).forEach(([key, value]) => {
        const globalIndex = this.getGlobalIndex(section, key);
        const isSelected = globalIndex === this.selectedIndex;
        
        const itemDiv = document.createElement('div');
        itemDiv.className = `header-item ${isSelected ? 'selected' : ''}`;
        itemDiv.dataset.index = globalIndex.toString();
        
        const keySpan = document.createElement('span');
        keySpan.className = 'header-key';
        keySpan.textContent = key + ':';
        
        const valueSpan = document.createElement('span');
        valueSpan.className = 'header-value';
        valueSpan.textContent = value;
        
        itemDiv.appendChild(keySpan);
        itemDiv.appendChild(valueSpan);
        
        // Add click handler for selection
        itemDiv.addEventListener('click', () => {
          this.selectedIndex = globalIndex;
          this.stateManager.setState({ headersSelectedIndex: globalIndex });
        });
        
        listDiv.appendChild(itemDiv);
      });
    }

    sectionDiv.appendChild(listDiv);
    return sectionDiv;
  }

  private getGlobalIndex(section: 'general' | 'request' | 'response', key: string): number {
    return this.headers.findIndex(h => h.section === section && h.key === key);
  }

  private renderEmpty(): void {
    this.container.innerHTML = '<p>No request selected</p>';
  }

  private scrollToSelected(): void {
    requestAnimationFrame(() => {
      const selectedItem = this.container.querySelector('.header-item.selected');
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  // Public methods for keyboard navigation
  public moveSelection(delta: number): void {
    if (this.headers.length === 0) return;

    this.selectedIndex = Math.max(0, Math.min(this.headers.length - 1, this.selectedIndex + delta));
    
    // Update state
    this.stateManager.setState({ headersSelectedIndex: this.selectedIndex });
  }

  public navigateTo(position: 'first' | 'last'): void {
    if (this.headers.length === 0) return;

    if (position === 'first') {
      this.selectedIndex = 0;
    } else {
      this.selectedIndex = this.headers.length - 1;
    }
    
    // Update state
    this.stateManager.setState({ headersSelectedIndex: this.selectedIndex });
  }

  public toggleSection(section: 'general' | 'request' | 'response'): void {
    if (this.collapsedSections.has(section)) {
      this.collapsedSections.delete(section);
    } else {
      this.collapsedSections.add(section);
    }

    // Re-render
    this.render(this.stateManager.getState());
  }

  public collapseCurrentSection(): void {
    if (this.headers.length === 0) return;
    
    const currentHeader = this.headers[this.selectedIndex];
    if (currentHeader) {
      const section = currentHeader.section;
      if (!this.collapsedSections.has(section)) {
        this.toggleSection(section);
      }
    }
  }

  public expandCurrentSection(): void {
    if (this.headers.length === 0) return;
    
    const currentHeader = this.headers[this.selectedIndex];
    if (currentHeader) {
      const section = currentHeader.section;
      if (this.collapsedSections.has(section)) {
        this.toggleSection(section);
      }
    }
  }

  public getSelectedHeader(): HeaderItem | null {
    return this.headers[this.selectedIndex] || null;
  }

  public copySelectedHeader(): void {
    const header = this.getSelectedHeader();
    if (!header) return;

    const text = `${header.key}: ${header.value}`;
    navigator.clipboard.writeText(text).then(() => {
      console.log('Header copied to clipboard:', text);
      // TODO: Show a toast notification
    }).catch(err => {
      console.error('Failed to copy header:', err);
    });
  }

  public copySelectedHeaderKey(): void {
    const header = this.getSelectedHeader();
    if (header) {
      navigator.clipboard.writeText(header.key).then(() => {
        console.log('Header key copied:', header.key);
      });
    }
  }

  public copySelectedHeaderValue(): void {
    const header = this.getSelectedHeader();
    if (header) {
      navigator.clipboard.writeText(header.value).then(() => {
        console.log('Header value copied:', header.value);
      });
    }
  }
}

