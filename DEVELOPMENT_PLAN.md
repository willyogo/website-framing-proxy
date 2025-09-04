# Website Framing Proxy - Development Plan

## 🎯 Current Status: Phase 1 Complete ✅
**Last Updated:** September 4, 2025

### ✅ Phase 1 Complete - Foundation:
- ✅ Project setup with TypeScript and all dependencies
- ✅ Core proxy server with direct HTTP/HTTPS implementation
- ✅ Anti-framing header removal (X-Frame-Options, CSP frame-ancestors)
- ✅ CORS configuration for iframe embedding
- ✅ Basic cookie domain mapping infrastructure
- ✅ Health check endpoint
- ✅ Comprehensive logging system
- ✅ Subdomain router foundation (ready for Phase 3)
- ✅ **Demo UI with 5 test websites (example.com, nouns.world, nouns.com, google.com, nouns.camp)**

### ✅ Phase 1 Testing - Proxy Functionality:
- ✅ **Basic proxy infrastructure is working perfectly**
- ✅ **Health check endpoint working**
- ✅ **CORS and anti-framing headers configured**  
- ✅ **All test websites returning 200 responses**
- ✅ **Iframe embedding working successfully**
- ✅ **Fixed fundamental proxy implementation issues**

### 🔧 Key Technical Breakthrough:
**Problem Solved:** Initial implementation using `http-proxy-middleware` was causing 400/403 errors even though direct site access worked fine.

**Solution:** Replaced complex proxy middleware with direct HTTP/HTTPS requests using Node.js built-in modules:
- Uses `https.request()` and `http.request()` directly
- Simple header forwarding and response piping
- Proper anti-framing header removal
- Clean error handling and timeout management

**Result:** All test websites now return 200 responses and load successfully in iframes.

### 🚧 Phase 2 Ready - Content Processing:
- ⏳ URL rewriting for HTML content, scripts, and resources
- ⏳ Cookie domain mapping and session preservation
- ⏳ JavaScript injection for XHR/fetch API interception
- ⏳ WebSocket proxy support
- ⏳ Static asset caching with TTL management

### 🚀 Server Status:
- **Running on:** http://localhost:3000
- **Production:** https://website-framing-proxy.onrender.com
- **Health Check:** http://localhost:3000/health
- **Test UI:** http://localhost:3000 (5 test websites available)
- **Build Status:** ✅ Successful compilation
- **Development Mode:** Available with `npm run dev`
- **Deployment:** ✅ Successfully deployed to Render

## Project Overview
Create a robust reverse proxy system that enables framing of any website (including those that normally forbid it) without breaking functionality. The system will be implemented on Nounspace.com to allow users to embed external websites in iframes.

## Core Requirements

### 1. Anti-Framing Bypass
- Strip or override `X-Frame-Options` headers
- Override `Content-Security-Policy` frame-ancestors directives
- Handle various anti-framing mechanisms

### 2. Functionality Preservation
- Rewrite HTML content to proxy all resources
- Transform relative and absolute URLs to go through proxy
- Preserve AJAX/XHR calls via JavaScript injection
- Maintain cookie sessions through domain mapping
- Support WebSocket connections

### 3. Security & Isolation
- Serve each external site from isolated subdomain
- Implement HTML5 iframe sandboxing with selective permissions
- Prevent iframe escape attempts
- Maintain same-origin policy within isolated domains

## Technical Architecture

### Proxy Server Components
1. **Core Proxy Server** (Node.js/Express)
   - HTTP/HTTPS request forwarding
   - Response header manipulation
   - Content streaming and buffering

2. **URL Rewriting Engine**
   - HTML content parsing and modification
   - Relative/absolute URL transformation
   - Script and resource path rewriting

3. **Cookie Management System**
   - Domain-to-domain cookie mapping
   - Session preservation across requests
   - Secure cookie handling

4. **JavaScript Injection System**
   - XHR/fetch API monkey-patching
   - WebSocket connection proxying
   - Dynamic script injection

5. **Subdomain Routing**
   - Dynamic subdomain allocation
   - Origin isolation per embedded site
   - Session-based routing

## Implementation Steps

### Phase 1: Foundation (Steps 1-3) ✅ COMPLETED
1. **Project Setup** ✅
   - ✅ Initialize Node.js project with TypeScript
   - ✅ Install core dependencies (express, http-proxy-middleware, cheerio)
   - ✅ Set up development environment and build tools
   - ✅ Create organized directory structure

