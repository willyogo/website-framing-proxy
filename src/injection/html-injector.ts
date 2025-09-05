/**
 * HTML Injector for Client-Side Processing
 * Injects JavaScript into HTML pages for client-side URL rewriting
 */

import { Logger } from '../utils/logger';

export class HTMLInjector {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Inject client-side processing script into HTML content
   */
  public injectClientProcessor(html: string): string {
    try {
      // Read the client processor script
      const fs = require('fs');
      const path = require('path');
      const scriptPath = path.join(__dirname, 'client-processor.js');
      const clientScript = fs.readFileSync(scriptPath, 'utf8');

      // Create the injection script
      const injectionScript = `
<!-- Website Framing Proxy - Client-Side Processor -->
<script>
${clientScript}
</script>
`;

      // Inject before closing </body> tag, or before closing </head> if no body
      if (html.includes('</body>')) {
        return html.replace('</body>', `${injectionScript}</body>`);
      } else if (html.includes('</head>')) {
        return html.replace('</head>', `${injectionScript}</head>`);
      } else {
        // If no body or head tags, append to the end
        return html + injectionScript;
      }
    } catch (error) {
      this.logger.error('Failed to inject client processor:', error as Record<string, any>);
      return html; // Return original HTML if injection fails
    }
  }

  /**
   * Check if HTML content should be processed
   */
  public shouldProcess(html: string): boolean {
    // Only process if it looks like HTML
    const trimmed = html.trim();
    return trimmed.startsWith('<') || 
           trimmed.includes('<html') || 
           trimmed.includes('<!DOCTYPE');
  }
}
