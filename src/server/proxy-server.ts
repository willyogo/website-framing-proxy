import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ContentProcessor, RewriteContext } from '../processing/content-processor';
import { CookieManager } from '../processing/cookie-manager';
// import { SubdomainRouter } from './subdomain-router'; // Will be used in Phase 3
import { Logger, LogLevel } from '../utils/logger';

export class ProxyServer {
  private app: express.Application;
  private port: number;
  private contentProcessor: ContentProcessor;
  private cookieManager: CookieManager;
  // private subdomainRouter: SubdomainRouter; // Will be used in Phase 3
  private logger: Logger;

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();
    this.logger = new Logger();
    this.logger.setLogLevel(LogLevel.DEBUG);
    
    // Initialize Phase 2 components
    this.contentProcessor = new ContentProcessor(this.logger);
    this.cookieManager = new CookieManager(this.logger);
    
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
      
      // Set response status and headers
      res.status(proxyRes.statusCode);
      
      // Copy headers from target response (except content-length which we'll set later)
      Object.keys(proxyRes.headers).forEach(key => {
        const value = proxyRes.headers[key];
        if (value !== undefined && key.toLowerCase() !== 'content-length') {
          res.setHeader(key, value);
        }
      });
      
      // Remove anti-framing headers
      res.removeHeader('x-frame-options');
      res.removeHeader('content-security-policy');
      res.removeHeader('content-security-policy-report-only');
      
      // Remove compression headers since we'll decompress and send uncompressed content
      res.removeHeader('content-encoding');
      res.removeHeader('content-length');
      
      // We'll set the correct content length after processing the HTML
      
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      
      // Debug header to verify we're running the latest code
      res.setHeader('X-Proxy-Version', 'streaming-decompression-v1');
      
      // Process cookies if present
      const setCookieHeaders = proxyRes.headers['set-cookie'];
      if (setCookieHeaders) {
        const processedCookies = this.cookieManager.processResponseCookies(
          setCookieHeaders,
          targetUrl.hostname,
          req.get('host') || 'localhost'
        );
        res.setHeader('Set-Cookie', processedCookies);
      }
      
      // Process content if it's HTML
      const contentType = proxyRes.headers['content-type'] || '';
      if (contentType.includes('text/html')) {
        // Check if content is compressed
        const contentEncoding = proxyRes.headers['content-encoding'];
        const isCompressed = contentEncoding === 'gzip' || contentEncoding === 'deflate';
        
        if (isCompressed) {
          // For compressed content, use streaming decompression
          const zlib = require('zlib');
          let decompressor;
          
          if (contentEncoding === 'gzip') {
            decompressor = zlib.createGunzip();
          } else if (contentEncoding === 'deflate') {
            decompressor = zlib.createInflate();
          }
          
          // Collect decompressed data
          let html = '';
          decompressor.on('data', (chunk: Buffer) => {
            html += chunk.toString('utf8');
          });
          
          decompressor.on('end', async () => {
            try {
              // Check if this is actually HTML
              if (!html.trim().startsWith('<') && !html.includes('<html') && !html.includes('<!DOCTYPE')) {
                // Not HTML, send as-is
                res.send(html);
                return;
              }
              
              // Create rewrite context
              const proxyBaseUrl = `${req.protocol}://${req.get('host')}`;
              const context: RewriteContext = {
                originalUrl: targetUrl.toString(),
                proxyBaseUrl,
                targetHost: targetUrl.hostname,
                targetProtocol: targetUrl.protocol
              };
              
              // Process the HTML content
              const processedHtml = await this.contentProcessor.processHtmlContent(html, context);
              
              // Send the processed content (uncompressed)
              res.send(processedHtml);
            } catch (error) {
              this.logger.error('Error processing HTML content:', error as Record<string, any>);
              // Fallback to original content
              res.send(html);
            }
          });
          
          decompressor.on('error', (error: any) => {
            this.logger.error('Error decompressing content:', error);
            // Fallback: pipe compressed content directly
            proxyRes.pipe(res);
          });
          
          // Pipe the compressed response to the decompressor
          proxyRes.pipe(decompressor);
        } else {
          // For uncompressed HTML, collect data and process
          const chunks: Buffer[] = [];
          proxyRes.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });
          
          proxyRes.on('end', async () => {
            try {
              const buffer = Buffer.concat(chunks);
              const html = buffer.toString('utf8');
              
              // Check if this is actually HTML
              if (!html.trim().startsWith('<') && !html.includes('<html') && !html.includes('<!DOCTYPE')) {
                res.send(html);
                return;
              }
              
              // Create rewrite context
              const proxyBaseUrl = `${req.protocol}://${req.get('host')}`;
              const context: RewriteContext = {
                originalUrl: targetUrl.toString(),
                proxyBaseUrl,
                targetHost: targetUrl.hostname,
                targetProtocol: targetUrl.protocol
              };
              
              // Process the HTML content
              const processedHtml = await this.contentProcessor.processHtmlContent(html, context);
              
              // Send the processed content
              res.send(processedHtml);
            } catch (error) {
              this.logger.error('Error processing HTML content:', error as Record<string, any>);
              // Fallback to original content
              const buffer = Buffer.concat(chunks);
              res.send(buffer.toString('utf8'));
            }
          });
          
          proxyRes.on('error', (error: any) => {
            this.logger.error('Error reading proxy response:', error);
            if (!res.headersSent) {
              res.status(500).json({ error: 'Error processing response' });
            }
          });
        }
      } else {
        // For non-HTML content, pipe directly
        proxyRes.pipe(res);
      }
    });
    
    proxyReq.on('error', (err: any) => {
      console.error('Direct proxy request error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Proxy request failed', details: err.message });
      }
    });
    
    // Handle request timeout
    proxyReq.setTimeout(30000, () => {
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
