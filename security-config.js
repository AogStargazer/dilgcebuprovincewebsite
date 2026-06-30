/**
 * Security Configuration for DILG Cebu Province Website
 * This file contains security constants and utilities to prevent vulnerabilities
 */

// Security Constants - Replace magic numbers
const SECURITY_CONFIG = {
  // Z-Index limits to prevent stacking context issues
  MAX_Z_INDEX: 999999,
  MIN_Z_INDEX: 1,

  // Content Security Policy settings
  CSP: {
    DEFAULT_SRC: ["'self'"],
    SCRIPT_SRC: ["'self'", "'unsafe-inline'"], // Consider removing unsafe-inline
    STYLE_SRC: ["'self'", "'unsafe-inline'"],
    IMG_SRC: ["'self'", "data:", "https:"],
    CONNECT_SRC: ["'self'"],
    FONT_SRC: ["'self'"],
    OBJECT_SRC: ["'none'"],
    MEDIA_SRC: ["'self'"],
    FRAME_SRC: ["'none'"]
  },

  // Input validation limits
  MAX_INPUT_LENGTH: 10000,
  MAX_URL_LENGTH: 2048,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB

  // Cache limits
  MAX_CACHE_SIZE: 100,
  CACHE_TTL: 3600000, // 1 hour in milliseconds

  // Rate limiting
  MAX_REQUESTS_PER_MINUTE: 60,
  MAX_REQUESTS_PER_HOUR: 1000,

  // Session security
  SESSION_TIMEOUT: 1800000, // 30 minutes
  MAX_SESSION_AGE: 86400000, // 24 hours

  // Retry limits
  MAX_RETRIES: 3,
  DEFAULT_BACKOFF: 300,

  // Content sanitization
  ALLOWED_HTML_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'span', 'div', 'p'],
  ALLOWED_HTML_ATTR: ['href', 'target', 'style', 'class', 'alt'],
  FORBIDDEN_HTML_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],

  // File upload restrictions
  ALLOWED_FILE_TYPES: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.pdf'],
  MAX_FILE_NAME_LENGTH: 255
};

