// Default prompt for lead finding
const DEFAULT_PROMPT = `SYSTEM: You are a JSON-only response bot. You must return ONLY valid JSON. No text, no analysis, no explanations.

TASK: Filter the LinkedIn posts below and return ONLY posts that contain hiring-related keywords.

HIRING KEYWORDS TO LOOK FOR:
- "hiring", "we're hiring", "looking to hire", "hiring for"
- "recruiting", "recruiter", "recruitment"
- "job opportunity", "open position", "job opening", "position available"
- "join our team", "we're looking for", "apply now", "apply today"
- "career opportunity", "employment", "job posting"

OUTPUT FORMAT - RETURN ONLY THIS JSON STRUCTURE:
[
  {
    "name": "exact name from post",
    "headline": "exact headline from post",
    "linkedin_profile_url": "exact URL from post", 
    "age": "exact age from post",
    "message": "exact message from post",
    "hiring_reason": "keyword found: [specific keyword]"
  }
]

RULES:
1. Return ONLY the JSON array above
2. No text before or after the JSON
3. No analysis, categorization, or explanations
4. If no hiring posts found, return: []
5. Copy exact values from the original posts

LinkedIn Posts Data:
{data}`;

// Helper to get the most recently active LinkedIn tab
async function getMostRecentLinkedInTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: '*://www.linkedin.com/*' }, (tabs) => {
      if (tabs && tabs.length > 0) {
        let targetTab = tabs[0];
        for (const tab of tabs) {
          if (!targetTab.lastAccessed || (tab.lastAccessed && tab.lastAccessed > targetTab.lastAccessed)) {
            targetTab = tab;
          }
        }
        resolve(targetTab);
      } else {
        resolve(null);
      }
    });
  });
}

