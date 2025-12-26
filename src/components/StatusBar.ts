import { StateManager } from '../core/StateManager';
import { NetworkRequest } from '../types';

export class StatusBar {
  private stateManager: StateManager;
  private requestsEl: HTMLElement;
  private transferredEl: HTMLElement;
  private searchEl: HTMLElement;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    
    this.requestsEl = document.getElementById('status-requests')!;
    this.transferredEl = document.getElementById('status-transferred')!;
    this.searchEl = document.getElementById('status-search')!;
    
    // Subscribe to state changes
    this.stateManager.subscribe(this.update.bind(this));
    
    // Initial render
    this.update(this.stateManager.getState());
  }

  private update(state: any): void {
    const filteredRequests = this.stateManager.getFilteredRequests();
    const allRequests = state.requests; // Use all requests for stats
    
    // Calculate stats from all requests (not filtered)
    const stats = this.calculateStats(allRequests);
    
    // Show filtered count in requests, but use all requests for other stats
    const requestCount = filteredRequests.length;
    const totalCount = allRequests.length;
    
    // Update UI - show filtered count (like native Network tab does)
    if (requestCount === totalCount) {
      this.requestsEl.textContent = `${requestCount} request${requestCount !== 1 ? 's' : ''}`;
    } else {
      // Show filtered count when filtering is active
      this.requestsEl.textContent = `${requestCount} / ${totalCount} request${totalCount !== 1 ? 's' : ''}`;
    }
    
    this.transferredEl.textContent = `${this.formatSize(stats.transferred)} transferred`;
    
    // Show/hide search indicator
    if (state.searchQuery && state.searchQuery.length > 0) {
      this.searchEl.textContent = `Search: "${state.searchQuery}"`;
      this.searchEl.classList.remove('hidden');
    } else {
      this.searchEl.classList.add('hidden');
    }
  }

  private calculateStats(requests: NetworkRequest[]): { transferred: number } {
    if (requests.length === 0) {
      return { transferred: 0 };
    }
    
    let transferred = 0;
    
    requests.forEach(req => {
      // Transferred size (actual bytes transferred over network)
      transferred += req.size;
    });
    
    return { transferred };
  }

  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }
}

