# GA4 MCP Server

A production-ready MCP (Model Context Protocol) server that exposes Google Analytics 4 Data API and Admin API as tools. Designed for deployment on Railway and integration with Claude.ai as an MCP connector.

The server authenticates as a **real Google user** via OAuth2 refresh token, so it can access every GA4 account/property that user has access to — no need to add a service account to each property individually.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MCP_AUTH_TOKEN` | Yes | Static bearer token for authenticating inbound MCP requests |
| `GOOGLE_CLIENT_ID` | Yes | OAuth2 client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth2 client secret |
| `GOOGLE_REFRESH_TOKEN` | Yes | Refresh token obtained via the setup script |
| `PORT` | No | HTTP port (default: `8080`) |

## Setup

### Step 1: Create OAuth2 Credentials in Google Cloud

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select or create a project
3. Enable these APIs (APIs & Services → Library):
   - **Google Analytics Data API**
   - **Google Analytics Admin API**
4. Go to **APIs & Services → Credentials**
5. Click **+ Create Credentials → OAuth client ID**
6. Application type: **Desktop app** (or Web application)
7. Note the **Client ID** and **Client Secret**

> If prompted to configure the OAuth consent screen first, set it to **External**, add your email as a test user, and add the scopes `analytics.readonly` and `analytics.edit`.

### Step 2: Get a Refresh Token

Install tsx if you don't have it, then run the helper script:

```bash
npm install
GOOGLE_CLIENT_ID=your-client-id GOOGLE_CLIENT_SECRET=your-secret npx tsx scripts/get-refresh-token.ts
```

This will:
1. Print a URL — open it in your browser
2. Sign in with the **Google account that has GA4 access**
3. Authorize the app
4. Paste the code back into the terminal
5. You'll get a refresh token — save it

### Step 3: Configure Environment

```bash
cp .env.example .env
```

Fill in your `.env`:
```
MCP_AUTH_TOKEN=<generate with: openssl rand -hex 32>
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
PORT=8080
```

### Step 4: Build and Run

```bash
npm run build
npm start
```

## Railway Deployment

1. Push this repo to GitHub
2. Create a new Railway project and connect the repo
3. Set all 4 environment variables in Railway settings
4. Railway will auto-detect the Dockerfile and build
5. Set the health check path to `/health`

## Claude.ai MCP Integration

1. In Claude.ai settings, add a new MCP integration
2. URL: `https://<your-railway-app>.up.railway.app/mcp`
3. Authentication: Bearer token with your `MCP_AUTH_TOKEN` value

## Available Tools

### Discovery & Account Structure
| Tool | Description |
|---|---|
| `ga4_list_accounts` | Lists all GA4 accounts the user has access to |
| `ga4_list_properties` | Lists GA4 properties under a given account or all accessible |
| `ga4_get_property` | Get detailed metadata for a single GA4 property |
| `ga4_list_data_streams` | Lists web and app data streams for a property |
| `ga4_list_custom_dimensions` | Lists all custom dimensions for a property |
| `ga4_list_custom_metrics` | Lists all custom metrics for a property |
| `ga4_list_audiences` | Lists configured audiences for a property |
| `ga4_list_key_events` | Lists key events (conversions) for a property |

### Reporting
| Tool | Description |
|---|---|
| `ga4_run_report` | Run a standard GA4 report with dimensions, metrics, filters |
| `ga4_run_realtime_report` | Fetch real-time data (last 30 minutes) |
| `ga4_run_pivot_report` | Run a pivot table report for cross-tabulation |
| `ga4_batch_run_reports` | Run up to 5 reports in a single API call |

### Specialized
| Tool | Description |
|---|---|
| `ga4_get_metadata` | List all available dimensions and metrics for a property |
| `ga4_run_funnel_report` | Run a funnel exploration report |
| `ga4_check_compatibility` | Check if dimensions and metrics can be used together |

## Troubleshooting

**PERMISSION_DENIED**: The Google user whose refresh token you used doesn't have access to this property. Check their permissions in GA4 Admin.

**INVALID_ARGUMENT**: A dimension or metric name is invalid. Run `ga4_get_metadata` to see all available fields for your property.

**RESOURCE_EXHAUSTED**: GA4 API quota exceeded. The Data API allows ~60 core requests per property per hour on the free tier. Wait and retry.

**NOT_FOUND**: The property ID doesn't exist or isn't accessible. Run `ga4_list_properties` to see available properties.

**Token expired / invalid_grant**: The refresh token may have been revoked. Re-run `scripts/get-refresh-token.ts` to get a new one.
