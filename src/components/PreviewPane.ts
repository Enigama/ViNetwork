import { NetworkRequest, AppMode, InspectFocus } from '../types';
import { StateManager } from '../core/StateManager';
import { JsonViewer } from './JsonViewer';
import { safeStringify } from '../utils/safeJson';

// Extend window to include jsonViewer
declare global {
  interface Window {
    jsonViewer?: JsonViewer;
  }
}

export class PreviewPane {
  private container: HTMLElement;
  private stateManager: StateManager;
  private jsonViewer: JsonViewer | null = null;
  private lastRequestId: string = '';
  private lastPreviewTab: string = '';
  private lastMode: AppMode = AppMode.NORMAL;
  private lastInspectFocus: InspectFocus = InspectFocus.HEADERS;

  constructor(container: HTMLElement, stateManager: StateManager) {
    this.container = container;
    this.stateManager = stateManager;
    
    this.setupTabs();
    this.initJsonViewer();
    this.stateManager.subscribe(this.render.bind(this));
    this.render(this.stateManager.getState());
  }

  private initJsonViewer(): void {
    const jsonViewerContainer = this.container.querySelector('#json-viewer') as HTMLElement;
    if (jsonViewerContainer) {
      this.jsonViewer = new JsonViewer(jsonViewerContainer, this.stateManager);
      // Expose globally for keyboard handler
      window.jsonViewer = this.jsonViewer;
    }
  }

