import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';

export interface SubdomainSession {
  id: string;
  targetDomain: string;
  createdAt: Date;
  lastAccessed: Date;
  cookieMap: Map<string, string>;
}

export class SubdomainRouter {
  private sessions: Map<string, SubdomainSession>;
  private logger: Logger;

  constructor() {
    this.sessions = new Map();
    this.logger = new Logger();
    
    // Clean up expired sessions every hour
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 60 * 1000);
  }

  /**
   * Create a new subdomain session for a target domain
   */
  public createSession(targetDomain: string): SubdomainSession {
    const sessionId = uuidv4();
    const session: SubdomainSession = {
      id: sessionId,
      targetDomain,
      createdAt: new Date(),
      lastAccessed: new Date(),
      cookieMap: new Map(),
    };

    this.sessions.set(sessionId, session);
    this.logger.info(`Created new session ${sessionId} for domain ${targetDomain}`);
    
    return session;
  }

  /**
   * Get session by ID
   */
  public getSession(sessionId: string): SubdomainSession | undefined {
    const session = this.sessions.get(sessionId);
    
    if (session) {
      session.lastAccessed = new Date();
    }
    
    return session;
  }

  /**
   * Generate subdomain for session
   */
  public generateSubdomain(sessionId: string): string {
    // Use first 8 characters of session ID for subdomain
    const subdomainHash = sessionId.substring(0, 8);
    return `proxy-${subdomainHash}`;
  }

  /**
   * Extract session ID from subdomain
   */
  public extractSessionIdFromSubdomain(subdomain: string): string | null {
    // Format: proxy-{hash}
    const match = subdomain.match(/^proxy-([a-f0-9]{8})$/);
    return match ? match[1]! : null;
  }

  /**
   * Map cookie from original domain to proxy domain
   */
  public mapCookie(sessionId: string, originalCookie: string, proxyCookie: string): void {
    const session = this.sessions.get(sessionId);
    
    if (session) {
      session.cookieMap.set(originalCookie, proxyCookie);
      session.lastAccessed = new Date();
    }
  }

  /**
   * Get mapped cookie for original cookie
   */
  public getMappedCookie(sessionId: string, originalCookie: string): string | undefined {
    const session = this.sessions.get(sessionId);
    
    if (session) {
      session.lastAccessed = new Date();
      return session.cookieMap.get(originalCookie);
    }
    
    return undefined;
  }

  /**
   * Get all mapped cookies for a session
   */
  public getAllMappedCookies(sessionId: string): Map<string, string> {
    const session = this.sessions.get(sessionId);
    
    if (session) {
      session.lastAccessed = new Date();
      return new Map(session.cookieMap);
    }
    
    return new Map();
  }

  /**
   * Clean up expired sessions (older than 24 hours)
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    const expiredSessions: string[] = [];
    
    this.sessions.forEach((session, sessionId) => {
      if (now.getTime() - session.lastAccessed.getTime() > maxAge) {
        expiredSessions.push(sessionId);
      }
    });
    
    expiredSessions.forEach(sessionId => {
      this.sessions.delete(sessionId);
      this.logger.info(`Cleaned up expired session ${sessionId}`);
    });
    
    if (expiredSessions.length > 0) {
      this.logger.info(`Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  /**
   * Get session statistics
   */
  public getStats(): {
    totalSessions: number;
    activeSessions: number;
    oldestSession: Date | null;
  } {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    let activeSessions = 0;
    let oldestSession: Date | null = null;
    
    this.sessions.forEach(session => {
      if (now.getTime() - session.lastAccessed.getTime() <= maxAge) {
        activeSessions++;
      }
      
      if (!oldestSession || session.createdAt < oldestSession) {
        oldestSession = session.createdAt;
      }
    });
    
    return {
      totalSessions: this.sessions.size,
      activeSessions,
      oldestSession,
    };
  }
}
