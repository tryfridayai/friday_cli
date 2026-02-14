---
id: nodejs-development
name: Node.js Development
description: Best practices for Node.js backend development
tags: nodejs, backend, javascript, typescript, api
projectTypes: node, express, fastify, nest, koa
---

# Node.js Development Best Practices

## Project Structure

### Layered Architecture
```
src/
  controllers/    # HTTP request handlers
  services/       # Business logic
  repositories/   # Data access layer
  models/         # Data models/entities
  middleware/     # Express/Fastify middleware
  utils/          # Utility functions
  config/         # Configuration
  types/          # TypeScript types
```

### Feature-Based Structure
```
src/
  features/
    users/
      user.controller.ts
      user.service.ts
      user.repository.ts
      user.model.ts
      user.routes.ts
      user.test.ts
    products/
      ...
  shared/
    middleware/
    utils/
```

## Error Handling

### Custom Error Classes
```javascript
class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

class NotFoundError extends AppError {
  constructor(resource) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}
```

### Global Error Handler
```javascript
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal server error';

  // Log error
  logger.error({ err, req: { method: req.method, url: req.url } });

  res.status(statusCode).json({
    error: {
      message,
      code: err.code,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});
```

### Async Error Wrapper
```javascript
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Usage
router.get('/users', asyncHandler(async (req, res) => {
  const users = await userService.findAll();
  res.json(users);
}));
```

## Input Validation

### Zod Schema Validation
```javascript
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  age: z.number().int().positive().optional(),
});

const validateBody = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    res.status(400).json({ error: error.errors });
  }
};
```

### Joi Validation
```javascript
const Joi = require('joi');

const userSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
});
```

## Database Patterns

### Repository Pattern
```javascript
class UserRepository {
  async findById(id) {
    return db.user.findUnique({ where: { id } });
  }

  async findByEmail(email) {
    return db.user.findUnique({ where: { email } });
  }

  async create(data) {
    return db.user.create({ data });
  }
}
```

### Connection Pooling
```javascript
// PostgreSQL with pg
const { Pool } = require('pg');
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Transaction Handling
```javascript
async function transferFunds(fromId, toId, amount) {
  return db.$transaction(async (tx) => {
    const from = await tx.account.update({
      where: { id: fromId },
      data: { balance: { decrement: amount } },
    });

    if (from.balance < 0) {
      throw new Error('Insufficient funds');
    }

    await tx.account.update({
      where: { id: toId },
      data: { balance: { increment: amount } },
    });
  });
}
```

## Authentication & Authorization

### JWT Best Practices
```javascript
const jwt = require('jsonwebtoken');

function generateTokens(userId) {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
}
```

### Authentication Middleware
```javascript
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedError();

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await userService.findById(payload.userId);
    next();
  } catch (error) {
    next(new UnauthorizedError());
  }
};
```

## Logging

### Structured Logging (Pino)
```javascript
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

// Usage
logger.info({ userId, action: 'login' }, 'User logged in');
logger.error({ err, req }, 'Request failed');
```

### Request Logging
```javascript
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: Date.now() - start
    });
  });
  next();
});
```

## Configuration

### Environment Variables
```javascript
// config.js
const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  database: {
    url: process.env.DATABASE_URL,
    pool: {
      min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
      max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
    }
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  }
};

// Validate required env vars
const required = ['DATABASE_URL', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}
```

## Testing

### Unit Testing
```javascript
describe('UserService', () => {
  let userService;
  let mockUserRepository;

  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
      create: jest.fn(),
    };
    userService = new UserService(mockUserRepository);
  });

  test('findById returns user', async () => {
    const mockUser = { id: '1', name: 'Test' };
    mockUserRepository.findById.mockResolvedValue(mockUser);

    const result = await userService.findById('1');

    expect(result).toEqual(mockUser);
  });
});
```

### Integration Testing
```javascript
const request = require('supertest');
const app = require('../app');

describe('POST /api/users', () => {
  test('creates user with valid data', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({ email: 'test@example.com', name: 'Test' })
      .expect(201);

    expect(response.body.user.email).toBe('test@example.com');
  });
});
```

## Performance

### Caching
```javascript
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

async function getCachedUser(id) {
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);

  const user = await userRepository.findById(id);
  await redis.setex(`user:${id}`, 3600, JSON.stringify(user));
  return user;
}
```

### Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  message: { error: 'Too many requests' }
});

app.use('/api/', limiter);
```

## Security

### Helmet Middleware
```javascript
const helmet = require('helmet');
app.use(helmet());
```

### CORS Configuration
```javascript
const cors = require('cors');
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(','),
  credentials: true,
}));
```

### Input Sanitization
- Never trust user input
- Parameterize database queries
- Validate and sanitize all inputs
- Use prepared statements for SQL
