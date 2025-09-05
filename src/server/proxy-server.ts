import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
// import { ContentProcessor, RewriteContext } from '../processing/content-processor';
import { CookieManager } from '../processing/cookie-manager';
// import { HTMLInjector } from '../injection/html-injector';
import { InjectionMiddleware } from '../injection/injection-middleware';
// import { SubdomainRouter } from './subdomain-router'; // Will be used in Phase 3
import { Logger, LogLevel } from '../utils/logger';

export class ProxyServer {
  private app: express.Application;
  private port: number;
  // private contentProcessor: ContentProcessor;
  private cookieManager: CookieManager;
  // private htmlInjector: HTMLInjector;
  private injectionMiddleware: InjectionMiddleware;
  // private subdomainRouter: SubdomainRouter; // Will be used in Phase 3
  private logger: Logger;

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();
    this.logger = new Logger();
    this.logger.setLogLevel(LogLevel.DEBUG);
    
    // Initialize Phase 2 components
    // Initialize Phase 2 components
    // this.contentProcessor = new ContentProcessor(this.logger);
    this.cookieManager = new CookieManager(this.logger);
    // this.htmlInjector = new HTMLInjector(this.logger);
    this.injectionMiddleware = new InjectionMiddleware();
    
    // this.subdomainRouter = new SubdomainRouter(); // Will be used in Phase 3
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // We'll handle CSP manually
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
      frameguard: false, // We'll handle X-Frame-Options manually
    }));

    // CORS configuration
    this.app.use(cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    }));
    
    // Client-side injection middleware
    this.app.use(this.injectionMiddleware.injectClientProcessor());

    // Body parsing
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    this.app.use(cookieParser());

    // Request logging
    this.app.use((req, _res, next) => {
      this.logger.info(`${req.method} ${req.url}`, {
        userAgent: req.get('User-Agent'),
        origin: req.get('Origin'),
        referer: req.get('Referer'),
      });
      next();
    });
  }


  private isSimpleSite(targetUrl: string): boolean {
    // List of simple static sites that work well with client-side processing
    const simpleSites = [
      'example.com',
      'nouns.world',
      'myspace.com'
    ];
    
    try {
      const url = new URL(targetUrl);
      const hostname = url.hostname.replace(/^www\./, '');
      
      // Check if it's a known simple site
      if (simpleSites.includes(hostname)) {
        return true;
      }
      
      // For unknown sites, be conservative and assume they're complex
      // This prevents breaking SSR sites like nouns.com, bigshottoyshop.com
      return false;
    } catch (error) {
      return false;
    }
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // Serve test page
    this.app.get('/', (_req, res) => {
      res.sendFile('test.html', { root: __dirname + '/../../' });
    });

    // Test endpoint that returns simple data
    this.app.get('/test-data', (_req, res) => {
      res.json({ message: 'Test data from proxy server', timestamp: new Date().toISOString() });
    });

    // Debug endpoint
    this.app.get('/debug', (_req, res) => {
      const testPath = '/proxy/nouns.world';
      const mockReq = { path: testPath, url: testPath } as express.Request;
      const targetUrl = this.extractTargetUrl(mockReq);
      res.json({
        testPath,
        extractedUrl: targetUrl,
        pathParts: testPath.split('/')
      });
    });

    // Debug endpoint for specific sites
    this.app.get('/debug/:site', (req, res) => {
      const site = req.params.site;
      const testPath = `/proxy/${site}`;
      const mockReq = { path: testPath, url: testPath } as express.Request;
      const targetUrl = this.extractTargetUrl(mockReq);
      res.json({
        site,
        testPath,
        extractedUrl: targetUrl,
        pathParts: testPath.split('/')
      });
    });

    // Main proxy route - handles all requests to external sites
    this.app.all('/proxy/*', this.createProxyHandler());
  }

  private createProxyHandler() {
    return async (req: express.Request, res: express.Response): Promise<void> => {
      console.log('Proxy handler called:', req.path, req.url);
      try {
        // Extract target URL from request
        const targetUrl = this.extractTargetUrl(req);
        console.log('Extracted target URL:', targetUrl);
        
        if (!targetUrl) {
          res.status(400).json({ error: 'Invalid target URL' });
          return;
        }

        // Parse the target URL to get just the base URL
        const targetUrlObj = new URL(targetUrl);
        const baseTarget = `${targetUrlObj.protocol}//${targetUrlObj.host}`;
        const targetPath = targetUrlObj.pathname + targetUrlObj.search;

        console.log('Base target:', baseTarget);
        console.log('Target path:', targetPath);

        // Use direct HTTP request instead of proxy middleware
        await this.makeDirectProxyRequest(req, res, baseTarget, targetPath);
        
      } catch (error) {
        this.logger.error('Error in proxy handler:', error as Record<string, any>);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Proxy error occurred', details: (error as Error).message });
        }
      }
    };
  }

  private async makeDirectProxyRequest(
    req: express.Request, 
    res: express.Response, 
    baseTarget: string, 
    targetPath: string
  ): Promise<void> {
    const https = require('https');
    const http = require('http');
    
    const targetUrl = new URL(targetPath, baseTarget);
    const isHttps = targetUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    
    console.log('Making direct request to:', targetUrl.toString());
    
    // Process request cookies
    const requestCookies = req.get('Cookie') || '';
    const processedCookies = this.cookieManager.processRequestCookies(requestCookies, targetUrl.hostname);
    
    const options: any = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      timeout: 60000, // 60 second timeout for slow sites
      headers: {
        ...req.headers,
        host: targetUrl.hostname,
        'user-agent': req.get('User-Agent') || 'Mozilla/5.0 (compatible; Proxy/1.0)',
        'accept': req.get('Accept') || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': req.get('Accept-Language') || 'en-US,en;q=0.5',
        'accept-encoding': req.get('Accept-Encoding') || 'gzip, deflate',
        'connection': 'close',
        'upgrade-insecure-requests': '1'
      }
    };
    
    // For HTTPS requests, ignore SSL certificate errors
    if (isHttps) {
      options.rejectUnauthorized = false;
    }
    
    // Set processed cookies if any
    if (processedCookies) {
      options.headers['Cookie'] = processedCookies;
    }
    
    // Remove proxy-identifying headers
    delete options.headers['x-forwarded-for'];
    delete options.headers['x-real-ip'];
    delete options.headers['x-forwarded-proto'];
    delete options.headers['x-forwarded-host'];
    delete options.headers['x-forwarded-port'];
    
    const proxyReq = client.request(options, async (proxyRes: any) => {
      console.log('Direct proxy response received:', proxyRes.statusCode);
      
      // Handle redirects
      if (proxyRes.statusCode && proxyRes.statusCode >= 300 && proxyRes.statusCode < 400) {
        const location = proxyRes.headers.location;
        if (location) {
          // If it's a relative redirect, make it absolute
          const redirectUrl = location.startsWith('http') ? location : new URL(location, targetUrl.toString()).toString();
          res.redirect(proxyRes.statusCode, `/proxy/${new URL(redirectUrl).hostname}${new URL(redirectUrl).pathname}${new URL(redirectUrl).search}`);
          return;
        }
      }
      
      // Handle 404s gracefully - return appropriate content type
      if (proxyRes.statusCode === 404) {
        const contentType = proxyRes.headers['content-type'] || '';
        if (contentType.includes('application/json') || targetPath.match(/\.(json|js)$/i)) {
          res.status(404).json({ error: 'Resource not found', path: targetPath });
          return;
        }
      }
      
      // Set response status and headers
      res.status(proxyRes.statusCode);
      
      // Copy headers from target response (except content-length which we'll set later)
      Object.keys(proxyRes.headers).forEach(key => {
        const value = proxyRes.headers[key];
        if (value !== undefined && key.toLowerCase() !== 'content-length') {
          // Fix MIME types for common file extensions
          if (key.toLowerCase() === 'content-type') {
            if (typeof value === 'string') {
              // Fix JavaScript MIME types
              if (value.includes('text/html') && targetPath.match(/\.(js|mjs)$/i)) {
                res.setHeader(key, 'application/javascript; charset=utf-8');
              }
              // Fix CSS MIME types
              else if (value.includes('text/html') && targetPath.match(/\.css$/i)) {
                res.setHeader(key, 'text/css; charset=utf-8');
              }
              // Fix font MIME types
              else if (value.includes('text/html') && targetPath.match(/\.(woff|woff2|ttf|otf|eot)$/i)) {
                res.setHeader(key, 'application/font-woff; charset=utf-8');
              }
              // Fix image MIME types
              else if (value.includes('text/html') && targetPath.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) {
                const ext = targetPath.match(/\.([^.]+)$/i)?.[1]?.toLowerCase();
                const mimeTypes: { [key: string]: string } = {
                  'png': 'image/png',
                  'jpg': 'image/jpeg',
                  'jpeg': 'image/jpeg',
                  'gif': 'image/gif',
                  'svg': 'image/svg+xml',
                  'webp': 'image/webp'
                };
                if (ext && mimeTypes[ext]) {
                  res.setHeader(key, mimeTypes[ext]);
                } else {
                  res.setHeader(key, value);
                }
              } else {
                res.setHeader(key, value);
              }
            } else {
              res.setHeader(key, value);
            }
          } else {
            res.setHeader(key, value);
          }
        }
      });
      
      // Remove anti-framing headers
      res.removeHeader('x-frame-options');
      res.removeHeader('content-security-policy');
      res.removeHeader('content-security-policy-report-only');
      
      // Keep compression headers so browser can decompress properly
      // res.removeHeader('content-encoding');
      // res.removeHeader('content-length');
      
      // We'll set the correct content length after processing the HTML
      
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, User-Agent, Referer, Cookie, Cache-Control');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Date, Server, X-Proxy-Version');
      
      // Debug header to verify we're running the latest code
      res.setHeader('X-Proxy-Version', 'hybrid-with-injection-v1');
      
      // Process response cookies
      const setCookieHeaders = proxyRes.headers['set-cookie'];
      if (setCookieHeaders) {
        const processedCookies = this.cookieManager.processResponseCookies(
          setCookieHeaders,
          targetUrl.hostname,
          req.get('host') || 'localhost'
        );
        res.setHeader('Set-Cookie', processedCookies);
      }
      
      // Hybrid approach: Different handling for simple vs complex sites
      const contentType = proxyRes.headers['content-type'] || '';
      const isHtml = contentType.includes('text/html');
      const isSimpleSite = this.isSimpleSite(targetUrl.toString());
      
      if (isHtml && isSimpleSite) {
        // Simple sites: Decompress and process with client-side injection
        this.logger.info(`Processing simple site: ${targetUrl}`);
        
        // Handle compressed content for simple sites
        const contentEncoding = proxyRes.headers['content-encoding'];
        let stream = proxyRes;
        
        if (contentEncoding === 'gzip' || contentEncoding === 'deflate') {
          // Remove compression headers since we're decompressing on server side
          res.removeHeader('content-encoding');
          res.removeHeader('content-length');
          res.removeHeader('vary');
          
          if (contentEncoding === 'gzip') {
            const zlib = require('zlib');
            stream = proxyRes.pipe(zlib.createGunzip());
          } else if (contentEncoding === 'deflate') {
            const zlib = require('zlib');
            stream = proxyRes.pipe(zlib.createInflate());
          }
        }
        
        // Collect the response data for processing
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        
        stream.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const content = buffer.toString('utf8');
          
          // Set the correct content length for decompressed content
          if (contentEncoding === 'gzip' || contentEncoding === 'deflate') {
            res.setHeader('content-length', Buffer.byteLength(content, 'utf8'));
          }
          
          // Send the content (middleware will handle injection)
          res.send(content);
        });
        
        stream.on('error', (error: any) => {
          this.logger.error('Error reading proxy response:', error);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Error processing response' });
          }
        });
      } else if (isHtml && !isSimpleSite) {
        // Complex sites: Stream directly but ensure script injection happens
        this.logger.info(`Streaming complex site with script injection: ${targetUrl}`);
        
        // For complex sites, we need to inject the script without decompressing
        // This prevents the ERR_CONTENT_DECODING_FAILED error
        const chunks: Buffer[] = [];
        
        proxyRes.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        
        proxyRes.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const content = buffer.toString('utf8');
          
          // Send the content (middleware will handle injection)
          res.send(content);
        });
        
        proxyRes.on('error', (error: any) => {
          this.logger.error('Error reading proxy response:', error);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Error processing response' });
          }
        });
      } else {
        // For non-HTML content (JS, CSS, images, etc.), stream directly
        this.logger.info(`Streaming non-HTML content: ${targetUrl}`);
        proxyRes.pipe(res);
      }
    });
    
    proxyReq.on('error', (err: any) => {
      console.error('Direct proxy request error:', err);
      if (!res.headersSent) {
        if (err.message.includes('timeout')) {
          res.status(504).json({ error: 'Proxy request timeout', details: 'The target server took too long to respond' });
        } else if (err.message.includes('ECONNREFUSED')) {
          res.status(502).json({ error: 'Connection refused', details: 'Unable to connect to target server' });
        } else if (err.message.includes('ENOTFOUND')) {
          res.status(502).json({ error: 'Host not found', details: 'Target hostname could not be resolved' });
        } else {
          res.status(500).json({ error: 'Proxy request failed', details: err.message });
        }
      }
    });
    
    // Handle timeout
    proxyReq.on('timeout', () => {
      console.error('Proxy request timeout');
      if (!res.headersSent) {
        res.status(504).json({ error: 'Proxy request timeout', details: 'The target server took too long to respond' });
      }
      proxyReq.destroy();
    });
    
    // Handle request timeout
    proxyReq.setTimeout(60000, () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: 'Proxy request timeout' });
      }
    });
    
    // Forward the request body if present
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
  }




  private extractTargetUrl(req: express.Request): string | null {
    // Extract target URL from the request path
    // Format: /proxy/{target-domain}/...
    const pathParts = req.path.split('/');
    
    this.logger.debug('URL extraction debug:', {
      path: req.path,
      pathParts,
      url: req.url
    });
    
    if (pathParts.length < 3 || pathParts[1] !== 'proxy') {
      this.logger.debug('Invalid path format');
      return null;
    }

    try {
      const targetDomain = pathParts[2];
      if (!targetDomain) {
        this.logger.debug('No target domain found');
        return null;
      }
      
      const remainingPath = pathParts.slice(3).join('/');
      
      // Construct full URL
      let targetUrl: string;
      if (targetDomain.startsWith('http://') || targetDomain.startsWith('https://')) {
        // Full URL provided
        targetUrl = targetDomain;
        if (remainingPath) {
          targetUrl += '/' + remainingPath;
        }
      } else {
        // Domain only, check if it's localhost for HTTP, otherwise default to https
        if (targetDomain.includes('localhost') || targetDomain.includes('127.0.0.1')) {
          targetUrl = `http://${targetDomain}`;
        } else {
          targetUrl = `https://${targetDomain}`;
        }
        if (remainingPath) {
          targetUrl += '/' + remainingPath;
        }
      }
      
      // Handle specific redirect cases
      if (targetUrl === 'https://nouns.com' || targetUrl === 'https://nouns.com/') {
        targetUrl = 'https://www.nouns.com/';
      }
      
      // Add query string if present
      if (req.url.includes('?')) {
        const queryString = req.url.split('?')[1];
        targetUrl += '?' + queryString;
      }
      
      // Validate URL
      new URL(targetUrl);
      return targetUrl;
    } catch (error) {
      this.logger.error('Invalid target URL:', error as Record<string, any>);
      return null;
    }
  }

  public start(): void {
    this.app.listen(this.port, () => {
      this.logger.info(`Proxy server running on port ${this.port}`);
      this.logger.info(`Health check: http://localhost:${this.port}/health`);
    });
  }

  public getApp(): express.Application {
    return this.app;
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new ProxyServer();
  server.start();
}
