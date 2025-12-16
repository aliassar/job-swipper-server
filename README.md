# Job Swiper Backend Server

A production-ready backend server for the Job Swiper application built with Hono (TypeScript), Drizzle ORM, and PostgreSQL.

> **⚠️ Repository Naming Note:** This repository is named `job-swipper-server` (with double 'p'), while the client repository is `job-swiper` (single 'p'). This naming inconsistency is historical and does not affect functionality.

## Tech Stack

- **Framework:** Hono (TypeScript)
- **ORM:** Drizzle ORM
- **Database:** PostgreSQL (Neon-compatible)
- **Authentication:** JWT with email/password, Google OAuth, GitHub OAuth
- **File Storage:** S3-compatible (Cloudflare R2, AWS S3)
- **PDF Generation:** PDFKit for export functionality
- **Validation:** Zod for request/response validation
- **Logging:** Pino for structured JSON logging
- **Deployment:** Vercel serverless

## Features

- ✅ **96 RESTful API endpoints** for comprehensive job management
- ✅ **Job Swiper** functionality (accept, reject, skip, save, rollback)
- ✅ **Application Tracking** with 12 customizable stages
- ✅ **AI-powered Document Generation** (resumes & cover letters via microservices)
- ✅ **Email Integration** with OAuth (Gmail, Outlook, Yahoo) and IMAP support
- ✅ **Real-time Notifications** via Server-Sent Events (SSE)
- ✅ **Advanced Filtering** (search, location, salary range)
- ✅ **Export Functionality** (CSV, PDF)
- ✅ **Audit Logging** for all user actions
- ✅ **Rate Limiting** (100 requests/minute per user)
- ✅ **GDPR Compliance** (data export & account deletion)
- ✅ **Automated Job Scraping** via cron (every 2 hours)

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (or Neon)
- S3-compatible storage (Cloudflare R2, AWS S3, etc.)
- Redis (optional, for rate limiting)

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your configuration
# See .env.example for detailed documentation of each variable
# Required variables: DATABASE_URL, JWT_SECRET, S3_* credentials
```

**Important Configuration Notes:**

- **Authentication:** OAuth (Google/GitHub) is handled by THIS server, not the frontend. The frontend should redirect to `/api/auth/google` or `/api/auth/github` endpoints.
- **CORS:** Add your frontend URL to `ALLOWED_ORIGINS` environment variable (e.g., `https://app.yourdomain.com`). Multiple origins can be comma-separated.
- **Required Variables:** `DATABASE_URL`, `JWT_SECRET`, and S3 storage credentials are required for the server to start.
- **Optional Variables:** OAuth providers, microservices, and email features are optional and can be configured as needed.

See `.env.example` for complete documentation of all environment variables.
```

### Database Setup

```bash
# Generate database migrations
npm run db:generate

# Push schema to database
npm run db:push

# Seed initial data (optional)
npm run db:seed

# Open Drizzle Studio (database viewer)
npm run db:studio
```

### Development

```bash
# Start development server with hot reload
npm run dev
```

### Build

```bash
# Type check
npm run typecheck

# Build for production
npm run build
```

### Testing

```bash
# Run tests
npm test

