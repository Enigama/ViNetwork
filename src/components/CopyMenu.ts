import { StateManager } from '../core/StateManager';
import { AppMode } from '../types';
import { CopyUtil } from '../utils/copy';

export class CopyMenu {
  private container: HTMLElement;
  private stateManager: StateManager;
  private selectedMenuItem: number = 0;
  private menuItems = [
    { label: 'Copy as cURL', action: 'curl' },
    { label: 'Copy URL', action: 'url' },
    { label: 'Copy Request Headers', action: 'request-headers' },
    { label: 'Copy Response Headers', action: 'response-headers' },
    { label: 'Copy Response Body', action: 'response' }
  ];

  constructor(container: HTMLElement, stateManager: StateManager) {
    this.container = container;
    this.stateManager = stateManager;
    this.stateManager.subscribe(this.render.bind(this));
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Add click handlers to copy options
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('copy-option')) {
        const index = parseInt(target.dataset.index || '0', 10);
        this.executeActionByIndex(index);
      }
    });
  }

  render(state: any): void {
    const copyBar = document.getElementById('copy-bar');
    if (!copyBar) return;

    if (state.mode !== AppMode.COPY) {
      // Reset selection when leaving copy mode
      this.selectedMenuItem = 0;
      return;
    }

    // Update selected class on all options
    const options = copyBar.querySelectorAll('.copy-option');
    options.forEach((option, index) => {
      if (index === this.selectedMenuItem) {
        option.classList.add('selected');
      } else {
        option.classList.remove('selected');
      }
    });
  }

  moveSelection(delta: number): void {
    this.selectedMenuItem = (this.selectedMenuItem + delta + this.menuItems.length) % this.menuItems.length;
    const state = this.stateManager.getState();
    this.render(state);
  }

  executeSelectedAction(): void {
    this.executeActionByIndex(this.selectedMenuItem);
  }

  private executeActionByIndex(index: number): void {
    const item = this.menuItems[index];
    if (!item) return;

    const state = this.stateManager.getState();
    const requests = this.stateManager.getFilteredRequests();
    const selectedRequest = requests[state.selectedIndex];
    
    if (!selectedRequest) return;

    let text = '';
    let toastMessage = '';

    switch (item.action) {
      case 'curl':
        text = CopyUtil.copyAsCurl(selectedRequest);
        toastMessage = 'Copied as cURL';
        break;
        
      case 'url':
        text = CopyUtil.copyUrl(selectedRequest);
        toastMessage = 'Copied URL';
        break;
        
      case 'request-headers':
        text = CopyUtil.copyRequestHeaders(selectedRequest);
        toastMessage = 'Copied Request Headers';
        break;
        
      case 'response-headers':
        text = CopyUtil.copyResponseHeaders(selectedRequest);
        toastMessage = 'Copied Response Headers';
        break;
        
      case 'response':
        text = CopyUtil.copyResponse(selectedRequest);
        toastMessage = 'Copied Response Body';
        break;
    }
    
    if (text) {
      CopyUtil.toClipboard(text);
      this.showToast(toastMessage);
    }
    
    // Exit copy mode after action
    this.stateManager.setState({ mode: AppMode.NORMAL });
    this.selectedMenuItem = 0; // Reset selection for next time
  }

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
