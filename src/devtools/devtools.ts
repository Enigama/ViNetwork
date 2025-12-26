// Create the "ViNetwork" panel in DevTools
let panelInstance: chrome.devtools.panels.ExtensionPanel | null = null;

chrome.devtools.panels.create(
  "ViNetwork",
  "", // No icon for panel tab
  "src/devtools/panel.html", // Corrected path
  (panel: chrome.devtools.panels.ExtensionPanel) => {
    // Panel created successfully
    panelInstance = panel;
    
    // Listen for when panel becomes visible to ensure debugger is attached
    panel.onShown.addListener((window: Window) => {
      // When panel becomes visible, dispatch a custom event
      // The panel.ts will listen for this and ensure network capture is active
      window.dispatchEvent(new CustomEvent('panel-shown'));
    });
  }
);