# Run tests with UI
npm test:ui
```

## Project Structure

```
job-swipper-server/
├── src/
│   ├── db/
│   │   ├── migrations/       # Database migrations
│   │   ├── schema.ts         # Drizzle schema definitions
│   │   └── seed.ts           # Database seeding
│   ├── lib/
│   │   ├── audit.ts          # Audit logging utilities
│   │   ├── db.ts             # Database connection
│   │   ├── email-client.ts   # Email client utilities
│   │   ├── encryption.ts     # Encryption utilities
│   │   ├── errors.ts         # Custom error classes
│   │   ├── microservice-client.ts  # Microservice communication
│   │   ├── storage.ts        # S3 storage utilities
│   │   └── utils.ts          # Helper functions
│   ├── middleware/
│   │   ├── auth.ts           # JWT authentication
│   │   ├── error-handler.ts  # Global error handler
│   │   ├── logger.ts         # Request logging
│   │   ├── rate-limit.ts     # Rate limiting
│   │   └── request-id.ts     # Request ID generation
│   ├── routes/
│   │   ├── admin.ts          # Admin endpoints
│   │   ├── applications.ts   # Application management
│   │   ├── auth.ts           # Authentication
│   │   ├── cover-letters.ts  # Cover letter management
│   │   ├── email-connections.ts  # Email OAuth/IMAP
│   │   ├── generation.ts     # AI document generation
│   │   ├── history.ts        # Action history
│   │   ├── jobs.ts           # Job swiping
│   │   ├── notifications.ts  # Notifications
│   │   ├── reported.ts       # Reported jobs
│   │   ├── resumes.ts        # Resume management
│   │   ├── saved.ts          # Saved jobs
│   │   ├── settings.ts       # User settings
│   │   ├── sync.ts           # Job sync (cron)
│   │   ├── user-profile.ts   # User profile
│   │   ├── users.ts          # User data management
│   │   └── webhooks.ts       # Webhook handlers
│   ├── services/
│   │   ├── application.service.ts
│   │   ├── auth.service.ts
│   │   ├── cover-letter.service.ts
│   │   ├── email-connection.service.ts
│   │   ├── generation.service.ts
│   │   ├── job.service.ts
│   │   ├── notification.service.ts
│   │   ├── resume.service.ts
│   │   ├── scraper.service.ts
│   │   └── workflow.service.ts
│   ├── types/
│   │   └── index.ts          # TypeScript type definitions
│   └── index.ts              # Application entry point
├── .env.example              # Environment variables template
├── drizzle.config.ts         # Drizzle ORM configuration
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
└── vercel.json               # Vercel deployment config
```

## API Endpoints (96)

### Authentication API
- `POST /api/auth/register` - Email/password registration
- `POST /api/auth/login` - Email/password login
- `POST /api/auth/verify-email` - Verify email with token
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - Google OAuth callback
- `GET /api/auth/github` - Initiate GitHub OAuth
- `GET /api/auth/github/callback` - GitHub OAuth callback
- `POST /api/auth/logout` - Logout (client-side token removal)
- `GET /api/auth/me` - Get current user info

### Jobs API
- `GET /api/jobs` - Get pending jobs with filters
  - Query params: `search`, `limit`, `location`, `salaryMin`, `salaryMax`
- `GET /api/jobs/filters` - Get blocked companies list
- `GET /api/jobs/skipped` - Get skipped jobs (paginated)
  - Query params: `page`, `limit`, `search`
- `POST /api/jobs/:id/accept` - Accept job and create application
- `POST /api/jobs/:id/reject` - Reject job
- `POST /api/jobs/:id/skip` - Skip job temporarily
- `POST /api/jobs/:id/save` - Toggle save status
- `DELETE /api/jobs/:id/save` - Unsave a job
- `POST /api/jobs/:id/rollback` - Rollback previous decision
- `POST /api/jobs/:id/report` - Report job (reasons: `fake`, `not_interested`, `dont_recommend_company`)
- `POST /api/jobs/:id/unreport` - Remove report

### Applications API
- `GET /api/applications` - List applications (paginated)
  - Query params: `page`, `limit`, `search`
- `GET /api/applications/:id` - Get application details with job and documents
- `PUT /api/applications/:id/stage` - Update application stage
  - Stages: `Syncing`, `CV Check`, `Message Check`, `Being Applied`, `Applied`, `Interview 1`, `Next Interviews`, `Offer`, `Rejected`, `Accepted`, `Withdrawn`, `Failed`
- `PUT /api/applications/:id/notes` - Update application notes
- `GET /api/applications/:id/documents` - Get application documents (resume, cover letter)
- `PUT /api/applications/:id/documents` - Update custom document URLs
- `POST /api/applications/:id/cv/confirm` - Confirm CV for application
- `POST /api/applications/:id/cv/reupload` - Reupload CV (multipart/form-data)
- `POST /api/applications/:id/message/confirm` - Confirm cover letter message
- `PUT /api/applications/:id/message` - Update cover letter message
- `GET /api/applications/:id/download/resume` - Download generated resume (redirect to S3)
- `GET /api/applications/:id/download/cover-letter` - Download cover letter (redirect to S3)
- `POST /api/applications/:id/toggle-auto-status` - Toggle automatic status updates

### Saved Jobs API
- `GET /api/saved` - Get saved jobs (paginated)
  - Query params: `page`, `limit`, `search`
- `GET /api/saved/export?format=csv` - Export saved jobs to CSV
- `GET /api/saved/export?format=pdf` - Export saved jobs to PDF

### Notifications API
- `GET /api/notifications` - Get notifications (paginated)
  - Query params: `page`, `limit`
- `GET /api/notifications/stream` - SSE endpoint for real-time notifications
- `GET /api/notifications/unread-count` - Get unread notification count
- `POST /api/notifications/:id/read` - Mark notification as read
- `POST /api/notifications/read-all` - Mark all notifications as read
- `DELETE /api/notifications/:id` - Delete single notification
- `DELETE /api/notifications` - Clear all notifications

### Email Connections API
- `GET /api/email-connections` - List connected email accounts
- `POST /api/email-connections/gmail` - Start Gmail OAuth flow
- `GET /api/email-connections/gmail/callback` - Gmail OAuth callback
- `POST /api/email-connections/outlook` - Start Outlook OAuth flow
- `GET /api/email-connections/outlook/callback` - Outlook OAuth callback
- `POST /api/email-connections/yahoo` - Start Yahoo OAuth flow
- `GET /api/email-connections/yahoo/callback` - Yahoo OAuth callback
- `POST /api/email-connections/imap` - Add IMAP email connection
- `DELETE /api/email-connections/:id` - Remove email connection
- `POST /api/email-connections/:id/test` - Test email connection
- `POST /api/email-connections/:id/sync` - Sync credentials to Stage Updater service

### Settings & User Profile API
- `GET /api/settings` - Get user settings
- `PUT /api/settings` - Update user settings
  - Fields: `theme`, `emailNotifications`, `pushNotifications`, `automationStages`, `autoGenerateResume`, `autoGenerateCoverLetter`, `autoGenerateEmail`, `aiFilteringEnabled`
- `GET /api/user-profile` - Get user profile
- `PUT /api/user-profile` - Update user profile
  - Fields: `firstName`, `lastName`, `phone`, `linkedinUrl`, `address`, `city`, `state`, `zipCode`, `country`
- `POST /api/user-profile/base-resume` - Upload base resume (multipart/form-data)
- `POST /api/user-profile/base-cover-letter` - Upload base cover letter (multipart/form-data)
- `DELETE /api/user-profile/base-resume` - Remove base resume
- `DELETE /api/user-profile/base-cover-letter` - Remove base cover letter

### Users API (GDPR)
- `POST /api/users/me/export` - Export all user data (GDPR compliance)
- `DELETE /api/users/me` - Delete user account and all data

### Resumes API
- `GET /api/resumes` - List uploaded resume files
- `POST /api/resumes` - Upload resume file (multipart/form-data)
- `GET /api/resumes/:id` - Get resume details
- `DELETE /api/resumes/:id` - Delete resume
- `PATCH /api/resumes/:id/primary` - Set resume as primary
- `PATCH /api/resumes/:id/reference` - Set resume as reference

### Cover Letters API
- `GET /api/cover-letters` - List uploaded cover letters
- `GET /api/cover-letters/:id` - Get cover letter details
- `PATCH /api/cover-letters/:id/reference` - Set cover letter as reference

### Generation API (AI Documents)
- `POST /api/jobs/:id/generate/resume` - Generate tailored resume for job
  - Body: `{ baseResumeId: "uuid" }`
- `POST /api/jobs/:id/generate/cover-letter` - Generate cover letter for job
- `GET /api/generated/resumes` - List generated resumes
- `GET /api/generated/cover-letters` - List generated cover letters
- `GET /api/generated/resumes/:id/download` - Download generated resume
- `GET /api/generated/cover-letters/:id/download` - Download generated cover letter

### History & Reporting API
- `GET /api/history` - Get action history (last 100 actions)
- `GET /api/reported` - Get reported jobs (paginated)
  - Query params: `page`, `limit`, `search`
- `GET /api/application-history` - Get application history with filters
  - Query params: `startDate`, `endDate`, `search`, `stage`, `page`, `limit`
- `GET /api/application-history/export?format=csv` - Export application history to CSV
- `GET /api/application-history/export?format=pdf` - Export application history to PDF

### Email Sync API (Legacy)
- `POST /api/email/sync` - Trigger email sync
- `GET /api/email/status` - Get email sync status

### Admin API
- `POST /api/admin/normalize-salaries` - Batch normalize salary data
- `GET /api/admin/health` - Health check endpoint

### Sync API (Cron)
- `POST /api/sync` - Trigger job scraping sync (no auth for cron)
- `GET /api/sync/status` - Get last sync status

### Webhooks API
- `POST /api/webhooks/status-update` - Receive application status updates from Stage Updater
- `POST /api/webhooks/generation-complete` - Receive AI generation completion callbacks
- `POST /api/webhooks/application-submitted` - Receive application submission confirmations

### Health Check
- `GET /api/health` - Basic health check

## Application Stages

Applications flow through the following stages:

| Stage | Description |
|-------|-------------|
| **Syncing** | Initial stage when application is created |
| **CV Check** | Resume is being reviewed/verified by user |
| **Message Check** | Cover letter is being reviewed/verified by user |
| **Being Applied** | Application is in progress of being submitted |
| **Applied** | Application has been successfully submitted |
| **Interview 1** | First interview scheduled/completed |
| **Next Interviews** | Additional interview rounds |
| **Offer** | Job offer received |
| **Rejected** | Application was rejected by employer |
| **Accepted** | Job offer accepted |
| **Withdrawn** | Application withdrawn by user |
| **Failed** | Application submission failed |

## Microservices Integration

The server integrates with multiple microservices for extended functionality:

| Service | Purpose | Environment Variables |
|---------|---------|----------------------|
| **Scraper** | Job scraping from various sources | `SCRAPER_SERVICE_URL`, `SCRAPER_SERVICE_KEY` |
| **Resume AI** | AI-powered resume generation | `RESUME_AI_SERVICE_URL`, `RESUME_AI_SERVICE_KEY` |
| **Cover Letter AI** | AI-powered cover letter generation | `COVER_LETTER_AI_SERVICE_URL`, `COVER_LETTER_AI_SERVICE_KEY` |
| **Stage Updater** | Email monitoring for application status updates | `STAGE_UPDATER_SERVICE_URL`, `STAGE_UPDATER_SERVICE_KEY` |
| **Job Filter** | AI-based job filtering | `JOB_FILTER_SERVICE_URL` |
| **Application Sender** | Automated application submission | `APPLICATION_SENDER_SERVICE_URL` |

## Response Format

All endpoints return standardized JSON responses:

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Paginated Response
```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## Environment Variables

