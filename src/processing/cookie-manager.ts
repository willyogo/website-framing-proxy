import { Logger } from '../utils/logger';

export interface CookieMapping {
  originalDomain: string;
  proxyDomain: string;
  cookies: Map<string, string>;
}

export class CookieManager {
  private logger: Logger;
  private cookieMappings: Map<string, CookieMapping> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Process cookies from the original response and map them to proxy domain
   */
  processResponseCookies(
    originalCookies: string[], 
    originalDomain: string, 
    proxyDomain: string
  ): string[] {
    const mappedCookies: string[] = [];
    
    // Get or create cookie mapping for this domain
    let mapping = this.cookieMappings.get(originalDomain);
    if (!mapping) {
      mapping = {
        originalDomain,
        proxyDomain,
        cookies: new Map()
      };
      this.cookieMappings.set(originalDomain, mapping);
    }

    originalCookies.forEach(cookie => {
      try {
        const parsedCookie = this.parseCookie(cookie);
        if (parsedCookie) {
          // Store only the name=value for request mapping
          mapping!.cookies.set(parsedCookie.name, `${parsedCookie.name}=${parsedCookie.value}`);
          
          // Create a mapped cookie for the proxy domain
          const mappedCookie = this.createMappedCookie(parsedCookie, proxyDomain);
          mappedCookies.push(mappedCookie);
        }
      } catch (error) {
        this.logger.debug('Error processing cookie:', { cookie, error: (error as Error).message });
      }
    });

    return mappedCookies;
  }

  /**
   * Process cookies from the incoming request and map them back to original domain
   */
  processRequestCookies(
    requestCookies: string, 
    originalDomain: string
  ): string {
    const mapping = this.cookieMappings.get(originalDomain);
    if (!mapping) {
      return requestCookies;
    }

    const originalCookies: string[] = [];
    const cookiePairs = (requestCookies || '').split(';').map(c => c.trim()).filter(Boolean);

    cookiePairs.forEach(cookiePair => {
      const [name] = cookiePair.split('=');
      if (name && mapping.cookies.has(name)) {
        originalCookies.push(mapping.cookies.get(name)!);
      }
    });

    return originalCookies.join('; ');
  }

  /**
   * Parse a cookie string into its components
   */
  private parseCookie(cookie: string): { name: string; value: string; [key: string]: string } | null {
    const parts = cookie.split(';').map(part => part.trim());
    const [nameValue] = parts;
    
    if (!nameValue || !nameValue.includes('=')) {
      return null;
    }

    const [name, value] = nameValue.split('=');
    if (!name || !value) {
      return null;
    }
    
    const parsed: { name: string; value: string; [key: string]: string } = {
      name: name.trim(),
      value: value.trim()
    };

    // Parse additional attributes
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part && part.includes('=')) {
        const [key, val] = part.split('=');
        if (key && val) {
          parsed[key.trim().toLowerCase()] = val.trim();
        }
      } else if (part) {
        parsed[part.toLowerCase()] = 'true';
      }
    }

    return parsed;
  }

  /**
   * Create a mapped cookie for the proxy domain
   */
  private createMappedCookie(
    originalCookie: { name: string; value: string; [key: string]: string }, 
    proxyDomain: string
  ): string {
    const parts: string[] = [];
    
    // Name and value
    parts.push(`${originalCookie.name}=${originalCookie.value}`);
    
    // Domain - map to proxy domain
    parts.push(`Domain=${proxyDomain}`);
    
    // Path - preserve original path or default to /
    const path = originalCookie['path'] || '/';
    parts.push(`Path=${path}`);
    
    // Expires - preserve original expiration
    if (originalCookie['expires']) {
      parts.push(`Expires=${originalCookie['expires']}`);
    }
    
    // Max-Age - preserve original max-age
    if (originalCookie['max-age']) {
      parts.push(`Max-Age=${originalCookie['max-age']}`);
    }
    
    // Secure - preserve original secure flag
    if (originalCookie['secure'] === 'true') {
      parts.push('Secure');
    }
    
    // HttpOnly - preserve original httpOnly flag
    if (originalCookie['httponly'] === 'true') {
      parts.push('HttpOnly');
    }
    
    // SameSite - preserve original sameSite policy
    if (originalCookie['samesite']) {
      parts.push(`SameSite=${originalCookie['samesite']}`);
    }

    return parts.join('; ');
  }

  /**
   * Get all cookies for a specific domain
   */
  getCookiesForDomain(originalDomain: string): Map<string, string> {
    const mapping = this.cookieMappings.get(originalDomain);
    return mapping ? mapping.cookies : new Map();
  }

  /**
   * Clear cookies for a specific domain
   */
  clearCookiesForDomain(originalDomain: string): void {
    this.cookieMappings.delete(originalDomain);
  }

  /**
   * Clear all cookie mappings
   */
  clearAllCookies(): void {
    this.cookieMappings.clear();
  }

  /**
   * Get cookie mapping statistics
   */
  getStats(): { totalMappings: number; totalCookies: number } {
    let totalCookies = 0;
    this.cookieMappings.forEach(mapping => {
      totalCookies += mapping.cookies.size;
    });
    
    return {
      totalMappings: this.cookieMappings.size,
      totalCookies
    };
  }
}
