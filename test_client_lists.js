// Test script for client lists functionality
// This simulates the behavior of the S4S LinkedIn Tool with client lists

// Sample client lists (as they would be loaded from CSV/Excel)
const clientLists = {
  currentClients: [
    "3D Systems",
    "A10 Networks", 
    "Aeris Communications",
    "Amazon or AWS or Amazon Web Services",
    "Arrow Electronics",
    "Axcient",
    "Beyond Identity",
    "Broadcom",
    "Celigo",
    "Centrify",
    "Cisco",
    "Cloudian",
    "Cohesity",
    "Commonwealth of Pennsylvania",
    "Commvault",
    "Conversica",
    "Copado",
    "Cyral",
    "D2iQ",
    "Datameer",
    "Datera",
    "Department of the Air Force",
    "Druva",
    "Enphase Energy",
    "Equinix",
    "Exasol"
  ],
  excludedClients: [
    "Bristol Myers Squibb",
    "Lockheed Martin"
  ]
};

// Test posts data
const testPosts = [
  {
    name: "John Smith",
    title: "Senior Marketing Manager",
    company: "Cisco",
    connection_degree: "2nd",
    post_url: "https://linkedin.com/posts/test1",
    linkedin_profile_url: "https://linkedin.com/in/johnsmith",
    post_date: "2024-01-15",
    exact_date: true,
    post_content: "We're hiring! Looking for a Marketing Specialist to join our team. Great opportunity to work with cutting-edge technology."
  },
  {
    name: "Sarah Johnson",
    title: "HR Director",
    company: "AWS",
    connection_degree: "3rd",
    post_url: "https://linkedin.com/posts/test2",
    linkedin_profile_url: "https://linkedin.com/in/sarahjohnson",
    post_date: "2024-01-16",
    exact_date: true,
    post_content: "Excited to announce we're expanding our team! Looking for talented professionals to join AWS. Apply now!"
  },
  {
    name: "Mike Davis",
    title: "Talent Acquisition",
    company: "Broadcom",
    connection_degree: "2nd",
    post_url: "https://linkedin.com/posts/test3",
    linkedin_profile_url: "https://linkedin.com/in/mikedavis",
    post_date: "2024-01-17",
    exact_date: true,
    post_content: "Broadcom is hiring! Multiple positions available across different departments. Great benefits and culture."
  },
  {
    name: "Lisa Wilson",
    title: "Recruiting Manager",
    company: "Bristol Myers Squibb",
    connection_degree: "3rd",
    post_url: "https://linkedin.com/posts/test4",
    linkedin_profile_url: "https://linkedin.com/in/lisawilson",
    post_date: "2024-01-18",
    exact_date: true,
    post_content: "We have several open positions at Bristol Myers Squibb. Looking for experienced professionals to join our growing team."
  },
  {
    name: "David Brown",
    title: "HR Specialist",
    company: "Lockheed Martin",
    connection_degree: "2nd",
    post_url: "https://linkedin.com/posts/test5",
    linkedin_profile_url: "https://linkedin.com/in/davidbrown",
    post_date: "2024-01-19",
    exact_date: true,
    post_content: "Lockheed Martin is expanding! We're looking for talented individuals to fill various roles. Competitive salary and benefits."
  },
  {
    name: "Jennifer Lee",
    title: "Talent Manager",
    company: "Equinix",
    connection_degree: "3rd",
    post_url: "https://linkedin.com/posts/test6",
    linkedin_profile_url: "https://linkedin.com/in/jenniferlee",
    post_date: "2024-01-20",
    exact_date: true,
    post_content: "Equinix is hiring! We're looking for passionate professionals to help us continue our growth and innovation."
  },
  {
    name: "Robert Taylor",
    title: "Recruitment Lead",
    company: "Commvault",
    connection_degree: "2nd",
    post_url: "https://linkedin.com/posts/test7",
    linkedin_profile_url: "https://linkedin.com/in/roberttaylor",
    post_date: "2024-01-21",
    exact_date: true,
    post_content: "Commvault has exciting opportunities available! Join our team and be part of something amazing. Multiple positions open."
  },
  {
    name: "Amanda Garcia",
    title: "HR Coordinator",
    company: "Druva",
    connection_degree: "3rd",
    post_url: "https://linkedin.com/posts/test8",
    linkedin_profile_url: "https://linkedin.com/in/amandagarcia",
    post_date: "2024-01-22",
    exact_date: true,
    post_content: "Druva is growing and we need talented people! Various positions available with great growth opportunities."
  },
  {
    name: "Chris Martinez",
    title: "Talent Acquisition Specialist",
    company: "Cohesity",
    connection_degree: "2nd",
    post_url: "https://linkedin.com/posts/test9",
    linkedin_profile_url: "https://linkedin.com/in/chrismartinez",
    post_date: "2024-01-23",
    exact_date: true,
    post_content: "Cohesity is hiring! We're looking for motivated professionals to join our dynamic team. Apply today!"
  },
  {
    name: "Michelle Rodriguez",
    title: "HR Manager",
    company: "Celigo",
    connection_degree: "3rd",
    post_url: "https://linkedin.com/posts/test10",
    linkedin_profile_url: "https://linkedin.com/in/michellerodriguez",
    post_date: "2024-01-24",
    exact_date: true,
    post_content: "Celigo has exciting career opportunities! We're expanding our team and looking for the best talent."
  },
  {
    name: "Kevin Thompson",
    title: "Marketing Director",
    company: "Microsoft",
    connection_degree: "2nd",
    post_url: "https://linkedin.com/posts/test11",
    linkedin_profile_url: "https://linkedin.com/in/kevinthompson",
    post_date: "2024-01-25",
    exact_date: true,
    post_content: "Microsoft is hiring! We have several marketing positions available. Great company culture and benefits."
  },
  {
    name: "Rachel Green",
    title: "Talent Acquisition Manager",
    company: "Google",
    connection_degree: "3rd",
    post_url: "https://linkedin.com/posts/test12",
    linkedin_profile_url: "https://linkedin.com/in/rachelgreen",
    post_date: "2024-01-26",
    exact_date: true,
    post_content: "Google is expanding our team! Looking for talented professionals to join us. Amazing opportunities available."
  },
  {
    name: "Alex Thompson",
    title: "HR Director",
    company: "Cisco",
    connection_degree: "1st",
    post_url: "https://linkedin.com/posts/test13",
    linkedin_profile_url: "https://linkedin.com/in/alexthompson",
    post_date: "2024-01-27",
    exact_date: true,
    post_content: "Cisco is hiring! We have several HR positions available. Great company culture and benefits."
  },
  {
    name: "Maria Rodriguez",
    title: "Talent Manager",
    company: "Microsoft",
    connection_degree: "1st",
    post_url: "https://linkedin.com/posts/test14",
    linkedin_profile_url: "https://linkedin.com/in/mariarodriguez",
    post_date: "2024-01-28",
    exact_date: true,
    post_content: "Microsoft is expanding our team! Looking for talented professionals to join us. Amazing opportunities available."
  }
];