2. **Core Proxy Server** ✅
   - ✅ Basic HTTP/HTTPS proxy functionality
   - ✅ Request/response streaming
   - ✅ Error handling and logging
   - ✅ Health check endpoint

3. **Header Manipulation** ✅
   - ✅ Remove X-Frame-Options headers
   - ✅ Override CSP frame-ancestors
   - ✅ Add necessary CORS headers
   - ✅ Cookie domain mapping foundation

### Phase 2: Content Processing (Steps 4-6)
4. **HTML Rewriting**
   - Parse HTML content with Cheerio
   - Rewrite all resource URLs (img, script, link, etc.)
   - Inject base tag for relative URL resolution
   - Handle inline styles and scripts

5. **Cookie System**
   - Implement cookie domain mapping
   - Store original cookies with proxy domain equivalents
   - Forward cookies on subsequent requests
   - Handle secure and httpOnly cookies

6. **AJAX Interception**
   - Inject JavaScript to override fetch/XMLHttpRequest
   - Rewrite API calls to go through proxy
   - Maintain request headers and authentication

### Phase 3: Advanced Features (Steps 7-9)
7. **WebSocket Support**
   - Implement WebSocket proxy server
   - Handle WebSocket upgrade requests
   - Message forwarding and connection management

8. **Domain Isolation**
   - Set up subdomain routing system
   - Generate unique subdomains per session
   - Implement origin isolation

9. **Iframe Sandboxing**
   - Configure iframe sandbox attributes
   - Implement selective permission system
   - Add security headers for iframe embedding

### Phase 4: Optimization & Testing (Steps 10-12)
10. **Caching System**
    - Implement static asset caching
    - Add TTL management
    - Handle cache invalidation

11. **Testing Suite**
    - Create test cases for various website types
    - Test anti-framing bypass effectiveness
    - Verify functionality preservation

12. **Performance Optimization**
    - Implement connection pooling
    - Add compression support
    - Optimize memory usage

## Security Considerations

### Iframe Sandbox Permissions
- ✅ `allow-scripts` - Enable JavaScript execution
- ✅ `allow-same-origin` - Allow same-origin access (safe with domain isolation)
- ✅ `allow-forms` - Enable form submissions
- ✅ `allow-popups` - Allow popup windows
- ✅ `allow-top-navigation-by-user-activation` - Allow user-initiated navigation
- ❌ `allow-top-navigation` - Prevent automatic parent navigation
- ❌ `allow-modals` - Disable modal dialogs (security risk)

### Domain Isolation Strategy
- Each embedded site gets unique subdomain: `{hash}.proxy.nounspace.com`
- Subdomains are generated per session/user
- No shared state between different embedded sites
- Original site cookies mapped to proxy domain cookies

## File Structure
```
website-framing-proxy/
├── src/
│   ├── server/
│   │   ├── proxy-server.ts
│   │   ├── header-manipulation.ts
│   │   └── subdomain-router.ts
│   ├── processing/
│   │   ├── html-rewriter.ts
│   │   ├── url-transformer.ts
│   │   └── cookie-manager.ts
│   ├── injection/
│   │   ├── js-injector.ts
│   │   ├── xhr-interceptor.ts
│   │   └── websocket-proxy.ts
│   ├── security/
│   │   ├── sandbox-config.ts
│   │   └── origin-isolation.ts
│   └── utils/
│       ├── cache-manager.ts
│       └── logger.ts
├── tests/
│   ├── integration/
│   └── unit/
├── package.json
└── README.md
```

## Dependencies
- **express** - Web server framework
- **http-proxy-middleware** - Proxy middleware
- **cheerio** - HTML parsing and manipulation
- **ws** - WebSocket support
- **node-cache** - In-memory caching
- **helmet** - Security headers
- **cors** - CORS handling
- **typescript** - Type safety
- **jest** - Testing framework

## Success Metrics
- Successfully frame 95%+ of test websites
- Maintain full functionality (login, forms, AJAX) for embedded sites
- Zero iframe escape vulnerabilities
- Sub-200ms additional latency per request
- Support for modern web technologies (SPAs, WebSockets, etc.)

## Next Steps
1. Begin with Phase 1 implementation
2. Test with simple static websites
3. Gradually add complexity and test with dynamic sites
4. Iterate based on real-world testing results
