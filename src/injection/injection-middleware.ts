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
  return `\n${CLIENT_PROCESSOR_MARKER}\n<script>\n(function() {\n    'use strict';\n    \n    // Configuration\n    const PROXY_BASE_URL = window.location.origin;\n    const TARGET_HOST = window.location.hostname.replace(/^[^.]+\\\./, '');\n    \n    // Debug logging\n    console.log('Client processor initialized:', {\n        proxyBaseUrl: PROXY_BASE_URL,\n        targetHost: TARGET_HOST,\n        currentHostname: window.location.hostname,\n        currentPath: window.location.pathname\n    });\n    \n    // URL rewriting utilities\n    const URLRewriter = {\n        shouldRewrite: function(url) {\n            if (!url || typeof url !== 'string') return false;\n            if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('javascript:') || url.startsWith('mailto:') || url.startsWith('tel:')) {\n                return false;\n            }\n            // Don't rewrite URLs that are already proxied\n            if (url.includes('/proxy/')) {\n                return false;\n            }\n            return true;\n        },\n        \n        rewriteUrl: function(url) {\n            if (!this.shouldRewrite(url)) return url;\n            try {\n                // Handle relative URLs - these should ALWAYS be rewritten\n                if (url.startsWith('/') && !url.startsWith('//')) {\n                    return \`${'${'}PROXY_BASE_URL${'}'}\/proxy\/${'${'}TARGET_HOST${'}'}\${'${'}url${'}'}\`;\n                }\n                \n                // Handle protocol-relative URLs\n                if (url.startsWith('//')) {\n                    const urlObj = new URL('https:' + url);\n                    return \`${'${'}PROXY_BASE_URL${'}'}\/proxy\/${'${'}urlObj.hostname${'}'}\${'${'}urlObj.pathname${'}'}\${'${'}urlObj.search${'}'}\${'${'}urlObj.hash${'}'}\`;\n                }\n                \n                // Handle absolute URLs\n                const urlObj = new URL(url, window.location.href);\n                if (urlObj.pathname.startsWith('/proxy/')) return url;\n                \n                // Rewrite URLs that point to the target host OR are on the same origin\n                if (urlObj.hostname === TARGET_HOST || \n                    urlObj.hostname === 'www.' + TARGET_HOST ||\n                    urlObj.hostname === window.location.hostname) {\n                    return \`${'${'}PROXY_BASE_URL${'}'}\/proxy\/${'${'}TARGET_HOST${'}'}\${'${'}urlObj.pathname${'}'}\${'${'}urlObj.search${'}'}\${'${'}urlObj.hash${'}'}\`;\n                }\n                \n                // Special case: if the URL is going to the proxy server itself, rewrite it\n                if (urlObj.hostname === window.location.hostname && !urlObj.pathname.startsWith('/proxy/')) {\n                    return \`${'${'}PROXY_BASE_URL${'}'}\/proxy\/${'${'}TARGET_HOST${'}'}\${'${'}urlObj.pathname${'}'}\${'${'}urlObj.search${'}'}\${'${'}urlObj.hash${'}'}\`;\n                }\n                \n                return url;\n            } catch (e) {\n                console.warn('Failed to rewrite URL:', url, e);\n                return url;\n            }\n        }\n    };\n    \n    // Process DOM elements\n    function processElements() {\n        const urlAttributes = ['src', 'href', 'action', 'data-src', 'data-href'];\n        const selectors = ['img', 'script', 'link', 'a', 'form', 'iframe', 'video', 'audio', 'source', 'track', 'embed', 'object', 'param'];\n        \n        selectors.forEach(selector => {\n            document.querySelectorAll(selector).forEach(element => {\n                urlAttributes.forEach(attr => {\n                    if (element.hasAttribute(attr)) {\n                        const originalUrl = element.getAttribute(attr);\n                        const rewrittenUrl = URLRewriter.rewriteUrl(originalUrl);\n                        if (rewrittenUrl !== originalUrl) {\n                            element.setAttribute(attr, rewrittenUrl);\n                        }\n                    }\n                });\n            });\n        });\n        \n        // Process CSS for URL rewriting\n        processCSS();\n    }\n    \n    // Process CSS for URL rewriting\n    function processCSS() {\n        // Process external stylesheets\n        document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {\n            const href = link.getAttribute('href');\n            if (href) {\n                const rewrittenHref = URLRewriter.rewriteUrl(href);\n                if (rewrittenHref !== href) {\n                    link.setAttribute('href', rewrittenHref);\n                }\n            }\n        });\n        \n        // Process inline styles and style elements\n        document.querySelectorAll('*[style]').forEach(element => {\n            const style = element.getAttribute('style');\n            if (style) {\n                const rewrittenStyle = rewriteCSSUrls(style);\n                if (rewrittenStyle !== style) {\n                    element.setAttribute('style', rewrittenStyle);\n                }\n            }\n        });\n        \n        // Process <style> elements\n        document.querySelectorAll('style').forEach(styleElement => {\n            if (styleElement.textContent) {\n                const rewrittenCSS = rewriteCSSUrls(styleElement.textContent);\n                if (rewrittenCSS !== styleElement.textContent) {\n                    styleElement.textContent = rewrittenCSS;\n                }\n            }\n        });\n    }\n    \n    // Rewrite URLs in CSS content\n    function rewriteCSSUrls(cssContent) {\n        // Match url() functions in CSS\n        return cssContent.replace(/url\\\\(['\"]?([^'\")]+)['\"]?\\\\)/g, (match, url) => {\n            const rewrittenUrl = URLRewriter.rewriteUrl(url);\n            return \`url('\\${'${'}rewrittenUrl${'}'}')\`;\n        });\n    }\n    \n    // Initialize when DOM is ready\n    if (document.readyState === 'loading') {\n        document.addEventListener('DOMContentLoaded', processElements);\n    } else {\n        processElements();\n    }\n    \n    // Intercept AJAX and Fetch API calls\n    function interceptAPIs() {\n        // Intercept fetch API\n        const originalFetch = window.fetch;\n        window.fetch = function(input, init) {\n            if (typeof input === 'string') {\n                const rewrittenUrl = URLRewriter.rewriteUrl(input);\n                console.log('Fetch intercepted:', input, '->', rewrittenUrl);\n                return originalFetch.call(this, rewrittenUrl, init).catch(error => {\n                    console.warn('Fetch request failed:', error);\n                    throw error;\n                });\n            } else if (input instanceof Request) {\n                const rewrittenUrl = URLRewriter.rewriteUrl(input.url);\n                console.log('Fetch Request intercepted:', input.url, '->', rewrittenUrl);\n                const newRequest = new Request(rewrittenUrl, input);\n                return originalFetch.call(this, newRequest, init).catch(error => {\n                    console.warn('Fetch request failed:', error);\n                    throw error;\n                });\n            }\n            return originalFetch.call(this, input, init);\n        };\n        \n        // Also intercept any requests that might be made directly to the proxy server\n        const originalOpen = XMLHttpRequest.prototype.open;\n        XMLHttpRequest.prototype.open = function(method, url, ...args) {\n            this._originalUrl = url;\n            const rewrittenUrl = URLRewriter.rewriteUrl(url);\n            console.log('XHR intercepted:', method, url, '->', rewrittenUrl);\n            return originalOpen.call(this, method, rewrittenUrl, ...args);\n        };\n        \n        // Intercept dynamic imports (if supported)\n        if (window.import) {\n            const originalImport = window.import;\n            window.import = function(specifier) {\n                const rewrittenSpecifier = URLRewriter.rewriteUrl(specifier);\n                return originalImport.call(this, rewrittenSpecifier);\n            };\n        }\n    }\n    \n    // Initialize API interception\n    interceptAPIs();\n    \n    // Observe DOM changes for dynamic content\n    const observer = new MutationObserver(mutations => {\n        mutations.forEach(mutation => {\n            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {\n                mutation.addedNodes.forEach(node => {\n                    if (node.nodeType === Node.ELEMENT_NODE) {\n                        // Re-run processing for newly added elements\n                        processElements();\n                    }\n                });\n            }\n        });\n    });\n    \n    observer.observe(document.body, { childList: true, subtree: true });\n})();\n</script>\n`;
}

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
            const injectionScript = getClientProcessorScript();

            // Skip if already injected (marker present)
            if (!data.includes(CLIENT_PROCESSOR_MARKER)) {
              // Inject before closing </body> or </head>
              if (data.includes('</body>')) {
                data = data.replace('</body>', `${injectionScript}</body>`);
              } else if (data.includes('</head>')) {
                data = data.replace('</head>', `${injectionScript}</head>`);
              } else {
                data = data + injectionScript;
              }
            }
          }
          
          return originalSend.call(this, data);
        };
      }
      
      next();
    };
  }
}
