# Client Lists Feature

## Overview
The S4S LinkedIn Tool now includes a client lists management feature that allows you to upload an Excel/CSV file containing current/past clients and blacklisted clients. This feature customizes connection messages and marks blocked companies in the generated leads.

## How to Use

### 1. Access the Settings
- Click the settings gear icon (⚙️) in the extension popup
- Navigate to the "Client Lists Management" section

### 2. Upload Your Client Lists
- Click "Choose File" and select your Excel or CSV file
- Click "Upload" to process the file
- The system will display the number of current/past clients and blacklisted clients loaded

### 3. File Format
Your Excel/CSV file should have two columns:
- **Column A**: Current/Past Clients (companies you've worked with)
- **Column B**: Blacklisted Clients (companies you want to avoid)

Example format:
```
Current/Past Clients | Blacklisted Clients
NetApp              | Company A
AWS                 | Company B
Salesforce          | Company C
ServiceNow          | Company D
HPE                 | Company E
```

### 4. How It Works

#### For Current/Past Clients:
When a lead's company matches a current/past client, the tool generates a special message that mentions your previous relationship:

```
Hi [FirstName],

Thank you for accepting my connection request.

I wanted to take a moment to introduce myself and my company, Stage 4 Solutions, an interim staffing company ranked on the Inc. 5000 list five times for consistent growth. We previously supported "[COMPANY NAME]" as an approved vendor.

For the last 23 years, we have filled gaps across marketing, IT, and operations teams – nationwide. We are in the top 9% of staffing firms nationally!

I noticed on LinkedIn that you are hiring for your team. We have quickly filled gaps at our clients such as NetApp, AWS, Salesforce, ServiceNow, and HPE. Here's what our clients say about us: https://www.stage4solutions.com/clientsuccess/testimonials/

We specialize in providing timely, cost-effective, and well-qualified professionals for contract (full or part-time) and contract to perm roles.

I would love to support you in filling any gaps in your team with well-qualified contractors.

What is a good time to talk over the next couple of weeks? Please let me know and I will send you a meeting invite.

Looking forward to our conversation,

Niti

*******************************

Niti Agrawal
CEO
Stage 4 Solutions, Inc.
Consulting & Interim Staffing
niti@stage4solutions.com
408-887-1033 (cell)
www.stage4solutions.com/
```

#### For Blacklisted Clients:
When a lead's company matches a blacklisted client, the tool:
- Marks the lead as "BLOCKED" in the CSV export
- Sets the connection message to "BLOCKED - Company is blacklisted"

### 5. CSV Export Changes
The exported CSV now includes a new "Blocked Status" column that shows "BLOCKED" for companies in your blacklist.

### 6. Managing Your Lists
- **View Status**: The settings page shows how many companies are loaded in each list
- **Clear Lists**: Click "Clear Client Lists" to remove all loaded companies
- **Update Lists**: Upload a new file to replace the current lists

## Technical Notes
- The system performs case-insensitive matching
- Partial matches are supported (e.g., "NetApp" will match "NetApp Inc.")
- Currently supports CSV files (Excel support coming soon)
- Client lists are stored locally in your browser's extension storage
- Lists persist between browser sessions

## Troubleshooting
- **File not uploading**: Ensure your file is in CSV format
- **No matches found**: Check that company names in your file match the LinkedIn company names
- **Lists not loading**: Try refreshing the extension or clearing and re-uploading your lists 