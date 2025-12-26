import { NetworkRequest, JsonNode } from '../types';

export class CopyUtil {
  // Copy JSON node value (for 'y' command)
  static copyJsonValue(node: JsonNode): string {
    if (node.type === 'object' || node.type === 'array') {
      return JSON.stringify(node.value, null, 2);
    }
    
    if (node.type === 'string') {
      // Return raw string without quotes for primitives
      return node.value as string;
    }
    
    return String(node.value);
  }
  
  // Copy JSON node as full JSON (for 'yy' command)
  static copyJsonAsJson(node: JsonNode): string {
    return JSON.stringify(node.value, null, 2);
  }
  
  // Copy JSON path (for 'yp' command)
  static copyJsonPath(path: string): string {
    return path;
  }

  // Copy as cURL command
  static copyAsCurl(request: NetworkRequest): string {
    const { method, url, requestHeaders, requestBody } = request;
    
    let curl = `curl '${url}'`;
    
    // Add method if not GET
    if (method !== 'GET') {
      curl += ` -X ${method}`;
    }
    
    // Add headers
    Object.entries(requestHeaders).forEach(([key, value]) => {
      curl += ` \\\n  -H '${key}: ${value}'`;
    });
    
    // Add request body if present
    if (requestBody) {
      const body = typeof requestBody === 'string' 
        ? requestBody 
        : JSON.stringify(requestBody);
      curl += ` \\\n  --data-raw '${body.replace(/'/g, "\\'")}'`;
    }
    
    curl += ' \\\n  --compressed';
    
    return curl;
  }
  
  // Copy just the URL
  static copyUrl(request: NetworkRequest): string {
    return request.url;
  }
  
  // Copy request headers as JSON
  static copyRequestHeaders(request: NetworkRequest): string {
    return JSON.stringify(request.requestHeaders, null, 2);
  }
  
  // Copy response headers as JSON
  static copyResponseHeaders(request: NetworkRequest): string {
    return JSON.stringify(request.responseHeaders, null, 2);
  }
  
  // Copy response body
  static copyResponse(request: NetworkRequest): string {
    if (!request.responseBody) return '';
    return typeof request.responseBody === 'string'
      ? request.responseBody
      : JSON.stringify(request.responseBody, null, 2);
  }
  
  // Helper to copy to clipboard
  // Uses legacy execCommand as primary method - more reliable in DevTools extensions
  // navigator.clipboard API is blocked by permissions policy in extension contexts
  static toClipboard(text: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Failed to copy:', err);
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

