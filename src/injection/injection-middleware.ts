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
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', processElements);
    } else {
        processElements();
    }
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
