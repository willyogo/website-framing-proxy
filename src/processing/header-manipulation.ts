import { IncomingMessage, ServerResponse } from 'http';
import { Request } from 'express';

export class HeaderManipulator {
  /**
   * Manipulate request headers before forwarding to target
   */
  public manipulateRequestHeaders(proxyReq: any, req: Request): void {
    // Remove headers that could interfere with proxying
    proxyReq.removeHeader('x-forwarded-for');
    proxyReq.removeHeader('x-forwarded-proto');
    proxyReq.removeHeader('x-forwarded-host');
    
    // Set proper host header
    if (req.headers.host) {
      proxyReq.setHeader('host', req.headers.host);
    }

    // Add headers to identify this as a proxy request
    proxyReq.setHeader('x-proxy-request', 'true');
    proxyReq.setHeader('x-original-url', req.originalUrl || req.url);
  }

  /**
   * Manipulate response headers to enable framing
   */
  public manipulateResponseHeaders(
    proxyRes: IncomingMessage,
    req: Request,
    res: ServerResponse
  ): void {
    // Remove anti-framing headers
    this.removeAntiFramingHeaders(proxyRes, res);
    
    // Override CSP frame-ancestors
    this.overrideCSPFrameAncestors(proxyRes, res);
    
    // Add CORS headers for iframe embedding
    this.addCORSHeaders(res);
    
    // Handle cookie domain mapping
    this.mapCookieDomains(proxyRes, res, req);
  }

  /**
   * Remove headers that prevent iframe embedding
   */
  private removeAntiFramingHeaders(proxyRes: IncomingMessage, res: ServerResponse): void {
    // Remove X-Frame-Options header
    if (proxyRes.headers['x-frame-options']) {
      delete proxyRes.headers['x-frame-options'];
    }

    // Remove X-Frame-Options from response
    res.removeHeader('X-Frame-Options');
  }

  /**
   * Override Content-Security-Policy frame-ancestors directive
   */
  private overrideCSPFrameAncestors(proxyRes: IncomingMessage, res: ServerResponse): void {
    const cspHeader = proxyRes.headers['content-security-policy'];
    
    if (cspHeader) {
      // Parse existing CSP and remove/modify frame-ancestors
      const cspDirectives = this.parseCSPDirectives(cspHeader as string);
      
      // Remove or modify frame-ancestors directive
      delete cspDirectives['frame-ancestors'];
      
      // Rebuild CSP header
      const newCSP = this.buildCSPDirectives(cspDirectives);
      res.setHeader('Content-Security-Policy', newCSP);
    }
  }

  /**
   * Add CORS headers to allow iframe embedding
   */
  private addCORSHeaders(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  /**
   * Map cookies from original domain to proxy domain
   */
  private mapCookieDomains(proxyRes: IncomingMessage, res: ServerResponse, req: Request): void {
    const setCookieHeaders = proxyRes.headers['set-cookie'];
    
    if (setCookieHeaders) {
      const mappedCookies = setCookieHeaders.map(cookie => {
        return this.mapCookieDomain(cookie, req);
      });
      
      res.setHeader('Set-Cookie', mappedCookies);
    }
  }

  /**
   * Map individual cookie domain
   */
  private mapCookieDomain(cookie: string, req: Request): string {
    // Extract cookie parts
    const parts = cookie.split(';').map(part => part.trim());
    const cookieNameValue = parts[0];
    const attributes = parts.slice(1);
    
    // Map domain attribute
    const mappedAttributes = attributes.map(attr => {
      if (attr.toLowerCase().startsWith('domain=')) {
        // Set domain to current proxy domain
        return `Domain=${req.get('host')}`;
      }
      return attr;
    });
    
    return [cookieNameValue, ...mappedAttributes].join('; ');
  }

  /**
   * Parse CSP directives from header value
   */
  private parseCSPDirectives(cspHeader: string): Record<string, string[]> {
    const directives: Record<string, string[]> = {};
    
    cspHeader.split(';').forEach(directive => {
      const trimmed = directive.trim();
      if (trimmed) {
        const [name, ...values] = trimmed.split(/\s+/);
        if (name && values.length > 0) {
          directives[name.toLowerCase()] = values;
        }
      }
    });
    
    return directives;
  }

  /**
   * Build CSP header from directives object
   */
  private buildCSPDirectives(directives: Record<string, string[]>): string {
    return Object.entries(directives)
      .map(([name, values]) => `${name} ${values.join(' ')}`)
      .join('; ');
  }
}
