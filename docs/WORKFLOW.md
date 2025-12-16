# Job Swiper Application Workflow

This document describes the end-to-end workflows and processes in the Job Swiper application.

## Table of Contents

- [Job Discovery & Swiping Workflow](#job-discovery--swiping-workflow)
- [Application Creation & Management Workflow](#application-creation--management-workflow)
- [Document Generation Workflow](#document-generation-workflow)
- [Application Submission Workflow](#application-submission-workflow)
- [Email Monitoring & Status Updates Workflow](#email-monitoring--status-updates-workflow)
- [Notification System Workflow](#notification-system-workflow)
- [Data Export & Account Deletion Workflow](#data-export--account-deletion-workflow)

---

## Job Discovery & Swiping Workflow

### 1. Job Scraping (Automated)

**Trigger:** Cron job (every 2 hours) or manual trigger via `POST /api/sync`

**Process Flow:**
1. Cron service calls `/api/sync` endpoint
2. Server calls Scraper microservice via `SCRAPER_SERVICE_URL`
3. Scraper fetches jobs from multiple sources (Indeed, LinkedIn, etc.)
4. Scraper sends jobs back to server
5. Server stores jobs in database with status `pending`
6. Optional: Job Filter microservice filters out irrelevant jobs
7. Optional: AI Filtering service applies user-specific filtering criteria

**Database Changes:**
- New records created in `jobs` table
- Salary data parsed and normalized (salaryMin, salaryMax)

### 2. Job Presentation to User

**Endpoint:** `GET /api/jobs`

**Process Flow:**
1. User requests pending jobs with optional filters:
   - Search by title/company
   - Location filter
   - Salary range (salaryMin, salaryMax)
2. Server queries database for jobs with status `pending`
3. Excludes jobs from blocked companies
4. Returns filtered, sorted job list

### 3. Job Actions

#### Accept Job
**Endpoint:** `POST /api/jobs/:id/accept`

**Process Flow:**
1. Update job status to `accepted` in `userJobStatus` table
2. Create new application record in `applications` table with stage `Syncing`
3. Create action history record
4. Trigger document generation workflow (if auto-generation enabled)
5. Return job and application details

#### Reject Job
**Endpoint:** `POST /api/jobs/:id/reject`

**Process Flow:**
1. Update job status to `rejected` in `userJobStatus` table
2. Create action history record
3. Return updated status

#### Skip Job
**Endpoint:** `POST /api/jobs/:id/skip`

**Process Flow:**
1. Update job status to `skipped` in `userJobStatus` table
2. Create action history record
3. Job will not appear in pending list but can be retrieved via `/api/jobs/skipped`

#### Save Job
**Endpoint:** `POST /api/jobs/:id/save`

**Process Flow:**
1. Toggle `isSaved` flag in `userJobStatus` table
2. Create action history record
3. Job appears in `/api/saved` endpoint
4. Can be exported to CSV/PDF

#### Report Job
**Endpoint:** `POST /api/jobs/:id/report`

**Process Flow:**
1. Create record in `reportedJobs` table with reason:
   - `fake` - Job posting is fraudulent
   - `not_interested` - User not interested in this job
   - `dont_recommend_company` - Block all jobs from this company
2. If reason is `dont_recommend_company`:
   - Create record in `blockedCompanies` table
   - Future jobs from this company automatically filtered
3. Create action history record

#### Rollback Decision
**Endpoint:** `POST /api/jobs/:id/rollback`

**Process Flow:**
1. Query action history for last action on this job
2. Revert status to previous state
3. Delete any created application (if job was accepted)
4. Create rollback action history record

---

## Application Creation & Management Workflow

### Application Stages

Applications progress through the following stages:

```
Syncing → CV Check → Message Check → Being Applied → Applied → 
  → Interview 1 → Next Interviews → Offer → Accepted (terminal)
                                  ↓
                              Rejected (terminal)
                              Withdrawn (terminal, user action)
                              Failed (terminal, submission error)
```

**Note:** Terminal states (Rejected, Accepted, Withdrawn, Failed) are final and cannot be changed once reached.

### Stage Descriptions

| Stage | Description | User Actions Required |
|-------|-------------|----------------------|
| **Syncing** | Initial creation, waiting for document generation | None (automatic) |
| **CV Check** | Resume ready for review | Review and confirm or reupload |
| **Message Check** | Cover letter ready for review | Review and confirm or edit |
| **Being Applied** | Application in submission process | None (automatic via Application Sender) |
| **Applied** | Successfully submitted to employer | Monitor for responses |
| **Interview 1** | First interview scheduled/completed | Update manually or auto via email monitoring |
| **Next Interviews** | Additional interview rounds | Update manually or auto via email monitoring |
| **Offer** | Job offer received | Accept or decline |
| **Rejected** | Application rejected by employer | None (terminal state) |
| **Accepted** | Job offer accepted by user | None (terminal state) |
| **Withdrawn** | User withdrew application | None (terminal state) |
| **Failed** | Application submission failed | Review error and retry |

### Manual Stage Updates

**Endpoint:** `PUT /api/applications/:id/stage`

**Process Flow:**
1. Validate new stage value
2. Update application record
3. Create notification if significant stage change
4. Create action history record
5. Trigger follow-up actions if needed

### Automatic Status Updates

**Setting:** `autoStatusEnabled` flag in applications table

**Process Flow:**
1. Email monitoring service (Stage Updater) scans user's email
2. Detects job-related emails (rejections, interview invites, offers)
3. Calls webhook `/api/webhooks/status-update` with detected stage
4. Server updates application stage
5. Creates notification for user

**Note:** Users can toggle automatic updates via `POST /api/applications/:id/toggle-auto-status`

---

## Document Generation Workflow

### Resume Generation

**Endpoint:** `POST /api/jobs/:id/generate/resume`

**Process Flow:**
1. User initiates resume generation with `baseResumeId`
2. Server retrieves:
   - Base resume file from S3
   - Job details (position, company, requirements)
   - User profile information
3. Server calls Resume AI microservice with:
   - Base resume content
   - Job description
   - User preferences
4. AI service generates tailored resume
5. AI service uploads PDF to S3 and calls webhook
6. Webhook handler creates `generatedResumes` record
7. Links generated resume to application
8. Updates application stage to `CV Check`
9. Creates notification for user

**Asynchronous Flow:**
- Generation happens in background
- Webhook notifies server when complete
- Notification sent to user via SSE stream

### Cover Letter Generation

**Endpoint:** `POST /api/jobs/:id/generate/cover-letter`

**Process Flow:**
1. User initiates cover letter generation
2. Server retrieves:
   - Base cover letter template (if exists)
   - Job details
   - User profile information
   - User's base resume for context
3. Server calls Cover Letter AI microservice
4. AI service generates personalized cover letter
5. AI service uploads PDF to S3 and calls webhook
6. Webhook handler creates `generatedCoverLetters` record
7. Links generated cover letter to application
8. Updates application stage to `Message Check` (if CV already confirmed)
9. Creates notification for user

### Document Review & Confirmation

#### CV Review Flow

**Endpoints:**
- `POST /api/applications/:id/cv/confirm` - Approve generated CV
- `POST /api/applications/:id/cv/reupload` - Reject and upload custom CV

**Confirm Process:**
1. User reviews generated resume
2. Approves via confirm endpoint
3. Application stage advances to `Message Check`
4. Cover letter generation triggered (if auto-generation enabled)

**Reupload Process:**
1. User uploads custom resume file (multipart/form-data)
2. File uploaded to S3
3. Old generated resume record updated/replaced
4. Application stage advances to `Message Check`

#### Cover Letter Review Flow

**Endpoints:**
- `POST /api/applications/:id/message/confirm` - Approve cover letter
- `PUT /api/applications/:id/message` - Edit and confirm message

**Confirm Process:**
1. User reviews generated cover letter
2. Approves via confirm endpoint
3. Application stage advances to `Being Applied`
4. Application submission triggered (if auto-apply enabled)

**Edit Process:**
1. User edits cover letter text
2. Sends updated message via PUT endpoint
3. Server updates cover letter content
4. Automatically confirms and advances stage
5. Application submission triggered (if auto-apply enabled)

---

## Application Submission Workflow

### Automatic Submission

**Trigger:** Application reaches `Being Applied` stage with auto-apply enabled

**Process Flow:**
1. Application stage updated to `Being Applied`
2. Server calls Application Sender microservice with:
   - Job URL/details
   - User profile data
   - Generated resume URL
   - Generated cover letter content
   - User credentials (if login required)
3. Application Sender service:
   - Opens job application page
   - Fills form fields automatically
   - Uploads documents
   - Submits application
4. On success:
   - Calls webhook `/api/webhooks/application-submitted`
   - Server updates stage to `Applied`
   - Sets `appliedAt` timestamp
   - Creates success notification
5. On failure:
   - Calls webhook with error details
   - Server updates stage to `Failed`
   - Creates failure notification with error message

### Manual Submission

**Process Flow:**
1. User downloads documents via:
   - `GET /api/applications/:id/download/resume`
   - `GET /api/applications/:id/download/cover-letter`
2. User manually applies through company website
3. User updates application stage to `Applied` manually
4. User can add notes about submission

---

## Email Monitoring & Status Updates Workflow

### Email Connection Setup

**Supported Providers:**
- Gmail (OAuth 2.0)
- Outlook (OAuth 2.0)
- Yahoo (OAuth 2.0)
- IMAP (custom email servers)

**OAuth Flow (Gmail/Outlook/Yahoo):**
1. User initiates connection: `POST /api/email-connections/gmail`
2. Server generates OAuth URL with state parameter
3. User redirected to provider's OAuth consent screen
4. User grants permission
5. Provider redirects to callback: `GET /api/email-connections/gmail/callback`
6. Server exchanges code for access token
7. Server encrypts and stores access token
8. Creates email connection record
9. Syncs credentials to Stage Updater service

**IMAP Flow:**
1. User provides: `POST /api/email-connections/imap`
   - Email address
   - IMAP host
   - Port
   - Username
   - Password
2. Server tests connection
3. On success:
   - Encrypts password with `ENCRYPTION_KEY`
   - Stores encrypted credentials
   - Syncs to Stage Updater service

### Email Monitoring Process

**Service:** Stage Updater microservice

**Process Flow:**
1. Stage Updater receives user credentials via credential sync
2. Periodically scans user's email inbox
3. Searches for job-related emails:
   - Application confirmations
   - Interview invitations
   - Rejection notices
   - Offer letters
   - Follow-up requests
4. Uses AI/pattern matching to:
   - Identify sender (company)
   - Classify email type
   - Extract relevant information
5. Matches email to application in database
6. Determines new application stage
7. Calls webhook `/api/webhooks/status-update`
8. Server updates application and notifies user

### Credential Synchronization

**Endpoint:** `POST /api/email-connections/:id/sync`

**Process Flow:**
1. Retrieves email connection from database
2. Decrypts credentials
3. Calls Stage Updater microservice with:
   - User ID
   - Email address
   - Provider type
   - Credentials (OAuth tokens or IMAP password)
4. Stage Updater stores credentials securely
5. Begins monitoring for this email account

**Security:**
- Credentials encrypted at rest using AES-256
- Transmitted over HTTPS with API key authentication
- Webhook verification using shared secret

---

## Notification System Workflow

### Notification Types

| Type | Trigger | Purpose |
|------|---------|---------|
| `cv_ready` | Resume generation complete | Inform user to review CV |
| `message_ready` | Cover letter generation complete | Inform user to review message |
| `status_changed` | Application stage updated | Inform user of progress |
| `follow_up_reminder` | Timer expires | Remind user to follow up |
| `verification_needed` | Document needs approval | Prompt user action |
| `generation_failed` | AI generation error | Alert user to retry |
| `apply_failed` | Application submission error | Alert user to apply manually |

### Notification Creation

**Internal API:** `notificationService.createNotification()`

**Process Flow:**
1. Event occurs (e.g., document generated, stage updated)
2. Service creates notification record with:
   - User ID
   - Type
   - Title
   - Message
   - Metadata (job ID, application ID, etc.)
3. Notification saved to database with `isRead: false`
4. Notification pushed to real-time subscribers via SSE
5. User sees notification in UI immediately

### Real-time Notifications (SSE)

**Endpoint:** `GET /api/notifications/stream`

**Process Flow:**
1. Client establishes SSE connection
2. Server sends initial connection confirmation
3. Server subscribes user to notification stream
4. When new notification created:
   - Server pushes notification data via SSE
   - Client displays notification in real-time
5. Server sends heartbeat every 30 seconds to keep connection alive
6. On disconnect:
   - Client reconnects automatically
   - Fetches missed notifications via `GET /api/notifications`

### Notification Management

**Endpoints:**
- `GET /api/notifications` - List all notifications (paginated)
- `GET /api/notifications/unread-count` - Get unread count for badge
- `POST /api/notifications/:id/read` - Mark single as read
- `POST /api/notifications/read-all` - Mark all as read
- `DELETE /api/notifications/:id` - Delete single notification
- `DELETE /api/notifications` - Clear all notifications

---

## Data Export & Account Deletion Workflow

### GDPR Data Export

**Endpoint:** `POST /api/users/me/export`

**Process Flow:**
1. User requests data export
2. Server collects all user data:
   - User settings
   - Profile information
   - Resume files metadata
   - All job statuses and actions
   - All applications
   - Complete action history
3. Data compiled into JSON structure
4. Audit log created for compliance
5. Data returned to user
6. User can save/download for their records

**Data Included:**
```json
{
  "settings": [...],      // User preferences and automation settings
  "resumes": [...],       // Uploaded and generated resume metadata
  "jobStatuses": [...],   // All job swipe decisions
  "applications": [...],  // All job applications and their stages
  "history": [...]        // Complete action audit trail
}
```

### Account Deletion

**Endpoint:** `DELETE /api/users/me`

**Process Flow:**
1. User initiates account deletion
2. Server performs cascading deletion in order:
   - Action history records
   - Application records
   - Generated documents (from database, files remain in S3)
   - User job statuses
   - Resume file records
   - User settings
   - User profile
   - Blocked companies
   - Reported jobs
   - Notifications
   - Email connections
3. Audit log created for compliance
4. Success response returned
5. User's JWT token invalidated (client-side)

**Data Retention:**
- Files in S3 may remain (can be cleaned up by separate process)
- Audit logs retained for compliance
- User ID removed from all referenced tables via foreign key cascade

**Note:** This is a permanent action and cannot be undone.

---

## Settings & Automation Workflow

### User Settings Management

**Endpoint:** `GET /api/settings`, `PUT /api/settings`

**Configurable Settings:**

#### UI Preferences
- `theme` - Light/dark mode
- `emailNotifications` - Receive email notifications
- `pushNotifications` - Receive push notifications

#### Automation Settings
- `automationStages` - Array of stages where automation should pause for review
- `autoGenerateResume` - Automatically generate resume when job accepted
- `autoGenerateCoverLetter` - Automatically generate cover letter after CV confirmed
- `autoGenerateEmail` - Automatically generate application email
- `aiFilteringEnabled` - Use AI to pre-filter irrelevant jobs

#### Base Documents
- `baseResumeId` - UUID of resume to use as template
- `baseCoverLetterUrl` - URL of cover letter template

**Automation Behavior:**

**With Auto-Generation Enabled:**
1. User accepts job
2. Application created in `Syncing` stage
3. Resume generation triggered automatically
4. On completion → `CV Check` stage
5. User confirms CV
6. Cover letter generation triggered automatically
7. On completion → `Message Check` stage
8. User confirms message
9. Stage advances to `Being Applied`
10. Application submission triggered (if auto-apply enabled)

**With Auto-Generation Disabled:**
1. User accepts job
2. Application created in `Syncing` stage
3. User manually triggers generation or uploads documents
4. User manually advances stages

### Profile Management

**Endpoints:** `GET /api/user-profile`, `PUT /api/user-profile`

**Purpose:**
- Store user contact information for auto-filling application forms
- Provide context for AI document generation

**Profile Fields:**
- `firstName`, `lastName`
- `phone`
- `linkedinUrl`
- `address`, `city`, `state`, `zipCode`, `country`

**Used By:**
- Application Sender microservice (auto-fill forms)
- Resume AI microservice (personalize resumes)
- Cover Letter AI microservice (personalize letters)

---

## Error Handling & Recovery

### Generation Failures

**Scenario:** AI service fails to generate document

**Process Flow:**
1. AI service calls webhook with `success: false` and error message
2. Server creates notification with type `generation_failed`
3. User sees error notification
4. User can retry generation or upload custom document
5. Application stage remains at current state until resolved

### Application Submission Failures

**Scenario:** Application Sender cannot submit application

**Process Flow:**
1. Application Sender calls webhook with failure details
2. Server updates application stage to `Failed`
3. Creates notification with error message
4. User can:
   - Download documents and apply manually
   - Fix issues and retry automatic submission
   - Update stage to `Applied` after manual submission

### Email Monitoring Failures

**Scenario:** Cannot connect to user's email account

**Process Flow:**
1. Stage Updater detects connection failure
2. Email connection marked as inactive
3. User notified to reconnect account
4. User tests connection: `POST /api/email-connections/:id/test`
5. If OAuth token expired:
   - User re-authenticates via OAuth flow
   - New token stored
6. If IMAP credentials changed:
   - User updates credentials
   - New credentials encrypted and synced

---

## Performance & Scalability

### Pagination

All list endpoints support pagination:
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)

**Example:**
```
GET /api/applications?page=2&limit=50
```

### Caching

- Job listings cached for short periods
- User settings cached per session
- S3 presigned URLs cached (expire in 1 hour)

### Rate Limiting

- 100 requests per minute per user
- Prevents abuse and ensures fair usage
- Rate limit headers included in all responses

### Asynchronous Processing

Long-running operations handled asynchronously:
- Document generation (via microservice webhooks)
- Application submission (via microservice webhooks)
- Email monitoring (continuous background process)
- Job scraping (scheduled via cron)

---

## Security Considerations

### Authentication
- JWT tokens with configurable expiration
- Secure password hashing with bcrypt
- OAuth 2.0 for email connections

### Data Protection
- Email credentials encrypted at rest (AES-256)
- Sensitive data transmitted over HTTPS only
- Webhook requests authenticated with shared secret

### Access Control
- All endpoints require valid JWT token (except auth, webhooks, cron)
- Users can only access their own data
- Resource ownership verified on every request

### Audit Trail
- All user actions logged in action history
- Audit logs for GDPR operations (export, delete)
- Request IDs tracked for debugging

---

## Monitoring & Observability

### Logging

Structured JSON logging with Pino:
- Request/response logging
- Error logging with stack traces
- Microservice communication logging
- Webhook event logging

### Health Checks

- `GET /api/health` - Basic health check
- `GET /api/admin/health` - Detailed health check
- `GET /api/sync/status` - Job scraping status

### Metrics

Track key metrics:
- Jobs scraped per sync
- Applications created per day
- Document generation success rate
- Application submission success rate
- Email monitoring coverage
- API response times
- Error rates per endpoint