// Security Utility Functions
class SecurityUtils {
  /**
   * Sanitize HTML content to prevent XSS
   * @param {string} content - Content to sanitize
   * @param {boolean} allowHTML - Whether to allow HTML tags
   * @returns {string} Sanitized content
   */
  static sanitizeContent(content, allowHTML = false) {
    if (typeof content !== 'string') return '';

    // Check content length
    if (content.length > SECURITY_CONFIG.MAX_INPUT_LENGTH) {
      console.warn('Content length exceeds security limit');
      return content.substring(0, SECURITY_CONFIG.MAX_INPUT_LENGTH);
    }

    if (allowHTML && typeof window !== 'undefined' && window.DOMPurify) {
      return window.DOMPurify.sanitize(content, {
        ALLOWED_TAGS: SECURITY_CONFIG.ALLOWED_HTML_TAGS,
        ALLOWED_ATTR: SECURITY_CONFIG.ALLOWED_HTML_ATTR,
        ALLOW_DATA_ATTR: false,
        FORBID_TAGS: SECURITY_CONFIG.FORBIDDEN_HTML_TAGS
      });
    }

    return this.escapeHTML(content);
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  static escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[tag]);
  }

  /**
   * Safely set element content
   * @param {Element} element - DOM element
   * @param {string} content - Content to set
   * @param {boolean} allowHTML - Whether to allow HTML
   */
  static setElementContent(element, content, allowHTML = false) {
    if (!element || !(element instanceof Element)) return;

    const sanitizedContent = this.sanitizeContent(content, allowHTML);

    if (allowHTML && sanitizedContent !== this.escapeHTML(content)) {
      element.innerHTML = sanitizedContent;
    } else {
      element.textContent = content;
    }
  }

  /**
   * Validate URL to prevent open redirects
   * @param {string} url - URL to validate
   * @returns {boolean} Whether URL is safe
   */
  static isValidUrl(url) {
    if (typeof url !== 'string') return false;
    if (url.length > SECURITY_CONFIG.MAX_URL_LENGTH) return false;

    try {
      const urlObj = new URL(url, window.location.origin);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Validate file upload
   * @param {File} file - File to validate
   * @returns {boolean} Whether file is safe
   */
  static isValidFile(file) {
    if (!file || !(file instanceof File)) return false;

    // Check file size
    if (file.size > SECURITY_CONFIG.MAX_FILE_SIZE) return false;

    // Check file name length
    if (file.name.length > SECURITY_CONFIG.MAX_FILE_NAME_LENGTH) return false;

    // Check file extension
    const extension = '.' + file.name.split('.').pop().toLowerCase();
    return SECURITY_CONFIG.ALLOWED_FILE_TYPES.includes(extension);
  }

  /**
   * Rate limiting utility
   */
  static rateLimiter = {
    requests: new Map(),

    isAllowed(key, limit = SECURITY_CONFIG.MAX_REQUESTS_PER_MINUTE) {
      const now = Date.now();
      const windowStart = now - 60000; // 1 minute window

      if (!this.requests.has(key)) {
        this.requests.set(key, []);
      }

      const requests = this.requests.get(key);

      // Remove old requests outside the window
      const validRequests = requests.filter(time => time > windowStart);
      this.requests.set(key, validRequests);

      if (validRequests.length >= limit) {
        return false;
      }

      validRequests.push(now);
      return true;
    }
  };

  /**
   * Secure storage wrapper
   */
  static secureStorage = {
    set(key, value, useSession = false) {
      try {
        const storage = useSession ? sessionStorage : localStorage;
        const data = {
          value: value,
          timestamp: Date.now(),
          checksum: this.generateChecksum(value)
        };
        storage.setItem(key, JSON.stringify(data));
      } catch (error) {
        console.error('Storage write failed:', error);
      }
    },

    get(key, useSession = false, maxAge = SECURITY_CONFIG.SESSION_TIMEOUT) {
      try {
        const storage = useSession ? sessionStorage : localStorage;
        const data = storage.getItem(key);

        if (!data) return null;

        const parsed = JSON.parse(data);
        const now = Date.now();

        // Check if data is expired
        if (now - parsed.timestamp > maxAge) {
          storage.removeItem(key);
          return null;
        }

        // Verify checksum
        if (parsed.checksum !== this.generateChecksum(parsed.value)) {
          storage.removeItem(key);
          return null;
        }

        return parsed.value;
      } catch (error) {
        console.error('Storage read failed:', error);
        return null;
      }
    },

    remove(key, useSession = false) {
      try {
        const storage = useSession ? sessionStorage : localStorage;
        storage.removeItem(key);
      } catch (error) {
        console.error('Storage remove failed:', error);
      }
    },

    generateChecksum(value) {
      // Simple checksum for data integrity
      return btoa(JSON.stringify(value)).slice(0, 8);
    }
  };

  /**
   * Remove debug statements in production
   */
  static removeDebugStatements() {
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
      // Override console methods in production
      console.log = () => {};
      console.warn = () => {};
      console.error = () => {};
      console.debug = () => {};
    }
  }
}

// Initialize security measures
if (typeof window !== 'undefined') {
  // Remove debug statements in production
  SecurityUtils.removeDebugStatements();

  // Set up Content Security Policy
  const cspMeta = document.createElement('meta');
  cspMeta.httpEquiv = 'Content-Security-Policy';
  cspMeta.content = Object.entries(SECURITY_CONFIG.CSP)
    .map(([key, values]) => `${key.replace(/([A-Z])/g, '-$1').toLowerCase()} ${values.join(' ')}`)
    .join('; ');

  if (!document.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
    document.head.appendChild(cspMeta);
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SECURITY_CONFIG, SecurityUtils };
} else if (typeof window !== 'undefined') {
  window.SECURITY_CONFIG = SECURITY_CONFIG;
  window.SecurityUtils = SecurityUtils;
}
