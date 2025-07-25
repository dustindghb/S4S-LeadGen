// Export leads to CSV (opens in Excel)
window.exportLeadsToCSV = function(leads) {
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
  
  // Create CSV content
  const headers = ['Name', 'Title', 'Company', 'Position Hiring For', 'Connection Degree', 'Connection Note', 'Post URL', 'LinkedIn Profile URL', 'Post Date', 'Post Content'];
  const csvRows = [];
  
  // Add headers
  csvRows.push(headers.map(escapeCSVField).join(','));
  
  // Add data rows
  leads.forEach(lead => {
    // Generate connection message
    const isCompanyAccount = lead.title && (lead.title.toLowerCase().includes('company account') || lead.title.toLowerCase().includes('business account'));
    
    let firstName = 'there';
    if (!isCompanyAccount && lead.name) {
      firstName = lead.name.split(' ')[0];
    }
    
    const connectionDegree = lead.connectionDegree || '3rd';
    const cleanConnectionDegree = connectionDegree.toLowerCase().replace(/\s+/g, '');
    
    let connectionMessage;
    if (cleanConnectionDegree.includes('2nd') || cleanConnectionDegree.includes('second')) {
      connectionMessage = `Hi ${firstName},

I am the CEO of Stage 4 Solutions, a consulting and interim staffing company ranked on Inc.5000 list five times. We share many connections on LinkedIn. I noticed your company is growing and thought it would be great to connect.

Thanks!
Niti`;
    } else {
      connectionMessage = `Hi ${firstName},

I am the CEO of Stage 4 Solutions, a consulting and interim staffing company ranked on Inc.5000 list five times. I noticed your company is growing and thought it would be great to connect.

Thanks!
Niti`;
    }
    
    const row = [
      lead.name || '',
      lead.title || 'Unknown Title',
      lead.company || 'Unknown Company',
      lead.position || 'None found in post',
      lead.connectionDegree || '3rd',
      connectionMessage,
      lead.postUrl || lead.post_url || '',
      lead.linkedinUrl || lead.linkedin_profile_url || '',
      lead.postDate || lead.post_date || '',
      lead.content || lead.post_content || lead.message || ''
    ];
    csvRows.push(row.map(escapeCSVField).join(','));
  });
  
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