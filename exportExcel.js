// Export leads to CSV (opens in Excel)
window.exportLeadsToCSV = async function(leads) {
  if (!leads || !Array.isArray(leads) || leads.length === 0) {
    alert('No leads to export!');
    return;
  }
  
  // Helper function to escape CSV fields
  function escapeCSVField(field) {
    if (field === null || field === undefined) return '';
    
    // Convert to string and handle quotes
    const str = String(field);
    
    // If field contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    
    return str;
  }

  // Helper function to check if company is in client lists
  async function isCurrentClient(companyName) {
    try {
      const result = await chrome.storage.local.get(['clientLists']);
      const clientLists = result.clientLists || { currentClients: [], blacklistedClients: [] };
      return clientLists.currentClients.some(client => 
        companyName && client && 
        companyName.toLowerCase().includes(client.toLowerCase()) || 
        client.toLowerCase().includes(companyName.toLowerCase())
      );
    } catch (error) {
      console.error('[S4S] Error checking current client:', error);
      return false;
    }
  }

  async function isExcludedClient(companyName) {
    try {
      const result = await chrome.storage.local.get(['clientLists']);
      const clientLists = result.clientLists || { currentClients: [], excludedClients: [] };
      return clientLists.excludedClients.some(client => 
        companyName && client && 
        companyName.toLowerCase().includes(client.toLowerCase()) || 
        client.toLowerCase().includes(companyName.toLowerCase())
      );
    } catch (error) {
      console.error('[S4S] Error checking excluded client:', error);
      return false;
    }
  }

  // Helper function to generate connection message
  async function generateConnectionMessage(name, connectionDegree, title, company) {
    // Check if this is a company account
    const isCompanyAccount = title && (title.toLowerCase().includes('company account') || title.toLowerCase().includes('business account'));
    
    // Extract first name from full name (only if not a company account)
    let firstName = 'there';
    if (!isCompanyAccount && name) {
      firstName = name.split(' ')[0];
    }
    
    // Check if company is in client lists
    const isCurrentClientFlag = await isCurrentClient(company);
    const isExcludedFlag = await isExcludedClient(company);
    
    // If excluded, return a blocked message
    if (isExcludedFlag) {
      return `BLOCKED - Company is excluded`;
    }
    
    // If current/past client, use the special message format
    if (isCurrentClientFlag) {
      return `Hi ${firstName},

Thank you for accepting my connection request.

I wanted to take a moment to introduce myself and my company, Stage 4 Solutions, an interim staffing company ranked on the Inc. 5000 list five times for consistent growth. We previously supported "${company}" as an approved vendor.

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
www.stage4solutions.com/`;
    }
    
    // Clean up connection degree
    const cleanConnectionDegree = connectionDegree ? connectionDegree.toLowerCase().replace(/\s+/g, '') : '3rd';
    
    if (cleanConnectionDegree.includes('2nd') || cleanConnectionDegree.includes('second')) {
      return `Hi ${firstName},

I am the CEO of Stage 4 Solutions, a consulting and interim staffing company ranked on Inc.5000 list five times. We share many connections on LinkedIn. I noticed your company is growing and thought it would be great to connect.

Thanks!
Niti`;
    } else {
      // Default for 3rd connections and any other degree
      return `Hi ${firstName},

I am the CEO of Stage 4 Solutions, a consulting and interim staffing company ranked on Inc.5000 list five times. I noticed your company is growing and thought it would be great to connect.

Thanks!
Niti`;
    }
  }
  
  // Create CSV content
  const headers = ['Name', 'Title', 'Company', 'Position Hiring For', 'Connection Degree', 'Connection Note', 'Blocked Status', 'Post URL', 'LinkedIn Profile URL', 'Post Date', 'Post Content'];
  const csvRows = [];
  
  // Add headers
  csvRows.push(headers.map(escapeCSVField).join(','));
  
  // Add data rows
  for (const lead of leads) {
    // Generate connection message
    const connectionMessage = await generateConnectionMessage(
      lead.name, 
      lead.connectionDegree || '3rd', 
      lead.title, 
      lead.company
    );
    
    // Determine blocked status
            const isExcluded = await isExcludedClient(lead.company);
        const blockedStatus = isExcluded ? 'BLOCKED' : '';
    
    const row = [
      lead.name || '',
      lead.title || 'Unknown Title',
      lead.company || 'Unknown Company',
      lead.position || 'None found in post',
      lead.connectionDegree || '3rd',
      connectionMessage,
      blockedStatus,
      lead.postUrl || lead.post_url || '',
      lead.linkedinUrl || lead.linkedin_profile_url || '',
      lead.postDate || lead.post_date || '',
      lead.content || lead.post_content || lead.message || ''
    ];
    csvRows.push(row.map(escapeCSVField).join(','));
  }
  
  const csvContent = csvRows.join('\n');
  
  // Create and download file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.download = `linkedin_leads_${timestamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Keep the old function name for backward compatibility
window.exportLeadsToExcel = window.exportLeadsToCSV;