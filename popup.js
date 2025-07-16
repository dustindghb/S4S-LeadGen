

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
    resultsDiv.innerHTML = `<div style="background: #e3f2fd; padding: 10px; border-radius: 5px; margin: 10px 0; font-size: 12px; color: #1976d2; border-left: 4px solid #2196f3;">Data processing complete. Use the download buttons to export results.</div>`;
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
    const HIRING_CLASSIFIER_PROMPT = `SYSTEM: You are a hiring post classifier. Return ONLY "YES" or "NO".
TASK: Determine if this LinkedIn post is from someone actively HIRING others RIGHT NOW.

RETURN "YES" IF THE POST CONTAINS ANY OF THESE HIRING INDICATORS:
- "We are hiring" / "We're hiring" / "Now hiring"
- "We're looking for" / "We are looking for" / "Looking for" (when referring to employees/candidates)
- "Join our team" / "Join us" / "Come work with us"
- "We have openings" / "We have positions available"
- "Apply now" / "Send your resume" / "Interested? Contact us"
- "Know anyone who might be interested?" (about a specific role)
- Specific job titles with hiring intent (e.g., "Seeking Software Engineer", "Need Marketing Manager")
- "DM me your resume" / "Send me your CV"
- "Applications open" / "Currently accepting applications"
- "Expanding our team" + specific role mentions
- "Remote/hybrid opportunity available"
- Posts with clear job descriptions or requirements
- "Tag someone who would be perfect for this role"

RETURN "NO" FOR ALL OF THESE:
- Job seekers looking for work ("I'm looking for work", "Open to work", "Recently laid off")
- Career advice or tips about hiring/interviewing processes
- Lists of recruiters or job resources for job seekers
- General business/sales advice that mentions hiring
- Posts about company growth WITHOUT specific job openings or hiring language
- Personal career journey stories or job transitions
- Networking posts asking for general connections
- Posts about being hired or starting new roles (past tense)
- Industry discussions about hiring trends or market conditions
- Posts where hiring is mentioned in context but no job is offered
- "How to get hired" or "Tips for job interviews"
- "Here's how to improve your hiring process" (advice to employers)
- "After 3 years my journey ended due to redundancy" (job loss)
- "Here's a list of recruiters looking to fill roles" (resource sharing)
- "Landing interviews but getting rejected? Here's how to fix it" (job seeker advice)

KEY RULE: If the post contains clear hiring language indicating the author/company is actively seeking candidates, return "YES" - even if the post is brief like "We're hiring!"

POST CONTENT: ${post.content || post.message || ''}
POST HEADLINE: ${post.headline || ''}
RESPONSE: Return ONLY "YES" or "NO"`;

    const response = await sendMessageToBackground({
      action: 'ollamaRequest',
      endpoint: '/api/generate',
      method: 'POST',
      body: {
        model: 'gemma3:12b',
        prompt: HIRING_CLASSIFIER_PROMPT,
        stream: false,
        options: {
          temperature: 0.0,        // Lower for faster, more consistent responses
          num_predict: 5,          // Limit response length (just need YES/NO)
          top_k: 1,               // Only consider top token
          top_p: 0.1,             // Lower for faster sampling
          repeat_penalty: 1.0,     // Minimal penalty
          num_ctx: 4096           // Increased context window for longer posts
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
    
    const titleCompanyPrompt = `Extract job title and company from LinkedIn headline.

HEADLINE: ${headlineText}

Return JSON only:
{"title": "job title", "company": "company name"}

Examples:
"Software Engineer at Google" -> {"title": "Software Engineer", "company": "Google"}
"Marketing Manager, Apple" -> {"title": "Marketing Manager", "company": "Apple"}
"CEO • Startup" -> {"title": "CEO", "company": "Startup"}

JSON:`;

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
          temperature: 0.0,        // Lower for faster, more consistent responses
          num_predict: 100,        // Reduced for faster response
          top_k: 1,               // Only consider top token
          top_p: 0.1,             // Lower for faster sampling
          repeat_penalty: 1.0,     // Minimal penalty
          num_ctx: 4096           // Increased context window for longer posts
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
  let streamingLeads = []; // New: store leads found during streaming
  let isStreamingAnalysis = false; // New: track if we're doing streaming analysis
  let processedPostCount = 0; // New: track processed posts
  let totalPostCount = 0; // New: track total posts found
  let streamingAnalysisInterval = null; // New: store the analysis interval
  let isScrollingActive = false; // New: track if scrolling is active
  let allPostsProcessed = false; // New: track if all posts have been analyzed
  let processedPostIds = new Set(); // New: track which posts have been processed by unique ID
  let analysisIterationCount = 0; // New: track analysis iterations to prevent infinite loops
  let postQueue = []; // New: queue of posts to be processed
  let isProcessingQueue = false; // New: track if we're currently processing the queue
  let optimalBatchSize = 3; // New: dynamic batch size for parallel processing
  let lastProcessingTime = 0; // New: track processing time to optimize batch size
  let allAnalyzedPosts = []; // New: store all posts with their analysis results
  let metricsUpdateInterval = null; // New: interval for frequent metrics updates

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
    const stopAnalysisBtn = document.getElementById('stopAnalysis');
    if (!startBtn || !stopBtn || !stopAnalysisBtn) {
      statusDiv.textContent = 'Error: Start/Stop buttons not found in popup. Please check popup.html.';
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
        stopAnalysisBtn.disabled = false;
        statusDiv.textContent = 'Preparing to scroll with streaming analysis...';

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

        statusDiv.textContent = 'Starting scroll with streaming analysis...';
        
        // Start streaming analysis before scrolling
        await startStreamingAnalysis(tabId, statusDiv, resultsDiv);
        
        // Start scrolling with longer timeout
        await sendMessage(tabId, { action: "performSingleScroll" }, 120000); // 2 minutes
        
        // Scrolling completed, but analysis continues
        statusDiv.textContent = 'Scrolling completed. Analysis continues...';
        updateMetrics();
        
        // Analysis continues until user clicks stop
        startBtn.disabled = false;
        stopBtn.disabled = true;
        // Keep stopAnalysisBtn enabled so user can stop analysis
      } catch (error) {
        statusDiv.textContent = 'Error: ' + error.message;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        stopAnalysisBtn.disabled = true;
      }
    });

    stopBtn.addEventListener('click', async () => {
      try {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        statusDiv.textContent = 'Stopping scrolling...';

        const tab = await getMostRecentLinkedInTab();
        if (!tab) {
          statusDiv.textContent = 'No LinkedIn tab found. Please open a LinkedIn page.';
          return;
        }
        const tabId = tab.id;
        
        // Stop scrolling but keep analysis running
        await sendMessage(tabId, { action: "stopScroll" }, 5000);
        
        // Mark scrolling as stopped but keep analysis running
        isScrollingActive = false;
        
        statusDiv.textContent = 'Scrolling stopped. Analysis continues with remaining posts...';
        updateMetrics();
      } catch (error) {
        statusDiv.textContent = 'Error: ' + error.message;
      }
    });

    stopAnalysisBtn.addEventListener('click', async () => {
      try {
        stopAnalysisBtn.disabled = true;
        statusDiv.textContent = 'Stopping analysis...';
        
        // Stop the streaming analysis completely
        stopStreamingAnalysis();
        
        statusDiv.textContent = 'Analysis stopped. Scrolling continues...';
        updateMetrics();
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
      // Check if we have streaming leads or need to load from storage
      if (streamingLeads.length === 0) {
        // Try to load from storage
        const storedLeads = await loadLeadsFromStorage(statusDiv);
        if (storedLeads && storedLeads.length > 0) {
          streamingLeads = storedLeads;
          statusDiv.textContent = `Loaded ${streamingLeads.length} leads from storage.`;
        } else {
          statusDiv.textContent = 'Error: No leads found. Please start scrolling to analyze posts.';
          return;
        }
      }
      
      if (streamingLeads.length === 0) {
        statusDiv.textContent = 'Error: No leads found. Please start scrolling to analyze posts.';
        return;
      }
      
      // Display and export the leads
      statusDiv.textContent = `Found ${streamingLeads.length} leads!`;
      resultsDiv.innerHTML = `<div style="background: #e3f2fd; padding: 10px; border-radius: 5px; margin: 10px 0; font-size: 12px; color: #1976d2; border-left: 4px solid #2196f3;">Analysis complete! Found ${streamingLeads.length} leads. Use the download buttons to export results.</div>`;
      exportLeadsToCSV(streamingLeads);
    });

    // Add button to download all analyzed posts for review
    const downloadAllPostsBtn = window.createDownloadAllPostsButton(controlsDiv, () => {
      if (allAnalyzedPosts.length === 0) {
        statusDiv.textContent = 'Error: No analyzed posts found. Please start scrolling to analyze posts.';
        return;
      }
      
      statusDiv.textContent = `Downloading ${allAnalyzedPosts.length} analyzed posts for review...`;
      exportAllPostsToCSV();
      statusDiv.textContent = `Downloaded ${allAnalyzedPosts.length} analyzed posts for review.`;
    });
  });

  // New: Function to analyze a single post in real-time
  async function analyzeSinglePostStreaming(post, statusDiv) {
    try {
      // Check if post is hiring
      const isHiring = await checkIfPostIsHiring(post);
      
      // Store the post with analysis result
      const analyzedPost = {
        ...post,
        isHiring: isHiring,
        analyzedAt: new Date().toISOString()
      };
      
      // Add to all analyzed posts
      allAnalyzedPosts.push(analyzedPost);
      
      if (isHiring) {
        console.log(`[S4S] Streaming: Post is hiring - ${post.name}`);
        
        // Extract title and company
        const titleCompanyData = await extractTitleAndCompany(post);
        
        const enrichedPost = {
          ...analyzedPost,
          title: titleCompanyData.title,
          company: titleCompanyData.company
        };
        
        // Add to streaming leads
        streamingLeads.push(enrichedPost);
        
        // Update status and metrics immediately
        statusDiv.textContent = `Found lead ${streamingLeads.length}: ${post.name} - ${titleCompanyData.title} at ${titleCompanyData.company}`;
        updateMetrics();
        
        // Save to storage
        await saveLeadsToStorage(streamingLeads, statusDiv);
        
        // Update metrics again after storage
        updateMetrics();
        
        console.log(`[S4S] Streaming: Added lead - ${post.name} (${streamingLeads.length} total)`);
        return true;
      } else {
        console.log(`[S4S] Streaming: Post is not hiring - ${post.name}`);
        return false;
      }
    } catch (error) {
      console.error(`[S4S] Streaming: Error analyzing post ${post.name}:`, error);
      
      // Still store the post even if analysis failed
      const failedPost = {
        ...post,
        isHiring: false,
        analysisError: error.message,
        analyzedAt: new Date().toISOString()
      };
      allAnalyzedPosts.push(failedPost);
      
      return false;
    }
  }

  // New: Function to extract and analyze posts in real-time during scrolling
  async function extractAndAnalyzePostsStreaming(tabId, statusDiv, resultsDiv) {
    try {
      // Early exit if analysis is already complete
      if (allPostsProcessed || !isStreamingAnalysis) {
        console.log('[S4S] Analysis already complete or stopped, skipping iteration');
        return;
      }
      
      analysisIterationCount++;
      
      // Only stop if user explicitly stopped the analysis
      if (!isStreamingAnalysis) {
        console.log('[S4S] User stopped analysis, stopping iteration');
        return;
      }
      
      // Extract current posts with longer timeout
      const response = await sendMessage(tabId, { action: "extractPosts" }, 30000);
      
      if (response && response.posts) {
        const newPosts = response.posts;
        const previousCount = totalPostCount;
        totalPostCount = newPosts.length;
        
        // Update metrics when total post count changes
        updateMetrics();
        
        // Add new posts to the queue
        addPostsToQueue(newPosts);
        
        console.log(`[S4S] Streaming: Found ${newPosts.length} total posts (was ${previousCount}), Queue size: ${postQueue.length}, Processed: ${processedPostCount}, Analysis running: ${isStreamingAnalysis}, Scrolling active: ${isScrollingActive}`);
        
        // Process the queue
        await processQueue(statusDiv, resultsDiv);
        
        // Update extracted posts
        extractedPosts = newPosts;
        updateMetrics();
      } else {
        console.log(`[S4S] No posts found in response. Response:`, response);
        console.log(`[S4S] Analysis state - isStreamingAnalysis: ${isStreamingAnalysis}, isScrollingActive: ${isScrollingActive}, allPostsProcessed: ${allPostsProcessed}`);
      }
    } catch (error) {
      console.error('[S4S] Streaming: Error extracting/analyzing posts:', error);
    }
  }

  // New: Function to start streaming analysis
  async function startStreamingAnalysis(tabId, statusDiv, resultsDiv) {
    isStreamingAnalysis = true;
    isScrollingActive = true;
    allPostsProcessed = false;
    streamingLeads = [];
    processedPostCount = 0;
    totalPostCount = 0;
    processedPostIds.clear(); // Reset processed posts tracking
    analysisIterationCount = 0; // Reset iteration count
    postQueue = []; // Reset the queue
    isProcessingQueue = false; // Reset queue processing flag
    optimalBatchSize = 3; // Reset batch size
    lastProcessingTime = 0; // Reset processing time
    allAnalyzedPosts = []; // Reset analyzed posts tracking
    metricsUpdateInterval = null; // Reset metrics interval
    
    // Show metrics
    showMetrics(true);
    updateMetrics();
    
    // Test Ollama connection first
    const connectionTest = await testOllamaConnection();
    if (!connectionTest.success) {
      throw new Error(`Ollama connection failed: ${connectionTest.error}`);
    }
    
    statusDiv.textContent = `Ollama connected. Starting streaming analysis...`;
    
    // Start periodic analysis during scrolling
    streamingAnalysisInterval = setInterval(async () => {
      console.log('[S4S] Analysis interval tick - isStreamingAnalysis:', isStreamingAnalysis, 'allPostsProcessed:', allPostsProcessed);
      
      if (!isStreamingAnalysis || allPostsProcessed) {
        clearInterval(streamingAnalysisInterval);
        streamingAnalysisInterval = null;
        console.log('[S4S] Analysis interval stopped - streaming analysis:', isStreamingAnalysis, 'all posts processed:', allPostsProcessed);
        return;
      }
      
      await extractAndAnalyzePostsStreaming(tabId, statusDiv, resultsDiv);
    }, 5000); // Check for new posts every 5 seconds (slower to be gentler)
    
    // Start frequent metrics updates
    metricsUpdateInterval = setInterval(() => {
      if (isStreamingAnalysis) {
        updateMetrics();
      }
    }, 500); // Update metrics every 500ms for smooth display
    
    return streamingAnalysisInterval;
  }

  // New: Function to update metrics display
  function updateMetrics() {
    const metricsDiv = document.getElementById('metrics');
    const postsFoundSpan = document.getElementById('postsFound');
    const postsAnalyzedSpan = document.getElementById('postsAnalyzed');
    const leadsFoundSpan = document.getElementById('leadsFound');
    const analysisStatusSpan = document.getElementById('analysisStatus');
    
    if (metricsDiv && postsFoundSpan && postsAnalyzedSpan && leadsFoundSpan && analysisStatusSpan) {
      postsFoundSpan.textContent = totalPostCount;
      postsAnalyzedSpan.textContent = processedPostCount;
      leadsFoundSpan.textContent = streamingLeads.length;
      
      if (allPostsProcessed) {
        analysisStatusSpan.textContent = 'Complete';
        analysisStatusSpan.style.color = '#28a745';
      } else if (isStreamingAnalysis) {
        if (isScrollingActive) {
          analysisStatusSpan.textContent = `Scrolling & Analyzing (Q:${postQueue.length}, B:${optimalBatchSize})`;
          analysisStatusSpan.style.color = '#007bff';
        } else {
          analysisStatusSpan.textContent = `Analyzing Remaining (Q:${postQueue.length}, B:${optimalBatchSize})`;
          analysisStatusSpan.style.color = '#ffc107';
        }
      } else {
        analysisStatusSpan.textContent = 'Idle';
        analysisStatusSpan.style.color = '#6c757d';
      }
    }
  }

  // New: Function to show/hide metrics
  function showMetrics(show = true) {
    const metricsDiv = document.getElementById('metrics');
    if (metricsDiv) {
      metricsDiv.style.display = show ? 'block' : 'none';
    }
  }

  // New: Function to stop streaming analysis
  function stopStreamingAnalysis() {
    isStreamingAnalysis = false;
    isScrollingActive = false; // Also stop scrolling flag
    if (streamingAnalysisInterval) {
      clearInterval(streamingAnalysisInterval);
      streamingAnalysisInterval = null;
    }
    if (metricsUpdateInterval) {
      clearInterval(metricsUpdateInterval);
      metricsUpdateInterval = null;
    }
    console.log('[S4S] Streaming analysis stopped by user');
    updateMetrics();
  }

  // New: Function to add posts to the processing queue
  function addPostsToQueue(newPosts) {
    for (const post of newPosts) {
      const postId = post.postUrl || post.linkedinUrl || `${post.name}-${post.content?.substring(0, 50)}`;
      
      // Only add if not already in queue and not already processed
      if (!processedPostIds.has(postId) && !postQueue.some(qPost => {
        const qPostId = qPost.postUrl || qPost.linkedinUrl || `${qPost.name}-${qPost.content?.substring(0, 50)}`;
        return qPostId === postId;
      })) {
        postQueue.push(post);
        console.log(`[S4S] Added post to queue: ${post.name} (Queue size: ${postQueue.length})`);
        // Update metrics when queue size changes
        updateMetrics();
      }
    }
  }

  // New: Function to process the queue with parallel processing and smart batching
  async function processQueue(statusDiv, resultsDiv) {
    if (isProcessingQueue || postQueue.length === 0) {
      return;
    }
    
    isProcessingQueue = true;
    console.log(`[S4S] Processing queue with ${postQueue.length} posts using batch size ${optimalBatchSize}`);
    
    while (postQueue.length > 0 && isStreamingAnalysis && !allPostsProcessed) {
      const startTime = Date.now();
      
      // Take a batch of posts for parallel processing
      const batchSize = Math.min(optimalBatchSize, postQueue.length);
      const batch = postQueue.splice(0, batchSize);
      
      console.log(`[S4S] Processing batch of ${batchSize} posts in parallel`);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (post) => {
        const postId = post.postUrl || post.linkedinUrl || `${post.name}-${post.content?.substring(0, 50)}`;
        
        // Mark as processed
        processedPostIds.add(postId);
        processedPostCount++;
        
        // Update metrics immediately when post count changes
        updateMetrics();
        
        console.log(`[S4S] Processing post ${processedPostCount}/${totalPostCount}: ${post.name}`);
        
        try {
          const result = await analyzeSinglePostStreaming(post, statusDiv);
          // Update metrics after each post analysis
          updateMetrics();
          return result;
        } catch (error) {
          console.error(`[S4S] Error processing post ${post.name}:`, error);
          // Update metrics even on error
          updateMetrics();
          return false;
        }
      });
      
      // Wait for all posts in batch to complete
      await Promise.all(batchPromises);
      
      // Update status and metrics
      statusDiv.textContent = `Analyzed ${processedPostCount}/${totalPostCount} posts (Batch: ${batchSize})`;
      updateMetrics();
      
      // Calculate processing time and adjust batch size
      const processingTime = Date.now() - startTime;
      lastProcessingTime = processingTime;
      
      // Smart batch size adjustment
      if (processingTime < 2000 && optimalBatchSize < 5) {
        optimalBatchSize++;
        console.log(`[S4S] Increasing batch size to ${optimalBatchSize} (processing time: ${processingTime}ms)`);
      } else if (processingTime > 5000 && optimalBatchSize > 1) {
        optimalBatchSize--;
        console.log(`[S4S] Decreasing batch size to ${optimalBatchSize} (processing time: ${processingTime}ms)`);
      }
      
      // Longer delay between batches to be gentler on Ollama
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    isProcessingQueue = false;
    
    // Only complete if user explicitly stopped the analysis
    if (!isStreamingAnalysis) {
      console.log('[S4S] User stopped analysis, completing');
      handleAnalysisComplete(statusDiv, resultsDiv);
    }
  }

  // New: Function to handle completion of all analysis
  function handleAnalysisComplete(statusDiv, resultsDiv) {
    allPostsProcessed = true;
    isStreamingAnalysis = false; // Stop the streaming analysis flag
    updateMetrics();
    
    if (streamingLeads.length > 0) {
      statusDiv.textContent = `Analysis complete! Found ${streamingLeads.length} leads! Click "Download Leads as CSV" to export.`;
      resultsDiv.innerHTML = `<div style="background: #e3f2fd; padding: 10px; border-radius: 5px; margin: 10px 0; font-size: 12px; color: #1976d2; border-left: 4px solid #2196f3;">Analysis complete! Found ${streamingLeads.length} leads. Use the download buttons to export results.</div>`;
    } else {
      statusDiv.textContent = 'Analysis complete. No leads found.';
    }
    
    // Stop the analysis interval
    if (streamingAnalysisInterval) {
      clearInterval(streamingAnalysisInterval);
      streamingAnalysisInterval = null;
    }
    
    // Stop the metrics update interval
    if (metricsUpdateInterval) {
      clearInterval(metricsUpdateInterval);
      metricsUpdateInterval = null;
    }
    
    console.log('[S4S] Analysis completely stopped and interval cleared');
  }

  // Function to export leads to CSV
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

  // Function to export all analyzed posts to CSV for review
  function exportAllPostsToCSV() {
    if (!allAnalyzedPosts || !allAnalyzedPosts.length) {
      alert('No analyzed posts to export!');
      return;
    }
    
    const header = [
      'Name', 
      'Headline', 
      'Is Hiring', 
      'Title', 
      'Company', 
      'Connection Degree', 
      'Post URL', 
      'Profile URL', 
      'Post Date', 
      'Post Content',
      'Analysis Error',
      'Analyzed At'
    ];
    
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
    
    // Map each analyzed post to CSV row
    const rows = allAnalyzedPosts.map(post => [
      escapeCSVField(post.name || ''),
      escapeCSVField(post.headline || ''),
      escapeCSVField(post.isHiring ? 'YES' : 'NO'),
      escapeCSVField(post.title || ''),
      escapeCSVField(post.company || ''),
      escapeCSVField(post.connection_degree || post.connectionDegree || '3rd'),
      escapeCSVField(post.posturl || post.postUrl || ''),
      escapeCSVField(post.profileurl || post.linkedin_profile_url || post.linkedinUrl || ''),
      escapeCSVField(post.post_date || post.postDate || ''),
      escapeCSVField(post.post_content || post.content || ''),
      escapeCSVField(post.analysisError || ''),
      escapeCSVField(post.analyzedAt || '')
    ]);
    
    const csvContent = [header, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linkedin_all_posts_analysis_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }