import { StateManager } from './StateManager';
import { AppMode, InspectFocus } from '../types';
import { CopyUtil } from '../utils/copy';
import { JsonViewer } from '../components/JsonViewer';

// Extend window to include jsonViewer
declare global {
  interface Window {
    jsonViewer?: JsonViewer;
  }
}

export class KeyboardHandler {
  private stateManager: StateManager;
  private keySequence: string = '';
  private sequenceTimeout: number | null = null;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    this.attachListeners();
  }

  private attachListeners(): void {
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  // Main keyboard event router
  private handleKeyDown(event: KeyboardEvent): void {
    const state = this.stateManager.getState();
    const { mode } = state;

    // Route to mode-specific handler
    switch (mode) {
      case AppMode.NORMAL:
        this.handleNormalMode(event);
        break;
      case AppMode.SEARCH:
        this.handleSearchMode(event);
        break;
      case AppMode.FILTER:
        this.handleFilterMode(event);
        break;
      case AppMode.INSPECT:
        this.handleInspectMode(event);
        break;
      case AppMode.COPY:
        this.handleCopyMode(event);
        break;
    }
  }

  // Normal mode: Vim navigation commands
  private handleNormalMode(event: KeyboardEvent): void {
    const state = this.stateManager.getState();
    const requests = this.stateManager.getFilteredRequests();

    // Prevent default for vim keys to avoid browser shortcuts
    const vimKeys = ['j', 'k', 'h', 'l', 'g', 'G', '/', 'f', 'd', 'q', 'c'];
    if (vimKeys.includes(event.key)) {
      event.preventDefault();
    }

    switch (event.key) {
      case 'j':
        // Move selection down one row
        this.moveSelection(1, requests.length);
        break;

      case 'k':
        // Move selection up one row
        this.moveSelection(-1, requests.length);
        break;

      case 'h':
        // Collapse currently selected JSON node
        this.toggleJsonNode(false);
        break;

      case 'l':
        // Expand currently selected JSON node
        this.toggleJsonNode(true);
        break;

      case 'g':
        // Handle 'gg' sequence (go to top)
        this.handleGSequence(event);
        break;

      case 'G':
        // Go to bottom (last request)
        this.stateManager.setState({ 
          selectedIndex: Math.max(0, requests.length - 1) 
        });
        break;

      case '/':
        // Enter search mode
        this.stateManager.setState({ 
          mode: AppMode.SEARCH, 
          searchQuery: '' 
        });
        // Focus search input (handled by UI)
        break;

      case 'f':
        // Enter filter mode
        this.stateManager.setState({ mode: AppMode.FILTER });
        break;

      case 'd':
        // Handle 'dd' and 'dr' sequences
        this.handleDSequence(event);
        break;

      case 'Enter':
        // Enter inspect mode - respect the currently selected previewTab
        const currentTab = state.previewTab;
        const focusMap: Record<string, InspectFocus> = {
          'headers': InspectFocus.HEADERS,
          'response': InspectFocus.RESPONSE,
          'preview': InspectFocus.PREVIEW
        };
        const selectorMap: Record<string, string> = {
          'headers': '#headers-view',
          'response': '#response-view',
          'preview': '#preview-view'
        };
        
        this.stateManager.setState({ 
          mode: AppMode.INSPECT,
          inspectFocus: focusMap[currentTab]
        });
        
        // Focus the active panel so keyboard scrolling works immediately
        requestAnimationFrame(() => {
          const activePanel = document.querySelector(selectorMap[currentTab]) as HTMLElement;
          if (activePanel) {
            console.log(`Focusing ${currentTab} panel on Enter`);
            activePanel.setAttribute('tabindex', '0');
            activePanel.focus();
            console.log('Active element after focus:', document.activeElement);
          } else {
            console.error(`Panel not found: ${selectorMap[currentTab]}`);
          }
        });
        break;

      case ' ':
        // Toggle JSON formatting
        event.preventDefault();
        this.toggleJsonFormat();
        break;

      case '?':
        // Toggle help panel
        event.preventDefault();
        this.toggleHelp();
        break;

      case 'c':
        // Enter copy mode (show copy bar)
        this.stateManager.setState({ mode: AppMode.COPY });
        break;
    }

    // Handle Ctrl combinations
    if (event.ctrlKey) {
      switch (event.key) {
        case 's':
          event.preventDefault();
          this.exportData();
          break;
        case 'p':
          event.preventDefault();
          this.quickSearch();
          break;
      }
    }

    // Handle Shift combinations for tab switching
    if (event.shiftKey) {
      switch (event.key) {
        case 'H':
          this.stateManager.setState({ previewTab: 'headers' });
          break;
        case 'L':
          this.stateManager.setState({ previewTab: 'response' });
          break;
        case 'P':
          this.stateManager.setState({ previewTab: 'preview' });
          break;
      }
    }
  }

  // Search mode: Only handle q and Enter
  private handleSearchMode(event: KeyboardEvent): void {
    switch (event.key) {
      case 'q':
        event.preventDefault();
        // Exit search mode, clear query
        this.stateManager.setState({ 
          mode: AppMode.NORMAL,
          searchQuery: ''
        });
        break;
      case 'Enter':
        event.preventDefault();
        // Apply search and return to normal mode
        this.stateManager.setState({ mode: AppMode.NORMAL });
        break;
    }
    // Other keys are handled by the search input element
  }

  // Filter mode: Handle q to exit, h/l navigation, and Enter to toggle
  private handleFilterMode(event: KeyboardEvent): void {
    type FilterManagerType = {
      moveFilterLeft: () => void;
      moveFilterRight: () => void;
      handleNavigation: (key: string) => void;
    };
    
    if (event.key === 'q') {
      event.preventDefault();
      this.stateManager.setState({ mode: AppMode.NORMAL });
    } else if (event.shiftKey && event.key === 'H') {
      // Shift+H: Move filter left
      event.preventDefault();
      const filterManager = (window as unknown as { filterManager?: FilterManagerType }).filterManager;
      if (filterManager) {
        filterManager.moveFilterLeft();
      }
    } else if (event.shiftKey && event.key === 'L') {
      // Shift+L: Move filter right
      event.preventDefault();
      const filterManager = (window as unknown as { filterManager?: FilterManagerType }).filterManager;
      if (filterManager) {
        filterManager.moveFilterRight();
      }
    } else if (event.key === 'h' || event.key === 'l' || event.key === 'Enter') {
      event.preventDefault();
      // Delegate to FilterManager for normal navigation
      const filterManager = (window as unknown as { filterManager?: FilterManagerType }).filterManager;
      if (filterManager) {
        filterManager.handleNavigation(event.key);
      }
    }
    // Filter selections also handled by UI checkboxes via click
  }

  // Inspect mode: Focus on preview panels with vim-style navigation
  private handleInspectMode(event: KeyboardEvent): void {
    const state = this.stateManager.getState();
    
    if (event.key === 'q') {
      event.preventDefault();
      // Exit inspect mode, reset to Headers focus and collapse expansion
      this.stateManager.setState({ 
        mode: AppMode.NORMAL,
        inspectFocus: InspectFocus.HEADERS,
        inspectSearchQuery: '',
        inspectSearchMatches: [],
        inspectSearchIndex: 0,
        headersSelectedIndex: 0,
        isInspectExpanded: false
      });
      return;
    }

    // Toggle fullscreen with 'z'
    if (event.key === 'z') {
      event.preventDefault();
      const currentExpanded = state.isInspectExpanded;
      this.stateManager.setState({ isInspectExpanded: !currentExpanded });
      return;
    }

    // Handle tab switching with Shift+H/L/P
    if (event.shiftKey) {
      switch (event.key) {
        case 'H':
          event.preventDefault();
          this.switchToPanel('headers', InspectFocus.HEADERS, '#headers-view');
          return;
        case 'L':
          event.preventDefault();
          this.switchToPanel('response', InspectFocus.RESPONSE, '#response-view');
          return;
        case 'P':
          event.preventDefault();
          this.switchToPanel('preview', InspectFocus.PREVIEW, '#preview-view');
          return;
      }
    }

    // Tab and Shift+Tab for cycling through panels
    if (event.key === 'Tab') {
      event.preventDefault();
      this.cycleInspectFocus(event.shiftKey ? -1 : 1);
      return;
    }

    // Handle j/k differently when in Headers tab
    if (state.inspectFocus === InspectFocus.HEADERS && state.previewTab === 'headers') {
      if (event.key === 'j') {
        event.preventDefault();
        this.navigateHeaders(1);
        return;
      }
      
      if (event.key === 'k') {
        event.preventDefault();
        this.navigateHeaders(-1);
        return;
      }

      // h to collapse section, l to expand section
      if (event.key === 'h') {
        event.preventDefault();
        this.collapseHeaderSection();
        return;
      }

      if (event.key === 'l') {
        event.preventDefault();
        this.expandHeaderSection();
        return;
      }

      // y to copy (yank) the selected header
      if (event.key === 'y') {
        event.preventDefault();
        this.copySelectedHeader();
        return;
      }

      // Handle gg (go to first header) and G (go to last header)
      if (event.key === 'g') {
        this.handleHeadersGSequence(event);
        return;
      }

      if (event.key === 'G') {
        event.preventDefault();
        this.navigateHeadersTo('last');
        return;
      }
    } else if (state.inspectFocus === InspectFocus.PREVIEW && state.previewTab === 'preview') {
      // JSON navigation in Preview tab
      if (event.key === 'j') {
        event.preventDefault();
        this.navigateJson(1);
        return;
      }
      
      if (event.key === 'k') {
        event.preventDefault();
        this.navigateJson(-1);
        return;
      }

      // h to collapse, l to expand JSON node
      if (event.key === 'h') {
        event.preventDefault();
        this.collapseJsonNode();
        return;
      }

      if (event.key === 'l') {
        event.preventDefault();
        this.expandJsonNode();
        return;
      }

      // y for yank (copy) operations, p after y for path
      if (event.key === 'y' || (event.key === 'p' && this.keySequence === 'y')) {
        event.preventDefault();
        this.handleJsonYankSequence(event);
        return;
      }

      // Handle gg (go to first node) and G (go to last node)
      if (event.key === 'g') {
        this.handleJsonGSequence(event);
        return;
      }

      if (event.key === 'G') {
        event.preventDefault();
        this.navigateJsonTo('last');
        return;
      }
    } else {
      // Existing scroll behavior for Response tab
      if (event.key === 'j') {
        event.preventDefault();
        this.scrollInspectPanel(1);
        return;
      }
      
      if (event.key === 'k') {
        event.preventDefault();
        this.scrollInspectPanel(-1);
        return;
      }

      // Handle gg (go to top) and G (go to bottom)
      if (event.key === 'g') {
        this.handleInspectGSequence(event);
        return;
      }

      if (event.key === 'G') {
        event.preventDefault();
        this.scrollInspectPanelTo('bottom');
        return;
      }
    }

    // Ctrl+d / Ctrl+u for half-page scrolling
    if (event.ctrlKey) {
      if (event.key === 'd') {
        event.preventDefault();
        this.scrollInspectPanel(10);
        return;
      }
      if (event.key === 'u') {
        event.preventDefault();
        this.scrollInspectPanel(-10);
        return;
      }
    }

    // Search within the panel with /
    if (event.key === '/') {
      event.preventDefault();
      this.startInspectSearch();
      return;
    }

    // Navigate search matches with n/N
    if (event.key === 'n') {
      event.preventDefault();
      this.nextInspectSearchMatch(1);
      return;
    }

    if (event.key === 'N') {
      event.preventDefault();
      this.nextInspectSearchMatch(-1);
      return;
    }
  }

  // Handle 'gg' sequence (go to top)
  private handleGSequence(event: KeyboardEvent): void {
    this.keySequence += 'g';
    
    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
    }

    if (this.keySequence === 'gg') {
      // Go to first request
      this.stateManager.setState({ selectedIndex: 0 });
      this.keySequence = '';
    } else {
      // Wait for second 'g' (timeout after 1 second)
      this.sequenceTimeout = window.setTimeout(() => {
        this.keySequence = '';
      }, 1000);
    }
  }

  // Handle 'dd' (delete) and 'dr' (delete all) sequences
  private handleDSequence(event: KeyboardEvent): void {
    this.keySequence += 'd';
    
    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
    }

    const state = this.stateManager.getState();

    if (this.keySequence === 'dd') {
      // Delete selected request
      this.stateManager.deleteRequest(state.selectedIndex);
      this.keySequence = '';
    } else if (this.keySequence === 'dr') {
      // Clear all requests
      this.stateManager.clearRequests();
      this.keySequence = '';
    } else {
      // Wait for second character
      this.sequenceTimeout = window.setTimeout(() => {
        this.keySequence = '';
      }, 1000);
    }
  }

  // Move selection by delta, clamped to valid range
  private moveSelection(delta: number, maxLength: number): void {
    const state = this.stateManager.getState();
    const newIndex = Math.max(0, Math.min(maxLength - 1, state.selectedIndex + delta));
    this.stateManager.setState({ selectedIndex: newIndex });
  }

  // Toggle JSON node expansion
  private toggleJsonNode(expand: boolean): void {
    // Implementation depends on JSON viewer component
    // TODO: Implement JSON node expansion/collapse
  }

  // Toggle JSON formatting (pretty print vs compact)
  private toggleJsonFormat(): void {
    // TODO: Implement JSON format toggling
  }

  // Export all requests to JSON/HAR file
  private exportData(): void {
    const state = this.stateManager.getState();
    const data = JSON.stringify(state.requests, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `network-requests-${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  // Quick search modal (Ctrl+p)
  private quickSearch(): void {
    // TODO: Implement quick search modal
  }

  // Toggle help panel
  private toggleHelp(): void {
    const helpPanel = document.getElementById('help-panel');
    if (helpPanel) {
      helpPanel.classList.toggle('visible');
    }
  }

  // Cycle through inspect panels
  private cycleInspectFocus(direction: number): void {
    const state = this.stateManager.getState();
    const panels = [InspectFocus.HEADERS, InspectFocus.RESPONSE, InspectFocus.PREVIEW];
    const currentIndex = panels.indexOf(state.inspectFocus);
    const newIndex = (currentIndex + direction + panels.length) % panels.length;
    const newFocus = panels[newIndex];
    
    // Map focus to tab and selector
    const tabMap = {
      [InspectFocus.HEADERS]: 'headers',
      [InspectFocus.RESPONSE]: 'response',
      [InspectFocus.PREVIEW]: 'preview'
    };
    
    const selectorMap = {
      [InspectFocus.HEADERS]: '#headers-view',
      [InspectFocus.RESPONSE]: '#response-view',
      [InspectFocus.PREVIEW]: '#preview-view'
    };
    
    this.switchToPanel(tabMap[newFocus] as any, newFocus, selectorMap[newFocus]);
  }

  // Helper method to switch to a specific panel
  private switchToPanel(tab: 'headers' | 'response' | 'preview', focus: InspectFocus, selector: string): void {
    // Remove tabindex from all panels
    const allPanels = ['#headers-view', '#response-view', '#preview-view'];
    allPanels.forEach(sel => {
      const panel = document.querySelector(sel) as HTMLElement;
      if (panel) {
        panel.setAttribute('tabindex', '-1');
      }
    });
    
    // Update state
    this.stateManager.setState({ 
      inspectFocus: focus,
      previewTab: tab,
      inspectScrollPosition: 0
    });
    
    // Focus the new panel
    requestAnimationFrame(() => {
      const panel = document.querySelector(selector) as HTMLElement;
      if (panel) {
        console.log(`Switching to panel: ${selector}`);
        panel.setAttribute('tabindex', '0');
        panel.focus();
        console.log('Active element after switch:', document.activeElement);
      } else {
        console.error(`Panel not found: ${selector}`);
      }
    });
  }

  // Scroll the currently focused inspect panel
  private scrollInspectPanel(lines: number): void {
    const state = this.stateManager.getState();
    const panel = this.getActiveInspectPanel();
    
    console.log('scrollInspectPanel called:', { 
      lines, 
      mode: state.mode, 
      inspectFocus: state.inspectFocus,
      panel: panel?.id,
      panelScrollTop: panel?.scrollTop
    });
    
    if (panel) {
      const lineHeight = 20; // Approximate line height in pixels
      const oldScrollTop = panel.scrollTop;
      panel.scrollTop += lines * lineHeight;
      console.log('Scrolled panel:', {
        id: panel.id,
        from: oldScrollTop,
        to: panel.scrollTop,
        delta: lines * lineHeight
      });
      this.stateManager.setState({ 
        inspectScrollPosition: panel.scrollTop 
      });
    } else {
      console.error('No active panel found for scrolling');
    }
  }

  // Scroll to top or bottom of panel
  private scrollInspectPanelTo(position: 'top' | 'bottom'): void {
    const panel = this.getActiveInspectPanel();
    
    if (panel) {
      if (position === 'top') {
        panel.scrollTop = 0;
      } else {
        panel.scrollTop = panel.scrollHeight;
      }
      this.stateManager.setState({ 
        inspectScrollPosition: panel.scrollTop 
      });
    }
  }

  // Handle gg sequence in inspect mode
  private handleInspectGSequence(event: KeyboardEvent): void {
    this.keySequence += 'g';
    
    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
    }

    if (this.keySequence === 'gg') {
      event.preventDefault();
      this.scrollInspectPanelTo('top');
      this.keySequence = '';
    } else {
      this.sequenceTimeout = window.setTimeout(() => {
        this.keySequence = '';
      }, 1000);
    }
  }

  // Get the currently active inspect panel DOM element
  private getActiveInspectPanel(): HTMLElement | null {
    const state = this.stateManager.getState();
    const panelMap = {
      [InspectFocus.HEADERS]: '#headers-view',
      [InspectFocus.RESPONSE]: '#response-view',
      [InspectFocus.PREVIEW]: '#preview-view'
    };
    
    const selector = panelMap[state.inspectFocus];
    const panel = document.querySelector(selector) as HTMLElement | null;
    
    if (!panel) {
      console.error(`Panel not found for selector: ${selector}, inspectFocus: ${state.inspectFocus}`);
    }
    
    return panel;
  }

  // Start search within the inspect panel
  private startInspectSearch(): void {
    const searchBar = document.getElementById('inspect-search-bar');
    const searchInput = document.getElementById('inspect-search-input') as HTMLInputElement;
    
    if (searchBar && searchInput) {
      searchBar.classList.remove('hidden');
      searchInput.focus();
      searchInput.value = '';
      
      // Set up search input listener
      searchInput.oninput = () => {
        this.performInspectSearch(searchInput.value);
      };
      
      // Handle Enter and q
      searchInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.nextInspectSearchMatch(1);
        } else if (e.key === 'q') {
          e.preventDefault();
          searchBar.classList.add('hidden');
          this.stateManager.setState({
            inspectSearchQuery: '',
            inspectSearchMatches: [],
            inspectSearchIndex: 0
          });
          this.clearSearchHighlights();
        }
      };
    }
  }

  // Perform search within the current panel content
  private performInspectSearch(query: string): void {
    if (!query) {
      this.stateManager.setState({
        inspectSearchQuery: '',
        inspectSearchMatches: [],
        inspectSearchIndex: 0
      });
      this.clearSearchHighlights();
      this.updateSearchStatus();
      return;
    }

    const panel = this.getActiveInspectPanel();
    if (!panel) return;

    // First create the highlights
    this.highlightSearchMatches(query);
    
    // Count the actual highlight elements created
    const highlightElements = panel.querySelectorAll('.search-highlight');
    const matchCount = highlightElements.length;
    
    // Create an array of indices [0, 1, 2, ...] for match navigation
    const matches = Array.from({ length: matchCount }, (_, i) => i);

    this.stateManager.setState({
      inspectSearchQuery: query,
      inspectSearchMatches: matches,
      inspectSearchIndex: matchCount > 0 ? 0 : -1
    });

    if (matchCount > 0) {
      this.scrollToSearchMatch(0);
    }
    this.updateSearchStatus();
  }

  // Navigate to next/previous search match
  private nextInspectSearchMatch(direction: number): void {
    const state = this.stateManager.getState();
    const { inspectSearchMatches, inspectSearchIndex } = state;
    
    if (inspectSearchMatches.length === 0) return;
    
    const newIndex = (inspectSearchIndex + direction + inspectSearchMatches.length) % inspectSearchMatches.length;
    
    this.stateManager.setState({ inspectSearchIndex: newIndex });
    this.scrollToSearchMatch(newIndex);
    this.updateSearchStatus();
  }

  // Scroll to a specific search match
  private scrollToSearchMatch(matchIndex: number): void {
    const panel = this.getActiveInspectPanel();
    if (!panel) return;
    
    // Remove current class from all highlights
    const allHighlights = panel.querySelectorAll('.search-highlight');
    allHighlights.forEach(el => el.classList.remove('current'));
    
    // Get the highlight element at matchIndex
    const targetHighlight = allHighlights[matchIndex];
    if (!targetHighlight) return;
    
    // Mark the current match
    targetHighlight.classList.add('current');
    
    // Scroll the element into view, centered
    targetHighlight.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // Highlight all search matches in the panel
  private highlightSearchMatches(query: string): void {
    const panel = this.getActiveInspectPanel();
    if (!panel) return;
    
    // Clear existing highlights first
    this.clearSearchHighlights();
    
    // Get all text nodes and highlight matches
    const walker = document.createTreeWalker(
      panel,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    const nodesToReplace: { node: Node; parent: Node }[] = [];
    let currentNode = walker.nextNode();
    
    while (currentNode) {
      if (currentNode.textContent && currentNode.textContent.toLowerCase().includes(query.toLowerCase())) {
        nodesToReplace.push({ node: currentNode, parent: currentNode.parentNode! });
      }
      currentNode = walker.nextNode();
    }
    
    // Replace text nodes with highlighted versions
    nodesToReplace.forEach(({ node, parent }) => {
      const text = node.textContent || '';
      const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
      const parts = text.split(regex);
      
      const fragment = document.createDocumentFragment();
      parts.forEach(part => {
        if (part.toLowerCase() === query.toLowerCase()) {
          const mark = document.createElement('mark');
          mark.className = 'search-highlight';
          mark.textContent = part;
          fragment.appendChild(mark);
        } else if (part) {
          fragment.appendChild(document.createTextNode(part));
        }
      });
      
      parent.replaceChild(fragment, node);
    });
  }

  // Clear search highlights
  private clearSearchHighlights(): void {
    const panel = this.getActiveInspectPanel();
    if (!panel) return;
    
    const marks = panel.querySelectorAll('.search-highlight');
    marks.forEach(mark => {
      const text = document.createTextNode(mark.textContent || '');
      mark.parentNode?.replaceChild(text, mark);
    });
  }

  // Update search status display
  private updateSearchStatus(): void {
    const statusElement = document.getElementById('inspect-search-status');
    if (!statusElement) return;
    
    const state = this.stateManager.getState();
    const { inspectSearchMatches, inspectSearchIndex } = state;
    
    if (inspectSearchMatches.length === 0) {
      statusElement.textContent = 'No matches';
    } else {
      statusElement.textContent = `${inspectSearchIndex + 1}/${inspectSearchMatches.length}`;
    }
  }

  // Escape special regex characters
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Navigate headers list
  private navigateHeaders(delta: number): void {
    type HeadersListType = {
      moveSelection: (delta: number) => void;
      navigateTo: (position: 'first' | 'last') => void;
      collapseCurrentSection: () => void;
      expandCurrentSection: () => void;
      copySelectedHeader: () => void;
    };
    const headersList = (window as unknown as { headersList?: HeadersListType }).headersList;
    if (headersList) {
      headersList.moveSelection(delta);
    }
  }

  // Navigate to first or last header
  private navigateHeadersTo(position: 'first' | 'last'): void {
    type HeadersListType = {
      navigateTo: (position: 'first' | 'last') => void;
    };
    const headersList = (window as unknown as { headersList?: HeadersListType }).headersList;
    if (headersList) {
      headersList.navigateTo(position);
    }
  }

  // Handle 'gg' sequence for headers navigation
  private handleHeadersGSequence(event: KeyboardEvent): void {
    this.keySequence += 'g';
    
    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
    }

    if (this.keySequence === 'gg') {
      event.preventDefault();
      this.navigateHeadersTo('first');
      this.keySequence = '';
    } else {
      // Wait for second 'g' (timeout after 1 second)
      this.sequenceTimeout = window.setTimeout(() => {
        this.keySequence = '';
      }, 1000);
    }
  }

  // Collapse current header section
  private collapseHeaderSection(): void {
    type HeadersListType = { collapseCurrentSection: () => void };
    const headersList = (window as unknown as { headersList?: HeadersListType }).headersList;
    if (headersList) {
      headersList.collapseCurrentSection();
    }
  }

  // Expand current header section
  private expandHeaderSection(): void {
    type HeadersListType = { expandCurrentSection: () => void };
    const headersList = (window as unknown as { headersList?: HeadersListType }).headersList;
    if (headersList) {
      headersList.expandCurrentSection();
    }
  }

  // Copy selected header to clipboard
  private copySelectedHeader(): void {
    type HeadersListType = { copySelectedHeader: () => void };
    const headersList = (window as unknown as { headersList?: HeadersListType }).headersList;
    if (headersList) {
      headersList.copySelectedHeader();
    }
  }

  // Copy mode: Handle menu navigation
  private handleCopyMode(event: KeyboardEvent): void {
    const copyMenu = (window as unknown as { copyMenu?: { moveSelection: (d: number) => void; executeSelectedAction: () => void } }).copyMenu;
    if (!copyMenu) return;

    switch (event.key) {
      case 'q':
      case 'Escape':
        event.preventDefault();
        this.stateManager.setState({ mode: AppMode.NORMAL });
        break;
        
      case 'l':
      case 'ArrowRight':
        event.preventDefault();
        copyMenu.moveSelection(1);
        break;
        
      case 'h':
      case 'ArrowLeft':
        event.preventDefault();
        copyMenu.moveSelection(-1);
        break;
        
      case 'Enter':
        event.preventDefault();
        copyMenu.executeSelectedAction();
        break;
    }
  }

  // Navigate JSON nodes by delta
  private navigateJson(delta: number): void {
    const jsonViewer = window.jsonViewer;
    if (jsonViewer) {
      jsonViewer.moveSelection(delta);
    }
  }

  // Navigate to first or last JSON node
  private navigateJsonTo(position: 'first' | 'last'): void {
    const jsonViewer = window.jsonViewer;
    if (jsonViewer) {
      jsonViewer.navigateTo(position);
    }
  }

  // Collapse current JSON node
  private collapseJsonNode(): void {
    const jsonViewer = window.jsonViewer;
    if (jsonViewer) {
      jsonViewer.collapseCurrentNode();
    }
  }

  // Expand current JSON node
  private expandJsonNode(): void {
    const jsonViewer = window.jsonViewer;
    if (jsonViewer) {
      jsonViewer.expandCurrentNode();
    }
  }

  // Handle 'y', 'yy', 'yp' sequences for JSON yank
  private handleJsonYankSequence(event: KeyboardEvent): void {
    // Append the pressed key to the sequence
    this.keySequence += event.key;
    
    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
    }

    if (this.keySequence === 'yy') {
      // Copy entire node as JSON
      this.yankJsonAsJson();
      this.keySequence = '';
    } else if (this.keySequence === 'yp') {
      // Copy JSON path
      this.yankJsonPath();
      this.keySequence = '';
    } else if (this.keySequence === 'y') {
      // Wait for second character or timeout to copy value
      this.sequenceTimeout = window.setTimeout(() => {
        if (this.keySequence === 'y') {
          this.yankJsonValue();
        }
        this.keySequence = '';
      }, 300);
    } else {
      this.keySequence = '';
    }
  }

  // Copy current JSON value
  private yankJsonValue(): void {
    const jsonViewer = window.jsonViewer;
    if (!jsonViewer) return;

    const node = jsonViewer.getCurrentNode();
    if (!node) return;

    const value = CopyUtil.copyJsonValue(node);
    CopyUtil.toClipboard(value);
    this.showToast('Copied value');
  }

  // Copy current JSON node as full JSON
  private yankJsonAsJson(): void {
    const jsonViewer = window.jsonViewer;
    if (!jsonViewer) return;

    const json = jsonViewer.getCurrentNodeAsJson();
    if (json) {
      CopyUtil.toClipboard(json);
      this.showToast('Copied as JSON');
    }
  }

  // Copy current JSON path
  private yankJsonPath(): void {
    const jsonViewer = window.jsonViewer;
    if (!jsonViewer) return;

    const path = jsonViewer.getCurrentPath();
    if (path) {
      CopyUtil.toClipboard(path);
      this.showToast('Copied path');
    }
  }

  // Handle 'gg' sequence for JSON navigation
  private handleJsonGSequence(event: KeyboardEvent): void {
    this.keySequence += 'g';
    
    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
    }

    if (this.keySequence === 'gg') {
      event.preventDefault();
      this.navigateJsonTo('first');
      this.keySequence = '';
    } else {
      // Wait for second 'g' (timeout after 1 second)
      this.sequenceTimeout = window.setTimeout(() => {
        this.keySequence = '';
      }, 1000);
    }
  }

  // Show toast notification
  private showToast(message: string): void {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('visible');
    }, 10);
    
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => {
        if (toast.parentNode) {
          document.body.removeChild(toast);
        }
      }, 300);
    }, 2000);
  }
}