  private setupTabs(): void {
    const tabs = this.container.querySelectorAll('.tab-button');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const tabName = target.dataset.tab as 'headers' | 'response' | 'preview';
        this.stateManager.setState({ previewTab: tabName });
      });
    });
  }

  private render(state: any): void {
    const requests = this.stateManager.getFilteredRequests();
    const selectedRequest = requests[state.selectedIndex];

    if (!selectedRequest) {
      this.renderEmpty();
      this.lastRequestId = '';
      return;
    }

    // Check if we need to re-render (performance optimization)
    const requestChanged = this.lastRequestId !== selectedRequest.id;
    const tabChanged = this.lastPreviewTab !== state.previewTab;
    const modeChanged = this.lastMode !== state.mode;
    const focusChanged = this.lastInspectFocus !== state.inspectFocus;

    // Update tabs only if changed
    if (tabChanged) {
      this.updateTabs(state.previewTab);
      this.lastPreviewTab = state.previewTab;
    }
    
    // Update focus indicator only if mode or focus changed
    if (modeChanged || focusChanged) {
      this.updateFocusIndicator(state.inspectFocus, state.mode);
      this.lastMode = state.mode;
      this.lastInspectFocus = state.inspectFocus;
    }

    // Only re-render content if request changed or tab changed
    if (requestChanged || tabChanged) {
      switch (state.previewTab) {
        case 'headers':
          this.renderHeaders(selectedRequest);
          break;
        case 'response':
          this.renderResponse(selectedRequest);
          break;
        case 'preview':
          this.renderPreview(selectedRequest);
          break;
      }
      
      this.lastRequestId = selectedRequest.id;
    }
  }

  private updateTabs(activeTab: string): void {
    const tabs = this.container.querySelectorAll('.tab-button');
    const contents = this.container.querySelectorAll('.preview-tab');

    tabs.forEach(tab => {
      const tabName = (tab as HTMLElement).dataset.tab;
      tab.classList.toggle('active', tabName === activeTab);
    });

    contents.forEach(content => {
      const tabName = content.id.replace('-view', '');
      content.classList.toggle('active', tabName === activeTab);
    });
  }

  // Add focus indicator to active panel in inspect mode
  private updateFocusIndicator(focus: InspectFocus, mode: AppMode): void {
    const panels = this.container.querySelectorAll('.preview-tab');
    
    panels.forEach(panel => {
      if (mode === AppMode.INSPECT) {
        const panelName = panel.id.replace('-view', '');
        const focusMap = {
          [InspectFocus.HEADERS]: 'headers',
          [InspectFocus.RESPONSE]: 'response',
          [InspectFocus.PREVIEW]: 'preview'
        };
        
        panel.classList.toggle('focused', focusMap[focus] === panelName);
      } else {
        panel.classList.remove('focused');
      }
    });
  }

  private renderHeaders(request: NetworkRequest): void {
    const requestHeadersDiv = this.container.querySelector('#request-headers');
    const responseHeadersDiv = this.container.querySelector('#response-headers');

    if (requestHeadersDiv) {
      requestHeadersDiv.innerHTML = this.formatHeaders(request.requestHeaders);
    }

    if (responseHeadersDiv) {
      responseHeadersDiv.innerHTML = this.formatHeaders(request.responseHeaders);
    }
  }

  private formatHeaders(headers: Record<string, string>): string {
    return Object.entries(headers)
      .map(([key, value]) => `
        <div class="header-row">
          <span class="header-key">${key}:</span>
          <span class="header-value">${value}</span>
        </div>
      `)
      .join('');
  }

  private async renderResponse(request: NetworkRequest): Promise<void> {
    const responseBody = this.container.querySelector('#response-body');
    
    if (responseBody) {
      // Check if body is already loaded
      if (request.responseBody !== undefined) {
        if (typeof request.responseBody === 'object') {
          responseBody.textContent = safeStringify(request.responseBody, 2);
        } else {
          responseBody.textContent = String(request.responseBody) || 'No response body';
        }
      } else {
        // Show loading state
        responseBody.textContent = 'Loading response body...';
        
        // Lazy load the response body
        try {
          const networkCapture = (window as unknown as { networkCapture?: { fetchResponseBodyLazy: (id: string) => Promise<unknown> } }).networkCapture;
          if (networkCapture?.fetchResponseBodyLazy) {
            const body = await networkCapture.fetchResponseBodyLazy(request.id);
            
            // Store in request for caching
            request.responseBody = body;
            
            // Re-render with loaded body
            if (typeof body === 'object') {
              responseBody.textContent = safeStringify(body, 2);
            } else {
              responseBody.textContent = String(body) || 'No response body';
            }
          }
        } catch {
          responseBody.textContent = 'Failed to load response body';
        }
      }
    }
  }

  private async renderPreview(request: NetworkRequest): Promise<void> {
    const jsonViewerContainer = this.container.querySelector('#json-viewer');
    
    if (!jsonViewerContainer || !this.jsonViewer) return;
    
    // Reset json selection when switching requests
    this.stateManager.setState({ jsonSelectedIndex: 0 });
    
    // Check if body is already loaded
    if (request.responseBody !== undefined) {
      if (typeof request.responseBody === 'object' && request.responseBody !== null) {
        // Render interactive JSON tree using JsonViewer component
        this.jsonViewer.render(request.responseBody);
      } else {
        jsonViewerContainer.textContent = 'Not a JSON response';
      }
    } else {
      // Show loading state
      jsonViewerContainer.textContent = 'Loading preview...';
      
      // Lazy load the response body
      try {
        const networkCapture = (window as unknown as { networkCapture?: { fetchResponseBodyLazy: (id: string) => Promise<unknown> } }).networkCapture;
        if (networkCapture?.fetchResponseBodyLazy) {
          const body = await networkCapture.fetchResponseBodyLazy(request.id);
          
          // Store in request for caching
          request.responseBody = body;
          
          // Re-render with loaded body
          if (typeof body === 'object' && body !== null) {
            this.jsonViewer.render(body);
          } else {
            jsonViewerContainer.textContent = 'Not a JSON response';
          }
        }
      } catch {
        jsonViewerContainer.textContent = 'Failed to load preview';
      }
    }
  }

  private renderEmpty(): void {
    const requestHeaders = this.container.querySelector('#request-headers');
    const responseHeaders = this.container.querySelector('#response-headers');
    const responseBody = this.container.querySelector('#response-body');
    const jsonViewer = this.container.querySelector('#json-viewer');

    if (requestHeaders) {
      requestHeaders.innerHTML = '<p>No request selected</p>';
    }
    if (responseHeaders) {
      responseHeaders.innerHTML = '';
    }
    if (responseBody) {
      responseBody.textContent = '';
    }
    if (jsonViewer) {
      jsonViewer.textContent = '';
    }
  }
}

