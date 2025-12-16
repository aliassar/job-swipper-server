# Job Swiper API Documentation

Complete API reference with request/response examples for all endpoints.

## Table of Contents

- [Authentication](#authentication)
- [Jobs API](#jobs-api)
- [Applications API](#applications-api)
- [Saved Jobs API](#saved-jobs-api)
- [Notifications API](#notifications-api)
- [Email Connections API](#email-connections-api)
- [Settings API](#settings-api)
- [User Profile API](#user-profile-api)
- [Users API](#users-api)
- [Resumes API](#resumes-api)
- [Cover Letters API](#cover-letters-api)
- [Generation API](#generation-api)
- [History API](#history-api)
- [Reported Jobs API](#reported-jobs-api)
- [Admin API](#admin-api)
- [Sync API](#sync-api)
- [Webhooks API](#webhooks-api)

---

## Authentication

All authenticated endpoints require a JWT token in the `Authorization` header:
```
Authorization: Bearer <jwt_token>
```

### Register

Create a new user account with email and password.

**Endpoint:** `POST /api/auth/register`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-here",
      "email": "user@example.com",
      "emailVerified": false
    },
    "token": "jwt-token-here",
    "message": "Registration successful. Please check your email to verify your account."
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Login

Authenticate with email and password.

**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-here",
      "email": "user@example.com"
    },
    "token": "jwt-token-here"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### OAuth Login

**Google OAuth:**
- `GET /api/auth/google` - Redirects to Google OAuth
- `GET /api/auth/google/callback` - Callback endpoint

**GitHub OAuth:**
- `GET /api/auth/github` - Redirects to GitHub OAuth
- `GET /api/auth/github/callback` - Callback endpoint

---

## Jobs API

### Get Pending Jobs

Retrieve jobs that haven't been swiped yet, with optional filters.

**Endpoint:** `GET /api/jobs`

**Query Parameters:**
- `search` (optional) - Search by job title or company
- `limit` (optional, default: 10) - Number of jobs to return
- `location` (optional) - Filter by location
- `salaryMin` (optional) - Minimum salary filter
- `salaryMax` (optional) - Maximum salary filter

**Example Request:**
```
GET /api/jobs?search=software&limit=5&salaryMin=80000
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "job-uuid",
      "company": "Tech Corp",
      "position": "Software Engineer",
      "location": "New York, NY",
      "salary": "$100,000 - $150,000",
      "salaryMin": 100000,
      "salaryMax": 150000,
      "description": "Job description...",
      "requirements": ["5+ years experience", "Python"],
      "source": "indeed",
      "sourceUrl": "https://...",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Get Job Filters

Get list of blocked companies.

**Endpoint:** `GET /api/jobs/filters`

**Response:**
```json
{
  "success": true,
  "data": {
    "blockedCompanies": [
      {
        "company": "Bad Company Inc",
        "reason": "dont_recommend_company",
        "blockedAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Get Skipped Jobs

Retrieve jobs that were skipped.

**Endpoint:** `GET /api/jobs/skipped`

**Query Parameters:**
- `page` (optional, default: 1)
- `limit` (optional, default: 20)
- `search` (optional)

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "job-uuid",
        "company": "Tech Corp",
        "position": "Software Engineer",
        "status": "skipped",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Accept Job

Accept a job and create an application.

**Endpoint:** `POST /api/jobs/:id/accept`

**Response:**
```json
{
  "success": true,
  "data": {
    "job": {
      "id": "job-uuid",
      "status": "accepted"
    },
    "application": {
      "id": "app-uuid",
      "jobId": "job-uuid",
      "stage": "Syncing",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Reject Job

Mark a job as rejected.

**Endpoint:** `POST /api/jobs/:id/reject`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "job-uuid",
    "status": "rejected"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Skip Job

Temporarily skip a job.

**Endpoint:** `POST /api/jobs/:id/skip`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "job-uuid",
    "status": "skipped"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Toggle Save Job

Save or unsave a job.

**Endpoint:** `POST /api/jobs/:id/save`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "job-uuid",
    "isSaved": true
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Unsave Job

Remove a job from saved list.

**Endpoint:** `DELETE /api/jobs/:id/save`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "job-uuid",
    "isSaved": false
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Rollback Job Decision

Undo the last action on a job.

**Endpoint:** `POST /api/jobs/:id/rollback`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "job-uuid",
    "previousStatus": "rejected",
    "newStatus": "pending",
    "message": "Job status rolled back successfully"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Report Job

Report a job as fake, not interested, or to block the company.

**Endpoint:** `POST /api/jobs/:id/report`

**Request Body:**
```json
{
  "reason": "dont_recommend_company",
  "details": "Company has poor reviews"
}
```

Valid reasons: `fake`, `not_interested`, `dont_recommend_company`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "report-uuid",
    "jobId": "job-uuid",
    "reason": "dont_recommend_company",
    "details": "Company has poor reviews",
    "reportedAt": "2024-01-01T00:00:00.000Z"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Unreport Job

Remove a report from a job.

**Endpoint:** `POST /api/jobs/:id/unreport`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Report removed successfully"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Applications API

### List Applications

Get all applications with pagination.

**Endpoint:** `GET /api/applications`

**Query Parameters:**
- `page` (optional, default: 1)
- `limit` (optional, default: 20)
- `search` (optional)

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "app-uuid",
        "jobId": "job-uuid",
        "stage": "Applied",
        "notes": "Follow up in 2 weeks",
        "appliedAt": "2024-01-01T00:00:00.000Z",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "job": {
          "company": "Tech Corp",
          "position": "Software Engineer",
          "location": "New York, NY"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Get Application Details

Get detailed application information including job and documents.

**Endpoint:** `GET /api/applications/:id`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "app-uuid",
    "jobId": "job-uuid",
    "stage": "Applied",
    "notes": "Submitted through company website",
    "appliedAt": "2024-01-01T00:00:00.000Z",
    "autoStatusEnabled": true,
    "job": {
      "id": "job-uuid",
      "company": "Tech Corp",
      "position": "Software Engineer",
      "location": "New York, NY",
      "salary": "$100,000 - $150,000"
    },
    "generatedResume": {
      "id": "resume-uuid",
      "filename": "resume-tech-corp.pdf",
      "fileUrl": "https://s3.../resume.pdf",
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "generatedCoverLetter": {
      "id": "letter-uuid",
      "filename": "cover-letter-tech-corp.pdf",
      "fileUrl": "https://s3.../cover-letter.pdf",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Update Application Stage

Change the application stage.

**Endpoint:** `PUT /api/applications/:id/stage`

**Request Body:**
```json
{
  "stage": "Interview 1"
}
```

Valid stages: `Syncing`, `CV Check`, `Message Check`, `Being Applied`, `Applied`, `Interview 1`, `Next Interviews`, `Offer`, `Rejected`, `Accepted`, `Withdrawn`, `Failed`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "app-uuid",
    "stage": "Interview 1",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Update Application Notes

Update notes for an application.

**Endpoint:** `PUT /api/applications/:id/notes`

**Request Body:**
```json
{
  "notes": "Great conversation with hiring manager. Technical interview scheduled for next week."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "app-uuid",
    "notes": "Great conversation with hiring manager. Technical interview scheduled for next week.",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Get Application Documents

Get resume and cover letter URLs.

**Endpoint:** `GET /api/applications/:id/documents`

**Response:**
```json
{
  "success": true,
  "data": {
    "generatedResume": {
      "fileUrl": "https://s3.../resume.pdf",
      "fileName": "resume-tech-corp.pdf",
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "generatedCoverLetter": {
      "fileUrl": "https://s3.../cover-letter.pdf",
      "fileName": "cover-letter-tech-corp.pdf",
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "customResumeUrl": null,
    "customCoverLetterUrl": null
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Update Custom Documents

Set custom document URLs for an application.

**Endpoint:** `PUT /api/applications/:id/documents`

**Request Body:**
```json
{
  "resumeUrl": "https://custom.com/my-resume.pdf",
  "coverLetterUrl": "https://custom.com/my-cover-letter.pdf"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "app-uuid",
    "customResumeUrl": "https://custom.com/my-resume.pdf",
    "customCoverLetterUrl": "https://custom.com/my-cover-letter.pdf"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Confirm CV

Approve the generated resume for an application.

**Endpoint:** `POST /api/applications/:id/cv/confirm`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "app-uuid",
    "stage": "Message Check",
    "cvConfirmed": true
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Reupload CV

Reject generated resume and upload a new one.

**Endpoint:** `POST /api/applications/:id/cv/reupload`

**Content-Type:** `multipart/form-data`

**Form Data:**
- `file` - PDF file

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "app-uuid",
    "stage": "Message Check",
    "generatedResume": {
      "id": "new-resume-uuid",
      "filename": "new-resume.pdf",
      "fileUrl": "https://s3.../new-resume.pdf"
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Confirm Message

Approve the generated cover letter.

**Endpoint:** `POST /api/applications/:id/message/confirm`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "app-uuid",
    "stage": "Being Applied",
    "messageConfirmed": true
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Update Message

Edit and confirm the cover letter message.

**Endpoint:** `PUT /api/applications/:id/message`

**Request Body:**
```json
{
  "message": "Updated cover letter text..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "app-uuid",
    "stage": "Being Applied",
    "message": "Updated cover letter text...",
    "messageConfirmed": true
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Download Resume

Get presigned URL to download generated resume.

**Endpoint:** `GET /api/applications/:id/download/resume`

Redirects to S3 presigned URL for direct download.

### Download Cover Letter

Get presigned URL to download generated cover letter.

**Endpoint:** `GET /api/applications/:id/download/cover-letter`

Redirects to S3 presigned URL for direct download.

### Toggle Auto Status

Enable/disable automatic status updates from email monitoring.

**Endpoint:** `POST /api/applications/:id/toggle-auto-status`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "app-uuid",
    "autoStatusEnabled": false
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Saved Jobs API

### Get Saved Jobs

Retrieve all saved jobs.

**Endpoint:** `GET /api/saved`

**Query Parameters:**
- `page` (optional, default: 1)
- `limit` (optional, default: 20)
- `search` (optional)

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "job-uuid",
        "company": "Tech Corp",
        "position": "Software Engineer",
        "location": "New York, NY",
        "salary": "$100,000 - $150,000",
        "savedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 15,
      "totalPages": 1
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Export Saved Jobs (CSV)

Export saved jobs to CSV format.

**Endpoint:** `GET /api/saved/export?format=csv`

**Response:** CSV file download with headers:
```
Company,Position,Location,Salary,Source,Saved At
Tech Corp,Software Engineer,New York NY,$100000-$150000,indeed,2024-01-01T00:00:00.000Z
```

### Export Saved Jobs (PDF)

Export saved jobs to PDF format.

**Endpoint:** `GET /api/saved/export?format=pdf`

**Response:** PDF file download with formatted job listings.

---

## Notifications API

### Get Notifications

Retrieve user notifications with pagination.

**Endpoint:** `GET /api/notifications`

**Query Parameters:**
- `page` (optional, default: 1)
- `limit` (optional, default: 20)

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "notif-uuid",
        "type": "cv_ready",
        "title": "Resume Ready",
        "message": "Your resume has been generated successfully.",
        "isRead": false,
        "metadata": {
          "jobId": "job-uuid",
          "applicationId": "app-uuid"
        },
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 10,
      "totalPages": 1
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Notification Stream (SSE)

Real-time notification stream using Server-Sent Events.

**Endpoint:** `GET /api/notifications/stream`

**Response:** SSE stream with events:
```
data: {"type":"connected"}

data: {"id":"notif-uuid","type":"cv_ready","title":"Resume Ready","message":"Your resume has been generated successfully.","isRead":false,"createdAt":"2024-01-01T00:00:00.000Z"}

: heartbeat
```

### Get Unread Count

Get count of unread notifications.

**Endpoint:** `GET /api/notifications/unread-count`

**Response:**
```json
{
  "success": true,
  "data": {
    "count": 5
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Mark as Read

Mark a single notification as read.

**Endpoint:** `POST /api/notifications/:id/read`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Notification marked as read"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Mark All as Read

Mark all notifications as read.

**Endpoint:** `POST /api/notifications/read-all`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "All notifications marked as read"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Delete Notification

Delete a single notification.

**Endpoint:** `DELETE /api/notifications/:id`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Notification deleted"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Clear All Notifications

Delete all notifications.

**Endpoint:** `DELETE /api/notifications`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "All notifications cleared"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Email Connections API

### List Email Connections

Get all connected email accounts.

**Endpoint:** `GET /api/email-connections`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "conn-uuid",
      "email": "user@gmail.com",
      "provider": "gmail",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    {
      "id": "conn-uuid-2",
      "email": "user@company.com",
      "provider": "imap",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Start Gmail OAuth

Initiate Gmail OAuth flow.

**Endpoint:** `POST /api/email-connections/gmail`

**Response:**
```json
{
  "success": true,
  "data": {
    "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?client_id=..."
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Gmail OAuth Callback

**Endpoint:** `GET /api/email-connections/gmail/callback?code=...&state=...`

Redirects to: `/email-connections/success?provider=gmail&email=user@gmail.com`

### Start Outlook OAuth

Initiate Outlook OAuth flow.

**Endpoint:** `POST /api/email-connections/outlook`

**Response:**
```json
{
  "success": true,
  "data": {
    "authUrl": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=..."
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Outlook OAuth Callback

**Endpoint:** `GET /api/email-connections/outlook/callback?code=...&state=...`

Redirects to: `/email-connections/success?provider=outlook&email=user@outlook.com`

### Start Yahoo OAuth

Initiate Yahoo OAuth flow.

**Endpoint:** `POST /api/email-connections/yahoo`

**Response:**
```json
{
  "success": true,
  "data": {
    "authUrl": "https://api.login.yahoo.com/oauth2/request_auth?client_id=..."
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Yahoo OAuth Callback

**Endpoint:** `GET /api/email-connections/yahoo/callback?code=...&state=...`

Redirects to: `/email-connections/success?provider=yahoo&email=user@yahoo.com`

### Add IMAP Connection

Add custom email via IMAP.

**Endpoint:** `POST /api/email-connections/imap`

**Request Body:**
```json
{
  "email": "user@company.com",
  "host": "imap.company.com",
  "port": 993,
  "username": "user@company.com",
  "password": "app-specific-password"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "conn-uuid",
    "email": "user@company.com",
    "provider": "imap",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Remove Email Connection

Delete an email connection.

**Endpoint:** `DELETE /api/email-connections/:id`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Connection removed"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Test Email Connection

Test if an email connection is working.

**Endpoint:** `POST /api/email-connections/:id/test`

**Response:**
```json
{
  "success": true,
  "data": {
    "valid": true
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Sync to Stage Updater

Manually send credentials to Stage Updater microservice.

**Endpoint:** `POST /api/email-connections/:id/sync`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Credentials synced to Stage Updater",
    "syncedAt": "2024-01-01T00:00:00.000Z"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Settings API

### Get Settings

Retrieve user settings.

**Endpoint:** `GET /api/settings`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "settings-uuid",
    "userId": "user-uuid",
    "theme": "dark",
    "emailNotifications": true,
    "pushNotifications": true,
    "automationStages": ["CV Check", "Message Check"],
    "autoGenerateResume": true,
    "autoGenerateCoverLetter": true,
    "autoGenerateEmail": false,
    "aiFilteringEnabled": true,
    "baseResumeId": "resume-uuid",
    "baseCoverLetterUrl": "https://s3.../cover-letter.pdf",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Update Settings

Update user settings.

**Endpoint:** `PUT /api/settings`

**Request Body:**
```json
{
  "theme": "light",
  "emailNotifications": false,
  "autoGenerateResume": true,
  "aiFilteringEnabled": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "settings-uuid",
    "theme": "light",
    "emailNotifications": false,
    "autoGenerateResume": true,
    "aiFilteringEnabled": false,
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## User Profile API

### Get User Profile

Retrieve user profile information.

**Endpoint:** `GET /api/user-profile`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "profile-uuid",
    "userId": "user-uuid",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1234567890",
    "linkedinUrl": "https://linkedin.com/in/johndoe",
    "address": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "USA",
    "baseResume": {
      "id": "resume-uuid",
      "filename": "base-resume.pdf",
      "fileUrl": "https://s3.../base-resume.pdf"
    },
    "baseCoverLetter": {
      "fileUrl": "https://s3.../base-cover-letter.pdf"
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Update User Profile

Update profile information.

**Endpoint:** `PUT /api/user-profile`

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "linkedinUrl": "https://linkedin.com/in/johndoe",
  "city": "San Francisco",
  "state": "CA"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "profile-uuid",
    "firstName": "John",
    "lastName": "Doe",
    "city": "San Francisco",
    "state": "CA",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Upload Base Resume

Upload a base resume for AI generation.

**Endpoint:** `POST /api/user-profile/base-resume`

**Content-Type:** `multipart/form-data`

**Form Data:**
- `file` - PDF file

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "resume-uuid",
    "filename": "base-resume.pdf",
    "fileUrl": "https://s3.../base-resume.pdf",
    "isPrimary": true,
    "isReference": true,
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Upload Base Cover Letter

Upload a base cover letter template.

**Endpoint:** `POST /api/user-profile/base-cover-letter`

**Content-Type:** `multipart/form-data`

**Form Data:**
- `file` - PDF or text file

**Response:**
```json
{
  "success": true,
  "data": {
    "filename": "base-cover-letter.pdf",
    "fileUrl": "https://s3.../base-cover-letter.pdf"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Remove Base Resume

Remove base resume reference.

**Endpoint:** `DELETE /api/user-profile/base-resume`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Base resume removed"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Remove Base Cover Letter

Remove base cover letter reference.

**Endpoint:** `DELETE /api/user-profile/base-cover-letter`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Base cover letter removed"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Users API

### Export User Data

Export all user data for GDPR compliance.

**Endpoint:** `POST /api/users/me/export`

**Response:**
```json
{
  "success": true,
  "data": {
    "settings": [...],
    "resumes": [...],
    "jobStatuses": [...],
    "applications": [...],
    "history": [...]
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Delete Account

Permanently delete user account and all associated data.

**Endpoint:** `DELETE /api/users/me`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Account deleted successfully"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Resumes API

### List Resumes

Get all uploaded resumes.

**Endpoint:** `GET /api/resumes`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "resume-uuid",
      "filename": "my-resume.pdf",
      "fileUrl": "https://s3.../my-resume.pdf",
      "isPrimary": true,
      "isReference": false,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Upload Resume

Upload a new resume file.

**Endpoint:** `POST /api/resumes`

**Content-Type:** `multipart/form-data`

**Form Data:**
- `file` - PDF file

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "resume-uuid",
    "filename": "my-resume.pdf",
    "fileUrl": "https://s3.../my-resume.pdf",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Get Resume

Get resume details.

**Endpoint:** `GET /api/resumes/:id`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "resume-uuid",
    "filename": "my-resume.pdf",
    "fileUrl": "https://s3.../my-resume.pdf",
    "isPrimary": true,
    "isReference": false,
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Delete Resume

Delete a resume file.

**Endpoint:** `DELETE /api/resumes/:id`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Resume deleted successfully"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Set Primary Resume

Mark a resume as primary.

**Endpoint:** `PATCH /api/resumes/:id/primary`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "resume-uuid",
    "isPrimary": true
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Set Reference Resume

Mark a resume as reference for AI generation.

**Endpoint:** `PATCH /api/resumes/:id/reference`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "resume-uuid",
    "isReference": true
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Cover Letters API

### List Cover Letters

Get all uploaded cover letters.

**Endpoint:** `GET /api/cover-letters`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "letter-uuid",
      "filename": "my-cover-letter.pdf",
      "fileUrl": "https://s3.../my-cover-letter.pdf",
      "isReference": false,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Get Cover Letter

Get cover letter details.

**Endpoint:** `GET /api/cover-letters/:id`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "letter-uuid",
    "filename": "my-cover-letter.pdf",
    "fileUrl": "https://s3.../my-cover-letter.pdf",
    "isReference": false,
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Set Reference Cover Letter

Mark a cover letter as reference for AI generation.

**Endpoint:** `PATCH /api/cover-letters/:id/reference`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "letter-uuid",
    "isReference": true
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Generation API

### Generate Resume

Generate a tailored resume for a specific job.

**Endpoint:** `POST /api/jobs/:id/generate/resume`

**Request Body:**
```json
{
  "baseResumeId": "resume-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "generated-resume-uuid",
    "jobId": "job-uuid",
    "filename": "resume-tech-corp.pdf",
    "fileUrl": "https://s3.../resume-tech-corp.pdf",
    "baseResumeId": "resume-uuid",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Generate Cover Letter

Generate a cover letter for a specific job.

**Endpoint:** `POST /api/jobs/:id/generate/cover-letter`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "generated-letter-uuid",
    "jobId": "job-uuid",
    "filename": "cover-letter-tech-corp.pdf",
    "fileUrl": "https://s3.../cover-letter-tech-corp.pdf",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### List Generated Resumes

Get all AI-generated resumes.

**Endpoint:** `GET /api/generated/resumes`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "generated-resume-uuid",
      "jobId": "job-uuid",
      "filename": "resume-tech-corp.pdf",
      "fileUrl": "https://s3.../resume-tech-corp.pdf",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### List Generated Cover Letters

Get all AI-generated cover letters.

**Endpoint:** `GET /api/generated/cover-letters`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "generated-letter-uuid",
      "jobId": "job-uuid",
      "filename": "cover-letter-tech-corp.pdf",
      "fileUrl": "https://s3.../cover-letter-tech-corp.pdf",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Download Generated Resume

Get signed URL for downloading a generated resume.

**Endpoint:** `GET /api/generated/resumes/:id/download`

**Response:**
```json
{
  "success": true,
  "data": {
    "downloadUrl": "https://s3.../resume.pdf?X-Amz-Signature=...",
    "filename": "resume-tech-corp.pdf"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Download Generated Cover Letter

Get signed URL for downloading a generated cover letter.

**Endpoint:** `GET /api/generated/cover-letters/:id/download`

**Response:**
```json
{
  "success": true,
  "data": {
    "downloadUrl": "https://s3.../cover-letter.pdf?X-Amz-Signature=...",
    "filename": "cover-letter-tech-corp.pdf"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## History API

### Get Action History

Get history of all user actions (last 100).

**Endpoint:** `GET /api/history`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "history-uuid",
      "actionType": "accepted",
      "previousStatus": "pending",
      "newStatus": "accepted",
      "metadata": {},
      "createdAt": "2024-01-01T00:00:00.000Z",
      "job": {
        "id": "job-uuid",
        "company": "Tech Corp",
        "position": "Software Engineer"
      }
    }
  ],
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Reported Jobs API

### Get Reported Jobs

Retrieve all reported jobs.

**Endpoint:** `GET /api/reported`

**Query Parameters:**
- `page` (optional, default: 1)
- `limit` (optional, default: 20)
- `search` (optional)

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "report-uuid",
        "reason": "dont_recommend_company",
        "details": "Poor reviews",
        "reportedAt": "2024-01-01T00:00:00.000Z",
        "job": {
          "id": "job-uuid",
          "company": "Bad Company",
          "position": "Software Engineer",
          "location": "New York, NY"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5,
      "totalPages": 1
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Admin API

### Normalize Salaries

Batch process to normalize salary data across all jobs.

**Endpoint:** `POST /api/admin/normalize-salaries`

**Response:**
```json
{
  "success": true,
  "data": {
    "processed": 1523,
    "updated": 1245,
    "skipped": 278,
    "errors": 0
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Admin Health Check

Health check for admin monitoring.

**Endpoint:** `GET /api/admin/health`

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-01T00:00:00.000Z"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Sync API

### Trigger Job Sync

Manually trigger job scraping (also used by cron).

**Endpoint:** `POST /api/sync`

**Note:** No authentication required (should be protected by network rules in production)

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Job sync triggered",
    "jobsScraped": 150,
    "timestamp": "2024-01-01T00:00:00.000Z"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Get Sync Status

Get status of last job sync.

**Endpoint:** `GET /api/sync/status`

**Response:**
```json
{
  "success": true,
  "data": {
    "lastSync": "2024-01-01T00:00:00.000Z",
    "status": "success",
    "jobsProcessed": 150,
    "errors": 0
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Webhooks API

All webhook endpoints require `Authorization: Bearer <WEBHOOK_SECRET>` header.

### Status Update Webhook

Receive application status updates from Stage Updater microservice.

**Endpoint:** `POST /api/webhooks/status-update`

**Request Body:**
```json
{
  "applicationId": "app-uuid",
  "userId": "user-uuid",
  "newStage": "Interview 1",
  "metadata": {
    "source": "email",
    "emailSubject": "Interview Invitation"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Status update received"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Generation Complete Webhook

Receive notifications when AI document generation completes.

**Endpoint:** `POST /api/webhooks/generation-complete`

**Request Body:**
```json
{
  "requestId": "req_abc123",
  "userId": "user-uuid",
  "jobId": "job-uuid",
  "type": "resume",
  "success": true,
  "s3Key": "users/user-uuid/resumes/generated/resume.pdf",
  "filename": "resume-tech-corp.pdf"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Generation webhook received"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Application Submitted Webhook

Receive confirmation when application is submitted.

**Endpoint:** `POST /api/webhooks/application-submitted`

**Request Body:**
```json
{
  "applicationId": "app-uuid",
  "userId": "user-uuid",
  "success": true,
  "submittedAt": "2024-01-01T00:00:00.000Z",
  "confirmationId": "conf-123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Application submission webhook received"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Error Codes

Common error codes returned by the API:

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Request validation failed |
| `UNAUTHORIZED` | Missing or invalid authentication token |
| `FORBIDDEN` | User doesn't have permission for this resource |
| `NOT_FOUND` | Resource not found |
| `CONFLICT` | Resource already exists or conflict with current state |
| `RATE_LIMIT_EXCEEDED` | Too many requests (100/min limit) |
| `INTERNAL_SERVER_ERROR` | Unexpected server error |
| `SERVICE_UNAVAILABLE` | External microservice unavailable |

---

## Rate Limiting

All authenticated endpoints are rate-limited to **100 requests per minute** per user. Rate limit information is included in response headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

When rate limit is exceeded, the API returns:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "details": {
      "retryAfter": 60
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```
