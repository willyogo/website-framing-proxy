import * as cheerio from 'cheerio';
import { Logger } from '../utils/logger';

export interface RewriteContext {
  originalUrl: string;
  proxyBaseUrl: string;
  targetHost: string;
  targetProtocol: string;
}

export class ContentProcessor {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Process HTML content and rewrite URLs to go through the proxy
   */
  async processHtmlContent(html: string, context: RewriteContext): Promise<string> {
    try {
      const $ = cheerio.load(html);
      
      // Rewrite various types of URLs
      this.rewriteResourceUrls($, context);
      this.rewriteInlineStyles($, context);
      this.rewriteInlineScripts($, context);
      this.injectBaseTag($, context);
      this.injectProxyScript($, context);
      
      return $.html();
    } catch (error) {
      this.logger.error('Error processing HTML content:', error as Record<string, any>);
      return html; // Return original HTML if processing fails
    }
  }

  /**
   * Rewrite URLs in HTML attributes (src, href, action, etc.)
   */
  private rewriteResourceUrls($: cheerio.CheerioAPI, context: RewriteContext): void {
    const attributesToRewrite = [
      'src', 'href', 'action', 'data-src', 'data-href', 'poster', 'background'
    ];

    attributesToRewrite.forEach(attr => {
      $(`[${attr}]`).each((_, element) => {
        const originalUrl = $(element).attr(attr);
        if (originalUrl) {
          const rewrittenUrl = this.rewriteUrl(originalUrl, context);
          $(element).attr(attr, rewrittenUrl);
        }
      });
    });

    // Special handling for CSS background-image in style attributes
    $('[style*="background-image"]').each((_, element) => {
      const style = $(element).attr('style');
      if (style) {
        const rewrittenStyle = this.rewriteCssUrls(style, context);
        $(element).attr('style', rewrittenStyle);
      }
    });
  }

  /**
   * Rewrite URLs in inline CSS styles
   */
  private rewriteInlineStyles($: cheerio.CheerioAPI, context: RewriteContext): void {
    $('style').each((_, element) => {
      const css = $(element).html();
      if (css) {
        const rewrittenCss = this.rewriteCssUrls(css, context);
        $(element).html(rewrittenCss);
      }
    });
  }

  /**
   * Rewrite URLs in inline JavaScript
   */
  private rewriteInlineScripts($: cheerio.CheerioAPI, context: RewriteContext): void {
    $('script').each((_, element) => {
      const script = $(element).html();
      if (script && !$(element).attr('src')) {
        // Only process inline scripts, not external ones
        const rewrittenScript = this.rewriteJavaScriptUrls(script, context);
        $(element).html(rewrittenScript);
      }
    });
  }

  /**
   * Inject base tag to ensure relative URLs resolve correctly
   */
  private injectBaseTag($: cheerio.CheerioAPI, context: RewriteContext): void {
    // Remove existing base tags
    $('base').remove();
    
    // Add new base tag
    const baseUrl = `${context.proxyBaseUrl}/proxy/${context.targetHost}`;
    $('head').prepend(`<base href="${baseUrl}/">`);
  }

  /**
   * Inject JavaScript to intercept XHR and fetch requests
   */
  private injectProxyScript($: cheerio.CheerioAPI, context: RewriteContext): void {
    const proxyScript = this.generateProxyScript(context);
    $('head').append(`<script>${proxyScript}</script>`);
  }

  /**
   * Rewrite a single URL
   */
  private rewriteUrl(url: string, context: RewriteContext): string {
    try {
      // Handle absolute URLs
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const urlObj = new URL(url);
        return `${context.proxyBaseUrl}/proxy/${urlObj.host}${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
      }
      
      // Handle protocol-relative URLs
      if (url.startsWith('//')) {
        const urlObj = new URL(`https:${url}`);
        return `${context.proxyBaseUrl}/proxy/${urlObj.host}${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
      }
      
      // Handle relative URLs - they should work with the base tag
      return url;
    } catch (error) {
      this.logger.debug('Error rewriting URL:', { url, error: (error as Error).message });
      return url; // Return original URL if rewriting fails
    }
  }

  /**
   * Rewrite URLs in CSS content
   */
  private rewriteCssUrls(css: string, context: RewriteContext): string {
    // Match url() declarations in CSS
    return css.replace(/url\(['"]?([^'")]+)['"]?\)/g, (_, url) => {
      const rewrittenUrl = this.rewriteUrl(url, context);
      return `url('${rewrittenUrl}')`;
    });
  }

  /**
   * Rewrite URLs in JavaScript content
   */
  private rewriteJavaScriptUrls(script: string, _context: RewriteContext): string {
    // This is a basic implementation - more sophisticated URL detection could be added
    // For now, we'll rely on the injected proxy script to handle most cases
    return script;
  }

  /**
   * Generate JavaScript code to intercept and proxy XHR/fetch requests
   */
  private generateProxyScript(context: RewriteContext): string {
    return `
      (function() {
        const proxyBaseUrl = '${context.proxyBaseUrl}';
        const targetHost = '${context.targetHost}';
        
        // Intercept XMLHttpRequest
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;
        
        XMLHttpRequest.prototype.open = function(method, url, ...args) {
          this._originalUrl = url;
          const proxiedUrl = rewriteUrl(url);
          return originalXHROpen.call(this, method, proxiedUrl, ...args);
        };
        
        XMLHttpRequest.prototype.send = function(data) {
          // Add original referer header
          this.setRequestHeader('X-Original-Referer', window.location.href);
          return originalXHRSend.call(this, data);
        };
        
        // Intercept fetch
        const originalFetch = window.fetch;
        window.fetch = function(input, init) {
          const url = typeof input === 'string' ? input : input.url;
          const proxiedUrl = rewriteUrl(url);
          
          // Add original referer header
          if (!init) init = {};
          if (!init.headers) init.headers = {};
          init.headers['X-Original-Referer'] = window.location.href;
          
          return originalFetch(proxiedUrl, init);
        };
        
        // URL rewriting function
        function rewriteUrl(url) {
          try {
            // Handle absolute URLs
            if (url.startsWith('http://') || url.startsWith('https://')) {
              const urlObj = new URL(url);
              return proxyBaseUrl + '/proxy/' + urlObj.host + urlObj.pathname + urlObj.search + urlObj.hash;
            }
            
            // Handle protocol-relative URLs
            if (url.startsWith('//')) {
              const urlObj = new URL('https:' + url);
              return proxyBaseUrl + '/proxy/' + urlObj.host + urlObj.pathname + urlObj.search + urlObj.hash;
            }
            
            // Handle relative URLs
            if (url.startsWith('/')) {
              return proxyBaseUrl + '/proxy/' + targetHost + url;
            }
            
            // Handle relative URLs without leading slash
            return proxyBaseUrl + '/proxy/' + targetHost + '/' + url;
          } catch (error) {
            console.warn('Error rewriting URL:', url, error);
            return url;
          }
        }
        
        // Intercept WebSocket connections
        const originalWebSocket = window.WebSocket;
        window.WebSocket = function(url, protocols) {
          const proxiedUrl = rewriteUrl(url);
          return new originalWebSocket(proxiedUrl, protocols);
        };
        
        console.log('Proxy script loaded for', targetHost);
      })();
    `;
  }
}