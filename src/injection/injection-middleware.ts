/**
 * Injection Middleware for Client-Side Processing
 * Injects JavaScript into HTML responses for client-side URL rewriting
 */

import { Request, Response, NextFunction } from 'express';

// Marker used to detect prior injection and avoid duplicates
export const CLIENT_PROCESSOR_MARKER = '<!-- Website Framing Proxy - Client-Side Processor -->';

/**
 * Returns the client-side processor script HTML string.
 * Exported so server-side injection can reuse the exact same payload.
 */
export function getClientProcessorScript(): string {
  const script = `
(function() {
  'use strict';

  // Configuration: derive from /proxy/{host}/
  const PROXY_BASE_URL = window.location.origin;
  const parts = window.location.pathname.split('/');
  const TARGET_HOST = (parts.length > 2 && parts[1] === 'proxy') ? decodeURIComponent(parts[2]) : '';
  const PROXY_PREFIX = PROXY_BASE_URL + '/proxy/' + TARGET_HOST;

  // Debug
  try { console.log('Client processor initialized:', { proxyBaseUrl: PROXY_BASE_URL, targetHost: TARGET_HOST, currentHostname: window.location.hostname, currentPath: window.location.pathname }); } catch(_) {}

  // URL rewriting utilities
  const URLRewriter = {
    shouldRewrite: function(url) {
      if (!url || typeof url !== 'string') return false;
      if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('javascript:') || url.startsWith('mailto:') || url.startsWith('tel:')) return false;
      if (url.includes('/proxy/')) return false;
      return true;
    },
    rewriteUrl: function(url) {
      if (!this.shouldRewrite(url)) return url;
      try {
        // Relative URLs
        if (url.startsWith('/') && !url.startsWith('//')) {
          return PROXY_PREFIX + url;
        }
        // Protocol-relative
        if (url.startsWith('//')) {
          const u = new URL('https:' + url);
          return PROXY_BASE_URL + '/proxy/' + u.hostname + u.pathname + u.search + u.hash;
        }
        // Absolute
        const u2 = new URL(url, window.location.href);
        if (u2.pathname.startsWith('/proxy/')) return url;
        if (u2.hostname === TARGET_HOST || u2.hostname === ('www.' + TARGET_HOST) || u2.hostname === window.location.hostname) {
          return PROXY_PREFIX + u2.pathname + u2.search + u2.hash;
        }
        if (u2.hostname === window.location.hostname && !u2.pathname.startsWith('/proxy/')) {
          return PROXY_PREFIX + u2.pathname + u2.search + u2.hash;
        }
        return url;
      } catch (e) {
        try { console.warn('Failed to rewrite URL:', url, e); } catch(_) {}
        return url;
      }
    }
  };

  function processElements() {
    const urlAttributes = ['src', 'href', 'action', 'data-src', 'data-href'];
    const selectors = ['img', 'script', 'link', 'a', 'form', 'iframe', 'video', 'audio', 'source', 'track', 'embed', 'object', 'param'];
    selectors.forEach(function(selector) {
      document.querySelectorAll(selector).forEach(function(element) {
        urlAttributes.forEach(function(attr) {
          if (element.hasAttribute && element.hasAttribute(attr)) {
            const originalUrl = element.getAttribute(attr);
            const rewrittenUrl = URLRewriter.rewriteUrl(originalUrl);
            if (rewrittenUrl !== originalUrl) {
              element.setAttribute(attr, rewrittenUrl);
            }
          }
        });
        // srcset handling for responsive images
        if (element.hasAttribute && element.hasAttribute('srcset')) {
          const srcset = element.getAttribute('srcset');
          if (srcset) {
            const rewritten = srcset.split(',').map(function(part) {
              const seg = part.trim();
              if (!seg) return seg;
              const bits = seg.split(/\s+/);
              const u = bits[0];
              const d = bits.slice(1).join(' ');
              const ru = URLRewriter.rewriteUrl(u);
              return d ? (ru + ' ' + d) : ru;
            }).join(', ');
            if (rewritten !== srcset) {
              element.setAttribute('srcset', rewritten);
            }
          }
        }
      });
    });
    processCSS();
  }

  function processCSS() {
    document.querySelectorAll('link[rel="stylesheet"]').forEach(function(link){
      const href = link.getAttribute('href');
      if (href) {
        const rewrittenHref = URLRewriter.rewriteUrl(href);
        if (rewrittenHref !== href) {
          link.setAttribute('href', rewrittenHref);
        }
      }
    });
    document.querySelectorAll('*[style]').forEach(function(element){
      const style = element.getAttribute('style');
      if (style) {
        const rewrittenStyle = rewriteCSSUrls(style);
        if (rewrittenStyle !== style) {
          element.setAttribute('style', rewrittenStyle);
        }
      }
    });
    document.querySelectorAll('style').forEach(function(styleElement){
      if (styleElement.textContent) {
        const rewrittenCSS = rewriteCSSUrls(styleElement.textContent);
        if (rewrittenCSS !== styleElement.textContent) {
          styleElement.textContent = rewrittenCSS;
        }
      }
    });
  }

  function rewriteCSSUrls(cssContent) {
    return cssContent.replace(/url\(['"]?([^'\")]+)['"]?\)/g, function(_match, url) {
      const rewrittenUrl = URLRewriter.rewriteUrl(url);
      return "url('" + rewrittenUrl + "')";
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', processElements);
  } else {
    processElements();
  }

  (function interceptAPIs(){
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
      try {
        if (typeof input === 'string') {
          const rewrittenUrl = URLRewriter.rewriteUrl(input);
          return originalFetch.call(this, rewrittenUrl, init);
        } else if (input instanceof Request) {
          const rewrittenUrl = URLRewriter.rewriteUrl(input.url);
          const newRequest = new Request(rewrittenUrl, input);
          return originalFetch.call(this, newRequest, init);
        }
      } catch (_e) {}
      return originalFetch.call(this, input, init);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      try {
        const rewrittenUrl = URLRewriter.rewriteUrl(url);
        // @ts-ignore
        return originalOpen.apply(this, [method, rewrittenUrl].concat([].slice.call(arguments, 2)));
      } catch (_e) {
        // @ts-ignore
        return originalOpen.apply(this, arguments);
      }
    };
  })();

  const observer = new MutationObserver(function(mutations){
    mutations.forEach(function(mutation){
      if (mutation.type === 'childList' && mutation.addedNodes && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(function(node){
          if (node && node.nodeType === 1) {
            processElements();
          }
        });
      }
    });
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
`;
  return "\n" + CLIENT_PROCESSOR_MARKER + "\n<script>\n" + script + "\n</script>\n";
}

export class InjectionMiddleware {
  constructor() {}

  /**
   * Middleware to inject client-side processor into HTML responses
   */
  public injectClientProcessor() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Only process HTML responses under /proxy/
      if (req.path.startsWith('/proxy/')) {
        const originalSend = res.send;
        (res as any).send = function(data: any) {
          if (typeof data === 'string' && data.trim().startsWith('<')) {
            const injectionScript = getClientProcessorScript();
            if (!data.includes(CLIENT_PROCESSOR_MARKER)) {
              if (data.includes('</body>')) {
                data = data.replace('</body>', injectionScript + '</body>');
              } else if (data.includes('</head>')) {
                data = data.replace('</head>', injectionScript + '</head>');
              } else {
                data = data + injectionScript;
              }
            }
          }
          return (originalSend as any).call(this, data);
        };
      }
      next();
    };
  }
}

