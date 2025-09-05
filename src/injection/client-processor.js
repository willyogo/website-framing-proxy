/**
 * Client-Side Content Processor for Website Framing Proxy
 * Handles URL rewriting, AJAX interception, and dynamic content processing
 */

(function() {
    'use strict';
    
    // Configuration
    const PROXY_BASE_URL = window.location.origin;
    const TARGET_HOST = window.location.hostname.replace(/^[^.]+\./, ''); // Remove subdomain if present
    const TARGET_PROTOCOL = window.location.protocol;
    
    // URL rewriting utilities
    const URLRewriter = {
        // Check if a URL should be rewritten
        shouldRewrite: function(url) {
            if (!url || typeof url !== 'string') return false;
            
            // Don't rewrite data URLs, blob URLs, or already proxied URLs
            if (url.startsWith('data:') || 
                url.startsWith('blob:') || 
                url.startsWith('javascript:') ||
                url.includes('/proxy/')) {
                return false;
            }
            
            return true;
        },
        
        // Rewrite a URL to go through the proxy
        rewriteUrl: function(url) {
            if (!this.shouldRewrite(url)) return url;
            
            try {
                const urlObj = new URL(url, window.location.href);
                
                // Skip if it's already a proxy URL
                if (urlObj.pathname.startsWith('/proxy/')) return url;
                
                // Create proxy URL
                const proxyUrl = `${PROXY_BASE_URL}/proxy/${urlObj.hostname}${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
                return proxyUrl;
            } catch (e) {
                console.warn('Failed to rewrite URL:', url, e);
                return url;
            }
        },
        
        // Rewrite relative URLs
        rewriteRelativeUrl: function(url, baseUrl = window.location.href) {
            if (!this.shouldRewrite(url)) return url;
            
            try {
                const absoluteUrl = new URL(url, baseUrl).href;
                return this.rewriteUrl(absoluteUrl);
            } catch (e) {
                console.warn('Failed to rewrite relative URL:', url, e);
                return url;
            }
        }
    };
    
    // DOM processing utilities
    const DOMProcessor = {
        // Process all elements with URL attributes
        processElements: function() {
            const urlAttributes = ['src', 'href', 'action', 'data-src', 'data-href'];
            const selectors = [
                'img', 'script', 'link', 'a', 'form', 'iframe', 'video', 'audio',
                'source', 'track', 'embed', 'object', 'param'
            ];
            
            selectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    urlAttributes.forEach(attr => {
                        if (element.hasAttribute(attr)) {
                            const originalUrl = element.getAttribute(attr);
                            const rewrittenUrl = URLRewriter.rewriteRelativeUrl(originalUrl);
                            if (rewrittenUrl !== originalUrl) {
                                element.setAttribute(attr, rewrittenUrl);
                            }
                        }
                    });
                });
            });
        },
        
        // Process CSS background images and other CSS properties
        processCSS: function() {
            const elements = document.querySelectorAll('*');
            elements.forEach(element => {
                const computedStyle = window.getComputedStyle(element);
                const backgroundImage = computedStyle.backgroundImage;
                
                if (backgroundImage && backgroundImage !== 'none') {
                    const urlMatch = backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
                    if (urlMatch) {
                        const originalUrl = urlMatch[1];
                        const rewrittenUrl = URLRewriter.rewriteRelativeUrl(originalUrl);
                        if (rewrittenUrl !== originalUrl) {
                            element.style.backgroundImage = `url("${rewrittenUrl}")`;
                        }
                    }
                }
            });
        },
        
        // Process inline styles
        processInlineStyles: function() {
            const elements = document.querySelectorAll('[style]');
            elements.forEach(element => {
                const style = element.getAttribute('style');
                if (style && style.includes('url(')) {
                    const rewrittenStyle = style.replace(/url\(['"]?([^'"]+)['"]?\)/g, (match, url) => {
                        const rewrittenUrl = URLRewriter.rewriteRelativeUrl(url);
                        return `url("${rewrittenUrl}")`;
                    });
                    if (rewrittenStyle !== style) {
                        element.setAttribute('style', rewrittenStyle);
                    }
                }
            });
        }
    };
    
    // AJAX interception
    const AJAXInterceptor = {
        // Intercept XMLHttpRequest
        interceptXHR: function() {
            const originalOpen = XMLHttpRequest.prototype.open;
            const originalSend = XMLHttpRequest.prototype.send;
            
            XMLHttpRequest.prototype.open = function(method, url, ...args) {
                this._originalUrl = url;
                this._rewrittenUrl = URLRewriter.rewriteUrl(url);
                return originalOpen.call(this, method, this._rewrittenUrl, ...args);
            };
            
            XMLHttpRequest.prototype.send = function(...args) {
                if (this._rewrittenUrl !== this._originalUrl) {
                    console.log('XHR intercepted:', this._originalUrl, '->', this._rewrittenUrl);
                }
                return originalSend.apply(this, args);
            };
        },
        
        // Intercept fetch API
        interceptFetch: function() {
            const originalFetch = window.fetch;
            
            window.fetch = function(input, init) {
                let url = input;
                if (typeof input === 'string') {
                    url = URLRewriter.rewriteUrl(input);
                } else if (input instanceof Request) {
                    url = URLRewriter.rewriteUrl(input.url);
                }
                
                if (url !== input) {
                    console.log('Fetch intercepted:', input, '->', url);
                }
                
                return originalFetch.call(this, url, init);
            };
        }
    };
    
    // Dynamic content observer
    const DynamicContentObserver = {
        observer: null,
        
        init: function() {
            if (this.observer) return;
            
            this.observer = new MutationObserver(function(mutations) {
                let shouldProcess = false;
                
                mutations.forEach(function(mutation) {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        shouldProcess = true;
                    }
                });
                
                if (shouldProcess) {
                    // Debounce processing to avoid excessive calls
                    clearTimeout(this.processTimeout);
                    this.processTimeout = setTimeout(() => {
                        DOMProcessor.processElements();
                        DOMProcessor.processInlineStyles();
                    }, 100);
                }
            });
            
            this.observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        },
        
        destroy: function() {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
        }
    };
    
    // Main processor
    const ClientProcessor = {
        init: function() {
            console.log('Client-side content processor initialized');
            
            // Process existing content
            DOMProcessor.processElements();
            DOMProcessor.processCSS();
            DOMProcessor.processInlineStyles();
            
            // Set up AJAX interception
            AJAXInterceptor.interceptXHR();
            AJAXInterceptor.interceptFetch();
            
            // Set up dynamic content observation
            DynamicContentObserver.init();
            
            // Process again after a short delay to catch any missed content
            setTimeout(() => {
                DOMProcessor.processElements();
                DOMProcessor.processCSS();
                DOMProcessor.processInlineStyles();
            }, 1000);
        }
    };
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ClientProcessor.init);
    } else {
        ClientProcessor.init();
    }
    
    // Expose for debugging
    window.ProxyProcessor = {
        URLRewriter,
        DOMProcessor,
        AJAXInterceptor,
        DynamicContentObserver,
        ClientProcessor
    };
    
})();
