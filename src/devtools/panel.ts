import '../styles/main.css';
import { StateManager } from '../core/StateManager';
import { NetworkCapture } from '../core/NetworkCapture';
import { KeyboardHandler } from '../core/KeyboardHandler';
import { FilterManager } from '../core/FilterManager';
import { NetworkTable } from '../components/NetworkTable';
import { PreviewPane } from '../components/PreviewPane';
import { HeadersList } from '../components/HeadersList';
import { CopyMenu } from '../components/CopyMenu';
import { StatusBar } from '../components/StatusBar';
import { AppMode } from '../types';
import { debounce } from '../utils/debounce';

class DevToolsPanel {
  private stateManager: StateManager;
  private networkCapture: NetworkCapture;
  private keyboardHandler: KeyboardHandler;
  private filterManager: FilterManager;
  private networkTable: NetworkTable;
  private previewPane: PreviewPane;
  private headersList: HeadersList;
  private copyMenu: CopyMenu;
  private statusBar: StatusBar;

  constructor() {
    // Initialize core systems
    this.stateManager = new StateManager();
    this.networkCapture = new NetworkCapture(this.stateManager);
    this.keyboardHandler = new KeyboardHandler(this.stateManager);
    this.filterManager = new FilterManager(this.stateManager);

    // Make filterManager and networkCapture globally accessible
    (window as any).filterManager = this.filterManager;
    (window as any).networkCapture = this.networkCapture;

    // Initialize UI components
    const tableContainer = document.getElementById('network-table')!;
    const previewContainer = document.getElementById('preview-pane')!;
    const headersContainer = document.getElementById('headers-view')!;
    const copyBarContainer = document.getElementById('copy-bar')!;
    
    this.networkTable = new NetworkTable(tableContainer, this.stateManager);
    this.previewPane = new PreviewPane(previewContainer, this.stateManager);
    this.headersList = new HeadersList(headersContainer, this.stateManager);
    this.copyMenu = new CopyMenu(copyBarContainer, this.stateManager);
    this.statusBar = new StatusBar(this.stateManager);

    // Make headersList and copyMenu globally accessible for KeyboardHandler
    (window as any).headersList = this.headersList;
    (window as any).copyMenu = this.copyMenu;

    // Setup UI event listeners
    this.setupUI();

    // Subscribe to state changes for mode indicator
    this.stateManager.subscribe(this.updateModeIndicator.bind(this));

    // Auto-focus on the network table when panel loads
    // This allows keyboard navigation to work immediately
    this.focusNetworkTable();

    // Listen for panel visibility changes to ensure debugger is attached
    this.setupPanelVisibilityHandling();
  }

  private setupPanelVisibilityHandling(): void {
    // Track when panel was initialized to avoid conflicts during initial load
    const initTime = Date.now();
    const INIT_DELAY = 1000; // Wait 1 second after init before handling visibility changes

    // Listen for panel shown event from devtools.ts
    window.addEventListener('panel-shown', () => {
      // Don't trigger on initial load - give constructor time to attach
      if (Date.now() - initTime < INIT_DELAY) {
        return;
      }
      // When panel becomes visible, ensure network capture is re-attached if needed
      // This handles the case where panel was hidden and then shown again
      this.networkCapture.ensureAttached();
    });

    // Also use document visibility API as a fallback
    document.addEventListener('visibilitychange', () => {
      // Don't trigger on initial load - give constructor time to attach
      if (Date.now() - initTime < INIT_DELAY) {
        return;
      }
      if (!document.hidden) {
        // Panel became visible, ensure debugger is attached
        this.networkCapture.ensureAttached();
      }
    });
  }

  private setupUI(): void {
    // Setup search bar with debouncing (200ms delay for better performance)
    const searchInput = document.getElementById('search-input') as HTMLInputElement;
    const debouncedSearch = debounce((query: string) => {
      this.stateManager.setState({ searchQuery: query });
    }, 200);
    
    searchInput.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value;
      debouncedSearch(query);
    });

    // Filter checkboxes are now handled by FilterManager
  }

  private updateModeIndicator(state: any): void {
    const modeIndicator = document.getElementById('mode-indicator')!;
    const modeText = document.getElementById('mode-text')!;
    const searchBar = document.getElementById('search-bar')!;
    const filterBar = document.getElementById('filter-bar')!;
    const copyBar = document.getElementById('copy-bar')!;
    const networkTable = document.getElementById('network-table')!;
    const previewPane = document.getElementById('preview-pane')!;

    // Update mode text
    modeText.textContent = state.mode.toUpperCase();
    modeIndicator.dataset.mode = state.mode;

    // Show/hide search, filter, and copy bars
    const wasSearchHidden = searchBar.classList.contains('hidden');
    searchBar.classList.toggle('hidden', state.mode !== AppMode.SEARCH);
    filterBar.classList.toggle('hidden', state.mode !== AppMode.FILTER);
    copyBar.classList.toggle('hidden', state.mode !== AppMode.COPY);

    // Toggle collapsed/expanded classes based on isInspectExpanded
    networkTable.classList.toggle('collapsed', state.isInspectExpanded);
    previewPane.classList.toggle('expanded', state.isInspectExpanded);

    // Focus search input only when first entering search mode
    if (state.mode === AppMode.SEARCH && wasSearchHidden) {
      const searchInput = document.getElementById('search-input') as HTMLInputElement;
      searchInput.focus();
      // Don't select text - just place cursor at end
      searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
    }
  }

  private focusNetworkTable(): void {
    // Wait for the DOM to be fully ready and rendered
    requestAnimationFrame(() => {
      const tableContainer = document.getElementById('network-table');
      if (tableContainer) {
        // Make the table container focusable
        tableContainer.setAttribute('tabindex', '0');
        tableContainer.focus();
        
        // If there are already requests, ensure first one is selected
        const state = this.stateManager.getState();
        if (state.requests.length > 0 && state.selectedIndex === 0) {
          // Trigger a re-render to show selection
          this.stateManager.setState({ selectedIndex: 0 });
        }
      }
    });
  }

}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new DevToolsPanel();
});

