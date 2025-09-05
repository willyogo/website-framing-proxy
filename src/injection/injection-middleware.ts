/**
 * Injection Middleware for Client-Side Processing
 * Injects JavaScript into HTML responses for client-side URL rewriting
 */

import { Request, Response, NextFunction } from 'express';

export class InjectionMiddleware {
  constructor() {
    // Simple injection middleware
  }

  /**
   * Middleware to inject client-side processor into HTML responses
   */
  public injectClientProcessor() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Only process HTML responses
      if (req.path.startsWith('/proxy/')) {
        const originalSend = res.send;
        
        res.send = function(data: any) {
          // Check if this is HTML content
          if (typeof data === 'string' && data.trim().startsWith('<')) {
            // Inject client-side processor
            const injectionScript = `
<!-- Website Framing Proxy - Client-Side Processor -->
<script>
(function() {
    'use strict';
    
    // Configuration
    const PROXY_BASE_URL = window.location.origin;
    const TARGET_HOST = window.location.hostname.replace(/^[^.]+\./, '');
    
    // URL rewriting utilities
    const URLRewriter = {
        shouldRewrite: function(url) {
            if (!url || typeof url !== 'string') return false;
            if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('javascript:') || url.includes('/proxy/')) {
                return false;
            }
            return true;
        },
        
        rewriteUrl: function(url) {
            if (!this.shouldRewrite(url)) return url;
            try {
                const urlObj = new URL(url, window.location.href);
                if (urlObj.pathname.startsWith('/proxy/')) return url;
                return \`\${PROXY_BASE_URL}/proxy/\${urlObj.hostname}\${urlObj.pathname}\${urlObj.search}\${urlObj.hash}\`;
            } catch (e) {
                return url;
            }
        }
    };
    
    // Process DOM elements
    function processElements() {
        const urlAttributes = ['src', 'href', 'action', 'data-src', 'data-href'];
        const selectors = ['img', 'script', 'link', 'a', 'form', 'iframe', 'video', 'audio', 'source', 'track', 'embed', 'object', 'param'];
        
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(element => {
                urlAttributes.forEach(attr => {
                    if (element.hasAttribute(attr)) {
                        const originalUrl = element.getAttribute(attr);
                        const rewrittenUrl = URLRewriter.rewriteUrl(originalUrl);
                        if (rewrittenUrl !== originalUrl) {
                            element.setAttribute(attr, rewrittenUrl);
                        }
                    }
                });
            });
        });
        
        // Process CSS for URL rewriting
        processCSS();
    }
    
    // Process CSS for URL rewriting
    function processCSS() {
        // Process external stylesheets
        document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
            const href = link.getAttribute('href');
            if (href) {
                const rewrittenHref = URLRewriter.rewriteUrl(href);
                if (rewrittenHref !== href) {
                    link.setAttribute('href', rewrittenHref);
                }
            }
        });
        
        // Process inline styles and style elements
        document.querySelectorAll('*[style]').forEach(element => {
            const style = element.getAttribute('style');
            if (style) {
                const rewrittenStyle = rewriteCSSUrls(style);
                if (rewrittenStyle !== style) {
                    element.setAttribute('style', rewrittenStyle);
                }
            }
        });
        
        // Process <style> elements
        document.querySelectorAll('style').forEach(styleElement => {
            if (styleElement.textContent) {
                const rewrittenCSS = rewriteCSSUrls(styleElement.textContent);
                if (rewrittenCSS !== styleElement.textContent) {
                    styleElement.textContent = rewrittenCSS;
                }
            }
        });
    }
    
    // Rewrite URLs in CSS content
    function rewriteCSSUrls(cssContent) {
        // Match url() functions in CSS
        return cssContent.replace(/url\\(['"]?([^'")]+)['"]?\\)/g, (match, url) => {
            const rewrittenUrl = URLRewriter.rewriteUrl(url);
            return \`url('\${rewrittenUrl}')\`;
        });
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', processElements);
    } else {
        processElements();
    }
    
    // Intercept AJAX and Fetch API calls
    function interceptAPIs() {
        // Intercept XMLHttpRequest
        const originalXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...args) {
            this._originalUrl = url;
            const rewrittenUrl = URLRewriter.rewriteUrl(url);
            return originalXHROpen.call(this, method, rewrittenUrl, ...args);
        };
        
        // Intercept fetch API
        const originalFetch = window.fetch;
        window.fetch = function(input, init) {
            if (typeof input === 'string') {
                const rewrittenUrl = URLRewriter.rewriteUrl(input);
                return originalFetch.call(this, rewrittenUrl, init);
            } else if (input instanceof Request) {
                const rewrittenUrl = URLRewriter.rewriteUrl(input.url);
                const newRequest = new Request(rewrittenUrl, input);
                return originalFetch.call(this, newRequest, init);
            }
            return originalFetch.call(this, input, init);
        };
        
        // Intercept dynamic imports (if supported)
        if (window.import) {
            const originalImport = window.import;
            window.import = function(specifier) {
                const rewrittenSpecifier = URLRewriter.rewriteUrl(specifier);
                return originalImport.call(this, rewrittenSpecifier);
            };
        }
    }
    
    // Initialize API interception
    interceptAPIs();
    
    // Observe DOM changes for dynamic content
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Re-run processing for newly added elements
                        processElements();
                    }
                });
            }
        });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
})();
</script>
`;

            // Inject before closing </body> tag
            if (data.includes('</body>')) {
              data = data.replace('</body>', `${injectionScript}</body>`);
            } else if (data.includes('</head>')) {
              data = data.replace('</head>', `${injectionScript}</head>`);
            } else {
              data = data + injectionScript;
            }
          }
          
          return originalSend.call(this, data);
        };
      }
      
      next();
    };
  }
}
