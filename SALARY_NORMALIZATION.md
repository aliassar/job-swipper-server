# Salary Normalization

## Overview

The job-swipper-server now includes salary normalization functionality to enable efficient salary-based filtering. This feature extracts numeric salary ranges from text-based salary descriptions and stores them in dedicated `salaryMin` and `salaryMax` fields.

## Database Schema

The `jobs` table includes the following salary-related fields:

- `salary` (text): The original salary text (e.g., "$50,000 - $80,000", "Competitive")
- `salaryMin` (integer): The minimum salary value in dollars
- `salaryMax` (integer): The maximum salary value in dollars

## Utility Function

### `parseSalaryRange(salaryString)`

Located in `src/lib/utils.ts`, this function extracts numeric salary ranges from various text formats.

**Examples:**
```typescript
parseSalaryRange("$50,000 - $80,000")  // { min: 50000, max: 80000 }
parseSalaryRange("$60k-$90k")          // { min: 60000, max: 90000 }
parseSalaryRange("$75,000")            // { min: 75000, max: 75000 }
parseSalaryRange("Competitive")        // { min: null, max: null }
parseSalaryRange("50k - 80000")        // { min: 50000, max: 80000 }
```

## For Scraper Services

When inserting jobs into the database, scraper services should:

1. Store the original salary text in the `salary` field
2. Use `parseSalaryRange()` to extract numeric values
3. Store the results in `salaryMin` and `salaryMax` fields

**Example:**
```typescript
import { parseSalaryRange } from './lib/utils';

const salaryText = "$60k - $90k";
const { min, max } = parseSalaryRange(salaryText);

await db.insert(jobs).values({
  company: "Example Corp",
  position: "Software Engineer",
  salary: salaryText,
  salaryMin: min,
  salaryMax: max,
  // ... other fields
});
```

## Normalization Endpoint

For existing data, an admin endpoint is available to normalize all jobs:

```bash
POST /api/admin/normalize-salaries
```

This endpoint:
- Processes all jobs in the database
- Applies `parseSalaryRange()` to each job's salary field
- Updates `salaryMin` and `salaryMax` fields
- Returns statistics: `{ processed, updated, failed }`

## Filtering

The job service uses these numeric fields for efficient salary filtering:

```typescript
// GET /api/jobs?salaryMin=50000&salaryMax=100000
```

The filtering logic:
- Jobs with `salaryMax >= salaryMin` (user's minimum requirement)
- Jobs with `salaryMin <= salaryMax` (user's maximum budget)

This ensures the job's salary range overlaps with the user's desired range.

## Migration

A database migration (`0004_bitter_praxagora.sql`) adds the required fields:

```sql
ALTER TABLE "jobs" ADD COLUMN "salary_min" integer;
ALTER TABLE "jobs" ADD COLUMN "salary_max" integer;
```

## Testing

Comprehensive tests are available in:
- `src/__tests__/utils.test.ts` - Tests for `parseSalaryRange()`
- `src/__tests__/salary-normalization.test.ts` - Tests for normalization service
