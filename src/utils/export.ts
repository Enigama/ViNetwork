import { NetworkRequest } from '../types';

export class ExportUtil {
  // Export as simple JSON
  static exportAsJSON(requests: NetworkRequest[]): void {
    const data = JSON.stringify(requests, null, 2);
    this.download(data, 'network-requests.json', 'application/json');
  }

  // Export as HAR (HTTP Archive Format)
  static exportAsHAR(requests: NetworkRequest[]): void {
    const har = {
      log: {
        version: '1.2',
        creator: {
          name: 'ViNetwork',
          version: '1.0.0'
        },
        entries: requests.map(req => this.convertToHAREntry(req))
      }
    };

    const data = JSON.stringify(har, null, 2);
    this.download(data, 'network-requests.har', 'application/json');
  }

  // Convert NetworkRequest to HAR entry format
  private static convertToHAREntry(request: NetworkRequest): any {
    return {
      startedDateTime: new Date(request.timestamp).toISOString(),
      time: request.duration,
      request: {
        method: request.method,
        url: request.url,
        httpVersion: 'HTTP/1.1',
        headers: this.convertHeadersToHAR(request.requestHeaders),
        queryString: [],
        postData: request.requestBody ? {
          mimeType: 'application/json',
          text: JSON.stringify(request.requestBody)
        } : undefined
      },
      response: {
        status: request.status,
        statusText: request.statusText,
        httpVersion: 'HTTP/1.1',
        headers: this.convertHeadersToHAR(request.responseHeaders),
        content: {
          size: request.size,
          mimeType: request.responseHeaders['content-type'] || 'text/plain',
          text: typeof request.responseBody === 'string' 
            ? request.responseBody 
            : JSON.stringify(request.responseBody)
        }
      },
      cache: {},
      timings: {
        send: 0,
        wait: request.duration,
        receive: 0
      }
    };
  }

  private static convertHeadersToHAR(headers: Record<string, string>): any[] {
    return Object.entries(headers).map(([name, value]) => ({ name, value }));
  }

  // Trigger browser download
  private static download(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    // Cleanup
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
}

