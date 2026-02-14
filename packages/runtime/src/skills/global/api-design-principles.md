---
id: api-design-principles
name: API Design Principles
type: internal
description: RESTful API design principles and best practices
tags: backend, api, rest, design
---

# API Design Principles

## RESTful Design

### Resource-Oriented Design

**Resources are nouns, not verbs**:
- Good: `/users`, `/orders`, `/products`
- Bad: `/getUsers`, `/createOrder`, `/deleteProduct`

**Use plural nouns**:
- Good: `/users`, `/articles`, `/comments`
- Consistent: Always plural, even for single item (`/users/123`)

**Hierarchy for relationships**:
- `/users/123/orders` - Orders belonging to user 123
- `/orders/456/items` - Items in order 456
- Keep depth shallow (2-3 levels max)

### HTTP Methods

| Method | Purpose | Idempotent | Safe |
|--------|---------|------------|------|
| GET | Retrieve resource(s) | Yes | Yes |
| POST | Create new resource | No | No |
| PUT | Replace entire resource | Yes | No |
| PATCH | Partial update | Yes | No |
| DELETE | Remove resource | Yes | No |

**Idempotent**: Same request = same result
**Safe**: No side effects (read-only)

### Status Codes

**Success (2xx)**:
- `200 OK` - Request succeeded
- `201 Created` - Resource created (return resource + Location header)
- `204 No Content` - Success with no body (DELETE)

**Client Errors (4xx)**:
- `400 Bad Request` - Invalid request body/params
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Authenticated but not authorized
- `404 Not Found` - Resource doesn't exist
- `409 Conflict` - State conflict (duplicate, version mismatch)
- `422 Unprocessable Entity` - Valid syntax, invalid semantics
- `429 Too Many Requests` - Rate limited

**Server Errors (5xx)**:
- `500 Internal Server Error` - Unexpected error
- `502 Bad Gateway` - Upstream error
- `503 Service Unavailable` - Temporarily down

## Response Design

### Consistent Structure

**Success Response**:
```json
{
  "data": {
    "id": "123",
    "type": "user",
    "attributes": { ... }
  },
  "meta": {
    "requestId": "req_abc",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

**Collection Response**:
```json
{
  "data": [ ... ],
  "meta": {
    "total": 100,
    "page": 1,
    "perPage": 20,
    "totalPages": 5
  },
  "links": {
    "self": "/users?page=1",
    "next": "/users?page=2",
    "last": "/users?page=5"
  }
}
```

**Error Response**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "code": "INVALID_FORMAT",
        "message": "Must be a valid email address"
      }
    ]
  },
  "meta": {
    "requestId": "req_abc",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### Error Response Guidelines
- Use consistent error codes (machine-readable)
- Human-readable messages
- Include field-level errors for validation
- Include request ID for debugging
- Don't expose internal implementation details

## Pagination

### Offset-Based
```
GET /users?page=2&perPage=20
GET /users?offset=20&limit=20
```
- Simple to implement
- Can miss/duplicate items if data changes

### Cursor-Based
```
GET /users?cursor=eyJpZCI6MTIzfQ&limit=20
```
- More efficient for large datasets
- No duplicates/misses
- Can't jump to arbitrary page

### Response Metadata
Always include:
- Total count (if feasible)
- Current page/cursor
- Next page/cursor
- Links for navigation

## Filtering, Sorting, & Searching

### Filtering
```
GET /users?status=active
GET /orders?created_after=2024-01-01&total_gte=100
GET /products?category=electronics&in_stock=true
```

**Operators**:
- Equality: `status=active`
- Comparison: `total_gte=100`, `created_lte=2024-01-01`
- Multiple values: `status=active,pending` or `status[]=active&status[]=pending`

### Sorting
```
GET /users?sort=created_at        # Ascending
GET /users?sort=-created_at       # Descending
GET /users?sort=status,-created_at  # Multiple fields
```

### Searching
```
GET /users?search=john
GET /users?q=john&search_fields=name,email
```

## Versioning

### URI Versioning
```
/v1/users
/v2/users
```
- Most visible and explicit
- Easy to test different versions
- Recommended for most cases

### Header Versioning
```
Accept: application/vnd.myapi.v2+json
```
- Cleaner URIs
- More complex to implement and test

### Versioning Guidelines
- Version from day one
- Support N-1 version minimum
- Deprecate before removing
- Document migration paths

## Request/Response Best Practices

### Accept Partial Updates
- Use PATCH for partial updates
- Don't require all fields
- Only update provided fields

### Return Created/Updated Resource
- POST → Return created resource with 201
- PUT/PATCH → Return updated resource with 200
- Include Location header for new resources

### Use Consistent Naming
- snake_case or camelCase (pick one, be consistent)
- Clear, descriptive names
- Avoid abbreviations

### Timestamps
- Use ISO 8601 format: `2024-01-15T10:30:00Z`
- Always include timezone (prefer UTC)
- Use consistent naming: `created_at`, `updated_at`

## Authentication & Authorization

### Authentication Methods
- **API Keys**: Simple, for server-to-server
- **JWT**: Stateless, contains claims
- **OAuth 2.0**: Third-party access, user consent

### Authorization Patterns
- Check permissions on every request
- Return 403 (not 404) for unauthorized but existing resources
- Document required permissions per endpoint

## Rate Limiting

### Response Headers
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1484495718
Retry-After: 60
```

### Guidelines
- Return 429 when exceeded
- Include retry information
- Consider different limits per endpoint
- Document limits clearly

## Documentation

### Essential Elements
- Authentication instructions
- All endpoints with methods
- Request/response examples
- Error codes and meanings
- Rate limits
- Versioning policy

### OpenAPI/Swagger
- Machine-readable specification
- Auto-generate documentation
- Enable client SDK generation
- Keep in sync with implementation

## Design Checklist

- [ ] Resources are nouns, methods are HTTP verbs
- [ ] Consistent response structure
- [ ] Meaningful status codes
- [ ] Pagination for collections
- [ ] Filtering and sorting
- [ ] Versioning strategy
- [ ] Authentication documented
- [ ] Rate limiting implemented
- [ ] Errors include actionable details
- [ ] Documentation is complete
