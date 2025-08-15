# Security Quick Reference Guide

## Overview

This guide provides quick reference for using the security utilities implemented in the DILG Cebu Province website to prevent common vulnerabilities.

## Quick Security Checklist

### ✅ Always Do This
- [ ] Use `SecurityUtils.sanitizeContent()` for all user input
- [ ] Use `SecurityUtils.setElementContent()` instead of `innerHTML`
- [ ] Use `SECURITY_CONFIG` constants instead of magic numbers
- [ ] Validate URLs with `SecurityUtils.isValidUrl()`
- [ ] Use `SecurityUtils.secureStorage` for localStorage/sessionStorage
- [ ] Check file uploads with `SecurityUtils.isValidFile()`

### ❌ Never Do This
- [ ] Don't use `innerHTML` with user content
- [ ] Don't use magic numbers (like `2147483647`)
- [ ] Don't use `eval()` or `Function()` constructor
- [ ] Don't store sensitive data in localStorage without encryption
- [ ] Don't trust user input without validation
- [ ] Don't use `console.log` in production

## Common Security Patterns

### 1. Content Sanitization

**❌ Unsafe:**
```javascript
element.innerHTML = userInput;
```

**✅ Safe:**
```javascript
SecurityUtils.setElementContent(element, userInput, false);
// or for HTML content:
SecurityUtils.setElementContent(element, userInput, true);
```

### 2. URL Validation

**❌ Unsafe:**
```javascript
window.open(userUrl, '_blank');
```

**✅ Safe:**
```javascript
if (SecurityUtils.isValidUrl(userUrl)) {
  window.open(userUrl, '_blank');
}
```

### 3. Secure Storage

**❌ Unsafe:**
```javascript
localStorage.setItem('key', JSON.stringify(data));
```

**✅ Safe:**
```javascript
SecurityUtils.secureStorage.set('key', data, false);
// For session storage:
SecurityUtils.secureStorage.set('key', data, true);
```

### 4. File Upload Validation

**❌ Unsafe:**
```javascript
// No validation
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  // Process file without validation
});
```

**✅ Safe:**
```javascript
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (SecurityUtils.isValidFile(file)) {
    // Process file
  } else {
    alert('Invalid file type or size');
  }
});
```

### 5. Rate Limiting

**❌ Unsafe:**
```javascript
// No rate limiting
function handleRequest() {
  // Process request
}
```

**✅ Safe:**
```javascript
function handleRequest() {
  const clientId = getClientId(); // Get unique client identifier
  if (SecurityUtils.rateLimiter.isAllowed(clientId)) {
    // Process request
  } else {
    // Rate limit exceeded
    return { error: 'Too many requests' };
  }
}
```

## Security Constants Reference

### Z-Index Values
```javascript
SECURITY_CONFIG.MAX_Z_INDEX  // 999999
SECURITY_CONFIG.MIN_Z_INDEX  // 1
```

### Content Limits
```javascript
SECURITY_CONFIG.MAX_INPUT_LENGTH     // 10000 characters
SECURITY_CONFIG.MAX_URL_LENGTH       // 2048 characters
SECURITY_CONFIG.MAX_FILE_SIZE        // 10MB
SECURITY_CONFIG.MAX_FILE_NAME_LENGTH // 255 characters
```

### Timeouts and Retries
```javascript
SECURITY_CONFIG.MAX_RETRIES          // 3
SECURITY_CONFIG.DEFAULT_BACKOFF      // 300ms
SECURITY_CONFIG.SESSION_TIMEOUT      // 30 minutes
SECURITY_CONFIG.CACHE_TTL            // 1 hour
```

### Rate Limiting
```javascript
SECURITY_CONFIG.MAX_REQUESTS_PER_MINUTE // 60
SECURITY_CONFIG.MAX_REQUESTS_PER_HOUR   // 1000
```

## Common Vulnerabilities to Avoid

### 1. XSS (Cross-Site Scripting)

**Vulnerable Code:**
```javascript
// User can inject <script>alert('xss')</script>
document.getElementById('output').innerHTML = userInput;
```

**Secure Code:**
```javascript
SecurityUtils.setElementContent(
  document.getElementById('output'), 
  userInput, 
  false
);
```

### 2. Open Redirects

**Vulnerable Code:**
```javascript
// User can redirect to malicious site
window.location.href = userUrl;
```

**Secure Code:**
```javascript
if (SecurityUtils.isValidUrl(userUrl)) {
  window.location.href = userUrl;
}
```

### 3. Information Disclosure

**Vulnerable Code:**
```javascript
// Sensitive data in console
console.log('User data:', sensitiveData);
```

**Secure Code:**
```javascript
// Use secure logging or remove in production
if (process.env.NODE_ENV === 'development') {
  console.log('User data:', sensitiveData);
}
```

### 4. Insecure Storage

**Vulnerable Code:**
```javascript
// Data can be tampered with
localStorage.setItem('user', JSON.stringify(userData));
```

**Secure Code:**
```javascript
// Data is validated and has integrity checks
SecurityUtils.secureStorage.set('user', userData, false);
```

## Testing Security

### XSS Testing
```javascript
// Test these payloads in input fields:
'<script>alert("xss")</script>'
'<img src=x onerror=alert("xss")>'
'javascript:alert("xss")'
```

### File Upload Testing
```javascript
// Test with these files:
- .exe files (should be rejected)
- Files > 10MB (should be rejected)
- Files with special characters in name
```

### URL Validation Testing
```javascript
// Test these URLs:
'javascript:alert("xss")'
'data:text/html,<script>alert("xss")</script>'
'file:///etc/passwd'
```

## Emergency Security Contacts

If you discover a security vulnerability:

1. **Immediate Action:** Don't commit the vulnerable code
2. **Report:** Contact the security team immediately
3. **Document:** Document the issue and potential impact
4. **Fix:** Use the security utilities provided in this guide
5. **Test:** Verify the fix prevents the vulnerability

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [Input Validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)

---

**Remember:** Security is everyone's responsibility. When in doubt, use the security utilities provided!
