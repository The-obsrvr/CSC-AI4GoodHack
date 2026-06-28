# Burundi Information and Funding Retrieval System

Minimal TypeScript pipeline with lifecycle agents:

- `SourceAgent` fetches RSS articles
- `RetrievalAgent` scores and filters articles by keywords, organization matches, and embeddings
- `FundingExtractionAgent` extracts deadline, sponsor, amount, and eligibility details
- `ClassificationAgent` classifies articles
- `RankingAgent` computes the final score and rank
- `ReportAgent` produces a German email newsletter in HTML and plain text

## Installation & Setup

### Prerequisites

- Node.js 22+ recommended
- npm
- A Gmail account with an app password
- An OpenAI API key

### Install Dependencies

```bash
npm install
```

Core dependencies used by the system:

- rss-parser - reads RSS feeds in SourceAgent
- node-fetch - fetches article pages and API requests
- cheerio - extracts article content from HTML
- csv-parse - loads organization data from CSV
- dotenv - loads environment variables from .env
- nodemailer - sends newsletters through Gmail SMTP
- node-cron - schedules automatic pipeline runs

### Environment Variables
Create a .env file in the project root:
```shell
touch .env

OPENAI_API_KEY=your_openai_api_key
GMAIL_USER=your_gmail_address
GMAIL_APP_PASSWORD=your_gmail_app_password
NEWSLETTER_RECIPIENT=recipient@example.com
```

Notes:
- OPENAI_API_KEY enables embeddings, classification, funding extraction, and German report generation.
- GMAIL_USER and GMAIL_APP_PASSWORD are required only when sending emails.
- If NEWSLETTER_RECIPIENT is missing, the pipeline logs the newsletter output instead of sending email.
- Multiple recipients can be comma-separated.


## Manual Run

Use the manual trigger entrypoint:

```shell
node run.ts
```

This runs:
SourceAgent
→ RetrievalAgent
→ FundingExtractionAgent
→ ClassificationAgent
→ RankingAgent
→ ReportAgent
→ GmailClient, if NEWSLETTER_RECIPIENT is configured


## Scheduled Run

The scheduler uses node-cron and runs in the Africa/Bujumbura timezone at:
```
0 5,10,15,20 * * *
```

Start the scheduler with:
```shell
node Scheduler.ts
```
This calls:
```Pipeline.run({ trigger: "scheduled" })```


