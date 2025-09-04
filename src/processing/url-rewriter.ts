import { Logger } from '../utils/logger';

export interface RewriteContext {
  originalUrl: string;
  proxyBaseUrl: string;
  targetDomain: string;
  targetPath: string;
}

export class UrlRewriter {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Rewrite URLs in HTML content to go through the proxy
   */
  rewriteHtmlContent(html: string, context: RewriteContext): string {
    this.logger.debug('Rewriting HTML content', { 
      originalUrl: context.originalUrl,
      targetDomain: context.targetDomain 
    });

    try {
      // Rewrite various types of URLs in HTML
      let rewrittenHtml = html;

      // 1. Rewrite <base> tag href
      rewrittenHtml = this.rewriteBaseTag(rewrittenHtml, context);

      // 2. Rewrite <link> tags (CSS, icons, etc.)
      rewrittenHtml = this.rewriteLinkTags(rewrittenHtml, context);

      // 3. Rewrite <script> tags
      rewrittenHtml = this.rewriteScriptTags(rewrittenHtml, context);

      // 4. Rewrite <img> tags
      rewrittenHtml = this.rewriteImageTags(rewrittenHtml, context);

      // 5. Rewrite <iframe> tags
      rewrittenHtml = this.rewriteIframeTags(rewrittenHtml, context);

      // 6. Rewrite <form> action attributes
      rewrittenHtml = this.rewriteFormActions(rewrittenHtml, context);

      // 7. Rewrite <a> href attributes
      rewrittenHtml = this.rewriteAnchorTags(rewrittenHtml, context);

      // 8. Rewrite CSS url() references
      rewrittenHtml = this.rewriteCssUrls(rewrittenHtml, context);

      // 9. Rewrite inline JavaScript URLs
      rewrittenHtml = this.rewriteInlineJsUrls(rewrittenHtml, context);

      this.logger.debug('HTML content rewritten successfully');
      return rewrittenHtml;

    } catch (error) {
      this.logger.error('Error rewriting HTML content', { error });
      return html; // Return original HTML if rewriting fails
    }
  }

  /**
   * Rewrite a single URL to go through the proxy
   */
  rewriteUrl(url: string, context: RewriteContext): string {
    if (!url || url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('#')) {
      return url; // Don't rewrite data URLs, javascript URLs, or hash fragments
    }

    try {
      // Handle relative URLs
      if (url.startsWith('/')) {
        return `${context.proxyBaseUrl}/proxy/${context.targetDomain}${url}`;
      }

      // Handle protocol-relative URLs (//example.com)
      if (url.startsWith('//')) {
        const domain = url.substring(2).split('/')[0];
        if (!domain) return url;
        const path = url.substring(2 + domain.length);
        return `${context.proxyBaseUrl}/proxy/${domain}${path}`;
      }

      // Handle absolute URLs
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const urlObj = new URL(url);
        const path = urlObj.pathname + urlObj.search + urlObj.hash;
        return `${context.proxyBaseUrl}/proxy/${urlObj.hostname}${path}`;
      }

      // Handle relative URLs without leading slash (relative to current path)
      if (!url.startsWith('http') && !url.startsWith('/')) {
        const basePath = context.targetPath.endsWith('/') ? context.targetPath : context.targetPath + '/';
        return `${context.proxyBaseUrl}/proxy/${context.targetDomain}${basePath}${url}`;
      }

      return url;
    } catch (error) {
      this.logger.warn('Error rewriting URL', { url, error });
      return url;
    }
  }

  private rewriteBaseTag(html: string, context: RewriteContext): string {
    return html.replace(
      /<base\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi,
      (match, href) => {
        const rewrittenHref = this.rewriteUrl(href, context);
        return match.replace(href, rewrittenHref);
      }
    );
  }

  private rewriteLinkTags(html: string, context: RewriteContext): string {
    return html.replace(
      /<link\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi,
      (match, href) => {
        const rewrittenHref = this.rewriteUrl(href, context);
        return match.replace(href, rewrittenHref);
      }
    );
  }

  private rewriteScriptTags(html: string, context: RewriteContext): string {
    return html.replace(
      /<script\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi,
      (match, src) => {
        const rewrittenSrc = this.rewriteUrl(src, context);
        return match.replace(src, rewrittenSrc);
      }
    );
  }

  private rewriteImageTags(html: string, context: RewriteContext): string {
    return html.replace(
      /<img\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi,
      (match, src) => {
        const rewrittenSrc = this.rewriteUrl(src, context);
        return match.replace(src, rewrittenSrc);
      }
    );
  }

  private rewriteIframeTags(html: string, context: RewriteContext): string {
    return html.replace(
      /<iframe\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi,
      (match, src) => {
        const rewrittenSrc = this.rewriteUrl(src, context);
        return match.replace(src, rewrittenSrc);
      }
    );
  }

  private rewriteFormActions(html: string, context: RewriteContext): string {
    return html.replace(
      /<form\s+[^>]*action\s*=\s*["']([^"']+)["'][^>]*>/gi,
      (match, action) => {
        const rewrittenAction = this.rewriteUrl(action, context);
        return match.replace(action, rewrittenAction);
      }
    );
  }

  private rewriteAnchorTags(html: string, context: RewriteContext): string {
    return html.replace(
      /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi,
      (match, href) => {
        const rewrittenHref = this.rewriteUrl(href, context);
        return match.replace(href, rewrittenHref);
      }
    );
  }

  private rewriteCssUrls(html: string, context: RewriteContext): string {
    return html.replace(
      /url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi,
      (match, url) => {
        const rewrittenUrl = this.rewriteUrl(url, context);
        return match.replace(url, rewrittenUrl);
      }
    );
  }

  private rewriteInlineJsUrls(html: string, context: RewriteContext): string {
    // This is a basic implementation - more sophisticated JS parsing could be added
    return html.replace(
      /(?:fetch|XMLHttpRequest|axios|jQuery\.ajax)\s*\(\s*["']([^"']+)["']/gi,
      (match, url) => {
        const rewrittenUrl = this.rewriteUrl(url, context);
        return match.replace(url, rewrittenUrl);
      }
    );
  }
}
