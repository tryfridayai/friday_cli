---
id: backend-development-expertise
name: Backend Development Expertise
type: internal
description: Comprehensive backend development knowledge including API design, database architecture, security, and system design
version: 1.0.0
tags:
  - backend
  - development
  - api
  - database
  - security
  - system-design
---

# Backend Development Expertise

Apply this knowledge when helping users build server-side applications, design APIs, work with databases, or implement security.

## Core Competencies

### API Design
- **RESTful Principles**: Resources, HTTP methods, status codes, HATEOAS
- **API Versioning**: URL versioning, header versioning, deprecation strategies
- **Request/Response Design**: Consistent structure, pagination, filtering, sorting
- **Documentation**: OpenAPI/Swagger, clear examples, error documentation

### Database Architecture
- **Schema Design**: Normalization, denormalization trade-offs, indexing strategies
- **Query Optimization**: Explain plans, N+1 problems, efficient joins
- **Data Integrity**: Constraints, transactions, ACID properties
- **Migration Strategies**: Version control, rollback plans, zero-downtime migrations

### Security
- **Authentication**: Session-based, JWT, OAuth 2.0, API keys
- **Authorization**: Role-based (RBAC), attribute-based (ABAC), resource ownership
- **Input Validation**: Sanitization, type coercion, whitelist validation
- **Common Vulnerabilities**: SQL injection, XSS, CSRF, IDOR, rate limiting

### System Design
- **Scalability Patterns**: Horizontal vs. vertical scaling, statelessness
- **Caching Strategies**: Cache invalidation, cache-aside, write-through
- **Background Processing**: Job queues, scheduled tasks, event-driven
- **Observability**: Logging, metrics, tracing, health checks

### Error Handling & Reliability
- **Graceful Degradation**: Circuit breakers, fallbacks, retry logic
- **Error Responses**: Consistent format, actionable messages, error codes
- **Validation Errors**: Field-level errors, multiple errors at once
- **Logging**: Structured logging, appropriate levels, sensitive data handling

## Development Principles

### Code Quality
1. **Single Responsibility**: Each function/class does one thing well
2. **Dependency Injection**: Loose coupling, testability
3. **Fail Fast**: Validate inputs early, return errors immediately
4. **Idempotency**: Safe to retry operations, especially for payments/critical actions
5. **Defensive Programming**: Assume inputs are malicious, validate everything

### API Guidelines
1. **Consistent Naming**: Plural nouns for resources, lowercase, hyphens for multi-word
2. **Proper HTTP Methods**: GET (read), POST (create), PUT/PATCH (update), DELETE (remove)
3. **Meaningful Status Codes**: 200/201 success, 400 client error, 500 server error
4. **Versioning from Day One**: Plan for breaking changes
5. **Rate Limiting**: Protect resources, provide clear headers

### Database Guidelines
1. **Normalize by Default**: Denormalize only for proven performance needs
2. **Index Strategically**: Index query patterns, not just columns
3. **Use Transactions**: Group related operations, handle failures atomically
4. **Soft Delete When Appropriate**: Preserve data for audit/recovery
5. **Never Trust User Input**: Use parameterized queries always

### Security Guidelines
1. **Authentication != Authorization**: Verify identity AND permissions
2. **Principle of Least Privilege**: Grant minimum necessary access
3. **Defense in Depth**: Multiple layers of security
4. **Secure Defaults**: Deny by default, require explicit allows
5. **Audit Everything**: Log security-relevant events

## Development Workflow

### 1. Understand Requirements
- What data entities are involved?
- What operations are needed?
- Who needs access and with what permissions?
- What are the performance requirements?

### 2. Design the API
- Define resources and their relationships
- Specify endpoints and methods
- Design request/response schemas
- Plan error responses

### 3. Implement with Tests
- Start with data layer (models, migrations)
- Implement business logic with unit tests
- Build API layer with integration tests
- Add authentication/authorization

### 4. Secure & Harden
- Validate all inputs
- Implement rate limiting
- Add proper error handling
- Review for common vulnerabilities

## API Response Patterns

### Success Response
```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req_123"
  }
}
```

### Collection Response
```json
{
  "data": [ ... ],
  "meta": {
    "total": 100,
    "page": 1,
    "perPage": 20,
    "totalPages": 5
  }
}
```

### Error Response
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ]
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req_123"
  }
}
```

## Common Patterns

### Request Validation
- Validate types, formats, and constraints
- Return all validation errors at once
- Provide specific, actionable error messages
- Distinguish between missing and invalid

### Authentication Flow
- Secure token generation and storage
- Proper password hashing (bcrypt, argon2)
- Token expiration and refresh
- Secure cookie handling (httpOnly, secure, sameSite)

### Database Operations
- Use ORMs/query builders for safety
- Implement soft deletes for important data
- Use database transactions for related operations
- Handle concurrent updates (optimistic/pessimistic locking)

### Error Handling
- Catch errors at appropriate levels
- Transform internal errors to user-friendly messages
- Log full details server-side, sanitize for client
- Include request IDs for debugging

## Performance Considerations

1. **Database**: Use indexes, avoid N+1, cache when appropriate
2. **Network**: Minimize payload size, use compression
3. **Concurrency**: Use async/await, connection pooling
4. **Caching**: Cache expensive operations, invalidate correctly
5. **Background Jobs**: Move slow operations out of request cycle

## What NOT to Do

- Don't expose sensitive data in responses (passwords, internal IDs without need)
- Don't trust client-side validation alone
- Don't store secrets in code or version control
- Don't catch errors and silently swallow them
- Don't use raw SQL with string concatenation
- Don't skip authentication checks on "internal" endpoints

## Communication Approach

- Explain security implications of decisions
- Point out potential scalability concerns
- Provide complete, working code examples
- Discuss trade-offs between approaches
- Ask about existing patterns and conventions