See `.env.example` for a complete list of environment variables with detailed documentation.

### Required Variables (Server Won't Start Without These)

- **`DATABASE_URL`** - PostgreSQL connection string
- **`JWT_SECRET`** - Secret for JWT token signing (generate with: `openssl rand -base64 32`)
- **`S3_BUCKET`** - S3 bucket name for file storage
- **`S3_REGION`** - S3 region (e.g., `us-east-1` or `auto` for Cloudflare R2)
- **`S3_ACCESS_KEY`** - S3 access key ID
- **`S3_SECRET_KEY`** - S3 secret access key
- **`S3_ENDPOINT`** - S3 endpoint URL

### Important Configuration Variables

- **`ALLOWED_ORIGINS`** - Comma-separated list of frontend URLs allowed to make CORS requests
  - Example: `https://app.yourdomain.com,https://staging.yourdomain.com`
  - **Critical:** Your frontend URL must be listed here or requests will be blocked
- **`FRONTEND_URL`** - Base URL of your frontend (used for OAuth redirects)
- **`NEXTAUTH_URL`** - Base URL of this API server (used for OAuth callbacks)

### Optional Variables

- **OAuth Providers:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- **Email Features:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`
- **Email Connections:** `ENCRYPTION_KEY`, `GMAIL_CLIENT_ID`, `OUTLOOK_CLIENT_ID`, `YAHOO_CLIENT_ID`
- **Microservices:** Various service URLs and API keys (see `.env.example`)
- **Security:** `ADMIN_API_KEY`, `WEBHOOK_SECRET`, `CRON_SECRET`

For complete documentation and examples, see `.env.example`.

## CORS Configuration

The server uses CORS middleware to control which frontend origins can access the API.

### Development

```bash
ALLOWED_ORIGINS=http://localhost:3000
```

### Production

```bash
# Single frontend
ALLOWED_ORIGINS=https://app.yourdomain.com

