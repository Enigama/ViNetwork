// Application modes matching Vim's modal editing
export enum AppMode {
  NORMAL = 'normal',   // Default: navigation and commands
  SEARCH = 'search',   // Active when '/' pressed, typing search
  FILTER = 'filter',   // Active when 'f' pressed, selecting filters
  INSPECT = 'inspect', // Active when Enter pressed on a request
  COPY = 'copy'        // Active when 'c' pressed, showing copy menu
}

// Focus areas in inspect mode
export enum InspectFocus {
  HEADERS = 'headers',
  RESPONSE = 'response',
  PREVIEW = 'preview'
}

export enum RequestMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  OPTIONS = 'OPTIONS',
  HEAD = 'HEAD'
}

export enum ResourceType {
  XHR = 'xhr',
  FETCH = 'fetch',
  DOC = 'document',
  CSS = 'stylesheet',
  JS = 'script',
  IMG = 'image',
  FONT = 'font',
  MEDIA = 'media',
  MANIFEST = 'manifest',
  SOCKET = 'websocket',
  WASM = 'wasm',
  OTHER = 'other'
}

// Complete network request object with all captured data
export interface NetworkRequest {
  id: string;                              // Unique Chrome request ID
  url: string;                             // Full URL
  name: string;                            // Extracted filename/path from URL
  method: RequestMethod;                   // HTTP method
  type: ResourceType;                      // Resource type
  status: number;                          // HTTP status code (0 if pending)
  statusText: string;                      // Status text or "Pending"
  timestamp: number;                       // Request start time (ms)
  duration: number;                        // Request duration (ms)
  size: number;                            // Response size (bytes)
  requestHeaders: Record<string, string>;  // Request headers map
  responseHeaders: Record<string, string>; // Response headers map
  requestBody?: any;                       // POST data if present
  responseBody?: any;                      // Response body (parsed JSON or text)
  initiator?: string;                      // What triggered the request
}

// Application state - single source of truth
export interface AppState {
  mode: AppMode;                           // Current modal mode
  requests: NetworkRequest[];              // All captured requests
  selectedIndex: number;                   // Currently selected row (0-based)
  searchQuery: string;                     // Current search text
  filters: FilterState;                    // Active filters
  jsonExpanded: Map<string, boolean>;      // JSON node expansion state
  previewTab: 'headers' | 'response' | 'preview'; // Active preview tab
  filterSelectedIndex: number;             // Currently selected filter (0-based)
  filterOrder: string[];                   // Custom order of filter values (excluding 'all')
  inspectFocus: InspectFocus;              // Which panel is focused in inspect mode
  inspectScrollPosition: number;           // Scroll position in focused panel
  inspectSearchQuery: string;              // Search query within panel
  inspectSearchMatches: number[];          // Line numbers of search matches
  inspectSearchIndex: number;              // Current match index
  headersSelectedIndex: number;            // Currently selected header in Headers tab
  isInspectExpanded: boolean;              // Whether inspect mode is in full-width view
  jsonSelectedIndex: number;               // Currently selected JSON node in Preview tab
  flattenedJsonNodes: JsonNode[];          // Cached flat list of visible JSON nodes
}

export interface FilterState {
  types: Set<ResourceType>;                // Filtered resource types
  statusCodes: number[];                   // Filtered status codes
}

// JSON node for tree navigation
export interface JsonNode {
  key: string;                             // Property key or array index
  value: unknown;                          // The actual value
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  path: string;                            // Dot-notation path (e.g., "data.users[0].name")
  isExpanded: boolean;                     // Whether object/array is expanded
  level: number;                           // Nesting depth for indentation
}

