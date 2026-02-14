---
id: database-patterns
name: Database Patterns
type: internal
description: Database design, query optimization, and data management patterns
tags: backend, database, sql, data
---

# Database Patterns

## Schema Design

### Normalization Principles

**First Normal Form (1NF)**:
- No repeating groups
- Each cell contains single value
- Each record is unique

**Second Normal Form (2NF)**:
- 1NF + all non-key attributes depend on entire primary key
- No partial dependencies

**Third Normal Form (3NF)**:
- 2NF + no transitive dependencies
- Non-key attributes depend only on primary key

### When to Denormalize

**Consider denormalization when**:
- Read performance is critical
- Data rarely changes
- Complex joins hurt performance
- Reporting/analytics queries

**Denormalization techniques**:
- Calculated/derived columns
- Duplicated data across tables
- Summary/aggregate tables
- Materialized views

### Primary Keys

**Natural Keys**: Meaningful business data (email, SKU)
- Pro: Readable, no extra lookup
- Con: Can change, may be large

**Surrogate Keys**: System-generated (auto-increment, UUID)
- Pro: Stable, compact, no business meaning
- Con: Extra join for meaningful data

**Best Practice**: Use surrogate keys, add unique constraint on natural key

### UUID vs Auto-Increment

**UUID**:
- Globally unique
- No coordination needed (distributed systems)
- Harder to guess (security)
- Larger storage, worse for indexing

**Auto-Increment**:
- Compact, efficient indexing
- Reveals record count
- Coordination needed for distributed
- Better for most single-database apps

## Indexing

### Index Types

**B-Tree (default)**: Most queries, range scans, ordering
**Hash**: Exact match only, very fast
**GIN**: Full-text search, arrays, JSON
**GiST**: Geometric, geographic data

### Indexing Guidelines

**DO index**:
- Primary keys (automatic)
- Foreign keys
- Frequently filtered columns
- Columns in WHERE clauses
- Columns in JOIN conditions
- Columns in ORDER BY

**DON'T index**:
- Columns rarely used in queries
- Columns with low cardinality (few unique values)
- Small tables
- Frequently updated columns (index maintenance cost)

### Composite Indexes

Order matters! Index on `(a, b, c)` helps:
- Queries filtering on `a`
- Queries filtering on `a` and `b`
- Queries filtering on `a`, `b`, and `c`

Does NOT help:
- Queries filtering only on `b` or `c`
- Queries filtering on `b` and `c`

### Index Analysis

```sql
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'test@example.com';
```

Look for:
- Seq Scan (full table scan) → Consider index
- Index Scan → Good
- Rows estimated vs actual → Statistics accuracy

## Query Optimization

### N+1 Problem

**Problem**: Fetching related data in loop
```
users = SELECT * FROM users
for user in users:
  orders = SELECT * FROM orders WHERE user_id = user.id  # N queries!
```

**Solution**: Eager loading / JOIN
```sql
SELECT users.*, orders.*
FROM users
LEFT JOIN orders ON orders.user_id = users.id
```

### Query Tips

**Use specific columns, not SELECT ***:
```sql
-- Good
SELECT id, name, email FROM users

-- Avoid
SELECT * FROM users
```

**Limit results**:
```sql
SELECT * FROM logs ORDER BY created_at DESC LIMIT 100
```

**Use EXISTS instead of COUNT for existence**:
```sql
-- Good
SELECT EXISTS(SELECT 1 FROM orders WHERE user_id = 123)

-- Slower
SELECT COUNT(*) > 0 FROM orders WHERE user_id = 123
```

**Avoid functions on indexed columns in WHERE**:
```sql
-- Can't use index
WHERE YEAR(created_at) = 2024

-- Can use index
WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01'
```

## Transactions

### ACID Properties

**Atomicity**: All or nothing
**Consistency**: Valid state to valid state
**Isolation**: Concurrent transactions don't interfere
**Durability**: Committed = permanent

### Isolation Levels

| Level | Dirty Read | Non-Repeatable | Phantom |
|-------|------------|----------------|---------|
| Read Uncommitted | Yes | Yes | Yes |
| Read Committed | No | Yes | Yes |
| Repeatable Read | No | No | Yes |
| Serializable | No | No | No |

**Default (Read Committed)** is usually fine. Use higher isolation for:
- Financial transactions
- Inventory management
- Any operation where consistency is critical

### Transaction Best Practices

1. Keep transactions short
2. Avoid user interaction within transaction
3. Use appropriate isolation level
4. Handle deadlocks (retry logic)
5. Don't hold locks longer than needed

## Concurrency Control

### Optimistic Locking

Assume conflicts are rare, detect at commit:
```sql
UPDATE products
SET quantity = 10, version = version + 1
WHERE id = 123 AND version = 5
-- If rows affected = 0, conflict occurred
```

**Use when**: Conflicts are rare, reads >> writes

### Pessimistic Locking

Lock before reading:
```sql
SELECT * FROM products WHERE id = 123 FOR UPDATE
-- Row is locked until transaction ends
```

**Use when**: Conflicts are common, short transactions

## Data Integrity

### Constraints

**NOT NULL**: Field must have value
**UNIQUE**: No duplicates
**PRIMARY KEY**: Unique + Not Null identifier
**FOREIGN KEY**: Reference another table
**CHECK**: Custom validation rules

### Foreign Keys

```sql
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);
```

**ON DELETE options**:
- `RESTRICT`: Prevent deletion if referenced
- `CASCADE`: Delete related records
- `SET NULL`: Set foreign key to null
- `SET DEFAULT`: Set to default value

### Soft Deletes

Mark as deleted instead of removing:
```sql
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;

-- "Delete" user
UPDATE users SET deleted_at = NOW() WHERE id = 123;

-- Query active users
SELECT * FROM users WHERE deleted_at IS NULL;
```

**Use when**:
- Need audit trail
- May need to restore
- Referential integrity is complex

## Migrations

### Best Practices

1. **Version control**: Migrations in source control
2. **Forward only**: Don't edit applied migrations
3. **Reversible**: Include rollback when possible
4. **Idempotent**: Safe to run multiple times
5. **Small**: One logical change per migration

### Zero-Downtime Migrations

**Adding column**:
1. Add nullable column (or with default)
2. Deploy code that writes to new column
3. Backfill existing data
4. Add constraints

**Removing column**:
1. Stop reading/writing to column
2. Deploy code without column
3. Remove column

**Renaming**:
1. Add new column
2. Copy data
3. Update code to use new column
4. Remove old column

## Performance Checklist

- [ ] Indexes on frequently queried columns
- [ ] No N+1 queries
- [ ] Queries use appropriate columns (not SELECT *)
- [ ] Pagination for large result sets
- [ ] Slow query logging enabled
- [ ] Connection pooling configured
- [ ] Query plans analyzed for critical queries
- [ ] Appropriate isolation levels
- [ ] Transactions are short
- [ ] Statistics up to date (ANALYZE)
