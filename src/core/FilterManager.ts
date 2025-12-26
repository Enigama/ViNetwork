import { StateManager } from './StateManager';
import { RequestMethod, ResourceType } from '../types';

interface FilterOption {
  value: string;
  label: string;
  type: 'all' | 'type';
  resourceTypes?: ResourceType[]; // For combined filters like Fetch/XHR
}

interface StoredFilters {
  types: string[];
}

export class FilterManager {
  private stateManager: StateManager;
  private filterOptions: FilterOption[] = [];
  private filterElements: NodeListOf<HTMLElement> | null = null;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    this.initializeFilterOptions();
    this.attachListeners();
    this.loadFiltersFromStorage();
    this.loadFilterOrderFromStorage();
  }

  private initializeFilterOptions(): void {
    this.filterOptions = [
      { value: 'all', label: 'All', type: 'all' },
      { value: 'fetch/xhr', label: 'Fetch/XHR', type: 'type', resourceTypes: [ResourceType.FETCH, ResourceType.XHR] },
      { value: ResourceType.DOC, label: 'Doc', type: 'type' },
      { value: ResourceType.CSS, label: 'CSS', type: 'type' },
      { value: ResourceType.JS, label: 'JS', type: 'type' },
      { value: ResourceType.FONT, label: 'Font', type: 'type' },
      { value: ResourceType.IMG, label: 'Img', type: 'type' },
      { value: ResourceType.MEDIA, label: 'Media', type: 'type' },
      { value: ResourceType.MANIFEST, label: 'Manifest', type: 'type' },
      { value: ResourceType.SOCKET, label: 'Socket', type: 'type' },
      { value: ResourceType.WASM, label: 'Wasm', type: 'type' },
      { value: ResourceType.OTHER, label: 'Other', type: 'type' },
    ];
  }

  private attachListeners(): void {
    // Subscribe to state changes to update visual selection
    this.stateManager.subscribe(this.updateVisualSelection.bind(this));
    
    // Attach click handlers to checkboxes
    const filterBar = document.getElementById('filter-bar');
    if (filterBar) {
      const checkboxes = filterBar.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', (e) => {
          const target = e.target as HTMLInputElement;
          this.handleCheckboxChange(target.value, target.checked);
        });
      });
    }
  }

  public handleNavigation(key: string): void {
    const state = this.stateManager.getState();
    const currentIndex = state.filterSelectedIndex;
    const maxIndex = this.filterOptions.length - 1;

    switch (key) {
      case 'h':
        // Move left
        const newLeftIndex = Math.max(0, currentIndex - 1);
        this.stateManager.setState({ filterSelectedIndex: newLeftIndex });
        break;
      
      case 'l':
        // Move right
        const newRightIndex = Math.min(maxIndex, currentIndex + 1);
        this.stateManager.setState({ filterSelectedIndex: newRightIndex });
        break;
      
      case 'Enter':
        // Toggle selected checkbox
        this.toggleSelected();
        break;
    }
  }

  private toggleSelected(): void {
    const state = this.stateManager.getState();
    
    // Find the checkbox at the current visual position
    const filterBar = document.getElementById('filter-bar');
    if (!filterBar) return;

    const filterOptions = filterBar.querySelectorAll('.filter-option');
    const selectedFilterOption = filterOptions[state.filterSelectedIndex] as HTMLElement;
    
    if (!selectedFilterOption) return;

    const checkbox = selectedFilterOption.querySelector('input[type="checkbox"]') as HTMLInputElement;

    if (checkbox) {
      checkbox.checked = !checkbox.checked;
      this.handleCheckboxChange(checkbox.value, checkbox.checked);
    }
  }

  private handleCheckboxChange(value: string, checked: boolean): void {
    const state = this.stateManager.getState();
    
    if (value === 'all') {
      // If "All" is checked, clear all filters
      if (checked) {
        state.filters.types.clear();
        // Uncheck all other checkboxes
        this.uncheckAllExcept('all');
      }
    } else {
      // If any specific filter is checked, uncheck "All"
      if (checked) {
        const allCheckbox = document.querySelector(
          'input[type="checkbox"][value="all"]'
        ) as HTMLInputElement;
        if (allCheckbox) {
          allCheckbox.checked = false;
        }
      }

      // Update filters based on type
      const option = this.filterOptions.find(opt => opt.value === value);
      if (option && option.type === 'type') {
        if (option.resourceTypes) {
          // Handle combined filters (e.g., Fetch/XHR)
          option.resourceTypes.forEach(resourceType => {
            if (checked) {
              state.filters.types.add(resourceType);
            } else {
              state.filters.types.delete(resourceType);
            }
          });
        } else {
          // Handle single resource type filters
          if (checked) {
            state.filters.types.add(value as ResourceType);
          } else {
            state.filters.types.delete(value as ResourceType);
          }
        }
      }

      // If no filters are selected, check "All"
      if (state.filters.types.size === 0) {
        const allCheckbox = document.querySelector(
          'input[type="checkbox"][value="all"]'
        ) as HTMLInputElement;
        if (allCheckbox) {
          allCheckbox.checked = true;
        }
      }
    }

    // Update state and save to storage
    this.stateManager.setState({ filters: state.filters });
    this.saveFiltersToStorage();
  }

  private uncheckAllExcept(exceptValue: string): void {
    const filterBar = document.getElementById('filter-bar');
    if (!filterBar) return;

    const checkboxes = filterBar.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      const input = checkbox as HTMLInputElement;
      if (input.value !== exceptValue) {
        input.checked = false;
      }
    });
  }

  private updateVisualSelection(state: any): void {
    // Update visual indicator for selected filter
    // Always refresh the elements to get the current DOM state after reordering
    this.filterElements = document.querySelectorAll('.filter-option');

    this.filterElements.forEach((element, index) => {
      if (index === state.filterSelectedIndex) {
        element.classList.add('filter-selected');
      } else {
        element.classList.remove('filter-selected');
      }
    });
  }

  public async loadFiltersFromStorage(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('vim-network-filters');
      const storedFilters = result['vim-network-filters'] as StoredFilters | undefined;

      if (storedFilters) {
        const state = this.stateManager.getState();
        
        // Clear existing filters
        state.filters.types.clear();

        // Load types
        if (storedFilters.types && storedFilters.types.length > 0) {
          storedFilters.types.forEach(type => {
            state.filters.types.add(type as ResourceType);
          });
        }

        // Update checkboxes to reflect loaded state
        this.updateCheckboxesFromState(state);

        // Update state
        this.stateManager.setState({ filters: state.filters });
      }
    } catch (error) {
      // Silently fail - use default filters
    }
  }

  private updateCheckboxesFromState(state: any): void {
    const filterBar = document.getElementById('filter-bar');
    if (!filterBar) return;

    const checkboxes = filterBar.querySelectorAll('input[type="checkbox"]');
    
    // First uncheck all
    checkboxes.forEach((checkbox) => {
      (checkbox as HTMLInputElement).checked = false;
    });

    // Check filters that are active
    if (state.filters.types.size === 0) {
      // If no filters, check "All"
      const allCheckbox = filterBar.querySelector(
        'input[type="checkbox"][value="all"]'
      ) as HTMLInputElement;
      if (allCheckbox) {
        allCheckbox.checked = true;
      }
    } else {
      // Check active type filters
      state.filters.types.forEach((type: string) => {
        // Check for direct match
        const checkbox = filterBar.querySelector(
          `input[type="checkbox"][value="${type}"]`
        ) as HTMLInputElement;
        if (checkbox) {
          checkbox.checked = true;
        }
      });
      
      // Check combined Fetch/XHR filter if both are active
      if (state.filters.types.has(ResourceType.FETCH) && state.filters.types.has(ResourceType.XHR)) {
        const fetchXhrCheckbox = filterBar.querySelector(
          'input[type="checkbox"][value="fetch/xhr"]'
        ) as HTMLInputElement;
        if (fetchXhrCheckbox) {
          fetchXhrCheckbox.checked = true;
        }
      }
    }
  }

  private async saveFiltersToStorage(): Promise<void> {
    try {
      const state = this.stateManager.getState();
      
      const storedFilters: StoredFilters = {
        types: Array.from(state.filters.types)
      };

      await chrome.storage.local.set({ 'vim-network-filters': storedFilters });
    } catch (error) {
      // Silently fail - filters will be reset on reload
    }
  }

  // Move selected filter left (Shift+H)
  public moveFilterLeft(): void {
    const state = this.stateManager.getState();
    const currentIndex = state.filterSelectedIndex;
    
    // Can't move 'All' (index 0)
    if (currentIndex <= 1) return;
    
    // Get the filter value at current position (skip 'all' at index 0)
    const filterOrder = [...state.filterOrder];
    const orderIndex = currentIndex - 1; // Adjust for 'all' being at index 0
    
    // Swap with previous item
    [filterOrder[orderIndex], filterOrder[orderIndex - 1]] = 
      [filterOrder[orderIndex - 1], filterOrder[orderIndex]];
    
    // Update state with new order and move selection
    this.stateManager.setState({ 
      filterOrder,
      filterSelectedIndex: currentIndex - 1
    });
    
    // Re-render the filter bar with new order
    this.renderFilterBar();
    this.saveFilterOrderToStorage();
  }

  // Move selected filter right (Shift+L)
  public moveFilterRight(): void {
    const state = this.stateManager.getState();
    const currentIndex = state.filterSelectedIndex;
    const maxIndex = this.filterOptions.length - 1;
    
    // Can't move 'All' (index 0) or if already at end
    if (currentIndex === 0 || currentIndex >= maxIndex) return;
    
    // Get the filter value at current position (skip 'all' at index 0)
    const filterOrder = [...state.filterOrder];
    const orderIndex = currentIndex - 1; // Adjust for 'all' being at index 0
    
    // Swap with next item
    [filterOrder[orderIndex], filterOrder[orderIndex + 1]] = 
      [filterOrder[orderIndex + 1], filterOrder[orderIndex]];
    
    // Update state with new order and move selection
    this.stateManager.setState({ 
      filterOrder,
      filterSelectedIndex: currentIndex + 1
    });
    
    // Re-render the filter bar with new order
    this.renderFilterBar();
    this.saveFilterOrderToStorage();
  }

  // Render the filter bar based on current order
  private renderFilterBar(): void {
    const filterBar = document.getElementById('filter-bar');
    if (!filterBar) return;
    
    const filterOptions = filterBar.querySelector('.filter-options');
    if (!filterOptions) return;
    
    const state = this.stateManager.getState();
    
    // Clear existing content
    filterOptions.innerHTML = '';
    
    // Always add 'All' first
    const allOption = this.filterOptions.find(opt => opt.value === 'all');
    if (allOption) {
      const label = this.createFilterLabel(allOption, 0);
      filterOptions.appendChild(label);
    }
    
    // Add other filters in custom order
    state.filterOrder.forEach((value, index) => {
      const option = this.filterOptions.find(opt => opt.value === value);
      if (option) {
        const label = this.createFilterLabel(option, index + 1); // +1 for 'all'
        filterOptions.appendChild(label);
      }
    });
    
    // Re-attach listeners
    this.attachCheckboxListeners(filterOptions);
    
    // Update visual selection
    this.updateVisualSelection(state);
  }

  // Helper to create a filter label element
  private createFilterLabel(option: FilterOption, index: number): HTMLLabelElement {
    const state = this.stateManager.getState();
    const label = document.createElement('label');
    label.className = 'filter-option';
    label.setAttribute('data-index', index.toString());
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = option.value;
    
    // Set checked state based on current filters
    if (option.value === 'all') {
      checkbox.checked = state.filters.types.size === 0;
    } else if (option.type === 'type') {
      if (option.resourceTypes) {
        // For combined filters, check if all resource types are active
        checkbox.checked = option.resourceTypes.every(rt => state.filters.types.has(rt));
      } else {
        checkbox.checked = state.filters.types.has(option.value as ResourceType);
      }
    }
    
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(' ' + option.label));
    
    return label;
  }

  // Helper to attach checkbox listeners
  private attachCheckboxListeners(filterOptions: Element): void {
    const checkboxes = filterOptions.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        this.handleCheckboxChange(target.value, target.checked);
      });
    });
  }

  // Load filter order from storage
  public async loadFilterOrderFromStorage(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('vim-network-filter-order');
      const storedOrder = result['vim-network-filter-order'] as string[] | undefined;
      
      if (storedOrder && Array.isArray(storedOrder) && storedOrder.length > 0) {
        this.stateManager.setState({ filterOrder: storedOrder });
        this.renderFilterBar();
      }
    } catch (error) {
      // Silently fail - use default order
    }
  }

  // Save filter order to storage
  private async saveFilterOrderToStorage(): Promise<void> {
    try {
      const state = this.stateManager.getState();
      await chrome.storage.local.set({ 'vim-network-filter-order': state.filterOrder });
    } catch (error) {
      // Silently fail
    }
  }
}

