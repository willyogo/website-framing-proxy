import { Logger } from '../utils/logger';

export interface RewriteContext {
  originalUrl: string;
  proxyBaseUrl: string;
  targetHost: string;
  targetProtocol: string;
  targetPath: string;
}

export class UrlRewriter {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Rewrite a URL to go through the proxy
   */
  rewriteUrl(url: string, context: RewriteContext): string {
    try {
      // Handle absolute URLs
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return this.rewriteAbsoluteUrl(url, context);
      }
      
      // Handle protocol-relative URLs
      if (url.startsWith('//')) {
        return this.rewriteProtocolRelativeUrl(url, context);
      }
      
      // Handle absolute paths
      if (url.startsWith('/')) {
        return this.rewriteAbsolutePath(url, context);
      }
      
      // Handle relative paths
      return this.rewriteRelativePath(url, context);
    } catch (error) {
      this.logger.debug('Error rewriting URL:', { url, error: (error as Error).message });
      return url; // Return original URL if rewriting fails
    }
  }

  /**
   * Rewrite an absolute URL (http://example.com/path)
   */
  private rewriteAbsoluteUrl(url: string, context: RewriteContext): string {
    const urlObj = new URL(url);
    return `${context.proxyBaseUrl}/proxy/${urlObj.host}${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
  }

  /**
   * Rewrite a protocol-relative URL (//example.com/path)
   */
  private rewriteProtocolRelativeUrl(url: string, context: RewriteContext): string {
    const urlObj = new URL(`https:${url}`);
    return `${context.proxyBaseUrl}/proxy/${urlObj.host}${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
  }

  /**
   * Rewrite an absolute path (/path)
   */
  private rewriteAbsolutePath(url: string, context: RewriteContext): string {
    return `${context.proxyBaseUrl}/proxy/${context.targetHost}${url}`;
  }

  /**
   * Rewrite a relative path (path or ./path)
   */
  private rewriteRelativePath(url: string, context: RewriteContext): string {
    // Remove leading ./ if present
    const cleanUrl = url.startsWith('./') ? url.substring(2) : url;
    
    // Combine with the current path
    const currentPath = context.targetPath.endsWith('/') ? context.targetPath : context.targetPath + '/';
    const fullPath = currentPath + cleanUrl;
    
    return `${context.proxyBaseUrl}/proxy/${context.targetHost}${fullPath}`;
  }

  /**
   * Extract the original URL from a proxied URL
   */
  extractOriginalUrl(proxiedUrl: string, _proxyBaseUrl: string): string | null {
    try {
      const urlObj = new URL(proxiedUrl);
      
      // Check if this is a proxied URL
      if (!urlObj.pathname.startsWith('/proxy/')) {
        return null;
      }
      
      // Extract the target host and path
      const pathParts = urlObj.pathname.split('/');
      if (pathParts.length < 3) {
        return null;
      }
      
      const targetHost = pathParts[2];
      const targetPath = pathParts.slice(3).join('/');
      
      // Reconstruct the original URL
      const protocol = urlObj.searchParams.get('_protocol') || 'https';
      const originalPath = targetPath ? `/${targetPath}` : '/';
      
      return `${protocol}://${targetHost}${originalPath}${urlObj.search}${urlObj.hash}`;
    } catch (error) {
      this.logger.debug('Error extracting original URL:', { proxiedUrl, error: (error as Error).message });
      return null;
    }
  }

  /**
   * Check if a URL is a proxied URL
   */
  isProxiedUrl(url: string, proxyBaseUrl: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.origin === proxyBaseUrl && urlObj.pathname.startsWith('/proxy/');
    } catch {
      return false;
    }
  }

  /**
   * Get the target host from a proxied URL
   */
  getTargetHostFromProxiedUrl(proxiedUrl: string): string | null {
    try {
      const urlObj = new URL(proxiedUrl);
      const pathParts = urlObj.pathname.split('/');
      return pathParts.length >= 3 ? (pathParts[2] || null) : null;
    } catch {
      return null;
    }
  }

  /**
   * Rewrite URLs in CSS content
   */
  rewriteCssUrls(css: string, context: RewriteContext): string {
    // Match url() declarations in CSS
    return css.replace(/url\(['"]?([^'")]+)['"]?\)/g, (_, url) => {
      const rewrittenUrl = this.rewriteUrl(url, context);
      return `url('${rewrittenUrl}')`;
    });
  }

  /**
   * Rewrite URLs in JavaScript content
   */
  rewriteJavaScriptUrls(script: string, context: RewriteContext): string {
    // This is a basic implementation for common URL patterns in JavaScript
    // More sophisticated parsing could be added for complex cases
    
    // Rewrite string literals that look like URLs
    const urlPattern = /(['"`])(https?:\/\/[^'"`\s]+)\1/g;
    return script.replace(urlPattern, (_, quote, url) => {
      const rewrittenUrl = this.rewriteUrl(url, context);
      return `${quote}${rewrittenUrl}${quote}`;
    });
  }

  /**
   * Create a rewrite context from a request
   */
  createRewriteContext(
    originalUrl: string,
    proxyBaseUrl: string,
    targetHost: string,
    targetPath: string = '/'
  ): RewriteContext {
    const targetProtocol = originalUrl.startsWith('https://') ? 'https' : 'http';
    
    return {
      originalUrl,
      proxyBaseUrl,
      targetHost,
      targetProtocol,
      targetPath
    };
  }
}