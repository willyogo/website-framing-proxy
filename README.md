# Website Framing Proxy

A reverse proxy server designed to enable iframe embedding of websites by stripping anti-framing headers and implementing bot detection evasion techniques.

## Features

- **Reverse Proxy**: Routes requests to target websites through `/proxy/{domain}` endpoints
- **Anti-Framing Header Removal**: Strips `X-Frame-Options` and CSP `frame-ancestors` headers
- **CORS Configuration**: Enables cross-origin requests for iframe embedding
- **Bot Detection Evasion**: Implements sophisticated techniques to bypass CDN bot protection
- **Header Manipulation**: Spoofs realistic browser headers and request patterns
- **URL Resolution**: Handles domain redirects and path rewriting

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The server will start on `http://localhost:3000`

### Production

```bash
# Build the project
npm run build

# Start production server
npm start
```

## API Endpoints

- `GET /health` - Health check endpoint
- `GET /proxy/{domain}` - Proxy requests to target websites
- `GET /debug` - Debug endpoint for testing URL extraction
- `GET /debug/{site}` - Debug specific site URL extraction

## Usage Examples

### Basic Proxy Request
```bash
curl http://localhost:3000/proxy/example.com
```

### Health Check
```bash
curl http://localhost:3000/health
```

### Debug URL Extraction
```bash
curl http://localhost:3000/debug/nouns.world
```

## Bot Detection Evasion

The proxy implements several techniques to bypass bot detection:

- **Realistic User-Agents**: Rotates between different browser user agents
- **Browser Headers**: Sets comprehensive browser-like headers (Accept, Accept-Language, etc.)
- **Sec-Fetch Headers**: Includes modern browser security headers
- **Randomization**: Adds randomness to request patterns
- **Site-Specific Headers**: Handles Cloudflare, Vercel, and other CDN-specific headers

## Architecture

```
src/
├── server/
│   ├── proxy-server.ts      # Main proxy server
│   └── subdomain-router.ts  # Subdomain routing logic
├── processing/
│   ├── content-processor.ts # Content processing utilities
│   ├── header-manipulation.ts # Header manipulation logic
│   └── url-rewriter.ts      # URL rewriting utilities
├── utils/
│   └── logger.ts            # Logging utilities
└── injection/               # Client-side injection scripts
```

## Testing

The proxy has been tested with various websites:

- ✅ **Working**: `httpbin.org`, `neverssl.com`
- ❌ **Blocked**: `nouns.world` (CloudFront), `bigshottoyshop.com` (Cloudflare), `example.com` (Akamai)

## Deployment

### Vercel

This project is configured for Vercel deployment with:

- Automatic HTTPS/SSL
- Serverless functions
- Edge network distribution

### Environment Variables

No environment variables are required for basic functionality.

## Development Status

- ✅ **Phase 1**: Basic proxy infrastructure
- ✅ **Phase 1**: URL resolution and path rewriting
- ✅ **Phase 1**: Anti-framing header removal
- ✅ **Phase 1**: CORS configuration
- ✅ **Phase 1**: Bot detection evasion
- 🔄 **Phase 2**: Content processing and injection (planned)
- 🔄 **Phase 2**: Subdomain routing (planned)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