# Multiple environments
ALLOWED_ORIGINS=https://app.yourdomain.com,https://staging.yourdomain.com
```

**Important CORS Notes:**

- 🚨 **Frontend URL must be in `ALLOWED_ORIGINS`** or requests will be blocked
- ✅ Use exact URLs with protocol (e.g., `https://app.yourdomain.com`)
- ✅ No trailing slashes
- ✅ Separate multiple origins with commas (no spaces)
- ❌ Do NOT use wildcards (`*`) in production

### Common CORS Issues

If your frontend gets CORS errors:
1. Check that `ALLOWED_ORIGINS` includes your frontend URL
2. Ensure the URL matches exactly (including `https://`)
3. Restart the server after changing environment variables
4. Clear browser cache (CORS headers can be cached)

## Deployment

For detailed production deployment instructions, see **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)**.

### Quick Start - Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel deploy

# Deploy to production
vercel --prod
```

### Deployment Checklist

1. ✅ Set up PostgreSQL database (Neon recommended)
2. ✅ Configure S3-compatible storage (Cloudflare R2 recommended)
3. ✅ Generate secure secrets (`JWT_SECRET`, `ADMIN_API_KEY`, etc.)
4. ✅ Configure all required environment variables in your deployment platform
5. ✅ Set `ALLOWED_ORIGINS` to include your frontend URL(s)
6. ✅ Run database migrations: `npm run db:push`
7. ✅ Set up OAuth applications if using Google/GitHub login
8. ✅ Configure SMTP if using email/password registration
9. ✅ Test health check endpoint: `GET https://api.yourdomain.com/`
10. ✅ Verify CORS by testing API calls from your frontend