// Function to check if a company is a current/past client
function isCurrentClient(companyName) {
  return clientLists.currentClients.some(client => 
    companyName && client && 
    companyName.toLowerCase().includes(client.toLowerCase()) || 
    client.toLowerCase().includes(companyName.toLowerCase())
  );
}

// Function to check if a company is excluded
function isExcludedClient(companyName) {
  return clientLists.excludedClients.some(client => 
    companyName && client && 
    companyName.toLowerCase().includes(client.toLowerCase()) || 
    client.toLowerCase().includes(companyName.toLowerCase())
  );
}

// Function to generate connection message based on client type
function generateConnectionMessage(post) {
  const { name, connection_degree, title, company } = post;
  
  if (isExcludedClient(company)) {
    return "BLOCKED - Company is excluded";
  }
  
  // Clean up connection degree
  const cleanConnectionDegree = connection_degree ? connection_degree.toLowerCase().replace(/\s+/g, '') : '3rd';
  
  // Handle first-degree connections first
  if (cleanConnectionDegree.includes('1st') || cleanConnectionDegree.includes('first')) {
    if (isCurrentClient(company)) {
      // Approved vendor message for first-degree connections
      return `Hi ${name.split(' ')[0]},

I noticed on LinkedIn that you are hiring for your team.

I wanted to take a moment to re-introduce myself and my company, Stage 4 Solutions, an interim staffing company ranked on the Inc. 5000 list five times for consistent growth. We are an approved vendor for "${company}".

For the last 23 years, we have filled gaps across marketing, IT and operations teams - nationwide. We are in the top 9% of staffing firms nationally!

I noticed on LinkedIn that you are hiring for your team. We have quickly filled gaps at our clients such as NetApp, AWS, Salesforce, ServiceNow, and HPE. Here's what our clients say about us: https://www.stage4solutions.com/clientsuccess/testimonials/

We specialize in providing timely, cost-effective, and well-qualified professionals for contract (full or part-time) and contract to perm roles.

I would love to support you in filling any gaps in your team with well-qualified contractors.

What is a good time to talk over the next couple of weeks? Please let me know and I will send you a meeting invite.

Looking forward to our conversation,

Niti`;
    } else {
      // Regular first-degree connection message
      return `Hi ${name.split(' ')[0]},

I noticed on LinkedIn that you are hiring for your team.

I wanted to take a moment to re-introduce myself and my company, Stage 4 Solutions, an interim staffing company ranked on the Inc. 5000 list five times for consistent growth.

For the last 23 years, we have filled gaps across marketing, IT and operations teams - nationwide. We are in the top 9% of staffing firms nationally!

I noticed on LinkedIn that you are hiring for your team. We have quickly filled gaps at our clients such as NetApp, AWS, Salesforce, ServiceNow, and HPE. Here's what our clients say about us: https://www.stage4solutions.com/clientsuccess/testimonials/

We specialize in providing timely, cost-effective, and well-qualified professionals for contract (full or part-time) and contract to perm roles.

I would love to support you in filling any gaps in your team with well-qualified contractors.

What is a good time to talk over the next couple of weeks? Please let me know and I will send you a meeting invite.

Looking forward to our conversation,

Niti`;
    }
  }
  
  // Handle 2nd degree connections
  if (cleanConnectionDegree.includes('2nd') || cleanConnectionDegree.includes('second')) {
    return `Hi ${name.split(' ')[0]},

I am the CEO of Stage 4 Solutions, a consulting and interim staffing company ranked on Inc.5000 list five times. We share many connections on LinkedIn. I noticed your company is growing and thought it would be great to connect.

Thanks!
Niti`;
  }
  
  // Handle current/past clients (for non-first-degree connections)
  if (isCurrentClient(company)) {
    return `Hi ${name.split(' ')[0]},

Thank you for accepting my connection request.

I wanted to take a moment to introduce myself and my company, Stage 4 Solutions, an interim staffing company ranked on the Inc. 5000 list five times for consistent growth. We previously supported "${company}" as an approved vendor.

For the last 23 years, we have filled gaps across marketing, IT, and operations teams - nationwide. We are in the top 9% of staffing firms nationally!

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
  
  // Standard message for 3rd degree and neutral clients
  return `Hi ${name.split(' ')[0]},

I am the CEO of Stage 4 Solutions, a consulting and interim staffing company ranked on Inc.5000 list five times. I noticed your company is growing and thought it would be great to connect.

Thanks!
Niti`;
}

// Function to process posts and generate results
function processPosts(posts) {
  const results = {
    currentPastClients: [],
    excludedClients: [],
    neutralClients: [],
    csvData: []
  };
  
  posts.forEach(post => {
    const connectionMessage = generateConnectionMessage(post);
    const isBlocked = isExcludedClient(post.company);
    
    const csvRow = {
      name: post.name,
      title: post.title,
      company: post.company,
      connection_degree: post.connection_degree,
      post_url: post.post_url,
      linkedin_profile_url: post.linkedin_profile_url,
      post_date: post.post_date,
      exact_date: post.exact_date,
      post_content: post.post_content,
      connection_message: connectionMessage,
      blocked_status: isBlocked ? "BLOCKED" : ""
    };
    
    results.csvData.push(csvRow);
    
    if (isCurrentClient(post.company)) {
      results.currentPastClients.push(post);
    } else if (isExcludedClient(post.company)) {
      results.excludedClients.push(post);
    } else {
      results.neutralClients.push(post);
    }
  });
  
  return results;
}

// Run the test
console.log("=== S4S LinkedIn Tool - Client Lists Test ===\n");

console.log("Loaded Client Lists:");
console.log("Current/Past Clients:", clientLists.currentClients);
  console.log("Excluded Clients:", clientLists.excludedClients);
console.log("");

const results = processPosts(testPosts);

console.log("=== Test Results ===\n");

console.log(`Current/Past Client Posts (${results.currentPastClients.length}):`);
results.currentPastClients.forEach(post => {
  console.log(`✓ ${post.name} - ${post.company} - ${post.title}`);
});
console.log("");

  console.log(`Excluded Client Posts (${results.excludedClients.length}):`);
  results.excludedClients.forEach(post => {
  console.log(`✗ ${post.name} - ${post.company} - ${post.title} - BLOCKED`);
});
console.log("");

console.log(`Neutral Client Posts (${results.neutralClients.length}):`);
results.neutralClients.forEach(post => {
  console.log(`○ ${post.name} - ${post.company} - ${post.title}`);
});
console.log("");

console.log("=== CSV Export Sample ===");
console.log("Name,Title,Company,Connection Degree,Post URL,LinkedIn Profile URL,Post Date,Exact Date,Post Content,Connection Message,Blocked Status");
results.csvData.forEach(row => {
  console.log(`"${row.name}","${row.title}","${row.company}","${row.connection_degree}","${row.post_url}","${row.linkedin_profile_url}","${row.post_date}","${row.exact_date}","${row.post_content.substring(0, 50)}...","${row.connection_message.substring(0, 50)}...","${row.blocked_status}"`);
});

console.log("\n=== Test Summary ===");
console.log(`Total Posts: ${testPosts.length}`);
console.log(`Current/Past Client Posts: ${results.currentPastClients.length}`);
console.log(`Excluded Client Posts: ${results.excludedClients.length}`);
console.log(`Neutral Client Posts: ${results.neutralClients.length}`);
console.log(`Blocked Posts: ${results.csvData.filter(row => row.blocked_status === "BLOCKED").length}`);

console.log("\n=== Expected Behavior Verification ===");

// Verify current/past client behavior (now includes first-degree connections)
const currentPastTest = results.currentPastClients.length === 9; // 8 original + 1 first-degree (Cisco)
console.log(`✓ Current/Past Client Posts (${results.currentPastClients.length}/9): ${currentPastTest ? "PASS" : "FAIL"}`);

// Verify excluded client behavior
const excludedTest = results.excludedClients.length === 2;
console.log(`✓ Excluded Client Posts (${results.excludedClients.length}/2): ${excludedTest ? "PASS" : "FAIL"}`);

// Verify neutral client behavior (now includes first-degree Microsoft)
const neutralTest = results.neutralClients.length === 3; // 2 original + 1 first-degree (Microsoft)
console.log(`✓ Neutral Client Posts (${results.neutralClients.length}/3): ${neutralTest ? "PASS" : "FAIL"}`);

// Verify blocked status
const blockedTest = results.csvData.filter(row => row.blocked_status === "BLOCKED").length === 2;
console.log(`✓ Blocked Status (${results.csvData.filter(row => row.blocked_status === "BLOCKED").length}/2): ${blockedTest ? "PASS" : "FAIL"}`);

// Verify connection messages
const currentPastMessageTest = results.currentPastClients.every(post => {
  const csvRow = results.csvData.find(row => row.name === post.name && row.company === post.company);
  const message = csvRow.connection_message;
  // For first-degree connections, check for "approved vendor" message
  if (post.connection_degree && (post.connection_degree.toLowerCase().includes('1st') || post.connection_degree.toLowerCase().includes('first'))) {
    return message.includes("We are an approved vendor for");
  }
  // For other connections, check for "previously supported" message
  return message.includes("We previously supported");
});
console.log(`✓ Current/Past Client Messages: ${currentPastMessageTest ? "PASS" : "FAIL"}`);

const excludedMessageTest = results.excludedClients.every(post => {
  const csvRow = results.csvData.find(row => row.name === post.name && row.company === post.company);
  return csvRow.connection_message === "BLOCKED - Company is excluded";
});
console.log(`✓ Excluded Client Messages: ${excludedMessageTest ? "PASS" : "FAIL"}`);

// Verify first-degree connection messages
const firstDegreeTest = results.csvData.filter(row => 
  row.connection_degree && (row.connection_degree.toLowerCase().includes('1st') || row.connection_degree.toLowerCase().includes('first'))
).every(row => {
  const message = row.connection_message;
  if (isCurrentClient(row.company)) {
    return message.includes("We are an approved vendor for");
  } else {
    return message.includes("Stage 4 Solutions") && !message.includes("approved vendor");
  }
});
console.log(`✓ First-Degree Connection Messages: ${firstDegreeTest ? "PASS" : "FAIL"}`);

console.log("\n=== Test Complete ==="); 