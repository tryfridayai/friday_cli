---
id: backend-security
name: Backend Security
type: internal
description: Security principles and practices for backend applications
tags: backend, security, authentication, owasp
---

# Backend Security Principles

## Authentication

### Password Security

**Storage**:
- Never store plaintext passwords
- Use adaptive hashing: bcrypt, Argon2, scrypt
- Salt is typically included in hash output
- Use library defaults (they're tuned for security)

**Requirements**:
- Minimum 8 characters (12+ recommended)
- No maximum length (or very high: 128+)
- Check against common password lists
- Don't require arbitrary complexity rules

**Password Reset**:
- Send reset link, not password
- Token expires quickly (1 hour max)
- Single use tokens
- Invalidate on password change

### Session Management

**Session Security**:
- Regenerate session ID on login
- Set appropriate expiration
- Invalidate on logout
- Secure, HttpOnly, SameSite cookies

**Cookie Attributes**:
```
Set-Cookie: session=abc123;
  HttpOnly;      // Not accessible via JavaScript
  Secure;        // HTTPS only
  SameSite=Lax;  // CSRF protection
  Path=/;
  Max-Age=3600
```

### JWT Best Practices

**Token Security**:
- Short expiration (15 min - 1 hour)
- Use refresh tokens for longer sessions
- Sign with strong algorithm (RS256 or ES256)
- Validate all claims
- Store secret securely (not in code)

**What NOT to put in JWT**:
- Sensitive data (SSN, credit cards)
- Passwords or hashes
- More data than necessary

**Refresh Token Pattern**:
- Access token: Short-lived, for API access
- Refresh token: Long-lived, stored securely, for getting new access token

## Authorization

### Principle of Least Privilege

Users should have minimum permissions needed:
- Default deny, explicit allow
- Role-based access control (RBAC)
- Check permissions on every request
- Verify object ownership

### Authorization Checks

**Always verify**:
1. User is authenticated
2. User has permission for action
3. User owns/can access the resource
4. Action is valid for resource state

**Example**:
```
// Bad: Only checks if logged in
if (user) { deletePost(postId) }

// Good: Checks ownership
if (user && post.authorId === user.id) { deletePost(postId) }

// Best: Also checks role permissions
if (user && (post.authorId === user.id || user.role === 'admin')) {
  deletePost(postId)
}
```

### Common Mistakes

**Insecure Direct Object Reference (IDOR)**:
```
// Bad: Uses user-provided ID directly
GET /api/invoices/12345

// Good: Verify user can access this invoice
const invoice = await Invoice.findById(id);
if (invoice.userId !== currentUser.id) {
  throw new ForbiddenError();
}
```

## Input Validation

### Validation Principles

1. **Validate all input**: Query params, body, headers, cookies
2. **Whitelist over blacklist**: Define what's allowed, reject rest
3. **Validate on server**: Never trust client validation
4. **Fail closed**: Invalid input = reject, don't try to fix

### Common Validations

**String**:
- Maximum length
- Allowed characters (whitelist)
- Format (email, URL, phone)

**Number**:
- Range (min/max)
- Integer vs float
- Positive/negative

**Array**:
- Maximum length
- Item validation

**Object**:
- Required fields
- No unexpected fields
- Nested validation

### Sanitization vs Validation

**Validation**: Is this input acceptable?
- Reject if not valid
- Don't modify

**Sanitization**: Make input safe for specific use
- Escape HTML for display
- Parameterize for SQL
- Apply after validation

## SQL Injection Prevention

### Use Parameterized Queries

**Vulnerable**:
```sql
query = "SELECT * FROM users WHERE email = '" + email + "'"
// email = "'; DROP TABLE users; --"
```

**Safe**:
```sql
query = "SELECT * FROM users WHERE email = $1"
params = [email]
```

### ORM Safety

Most ORMs parameterize automatically:
```javascript
// Safe
User.findOne({ where: { email: userInput } })

// Potentially unsafe (raw query)
sequelize.query(`SELECT * FROM users WHERE email = '${userInput}'`)
```

**Rule**: Never concatenate user input into queries

## XSS Prevention

### Output Encoding

Encode data for the output context:
- **HTML**: `&lt;` for `<`, `&amp;` for `&`
- **JavaScript**: JSON encoding
- **URL**: URL encoding
- **CSS**: CSS encoding

### Content Security Policy (CSP)

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-abc123';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
```

### HttpOnly Cookies

Prevent JavaScript access to sensitive cookies:
```
Set-Cookie: session=abc; HttpOnly
```

## CSRF Prevention

### SameSite Cookies

```
Set-Cookie: session=abc; SameSite=Lax
```

- `Strict`: Cookie sent only to same site
- `Lax`: Cookie sent for top-level navigations
- `None`: Always sent (requires Secure)

### CSRF Tokens

For forms and non-GET requests:
1. Generate random token
2. Store in session
3. Include in form/request
4. Validate on server

### Additional Headers

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
```

## Secrets Management

### Never in Code

**Bad**:
```javascript
const API_KEY = "sk_live_abc123..."
```

**Good**:
```javascript
const API_KEY = process.env.API_KEY
```

### Secret Storage

- Environment variables for simple cases
- Secret managers (AWS Secrets Manager, HashiCorp Vault)
- Encrypted configuration
- Never in version control

### Rotation

- Rotate secrets regularly
- Support multiple active secrets during rotation
- Automate rotation when possible

## Rate Limiting

### Implementation

```javascript
// Per IP
rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
})

// Per user
rateLimit({
  keyGenerator: (req) => req.user.id,
  windowMs: 60 * 1000,
  max: 30
})
```

### Different Limits

- Login attempts: Very strict (5/minute)
- API endpoints: Moderate (100/minute)
- Static resources: Lenient

## Logging & Monitoring

### What to Log

**Security Events**:
- Authentication attempts (success/failure)
- Authorization failures
- Input validation failures
- Rate limit hits
- Admin actions

**Include**:
- Timestamp
- User ID (if known)
- IP address
- Action attempted
- Resource accessed
- Result

**Exclude**:
- Passwords
- API keys
- Personal data (or hash/mask)

### Monitoring

- Alert on unusual patterns
- Multiple failed logins
- Rate limit spikes
- Error rate increases
- Off-hours access

## Security Checklist

- [ ] Passwords hashed with bcrypt/Argon2
- [ ] Sessions are secure (HttpOnly, Secure, SameSite)
- [ ] JWT tokens are short-lived with refresh
- [ ] Authorization checked on every request
- [ ] All input validated
- [ ] Parameterized queries (no SQL injection)
- [ ] Output encoded (no XSS)
- [ ] CSRF protection enabled
- [ ] Secrets not in code
- [ ] Rate limiting implemented
- [ ] Security events logged
- [ ] HTTPS enforced
- [ ] Security headers set
