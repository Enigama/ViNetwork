import { NetworkRequest, RequestMethod, ResourceType } from '../types';
import { StateManager } from './StateManager';

export class NetworkCapture {
  private stateManager: StateManager;
  private tabId: number;
  private pendingRequests: Map<string, Partial<NetworkRequest>> = new Map();
  private responseBodyCache: Map<string, unknown> = new Map(); // Cache for lazy-loaded bodies
  private fetchingBodies: Set<string> = new Set(); // Track in-flight requests
  private isAttaching: boolean = false; // Prevent concurrent attachment attempts
  private retryCount: number = 0;
  private readonly MAX_RETRIES = 3;
  
  // Track main frame to distinguish from iframes (only clear on main frame navigation)
  private mainFrameId: string | null = null;
  
  // Batch UI updates to prevent render thrashing
  private pendingUIUpdates: Set<string> = new Set();
  private updateBatchRafId: number | null = null;

  // Store bound event handlers as class properties for stable references
  private eventHandler: (source: any, method: string, params: any) => void;
  private detachHandler: (source: any, reason: string) => void;
  
  // Track message timeout to clear it
  private messageTimeoutId: number | null = null;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    this.tabId = chrome.devtools.inspectedWindow.tabId;
    
    // Bind event handlers once and store as class properties
    this.eventHandler = this.handleDebuggerEvent.bind(this);
    this.detachHandler = this.handleDebuggerDetach.bind(this);
    
    // Add event listeners once in constructor (not in attachDebugger)
    chrome.debugger.onEvent.addListener(this.eventHandler);
    chrome.debugger.onDetach.addListener(this.detachHandler);
    