### OAuth Configuration Notes

**Important:** OAuth authentication (Google/GitHub login) is handled by THIS server, not the frontend.

**OAuth Flow:**
1. Frontend redirects user to: `GET /api/auth/google` or `GET /api/auth/github`
2. Server handles OAuth with provider
3. Server redirects back to frontend with JWT token
4. Frontend stores JWT and uses it for API requests

**Required Settings:**
- Set `NEXTAUTH_URL` to your API server URL (e.g., `https://api.yourdomain.com`)
- Set `FRONTEND_URL` to your frontend URL (e.g., `https://app.yourdomain.com`)
- Configure OAuth callback URLs in provider settings:
  - Google: `${NEXTAUTH_URL}/api/auth/google/callback`
  - GitHub: `${NEXTAUTH_URL}/api/auth/github/callback`

See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for complete deployment guide.

## Security Features

- 🔒 **JWT Authentication** with configurable expiration
- 🔒 **Password Hashing** with bcrypt
- 🔒 **Email Credential Encryption** using AES-256
- 🔒 **Rate Limiting** (100 req/min per user)
- 🔒 **Request ID Tracking** for audit trails
- 🔒 **Webhook Signature Verification**
- 🔒 **CORS Protection**
- 🔒 **SQL Injection Prevention** via Drizzle ORM
- 🔒 **Input Validation** with Zod schemas

## Additional Documentation

- **[docs/API.md](./docs/API.md)** - Complete API reference with request/response examples for all 96 endpoints
- **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** - Production deployment guide with environment setup, CORS configuration, and troubleshooting
- **[docs/WORKFLOW.md](./docs/WORKFLOW.md)** - Application workflow processes and stage transitions
- **[MICROSERVICE_IMPLEMENTATION.md](./MICROSERVICE_IMPLEMENTATION.md)** - Microservice integration details
- **[SECURE_CREDENTIALS.md](./SECURE_CREDENTIALS.md)** - Credential handling and encryption documentation
- **[.env.example](./.env.example)** - Comprehensive environment variable documentation with required/optional markers

## License

MIT