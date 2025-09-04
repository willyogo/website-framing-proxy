import { Logger } from '../utils/logger';
import { UrlRewriter, RewriteContext } from './url-rewriter';

export interface ProcessingOptions {
  rewriteUrls: boolean;
  injectScripts: boolean;
  preserveCookies: boolean;
}

export class ContentProcessor {
  private logger: Logger;
  private urlRewriter: UrlRewriter;

  constructor(logger: Logger) {
    this.logger = logger;
    this.urlRewriter = new UrlRewriter(logger);
  }

  /**
   * Process response content based on content type
   */
  async processContent(
    content: string,
    contentType: string,
    context: RewriteContext,
    options: ProcessingOptions = {
      rewriteUrls: true,
      injectScripts: true,
      preserveCookies: true
    }
  ): Promise<string> {
    this.logger.debug('Processing content', { 
      contentType,
      contentLength: content.length,
      options 
    });

    try {
      // Determine content type
      const mimeType = this.extractMimeType(contentType);
      
      switch (mimeType) {
        case 'text/html':
          return this.processHtmlContent(content, context, options);
        
        case 'text/css':
          return this.processCssContent(content, context, options);
        
        case 'application/javascript':
        case 'text/javascript':
          return this.processJavaScriptContent(content, context, options);
        
        case 'application/json':
          return this.processJsonContent(content, context, options);
        
        default:
          this.logger.debug('Content type not processed', { mimeType });
          return content;
      }
    } catch (error) {
      this.logger.error('Error processing content', { error, contentType });
      return content; // Return original content if processing fails
    }
  }

  private processHtmlContent(
    html: string, 
    context: RewriteContext, 
    options: ProcessingOptions
  ): string {
    this.logger.debug('Processing HTML content');

    let processedHtml = html;

    // 1. Rewrite URLs in HTML
    if (options.rewriteUrls) {
      processedHtml = this.urlRewriter.rewriteHtmlContent(processedHtml, context);
    }

    // 2. Inject proxy scripts for AJAX interception
    if (options.injectScripts) {
      processedHtml = this.injectProxyScripts(processedHtml, context);
    }

    // 3. Add base tag if not present
    processedHtml = this.ensureBaseTag(processedHtml, context);

    return processedHtml;
  }

  private processCssContent(
    css: string, 
    context: RewriteContext, 
    options: ProcessingOptions
  ): string {
    this.logger.debug('Processing CSS content');

    if (!options.rewriteUrls) {
      return css;
    }

    // Rewrite URLs in CSS
    return css.replace(
      /url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi,
      (match, url) => {
        const rewrittenUrl = this.urlRewriter.rewriteUrl(url, context);
        return match.replace(url, rewrittenUrl);
      }
    );
  }

  private processJavaScriptContent(
    js: string, 
    context: RewriteContext, 
    options: ProcessingOptions
  ): string {
    this.logger.debug('Processing JavaScript content');

    if (!options.rewriteUrls) {
      return js;
    }

    // Basic URL rewriting in JavaScript - this could be more sophisticated
    let processedJs = js;

    // Rewrite fetch() calls
    processedJs = processedJs.replace(
      /fetch\s*\(\s*["']([^"']+)["']/gi,
      (match, url) => {
        const rewrittenUrl = this.urlRewriter.rewriteUrl(url, context);
        return match.replace(url, rewrittenUrl);
      }
    );

    // Rewrite XMLHttpRequest URLs
    processedJs = processedJs.replace(
      /\.open\s*\(\s*["']([^"']+)["']/gi,
      (match, url) => {
        const rewrittenUrl = this.urlRewriter.rewriteUrl(url, context);
        return match.replace(url, rewrittenUrl);
      }
    );

    return processedJs;
  }

  private processJsonContent(
    json: string, 
    context: RewriteContext, 
    options: ProcessingOptions
  ): string {
    this.logger.debug('Processing JSON content');

    if (!options.rewriteUrls) {
      return json;
    }

    try {
      const data = JSON.parse(json);
      const processedData = this.rewriteUrlsInObject(data, context);
      return JSON.stringify(processedData);
    } catch (error) {
      this.logger.warn('Error processing JSON content', { error });
      return json;
    }
  }

  private rewriteUrlsInObject(obj: any, context: RewriteContext): any {
    if (typeof obj === 'string') {
      // Check if this looks like a URL
      if (this.looksLikeUrl(obj)) {
        return this.urlRewriter.rewriteUrl(obj, context);
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.rewriteUrlsInObject(item, context));
    }

    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.rewriteUrlsInObject(value, context);
      }
      return result;
    }

    return obj;
  }

  private looksLikeUrl(str: string): boolean {
    return str.startsWith('http://') || 
           str.startsWith('https://') || 
           str.startsWith('//') || 
           str.startsWith('/');
  }

  private injectProxyScripts(html: string, context: RewriteContext): string {
    const proxyScript = `
    <script>
      // Proxy script for AJAX interception
      (function() {
        const originalFetch = window.fetch;
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const proxyBase = '${context.proxyBaseUrl}';
        const targetDomain = '${context.targetDomain}';
        
        // Intercept fetch requests
        window.fetch = function(url, options) {
          if (typeof url === 'string' && !url.startsWith(proxyBase)) {
            const rewrittenUrl = rewriteUrlForProxy(url);
            console.log('Proxy: Rewriting fetch URL', url, '->', rewrittenUrl);
            return originalFetch.call(this, rewrittenUrl, options);
          }
          return originalFetch.call(this, url, options);
        };
        
        // Intercept XMLHttpRequest
        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
          if (typeof url === 'string' && !url.startsWith(proxyBase)) {
            const rewrittenUrl = rewriteUrlForProxy(url);
            console.log('Proxy: Rewriting XHR URL', url, '->', rewrittenUrl);
            return originalXHROpen.call(this, method, rewrittenUrl, async, user, password);
          }
          return originalXHROpen.call(this, method, url, async, user, password);
        };
        
        function rewriteUrlForProxy(url) {
          if (url.startsWith('http://') || url.startsWith('https://')) {
            const urlObj = new URL(url);
            const path = urlObj.pathname + urlObj.search + urlObj.hash;
            return proxyBase + '/proxy/' + urlObj.hostname + path;
          } else if (url.startsWith('/')) {
            return proxyBase + '/proxy/' + targetDomain + url;
          } else if (url.startsWith('//')) {
            const domain = url.substring(2).split('/')[0];
            const path = url.substring(2 + domain.length);
            return proxyBase + '/proxy/' + domain + path;
          }
          return url;
        }
      })();
    </script>`;

    // Inject before closing </head> tag, or at the beginning of <body>
    if (html.includes('</head>')) {
      return html.replace('</head>', proxyScript + '</head>');
    } else if (html.includes('<body')) {
      return html.replace('<body', proxyScript + '<body');
    } else {
      return proxyScript + html;
    }
  }

  private ensureBaseTag(html: string, context: RewriteContext): string {
    // Check if base tag already exists
    if (html.includes('<base')) {
      return html;
    }

    const baseTag = `<base href="${context.proxyBaseUrl}/proxy/${context.targetDomain}/">`;
    
    // Add base tag in head section
    if (html.includes('<head>')) {
      return html.replace('<head>', '<head>' + baseTag);
    } else if (html.includes('<html>')) {
      return html.replace('<html>', '<html><head>' + baseTag + '</head>');
    } else {
      return baseTag + html;
    }
  }

  private extractMimeType(contentType: string): string {
    if (!contentType) return 'text/plain';
    
    const mimeType = contentType.split(';')[0]?.trim().toLowerCase();
    return mimeType || 'text/plain';
  }
}
