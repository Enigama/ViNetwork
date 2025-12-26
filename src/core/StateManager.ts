import Fuse from 'fuse.js';
import { AppState, AppMode, NetworkRequest, InspectFocus } from '../types';
import { createFuseIndex } from '../utils/fuzzySearch';

export class StateManager {
  private state: AppState;
  private listeners: Set<(state: AppState) => void> = new Set();
  private readonly MAX_REQUESTS = 1000; // Maximum number of requests to keep in memory
  
  // RAF batching to prevent layout thrashing
  private rafId: number | null = null;
  private pendingUpdates: Partial<AppState>[] = [];
  
  // Memoization cache for filtered requests
  private filteredRequestsCache: {
    requests: NetworkRequest[] | null;
    lastRequestsLength: number;
    lastSearchQuery: string;
    lastMethodsSize: number;
    lastTypesSize: number;
  } = {
    requests: null,
    lastRequestsLength: 0,
    lastSearchQuery: '',
    lastMethodsSize: 0,
    lastTypesSize: 0
  };
  
  // Fuse.js index for fuzzy search
  private fuseIndex: Fuse<NetworkRequest> | null = null;
  private lastFuseIndexLength: number = 0;

  constructor() {
    // Initialize with empty state
    this.state = {
      mode: AppMode.NORMAL,
      requests: [],
      selectedIndex: 0,
      searchQuery: '',
      filters: {
        types: new Set(),
        statusCodes: []
      },
      jsonExpanded: new Map(),
      previewTab: 'headers',
      filterSelectedIndex: 0,
      filterOrder: ['fetch/xhr', 'document', 'stylesheet', 'script', 'font', 'image', 'media', 'manifest', 'websocket', 'wasm', 'other'],
      inspectFocus: InspectFocus.HEADERS,
      inspectScrollPosition: 0,
      inspectSearchQuery: '',
      inspectSearchMatches: [],
      inspectSearchIndex: 0,
      headersSelectedIndex: 0,
      isInspectExpanded: false,
      jsonSelectedIndex: 0,
      flattenedJsonNodes: []
    };
  }

  // Get immutable copy of state
  getState(): AppState {
    return { ...this.state };
  }

  // Update state and notify all subscribers with RAF batching
  setState(updates: Partial<AppState>): void {
    this.pendingUpdates.push(updates);
    
    if (!this.rafId) {
      this.rafId = requestAnimationFrame(() => {
        // Merge all pending updates in one batch
        const merged = Object.assign({}, ...this.pendingUpdates);
        this.state = { ...this.state, ...merged };
        
        // Clear cache if filters changed
        if (merged.searchQuery !== undefined || merged.filters !== undefined) {
          this.invalidateFilterCache();
        }
        
        // Reset selection to first item when search query changes
        if (merged.searchQuery !== undefined && merged.selectedIndex === undefined) {
          this.state.selectedIndex = 0;
        }
        
        this.notifyListeners();
        
        this.pendingUpdates = [];
        this.rafId = null;
      });
    }
  }

  // Subscribe to state changes (returns unsubscribe function)
  subscribe(listener: (state: AppState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Notify all subscribers of state change
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.state));
  }

  // Add new network request with automatic cleanup
  addRequest(request: NetworkRequest): void {
    this.state.requests.push(request);
    
    // Automatic memory management: remove oldest requests if limit exceeded
    if (this.state.requests.length > this.MAX_REQUESTS) {
      const toRemove = this.state.requests.length - this.MAX_REQUESTS;
      this.state.requests.splice(0, toRemove);
      
      // Adjust selected index if needed
      if (this.state.selectedIndex < toRemove) {
        this.state.selectedIndex = 0;
      } else {
        this.state.selectedIndex -= toRemove;
      }
    }
    
    this.notifyListeners();
  }

  // Clear all requests (triggered by 'dr' command)
  clearRequests(): void {
    this.state.requests = [];
    this.state.selectedIndex = 0;
    this.notifyListeners();
  }

  // Delete single request (triggered by 'dd' command)
  deleteRequest(index: number): void {
    this.state.requests.splice(index, 1);
    // Adjust selection if needed
    if (this.state.selectedIndex >= this.state.requests.length) {
      this.state.selectedIndex = Math.max(0, this.state.requests.length - 1);
    }
    this.notifyListeners();
  }

  // Get filtered requests based on search and filters (with memoization)
  getFilteredRequests(): NetworkRequest[] {
    // Check if we can use cached result
    const cacheValid = 
      this.filteredRequestsCache.requests !== null &&
      this.filteredRequestsCache.lastRequestsLength === this.state.requests.length &&
      this.filteredRequestsCache.lastSearchQuery === this.state.searchQuery &&
      this.filteredRequestsCache.lastTypesSize === this.state.filters.types.size;

    if (cacheValid) {
      return this.filteredRequestsCache.requests!;
    }

    // Rebuild Fuse index if requests changed
    if (this.fuseIndex === null || this.lastFuseIndexLength !== this.state.requests.length) {
      this.fuseIndex = createFuseIndex(this.state.requests);
      this.lastFuseIndexLength = this.state.requests.length;
    }

    // Get base results: fuzzy search if query exists, otherwise all requests
    let baseResults: NetworkRequest[];
    
    if (this.state.searchQuery) {
      // Use Fuse.js fuzzy search - results are already ranked by relevance
      baseResults = this.fuseIndex.search(this.state.searchQuery).map(result => result.item);
    } else {
      baseResults = this.state.requests;
    }

    // Apply type filter on top of search results
    const filtered = this.state.filters.types.size > 0
      ? baseResults.filter(req => this.state.filters.types.has(req.type))
      : baseResults;

    // Update cache
    this.filteredRequestsCache = {
      requests: filtered,
      lastRequestsLength: this.state.requests.length,
      lastSearchQuery: this.state.searchQuery,
      lastMethodsSize: 0,
      lastTypesSize: this.state.filters.types.size
    };

    return filtered;
  }
  
  // Invalidate cache when filters change significantly
  invalidateFilterCache(): void {
    this.filteredRequestsCache.requests = null;
    // Also invalidate Fuse index to ensure fresh search results
    this.fuseIndex = null;
  }
}