    this.attachDebugger();
  }

  // Public method to ensure debugger is attached (called when panel becomes visible)
  public async ensureAttached(): Promise<void> {
    // Only attempt attachment if not already in progress
    if (this.isAttaching) {
      return;
    }

    // Check if debugger is already attached and working by trying to enable Network domain
    try {
      await chrome.debugger.sendCommand({ tabId: this.tabId }, 'Network.enable');
      // If this succeeds, we're already attached and Network domain is enabled
      console.log('[NetworkCapture] Debugger already attached and Network domain enabled');
      return;
    } catch (error: any) {
      // If Network.enable fails, check the reason
      const errorMsg = error.message || '';
      
      // If it's because another debugger is attached, don't try to attach (will fail anyway)
      if (errorMsg.includes('Another debugger')) {
        console.warn('[NetworkCapture] Another debugger is attached, cannot ensure attachment');
        return;
      }
      
      // For other errors (like "not attached"), we need to attach
      console.log('[NetworkCapture] Need to attach debugger, error:', errorMsg);
    }

    // Try to attach
    try {
      await this.attachDebugger();
    } catch (error) {
      // Don't show error UI here - attachDebugger handles that
      console.error('[NetworkCapture] Failed to ensure attachment:', error);
    }
  }

  // Attach Chrome debugger to current tab (idempotent - can be called multiple times)
  private async attachDebugger(): Promise<void> {
    // Prevent concurrent attachment attempts
    if (this.isAttaching) {
      return;
    }

    this.isAttaching = true;

    try {
      let wasAlreadyAttached = false;
      
      // Try to attach debugger with protocol version 1.3
      try {
        await chrome.debugger.attach({ tabId: this.tabId }, '1.3');
        console.log('[NetworkCapture] Debugger attached successfully');
      } catch (attachError: any) {
        // Check if debugger is already attached
        const isAlreadyAttached = attachError.message?.includes('Another debugger is already attached to the target') ||
                                  attachError.message?.includes('Debugger is already attached');
        
        if (isAlreadyAttached) {
          // Debugger is already attached - this might be us or another debugger
          // We'll try to enable Network domain and see if it works
          wasAlreadyAttached = true;
          console.log('[NetworkCapture] Debugger already attached, attempting to enable Network domain');
        } else {
          // Some other error occurred
          throw attachError;
        }
      }
      
      // Clear caches on fresh attachment/re-attachment
      this.clearCaches();
      
      // Reset main frame tracking for fresh capture
      this.mainFrameId = null;
      
      // Enable Network domain to receive network events
      try {
        await chrome.debugger.sendCommand(
          { tabId: this.tabId }, 
          'Network.enable'
        );
      } catch (networkError: any) {
        const errorMsg = networkError.message || '';
        
        // If Network domain is already enabled, that's fine - continue
        if (errorMsg.includes('already enabled') || errorMsg.includes('Network domain is already enabled')) {
          console.log('[NetworkCapture] Network domain already enabled');
          // Continue normally
        } else if (errorMsg.includes('Another debugger') && wasAlreadyAttached) {
          // Another debugger is using the debugger API
          throw new Error('Another debugger is already attached to this tab. Close other DevTools or debugging extensions.');
        } else if (errorMsg.includes('not attached')) {
          // Debugger got detached between attach and enable - this shouldn't happen but handle it
          console.warn('[NetworkCapture] Debugger detached before Network.enable, will retry');
          throw networkError;
        } else {
          // Unknown error - log and re-throw
          console.error('[NetworkCapture] Network.enable failed:', errorMsg);
          throw networkError;
        }
      }
      
      // Verify Network domain is enabled by waiting a tick
      // This ensures the domain is fully active before requests start
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Reset retry count on successful attachment
      this.retryCount = 0;
      this.isAttaching = false;
      
      // Clear any existing info messages (like "Reconnecting...")
      // Only show success message on initial load, not on re-attachment after refresh
      const tableBody = document.getElementById('table-body');
      if (tableBody) {
        const existingMessage = tableBody.querySelector('.network-message');
        if (existingMessage) {
          const messageType = existingMessage.classList.contains('network-message-info') ? 'info' : null;
          // Clear info messages (reconnecting/retrying), keep errors
          if (messageType === 'info') {
            this.clearMessage();
          }
        }
      }
      
      // Only show success message if there are no requests yet (initial load)
      const state = this.stateManager.getState();
      if (state.requests.length === 0) {
        this.showMessage('Network capture started. Navigate to any page to see requests.', 'success');
      }
    } catch (error: any) {
      this.isAttaching = false;
      
      // Retry logic with exponential backoff
      if (this.retryCount < this.MAX_RETRIES) {
        this.retryCount++;
        const delay = Math.min(1000 * Math.pow(2, this.retryCount - 1), 5000);
        // Update retry message (will auto-clear)
        this.showMessage(`Retrying network capture (${this.retryCount}/${this.MAX_RETRIES})...`, 'info');
        setTimeout(() => this.attachDebugger(), delay);
        return;
      }
      
      // Provide helpful error messages with detailed logging
      console.error('[NetworkCapture] Attachment failed:', error);
      console.error('[NetworkCapture] Tab ID:', this.tabId);
      console.error('[NetworkCapture] Retry count:', this.retryCount);
      
      let errorMessage = 'Failed to start network capture: ';
      
      if (error.message?.includes('Another debugger is already attached')) {
        errorMessage += 'Another debugger is already attached to this tab. Close other DevTools or debugging extensions.';
      } else if (error.message?.includes('Cannot access') || error.message?.includes('Cannot attach')) {
        errorMessage += 'Cannot attach to this type of page.\n\n' +
                       '✓ Navigate to a regular website (e.g., google.com, github.com)\n' +
                       '✗ Chrome cannot debug: chrome://, chrome-extension://, edge://, or about: pages\n\n' +
                       'Once on a regular page, reload it to see network requests.';
      } else {
        errorMessage += error.message || 'Unknown error. Check console for details.';
      }
      
      this.showMessage(errorMessage, 'error');
    }
  }

  // Handle debugger detachment (e.g., on page refresh or navigation)
  private handleDebuggerDetach(source: any, reason: string): void {
    if (source.tabId !== this.tabId) return;
    
    // Clear caches when debugger detaches
    this.clearCaches();
    
    // Reset main frame tracking for new page
    this.mainFrameId = null;
    
    // Clear the requests from the UI state on page navigation/refresh
    this.stateManager.clearRequests();
    
    // Reset retry count on detachment
    this.retryCount = 0;
    
    // Attempt to re-attach automatically after a delay
    // Increased delay to 250ms to ensure page navigation has started
    // Don't show message if we're already showing one (to avoid message spam)
    if (!this.hasMessage()) {
      this.showMessage('Reconnecting network capture...', 'info');
    }
    setTimeout(() => {
      this.attachDebugger();
    }, 250);
  }

  // Clear pending requests and caches (called on navigation/detachment)
  private clearCaches(): void {
    this.pendingRequests.clear();
    this.responseBodyCache.clear();
    this.fetchingBodies.clear();
  }
  
  // Clear any existing message
  private clearMessage(): void {
    if (this.messageTimeoutId !== null) {
      clearTimeout(this.messageTimeoutId);
      this.messageTimeoutId = null;
    }
    
    const tableBody = document.getElementById('table-body');
    if (!tableBody) return;
    
    const existingMessage = tableBody.querySelector('.network-message');
    if (existingMessage) {
      existingMessage.remove();
    }
  }

  // Check if a message is currently displayed
  private hasMessage(): boolean {
    const tableBody = document.getElementById('table-body');
    if (!tableBody) return false;
    return tableBody.querySelector('.network-message') !== null;
  }

  // Show user-friendly message in the UI
  private showMessage(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    const tableBody = document.getElementById('table-body');
    if (!tableBody) return;
    
    // Clear any existing message and timeout
    this.clearMessage();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `network-message network-message-${type}`;
    messageDiv.style.padding = '20px';
    messageDiv.style.textAlign = 'center';
    messageDiv.style.whiteSpace = 'pre-line'; // Preserve line breaks
    messageDiv.style.color = type === 'error' ? 'var(--vim-error)' : 
                              type === 'success' ? 'var(--vim-success)' : 
                              'var(--vim-fg)';
    messageDiv.textContent = message;
    
    tableBody.appendChild(messageDiv);
    
    // Auto-clear messages based on type
    if (type === 'success') {
      // Success messages: clear after 3 seconds
      this.messageTimeoutId = window.setTimeout(() => {
        messageDiv.remove();
        this.messageTimeoutId = null;
      }, 3000);
    } else if (type === 'info') {
      // Info messages: clear after 2 seconds (or when requests arrive)
      this.messageTimeoutId = window.setTimeout(() => {
        messageDiv.remove();
        this.messageTimeoutId = null;
      }, 2000);
    }
    // Error messages persist until manually cleared or replaced
  }

  // Route debugger events to appropriate handlers
  private handleDebuggerEvent(source: any, method: string, params: any): void {
    if (source.tabId !== this.tabId) return;

    switch (method) {
      case 'Network.requestWillBeSent':
        this.handleRequestWillBeSent(params);
        break;
      case 'Network.responseReceived':
        this.handleResponseReceived(params);
        break;
      case 'Network.loadingFinished':
        this.handleLoadingFinished(params);
        break;
      case 'Network.loadingFailed':
        this.handleLoadingFailed(params);
        break;
    }
  }

  // Event: Request is about to be sent
  private handleRequestWillBeSent(params: any): void {
    // Clear any info/success messages when requests start arriving
    // This ensures messages don't persist when network activity begins
    const tableBody = document.getElementById('table-body');
    if (tableBody) {
      const existingMessage = tableBody.querySelector('.network-message');
      if (existingMessage) {
        const messageType = existingMessage.classList.contains('network-message-error') ? 'error' :
                           existingMessage.classList.contains('network-message-success') ? 'success' : 'info';
        // Only clear info and success messages, keep error messages
        if (messageType !== 'error') {
          this.clearMessage();
        }
      }
    }
    
    // Detect page navigation/refresh: clear previous requests only when MAIN frame navigates
    // This prevents iframe Document loads from clearing all captured requests
    if (params.type === 'Document') {
      const frameId = params.frameId as string;
      // Only clear on main frame navigation, not iframes
      if (!this.mainFrameId || frameId === this.mainFrameId) {
        this.mainFrameId = frameId;
        this.clearCaches();
        this.stateManager.clearRequests();
      }
    }

    const request: NetworkRequest = {
      id: params.requestId,
      url: params.request.url,
      name: this.extractName(params.request.url),
      method: params.request.method as RequestMethod,
      type: this.mapResourceType(params.type),
      status: 0,
      statusText: 'Pending',
      timestamp: params.timestamp * 1000,
      duration: 0,
      size: 0,
      requestHeaders: params.request.headers,
      responseHeaders: {},
      requestBody: params.request.postData,
      initiator: params.initiator?.url
    };

    // Add to state immediately so it appears in the list
    this.stateManager.addRequest(request);
    
    // Store reference for later updates
    this.pendingRequests.set(params.requestId, request);
  }

  // Event: Response headers received
  private handleResponseReceived(params: any): void {
    const state = this.stateManager.getState();
    const request = state.requests.find(r => r.id === params.requestId);
    
    if (request) {
      // Update status and headers (mutate directly, don't trigger yet)
      request.status = params.response.status;
      request.statusText = params.response.statusText;
      request.responseHeaders = params.response.headers;
      
      // Don't trigger re-render here - wait for loadingFinished for better performance
    }
  }

  // Event: Response body fully loaded
  private handleLoadingFinished(params: any): void {
    const state = this.stateManager.getState();
    const request = state.requests.find(r => r.id === params.requestId);
    
    if (request) {
      // Update size and duration
      request.size = params.encodedDataLength;
      // Use Chrome's monotonic timestamp consistently (both timestamps are in the same time system)
      request.duration = (params.timestamp * 1000) - request.timestamp;
      
      // Batch UI updates using RAF to prevent render thrashing
      this.pendingUIUpdates.add(params.requestId);
      
      if (!this.updateBatchRafId) {
        this.updateBatchRafId = requestAnimationFrame(() => {
          // Trigger single render for all completed requests
          this.stateManager.setState({ requests: [...state.requests] });
          this.pendingUIUpdates.clear();
          this.updateBatchRafId = null;
        });
      }
      
      // DON'T fetch response body automatically - only fetch when user views it (lazy loading)
      // This significantly improves performance for pages with many requests
      
      // Clean up pending map
      this.pendingRequests.delete(params.requestId);
    }
  }

  // Event: Request failed (network error, timeout, etc.)
  private handleLoadingFailed(params: any): void {
    const state = this.stateManager.getState();
    const request = state.requests.find(r => r.id === params.requestId);
    
    if (request) {
      request.statusText = params.errorText;
      // Calculate duration for failed requests too
      request.duration = (params.timestamp * 1000) - request.timestamp;
      this.stateManager.setState({ requests: [...state.requests] });
    }
    
    this.pendingRequests.delete(params.requestId);
  }

  // Fetch response body content (lazy - only when requested)
  public async fetchResponseBodyLazy(requestId: string): Promise<any> {
    // Check cache first
    if (this.responseBodyCache.has(requestId)) {
      return this.responseBodyCache.get(requestId);
    }

    // Check if already fetching
    if (this.fetchingBodies.has(requestId)) {
      // Wait for existing fetch to complete
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          if (this.responseBodyCache.has(requestId)) {
            clearInterval(interval);
            resolve(this.responseBodyCache.get(requestId));
          }
        }, 50);
      });
    }

    // Mark as fetching
    this.fetchingBodies.add(requestId);

    try {
      const response = await chrome.debugger.sendCommand(
        { tabId: this.tabId },
        'Network.getResponseBody',
        { requestId }
      );
      
      let body = null;
      if (response.body) {
        try {
          // Try to parse as JSON
          body = JSON.parse(response.body);
        } catch {
          // Store as plain text if not JSON
          body = response.body;
        }
      }

      // Cache the result
      this.responseBodyCache.set(requestId, body);
      this.fetchingBodies.delete(requestId);
      
      return body;
    } catch (error) {
      // Silently fail - response body fetching is not critical
      this.fetchingBodies.delete(requestId);
      return null;
    }
  }

  // Map Chrome resource type to our enum
  private mapResourceType(type: string): ResourceType {
    const typeMap: Record<string, ResourceType> = {
      'XHR': ResourceType.XHR,
      'Fetch': ResourceType.FETCH,
      'Document': ResourceType.DOC,
      'Stylesheet': ResourceType.CSS,
      'Script': ResourceType.JS,
      'Image': ResourceType.IMG,
      'Font': ResourceType.FONT,
      'Media': ResourceType.MEDIA,
      'Manifest': ResourceType.MANIFEST,
      'WebSocket': ResourceType.SOCKET,
      'WebAssembly': ResourceType.WASM
    };
    return typeMap[type] || ResourceType.OTHER;
  }

  // Extract meaningful name from URL (filename or path)
  private extractName(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      
      // Get last segment of path (filename)
      const segments = pathname.split('/').filter(s => s.length > 0);
      if (segments.length > 0) {
        const lastSegment = segments[segments.length - 1];
        // If it has an extension or query params, use it as-is
        if (lastSegment.includes('.') || urlObj.search) {
          return lastSegment + urlObj.search;
        }
        // Otherwise, show the last 2 path segments
        if (segments.length > 1) {
          return segments.slice(-2).join('/');
        }
        return lastSegment;
      }
      
      // Fallback to domain if no path
      return urlObj.hostname;
    } catch {
      // If URL parsing fails, return the whole URL
      return url;
    }
  }

  // Cleanup when panel closes
  destroy(): void {
    try {
      // Remove event listeners
      chrome.debugger.onEvent.removeListener(this.eventHandler);
      chrome.debugger.onDetach.removeListener(this.detachHandler);
      
      // Detach debugger
      chrome.debugger.detach({ tabId: this.tabId });
    } catch (error) {
      // Ignore errors on detach - debugger may already be detached
      console.log('[NetworkCapture] Cleanup error (expected if already detached):', error);
    }
  }
}