// Function to ensure content script is injected
async function ensureContentScriptInjected() {
    try {
      // First try to inject via background script
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'injectContentScript' }, resolve);
      });
      
      if (response && response.success) {
        return response.tabId;
      }
    } catch (error) {
      // Background injection failed, trying direct injection
    }
    
    // Fallback: try direct injection
    try {
      const tab = await getMostRecentLinkedInTab();
      if (tab && tab.url && tab.url.includes('linkedin.com')) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        return tab.id;
      }
    } catch (error) {
      return null;
    }
    
    return null;
  }
  
  // Function to send message to content script with timeout
  async function sendMessage(tabId, message, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Message timeout'));
      }, timeout);
      
      chrome.tabs.sendMessage(tabId, message, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
  
  // Function to test if content script is responsive
  async function testContentScript(tabId) {
    try {
      const response = await sendMessage(tabId, { action: "ping" }, 3000);
      return response && response.success;
    } catch (error) {
      return false;
    }
  }
  
  // Function to organize data into JSON format
  function organizeDataForJSON(posts) {
    return posts.map(post => ({
      name: post.name || 'Unknown',
      title: post.title || 'Unknown Title',
      company: post.company || 'Unknown Company',
      connection_degree: post.connectionDegree || '3rd',
      post_url: post.postUrl || '',
      linkedin_profile_url: post.linkedinUrl || '',
      post_date: post.postDate || '',
      exact_date: post.exactDate || false,
      post_content: post.content || ''
    }));
  }
  
  // Function to safely stringify JSON with proper encoding
  function safeJSONStringify(obj) {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (error) {
      console.error('[S4S] Error stringifying JSON:', error);
      // Fallback: try to stringify with replacer function
      return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'string') {
          // Ensure proper UTF-8 encoding
          return value;
        }
        return value;
      }, 2);
    }
  }
  
  // Function to download JSON file
  function downloadJSON(data, filename) {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  
  // Function to display JSON data
  function displayJSONData(posts) {
    const resultsDiv = document.getElementById('results');
    const jsonData = organizeDataForJSON(posts);
    const jsonString = safeJSONStringify(jsonData);
    
    resultsDiv.innerHTML = `<div class="json-display">${jsonString}</div>`;
  }

  // Function to send message to background script
  async function sendMessageToBackground(message) {
    return new Promise((resolve, reject) => {
      console.log('Sending message to background:', message);
      
      chrome.runtime.sendMessage(message, (response) => {
        console.log('Background response:', response);
        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  // Function to test Ollama connection and available models
  async function testOllamaConnection() {
    try {
      console.log('[S4S] Testing Ollama connection...');
      
      // Test basic connection
      const pingResponse = await sendMessageToBackground({
        action: 'ollamaRequest',
        endpoint: '/api/tags',
        method: 'GET'
      });
      
      if (!pingResponse || !pingResponse.success) {
        throw new Error('Failed to connect to Ollama');
      }
      
      console.log('[S4S] Ollama connection successful');
      
      // Check available models
      const models = pingResponse.data?.models || [];
      console.log('[S4S] Available models:', models.map(m => m.name));
      
      // Check if our preferred models are available
      const availableModels = models.map(m => m.name);
      const hasGemma3 = availableModels.some(m => m.includes('gemma3'));
      
      console.log('[S4S] Model availability - gemma3:', hasGemma3);
      
      return { success: true, models: availableModels, hasGemma3 };
    } catch (error) {
      console.error('[S4S] Ollama connection test failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Function to check if a single post is about hiring
  async function checkIfPostIsHiring(post) {
    // Simplified prompt with only essential information
    const hiringPrompt = `SYSTEM: You are a hiring post classifier. Return ONLY "YES" or "NO".

TASK: Determine if this LinkedIn post is about hiring, recruiting, job opportunities, or employment.

HIRING KEYWORDS: hiring, recruiting, job opportunity, open position, join our team, apply now, career opportunity, employment

POST CONTENT: ${post.content || post.message || ''}
POST HEADLINE: ${post.headline || ''}

RESPONSE: Return ONLY "YES" or "NO"`;

    const response = await sendMessageToBackground({
      action: 'ollamaRequest',
      endpoint: '/api/generate',
      method: 'POST',
      body: {
        model: 'gemma3:12b', // Use the correct model name
        prompt: hiringPrompt,
        stream: false,
        options: {
          temperature: 0.1, // Lower temperature for more consistent results
          num_predict: 10   // Limit response length
        }
      }
    });
    
    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to get response from Ollama');
    }
    
    const result = response.data.response.trim().toUpperCase();
    return result === 'YES';
  }

  // Function to extract title and company from a post's headline
  async function extractTitleAndCompany(post) {
    console.log(`[S4S] Extracting title/company for post:`, {
      name: post.name,
      headline: post.headline,
      content: post.content?.substring(0, 100) + '...'
    });
    
    // If no headline, try to extract from content or use a fallback
    let headlineText = post.headline || '';
    if (!headlineText && post.content) {
      // Try to extract a potential headline from the first few lines of content
      const firstLine = post.content.split('\n')[0];
      if (firstLine && firstLine.length > 10 && firstLine.length < 100) {
        headlineText = firstLine;
        console.log(`[S4S] Using first line of content as headline: "${headlineText}"`);
      }
    }
    
    if (!headlineText) {
      console.log(`[S4S] No headline found for post "${post.name}", using fallback`);
      return {
        title: 'Unknown Title',
        company: 'Unknown Company'
      };
    }
    
    const titleCompanyPrompt = `SYSTEM: You are a professional information extractor. Return ONLY valid JSON.

TASK: Extract the job title and company name from the LinkedIn headline.

HEADLINE: ${headlineText}

OUTPUT FORMAT - RETURN ONLY THIS JSON:
{
  "title": "exact job title or 'Unknown Title' if not found",
  "company": "exact company name or 'Unknown Company' if not found"
}

RULES:
1. Return ONLY the JSON object above
2. No text before or after the JSON
3. If title/company cannot be determined, use "Unknown Title"/"Unknown Company"
4. Copy exact values from the headline
5. Separate title and company if they are combined (e.g., "Software Engineer at Google" -> title: "Software Engineer", company: "Google")
6. Handle various formats: "Title at Company", "Title, Company", "Title • Company", etc.

EXAMPLES:
- "Software Engineer at Google" -> {"title": "Software Engineer", "company": "Google"}
- "Marketing Manager, Apple Inc." -> {"title": "Marketing Manager", "company": "Apple Inc."}
- "CEO • Startup" -> {"title": "CEO", "company": "Startup"}
- "Just a title" -> {"title": "Just a title", "company": "Unknown Company"}

RESPONSE:`;

    console.log(`[S4S] Sending prompt to Ollama:`, titleCompanyPrompt);

    const response = await sendMessageToBackground({
      action: 'ollamaRequest',
      endpoint: '/api/generate',
      method: 'POST',
      body: {
        model: 'gemma3:12b',
        prompt: titleCompanyPrompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 150
        }
      }
    });
    
    if (!response || !response.success) {
      console.error(`[S4S] Ollama request failed:`, response);
      throw new Error(response?.error || 'Failed to get response from Ollama');
    }
    
    console.log(`[S4S] Ollama response:`, response.data.response);
    
    try {
      const result = JSON.parse(response.data.response.trim());
      console.log(`[S4S] Parsed result:`, result);
      return {
        title: result.title || 'Unknown Title',
        company: result.company || 'Unknown Company'
      };
    } catch (error) {
      console.error('[S4S] Error parsing title/company response:', error);
      console.error('[S4S] Raw response was:', response.data.response);
      
      // Try to extract manually if JSON parsing fails
      const responseText = response.data.response.trim();
      if (responseText.includes('"title"') && responseText.includes('"company"')) {
        try {
          // Try to find JSON-like structure in the response
          const titleMatch = responseText.match(/"title"\s*:\s*"([^"]+)"/);
          const companyMatch = responseText.match(/"company"\s*:\s*"([^"]+)"/);
          
          if (titleMatch && companyMatch) {
            return {
              title: titleMatch[1] || 'Unknown Title',
              company: companyMatch[1] || 'Unknown Company'
            };
          }
        } catch (manualError) {
          console.error('[S4S] Manual extraction also failed:', manualError);
        }
      }
      
      return {
        title: 'Unknown Title',
        company: 'Unknown Company'
      };
    }
  }

  // Function to batch analyze posts for better performance
  async function batchAnalyzePosts(posts, batchSize = 5) {
    const results = [];
    console.log('[S4S] Starting batch analysis of', posts.length, 'posts with batch size', batchSize);
    
    for (let i = 0; i < posts.length; i += batchSize) {
      const batch = posts.slice(i, i + batchSize);
      console.log(`[S4S] Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(posts.length/batchSize)} (posts ${i+1}-${Math.min(i+batchSize, posts.length)})`);
      
      const batchPromises = batch.map(async (post, index) => {
        try {
          console.log(`[S4S] Analyzing post ${i + index + 1}: ${post.name || 'Unknown'}`);
          const isHiring = await checkIfPostIsHiring(post);
          console.log(`[S4S] Post ${i + index + 1} result:`, isHiring ? 'HIRING' : 'NOT HIRING');
          return { post, isHiring, index: i + index };
        } catch (error) {
          console.error(`[S4S] Error analyzing post ${i + index + 1}:`, error);
          return { post, isHiring: false, index: i + index, error: error.message };
        }
      });
      
      try {
        // Process batch with delay
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        console.log(`[S4S] Batch ${Math.floor(i/batchSize) + 1} completed successfully`);
        
        // Add delay between batches
        if (i + batchSize < posts.length) {
          console.log('[S4S] Waiting 200ms before next batch...');
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.error(`[S4S] Error processing batch ${Math.floor(i/batchSize) + 1}:`, error);
        // Add failed results to continue processing
        batch.forEach((post, index) => {
          results.push({ post, isHiring: false, index: i + index, error: 'Batch processing failed' });
        });
      }
    }
    
    console.log('[S4S] Batch analysis completed. Total results:', results.length);
    return results;
  }

  // Function to filter posts for hiring content
  async function filterHiringPosts(posts, statusDiv) {
    const hiringPosts = [];
    let processed = 0;
    
    for (const post of posts) {
      processed++;
      statusDiv.textContent = `Analyzing post ${processed}/${posts.length} for hiring content...`;
      
      try {
        const isHiring = await checkIfPostIsHiring(post);
        if (isHiring) {
          hiringPosts.push(post);
          console.log(`Post ${processed}: HIRING - ${post.name}`);
        } else {
          console.log(`Post ${processed}: NOT HIRING - ${post.name}`);
        }
      } catch (error) {
        console.error(`Error analyzing post ${processed}:`, error);
        // Continue with next post even if one fails
      }
    }
    
    return hiringPosts;
  }

  // Function to send data to Ollama for lead analysis (legacy - keeping for compatibility)
  async function analyzeLeadsWithOllama(posts, prompt) {
    await checkOllamaPort(); // Verify Ollama is running
    const jsonData = organizeDataForJSON(posts);
    
    console.log('Sending posts to Ollama:', jsonData.length, 'posts');
    console.log('Sample post data:', jsonData[0]);
    
    // Create the final prompt with the JSON data
    let finalPrompt;
    if (prompt.includes('{data}')) {
      // Replace {data} placeholder with actual JSON data
      finalPrompt = prompt.replace('{data}', JSON.stringify(jsonData, null, 2));
    } else {
      // If no {data} placeholder, append the JSON data to the prompt
      finalPrompt = prompt + '\n\nLinkedIn Posts Data:\n' + JSON.stringify(jsonData, null, 2);
    }
    
    console.log('Final prompt length:', finalPrompt.length);
    console.log('Prompt preview:', finalPrompt.substring(0, 1000) + '...');
    console.log('JSON data included:', finalPrompt.includes('"name"') && finalPrompt.includes('"post_content"'));
    
    const response = await sendMessageToBackground({
      action: 'ollamaRequest',
      endpoint: '/api/generate',
      method: 'POST',
      body: {
        model: 'gemma3:12b',
        prompt: finalPrompt,
        stream: false
      }
    });
    
    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to get response from Ollama');
    }
    
    return response.data.response;
  }
  

  
  // Global variables
  let extractedPosts = [];
  let isScrolling = false;
  let currentTabId = null;
  let scrollAbortController = null;
  
  // Helper to save and load leads from chrome.storage
  function saveLeadsToStorage(leads, statusDiv) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        if (statusDiv) statusDiv.textContent = 'Error: chrome.storage.local is not available.';
        resolve();
        return;
      }
      chrome.storage.local.set({ foundLeads: leads }, resolve);
    });
  }
  function loadLeadsFromStorage(statusDiv) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        if (statusDiv) statusDiv.textContent = 'Error: chrome.storage.local is not available.';
        resolve([]);
        return;
      }
      chrome.storage.local.get(['foundLeads'], (result) => {
        resolve(result.foundLeads || []);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    const controlsDiv = document.getElementById('controls');
    const downloadSection = document.getElementById('download-section');
    let statusDiv = document.getElementById('status');
    const resultsDiv = document.getElementById('results');

    // Fallback: create statusDiv if missing
    if (!statusDiv) {
      const contentDiv = document.querySelector('.content');
      statusDiv = document.createElement('div');
      statusDiv.id = 'status';
      statusDiv.textContent = '';
      statusDiv.style.background = '#e3f2fd';
      statusDiv.style.padding = '10px';
      statusDiv.style.borderRadius = '5px';
      statusDiv.style.margin = '10px 0';
      statusDiv.style.fontSize = '12px';
      statusDiv.style.color = '#1976d2';
      statusDiv.style.borderLeft = '4px solid #2196f3';
      if (contentDiv) contentDiv.insertBefore(statusDiv, contentDiv.firstChild);
    }

    // Button state
    let foundLeads = [];

    // Restore Start/Stop Scrolling button functionality
    const startBtn = document.getElementById('startScroll');
    const stopBtn = document.getElementById('stopScroll');
    if (!startBtn || !stopBtn) {
      statusDiv.textContent = 'Error: Start/Stop Scrolling buttons not found in popup. Please check popup.html.';
      return;
    }

    startBtn.addEventListener('click', async () => {
      try {
        const tab = await getMostRecentLinkedInTab();
        if (!tab) {
          statusDiv.textContent = 'No LinkedIn tab found. Please open a LinkedIn page.';
          startBtn.disabled = false;
          stopBtn.disabled = true;
          return;
        }
        const tabId = tab.id;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        statusDiv.textContent = 'Preparing to scroll...';

        // Ensure content script is injected
        const injected = await ensureContentScriptInjected();
        if (!injected) {
          statusDiv.textContent = 'Error: Could not inject content script. Please refresh the LinkedIn page.';
          startBtn.disabled = false;
          stopBtn.disabled = true;
          return;
        }

        // Test if content script is responsive
        const isResponsive = await testContentScript(tabId);
        if (!isResponsive) {
          statusDiv.textContent = 'Error: Content script not responsive. Please refresh the LinkedIn page.';
          startBtn.disabled = false;
          stopBtn.disabled = true;
          return;
        }

        statusDiv.textContent = 'Starting scroll...';
        await sendMessage(tabId, { action: "performSingleScroll" }, 30000);
        // Remove: statusDiv.textContent = 'Scroll completed.';
        startBtn.disabled = false;
        stopBtn.disabled = true;
      } catch (error) {
        statusDiv.textContent = 'Error: ' + error.message;
        startBtn.disabled = false;
        stopBtn.disabled = true;
      }
    });

    stopBtn.addEventListener('click', async () => {
      try {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        statusDiv.textContent = 'Stopping scroll...';

        const tab = await getMostRecentLinkedInTab();
        if (!tab) {
          statusDiv.textContent = 'No LinkedIn tab found. Please open a LinkedIn page.';
          return;
        }
        const tabId = tab.id;
        await sendMessage(tabId, { action: "stopScroll" }, 5000);
        statusDiv.textContent = 'Scrolling stopped. Extracting posts...';

        // Automatically extract posts after stopping scroll
        const injected = await ensureContentScriptInjected();
        if (!injected) {
          statusDiv.textContent = 'Error: Could not inject content script. Please refresh the LinkedIn page.';
          return;
        }
        const isResponsive = await testContentScript(tabId);
        if (!isResponsive) {
          statusDiv.textContent = 'Error: Content script not responsive. Please refresh the LinkedIn page.';
          return;
        }
        const response = await sendMessage(tabId, { action: "extractPosts" });
        if (response && response.posts) {
          extractedPosts = response.posts;
          statusDiv.textContent = `Found ${response.posts.length} posts after scrolling.`;
          displayJSONData(response.posts);
        } else {
          resultsDiv.textContent = 'No posts found or not on LinkedIn feed page.';
        }
      } catch (error) {
        statusDiv.textContent = 'Error: ' + error.message;
      }
    });

    // Create and wire up buttons using components
    const extractBtn = window.createExtractButton(controlsDiv, async () => {
      try {
        const tab = await getMostRecentLinkedInTab();
        if (!tab) {
          statusDiv.textContent = 'No LinkedIn tab found. Please open a LinkedIn page.';
          return;
        }
        const tabId = tab.id;
        statusDiv.textContent = 'Ensuring content script is loaded...';
        resultsDiv.innerHTML = '';
        // Ensure content script is injected
        const injected = await ensureContentScriptInjected();
        if (!injected) {
          statusDiv.textContent = 'Error: Could not inject content script. Please refresh the LinkedIn page.';
          return;
        }
        // Test if content script is responsive
        const isResponsive = await testContentScript(tabId);
        if (!isResponsive) {
          statusDiv.textContent = 'Error: Content script not responsive. Please refresh the LinkedIn page.';
          return;
        }
        statusDiv.textContent = 'Extracting posts...';
        const response = await sendMessage(tabId, { action: "extractPosts" });
        if (response && response.posts) {
          extractedPosts = response.posts;
          statusDiv.textContent = `Found ${response.posts.length} posts`;
          displayJSONData(response.posts);
        } else {
          resultsDiv.textContent = 'No posts found or not on LinkedIn feed page.';
        }
      } catch (error) {
        statusDiv.textContent = 'Error: ' + error.message;
        resultsDiv.textContent = 'Failed to extract posts. Please refresh the LinkedIn page and try again.';
      }
    });

    // Remove any duplicate Download CSV buttons
    downloadSection.innerHTML = '';
    // (No download button created)

    const findLeadsBtn = window.createFindLeadsButton(controlsDiv, async () => {
      if (!extractedPosts || extractedPosts.length === 0) {
        statusDiv.textContent = 'Error: No posts extracted yet. Please extract posts first.';
        return;
      }
      findLeadsBtn.disabled = true;
      findLeadsBtn.textContent = 'Testing Ollama...';
      statusDiv.textContent = 'Testing Ollama connection...';
      resultsDiv.innerHTML = '';
      
      try {
        // Test Ollama connection first
        const connectionTest = await testOllamaConnection();
        if (!connectionTest.success) {
          throw new Error(`Ollama connection failed: ${connectionTest.error}`);
        }
        
        findLeadsBtn.textContent = 'Analyzing...';
        statusDiv.textContent = `Ollama connected successfully. Available models: ${connectionTest.models.join(', ')}`;
        
        const totalPosts = extractedPosts.length;
        
        // Step 1: Filter for hiring posts using YES/NO analysis
        statusDiv.textContent = `Step 1: Analyzing ${totalPosts} posts for hiring content...`;
        const batchSize = Math.min(5, Math.ceil(totalPosts / 10));
        const analysisResults = await batchAnalyzePosts(extractedPosts, batchSize);
        
        // Filter hiring posts
        const hiringPosts = analysisResults
          .filter(result => result.isHiring)
          .map(result => result.post);
        
        console.log(`[S4S] Found ${hiringPosts.length} hiring posts`);
        
        if (hiringPosts.length === 0) {
          statusDiv.textContent = 'No hiring posts found.';
          resultsDiv.innerHTML = '<div style="color: orange; padding: 10px;">No hiring-related posts found in the extracted data.</div>';
          return;
        }
        
        // Step 2: Extract title and company from hiring posts
        statusDiv.textContent = `Step 2: Extracting title/company from ${hiringPosts.length} hiring posts...`;
        
        console.log(`[S4S] Hiring posts data:`, hiringPosts.map(post => ({
          name: post.name,
          headline: post.headline,
          content: post.content?.substring(0, 50) + '...'
        })));
        
        const enrichedPosts = [];
        for (let i = 0; i < hiringPosts.length; i++) {
          const post = hiringPosts[i];
          statusDiv.textContent = `Extracting title/company from post ${i + 1}/${hiringPosts.length}...`;
          
          console.log(`[S4S] Processing post ${i + 1}:`, {
            name: post.name,
            headline: post.headline,
            hasHeadline: !!post.headline,
            headlineLength: post.headline?.length || 0
          });
          
          try {
            const titleCompanyData = await extractTitleAndCompany(post);
            enrichedPosts.push({
              ...post,
              title: titleCompanyData.title,
              company: titleCompanyData.company
            });
          } catch (error) {
            console.error(`[S4S] Error extracting title/company from post ${i + 1}:`, error);
            // Add post with fallback values
            enrichedPosts.push({
              ...post,
              title: 'Unknown Title',
              company: 'Unknown Company'
            });
          }
        }
        
        await saveLeadsToStorage(enrichedPosts, statusDiv);
        statusDiv.textContent = `Found ${enrichedPosts.length} hiring-related posts with title/company data!`;
        const jsonString = JSON.stringify(enrichedPosts, null, 2);
        resultsDiv.innerHTML = `<div class="json-display">${jsonString}</div>`;
        if (enrichedPosts.length > 0) {
          exportLeadsToCSV(enrichedPosts);
        }
      } catch (error) {
        console.error('[S4S] Analysis failed:', error);
        statusDiv.textContent = `Error: ${error.message}`;
        resultsDiv.innerHTML = `<div style="color: red; padding: 10px;">Failed to analyze leads: ${error.message}</div>`;
      } finally {
        findLeadsBtn.disabled = false;
        findLeadsBtn.textContent = 'Find Leads';
      }
    });
  });

  // Remove Excel export logic and add CSV export logic
  function exportLeadsToCSV(leads) {
    if (!leads || !leads.length) {
      alert('No leads to export!');
      return;
    }
    // Updated columns to include title, company, connection degree, post URL and post date
    const headerKeys = [
      'name',
      'title',
      'company',
      'connection_degree',
      'posturl',
      'profileurl',
      'post_date',
      'post_content'
    ];
    const header = ['Name', 'Title', 'Company', 'Connection Degree', 'Post URL', 'Profile URL', 'Post Date', 'Post Content'];
    function escapeCSVField(field) {
      if (field === null || field === undefined) return '';
      const str = String(field);
      
      // Handle emojis and special characters
      let cleanedStr = str
        .replace(/\r\n/g, ' ') // Replace newlines with spaces for CSV
        .replace(/\r/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/\s{2,}/g, ' ') // Remove multiple spaces
        .trim();
      
      if (cleanedStr.includes(',') || cleanedStr.includes('"') || cleanedStr.includes('\n') || cleanedStr.includes('\r')) {
        return '"' + cleanedStr.replace(/"/g, '""') + '"';
      }
      return cleanedStr;
    }
    // Map each lead to the correct keys, with fallback for profileurl, post_content, and posturl
    const rows = leads.map(lead => [
      escapeCSVField(lead.name || ''),
      escapeCSVField(lead.title || 'Unknown Title'),
      escapeCSVField(lead.company || 'Unknown Company'),
      escapeCSVField(lead.connection_degree || lead.connectionDegree || '3rd'),
      escapeCSVField(lead.posturl || lead.postUrl || ''),
      escapeCSVField(lead.profileurl || lead.linkedin_profile_url || lead.linkedinUrl || ''),
      escapeCSVField(lead.post_date || lead.postDate || ''),
      escapeCSVField(lead.post_content || lead.content || '')
    ]);
    const csvContent = [header, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linkedin_leads_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }