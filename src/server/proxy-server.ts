import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { HeaderManipulator } from '../processing/header-manipulation';
// import { ContentProcessor } from '../processing/content-processor'; // TODO: Enable in Phase 2
// import { RewriteContext } from '../processing/url-rewriter'; // TODO: Enable in Phase 2
// import { SubdomainRouter } from './subdomain-router'; // Will be used in Phase 3
import { Logger, LogLevel } from '../utils/logger';

export class ProxyServer {
  private app: express.Application;
  private port: number;
  private headerManipulator: HeaderManipulator;
  // private contentProcessor: ContentProcessor; // TODO: Enable in Phase 2
  // private subdomainRouter: SubdomainRouter; // Will be used in Phase 3
  private logger: Logger;

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();
    this.logger = new Logger();
    this.logger.setLogLevel(LogLevel.DEBUG);
    
    this.headerManipulator = new HeaderManipulator();
    // this.contentProcessor = new ContentProcessor(this.logger); // TODO: Enable in Phase 2
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
    return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
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

        // Create proxy middleware for this specific request
        const proxyMiddleware = createProxyMiddleware({
          target: baseTarget,
          changeOrigin: true,
          secure: false, // Disable SSL verification for now
          followRedirects: true,
          timeout: 30000,
          logLevel: 'debug',
          pathRewrite: (path, _req) => {
            console.log('PathRewrite - Original path:', path);
            // Remove /proxy/domain from the path and replace with the target path
            const newPath = path.replace(/^\/proxy\/[^/]+/, targetPath);
            console.log('PathRewrite - New path:', newPath);
            return newPath;
          },
          onProxyReq: (proxyReq, req, _res) => {
            this.setupProxyRequest(proxyReq, req, targetUrl);
          },
          onProxyRes: (proxyRes, req, res) => {
            console.log('Proxy response received:', proxyRes.statusCode);
            this.headerManipulator.manipulateResponseHeaders(proxyRes, req, res);
            
            // TODO: Process response content for URL rewriting
            // await this.processProxyResponse(proxyRes, req, res);
          },
          onError: (err, _req, res) => {
            console.log('Proxy error:', err.message);
            this.logger.error('Proxy error:', err);
            if (!res.headersSent) {
              res.status(500).json({ error: 'Proxy error occurred', details: err.message });
            }
          },
        });

        proxyMiddleware(req, res, next);
      } catch (error) {
        this.logger.error('Error in proxy handler:', error as Record<string, any>);
        next(error);
      }
    };
  }

  // TODO: Implement response content processing in Phase 2
  // private async processProxyResponse(proxyRes: any, req: express.Request, res: express.Response): Promise<void> {
  //   // Content processing logic will be implemented here
  // }

  private setupProxyRequest(proxyReq: any, req: express.Request, targetUrl: string): void {
    console.log('Setting up proxy request to:', targetUrl);
    
    // Remove any existing headers that might identify us as a bot
    proxyReq.removeHeader('x-forwarded-for');
    proxyReq.removeHeader('x-real-ip');
    proxyReq.removeHeader('x-forwarded-proto');
    proxyReq.removeHeader('x-forwarded-host');
    
    // Set realistic User-Agent (rotate between different browsers)
    const userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
    ];
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    proxyReq.setHeader('User-Agent', randomUA);
    
    // Set comprehensive Accept headers
    proxyReq.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7');
    proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.9,es;q=0.8,fr;q=0.7');
    proxyReq.setHeader('Accept-Encoding', 'gzip, deflate, br');
    
    // Set connection headers
    proxyReq.setHeader('Connection', 'keep-alive');
    proxyReq.setHeader('Upgrade-Insecure-Requests', '1');
    
    // Set realistic Sec-Fetch headers
    proxyReq.setHeader('Sec-Fetch-Dest', 'document');
    proxyReq.setHeader('Sec-Fetch-Mode', 'navigate');
    proxyReq.setHeader('Sec-Fetch-Site', 'none');
    proxyReq.setHeader('Sec-Fetch-User', '?1');
    
    // Set additional headers that real browsers send
    proxyReq.setHeader('Cache-Control', 'max-age=0');
    proxyReq.setHeader('DNT', '1');
    proxyReq.setHeader('Sec-CH-UA', '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"');
    proxyReq.setHeader('Sec-CH-UA-Mobile', '?0');
    proxyReq.setHeader('Sec-CH-UA-Platform', '"macOS"');
    
    // Set referer to make it look like a direct navigation
    if (!proxyReq.getHeader('referer')) {
      proxyReq.setHeader('Referer', 'https://www.google.com/');
    }
    
    // Add some randomness to make requests look more natural
    if (Math.random() < 0.3) {
      proxyReq.setHeader('X-Requested-With', 'XMLHttpRequest');
    }
    
    this.headerManipulator.manipulateRequestHeaders(proxyReq, req);
    this.addBotDetectionEvasion(proxyReq, targetUrl);
  }

  private addBotDetectionEvasion(proxyReq: any, targetUrl: string): void {
    const url = new URL(targetUrl);
    const hostname = url.hostname;
    
    // Remove ALL proxy-identifying headers
    const proxyHeaders = [
      'x-forwarded-for', 'x-real-ip', 'x-forwarded-proto', 'x-forwarded-host',
      'x-forwarded-port', 'x-original-url', 'x-rewrite-url', 'x-forwarded-server',
      'x-cluster-client-ip', 'x-client-ip', 'x-remote-ip', 'x-remote-addr',
      'via', 'x-via', 'connection', 'upgrade', 'proxy-connection'
    ];
    
    proxyHeaders.forEach(header => {
      proxyReq.removeHeader(header);
    });
    
    // Generate realistic browser fingerprint
    const browserFingerprint = this.generateBrowserFingerprint();
    
    // Set comprehensive browser headers
    proxyReq.setHeader('Accept', browserFingerprint.accept);
    proxyReq.setHeader('Accept-Language', browserFingerprint.acceptLanguage);
    proxyReq.setHeader('Accept-Encoding', browserFingerprint.acceptEncoding);
    proxyReq.setHeader('User-Agent', browserFingerprint.userAgent);
    
    // Set modern browser headers
    proxyReq.setHeader('Sec-CH-UA', browserFingerprint.secChUa);
    proxyReq.setHeader('Sec-CH-UA-Mobile', browserFingerprint.secChUaMobile);
    proxyReq.setHeader('Sec-CH-UA-Platform', browserFingerprint.secChUaPlatform);
    proxyReq.setHeader('Sec-CH-UA-Arch', browserFingerprint.secChUaArch);
    proxyReq.setHeader('Sec-CH-UA-Bitness', browserFingerprint.secChUaBitness);
    proxyReq.setHeader('Sec-CH-UA-Full-Version', browserFingerprint.secChUaFullVersion);
    proxyReq.setHeader('Sec-CH-UA-Full-Version-List', browserFingerprint.secChUaFullVersionList);
    proxyReq.setHeader('Sec-CH-UA-Model', browserFingerprint.secChUaModel);
    proxyReq.setHeader('Sec-CH-UA-WoW64', browserFingerprint.secChUaWoW64);
    
    // Set viewport and screen info
    proxyReq.setHeader('Viewport-Width', browserFingerprint.viewportWidth);
    proxyReq.setHeader('Width', browserFingerprint.width);
    proxyReq.setHeader('Sec-GPC', '1');
    
    // Set realistic referer
    const referers = [
      'https://www.google.com/',
      'https://www.bing.com/',
      'https://duckduckgo.com/',
      'https://www.yahoo.com/',
      'https://www.baidu.com/',
      'https://yandex.com/'
    ];
    proxyReq.setHeader('Referer', referers[Math.floor(Math.random() * referers.length)]);
    
    // Set timing headers
    const now = new Date();
    proxyReq.setHeader('If-Modified-Since', new Date(now.getTime() - Math.random() * 86400000).toUTCString());
    
    // Add realistic browser behavior
    if (Math.random() < 0.15) {
      proxyReq.setHeader('X-Requested-With', 'XMLHttpRequest');
    }
    
    // Advanced CDN-specific evasion
    this.addCDNSpecificEvasion(proxyReq, hostname);
    
    // Add realistic connection behavior
    proxyReq.setHeader('Connection', 'keep-alive');
    proxyReq.setHeader('Upgrade-Insecure-Requests', '1');
    proxyReq.setHeader('Cache-Control', 'max-age=0');
    proxyReq.setHeader('DNT', '1');
  }

  private generateBrowserFingerprint(): any {
    const browsers = [
      {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        acceptLanguage: 'en-US,en;q=0.9',
        acceptEncoding: 'gzip, deflate, br',
        secChUa: '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        secChUaMobile: '?0',
        secChUaPlatform: '"macOS"',
        secChUaArch: '"x86"',
        secChUaBitness: '"64"',
        secChUaFullVersion: '"120.0.6099.109"',
        secChUaFullVersionList: '"Not_A Brand";v="8.0.0.0", "Chromium";v="120.0.6099.109", "Google Chrome";v="120.0.6099.109"',
        secChUaModel: '""',
        secChUaWoW64: '?0',
        viewportWidth: '1920',
        width: '1920'
      },
      {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        acceptLanguage: 'en-US,en;q=0.9',
        acceptEncoding: 'gzip, deflate, br',
        secChUa: '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        secChUaMobile: '?0',
        secChUaPlatform: '"Windows"',
        secChUaArch: '"x86"',
        secChUaBitness: '"64"',
        secChUaFullVersion: '"120.0.6099.109"',
        secChUaFullVersionList: '"Not_A Brand";v="8.0.0.0", "Chromium";v="120.0.6099.109", "Google Chrome";v="120.0.6099.109"',
        secChUaModel: '""',
        secChUaWoW64: '?0',
        viewportWidth: '1920',
        width: '1920'
      },
      {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        acceptLanguage: 'en-US,en;q=0.9',
        acceptEncoding: 'gzip, deflate, br',
        secChUa: '"Not_A Brand";v="8", "Safari";v="17"',
        secChUaMobile: '?0',
        secChUaPlatform: '"macOS"',
        secChUaArch: '"x86"',
        secChUaBitness: '"64"',
        secChUaFullVersion: '"17.1"',
        secChUaFullVersionList: '"Not_A Brand";v="8.0.0.0", "Safari";v="17.1"',
        secChUaModel: '""',
        secChUaWoW64: '?0',
        viewportWidth: '1920',
        width: '1920'
      }
    ];
    
    return browsers[Math.floor(Math.random() * browsers.length)];
  }

  private addCDNSpecificEvasion(proxyReq: any, hostname: string): void {
    // CloudFront/AWS specific evasion
    if (hostname.includes('cloudfront') || hostname.includes('amazonaws') || hostname.includes('s3')) {
      // Try to look like a real browser accessing CloudFront
      proxyReq.setHeader('X-Forwarded-For', this.generateRandomIP());
      proxyReq.setHeader('X-Forwarded-Proto', 'https');
      proxyReq.setHeader('X-Forwarded-Port', '443');
      proxyReq.setHeader('CloudFront-Viewer-Country', 'US');
      proxyReq.setHeader('CloudFront-Viewer-Country-Region', 'CA');
      proxyReq.setHeader('CloudFront-Viewer-City', 'San Francisco');
      proxyReq.setHeader('CloudFront-Viewer-City-Latitude', '37.7749');
      proxyReq.setHeader('CloudFront-Viewer-City-Longitude', '-122.4194');
      proxyReq.setHeader('CloudFront-Viewer-Time-Zone', 'America/Los_Angeles');
      proxyReq.setHeader('CloudFront-Viewer-TLS', 'TLSv1.3');
      proxyReq.setHeader('CloudFront-Viewer-TLS-Cipher', 'TLS_AES_256_GCM_SHA384');
    }
    
    // Cloudflare specific evasion
    if (hostname.includes('cloudflare') || hostname.includes('cf-')) {
      proxyReq.setHeader('CF-Connecting-IP', this.generateRandomIP());
      proxyReq.setHeader('CF-Ray', this.generateCFRay());
      proxyReq.setHeader('CF-Visitor', '{"scheme":"https"}');
      proxyReq.setHeader('CF-IPCountry', 'US');
      proxyReq.setHeader('CF-Timezone', 'America/Los_Angeles');
    }
    
    // Akamai specific evasion
    if (hostname.includes('akamai') || hostname.includes('akamaihd')) {
      proxyReq.setHeader('X-Akamai-Transformed', '9');
      proxyReq.setHeader('X-Akamai-Edge-IP', this.generateRandomIP());
      proxyReq.setHeader('X-Akamai-Request-ID', this.generateRequestId());
    }
    
    // Vercel specific evasion
    if (hostname.includes('vercel')) {
      proxyReq.setHeader('X-Vercel-Id', this.generateVercelId());
      proxyReq.setHeader('X-Vercel-Cache', 'MISS');
      proxyReq.setHeader('X-Vercel-IP-Country', 'US');
      proxyReq.setHeader('X-Vercel-IP-City', 'San Francisco');
      proxyReq.setHeader('X-Vercel-IP-Region', 'CA');
    }
  }

  private generateRandomIP(): string {
    const ips = [
      '192.168.1.100', '10.0.0.50', '172.16.0.25', '203.0.113.1',
      '198.51.100.1', '192.0.2.1', '8.8.8.8', '1.1.1.1'
    ];
    return ips[Math.floor(Math.random() * ips.length)];
  }

  private generateCFRay(): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result + '-DFW';
  }

  private generateRequestId(): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private generateVercelId(): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < 24; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
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
