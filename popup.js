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

// Function to ensure content script is injected
async function ensureContentScriptInjected() {
    try {
      // First try to inject via background script
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'injectContentScript' }, resolve);
      });
      
      if (response && response.success) {
        return true;
      }
    } catch (error) {
      // Background injection failed, trying direct injection
    }
    
    // Fallback: try direct injection
    try {
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.url && tab.url.includes('linkedin.com')) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        return true;
      }
    } catch (error) {
      return false;
    }
    
    return false;
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
      headline: post.headline || '',
      linkedin_profile_url: post.linkedinUrl || '',
      age: post.age || '',
      message: post.content || ''
    }));
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
    const jsonString = JSON.stringify(jsonData, null, 2);
    
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

  // Function to check if Ollama is running and get the port
  async function checkOllamaPort() {
    try {
      const response = await sendMessageToBackground({
        action: 'ollamaRequest',
        endpoint: '/api/tags',
        method: 'GET'
      }, 5000);
      
      if (response && response.success) {
        console.log('Ollama found and responding');
        return true;
      }
    } catch (error) {
      console.log('Ollama not available:', error.message);
    }
    
    throw new Error('Ollama not found on port 11435. Make sure Ollama is running and a model is loaded.');
  }

  // Function to check if a single post is about hiring
  async function checkIfPostIsHiring(post) {
    const hiringPrompt = `SYSTEM: You are a hiring post classifier. Return ONLY "YES" or "NO".

TASK: Determine if this LinkedIn post is about hiring, recruiting, job opportunities, or employment.

HIRING KEYWORDS TO LOOK FOR:
- "hiring", "we're hiring", "looking to hire", "hiring for"
- "recruiting", "recruiter", "recruitment"
- "job opportunity", "open position", "job opening", "position available"
- "join our team", "we're looking for", "apply now", "apply today"
- "career opportunity", "employment", "job posting"

POST TO ANALYZE:
${JSON.stringify(post, null, 2)}

RESPONSE: Return ONLY "YES" or "NO"`;

    const response = await sendMessageToBackground({
      action: 'ollamaRequest',
      endpoint: '/api/generate',
      method: 'POST',
      body: {
        model: 'gemma3:12b',
        prompt: hiringPrompt,
        stream: false
      }
    });
    
    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to get response from Ollama');
    }
    
    const result = response.data.response.trim().toUpperCase();
    return result === 'YES';
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
    console.log('JSON data included:', finalPrompt.includes('"name"') && finalPrompt.includes('"message"'));
    
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
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
        const isResponsive = await testContentScript(tab.id);
        if (!isResponsive) {
          statusDiv.textContent = 'Error: Content script not responsive. Please refresh the LinkedIn page.';
          startBtn.disabled = false;
          stopBtn.disabled = true;
          return;
        }

        statusDiv.textContent = 'Starting scroll...';
        await sendMessage(tab.id, { action: "performSingleScroll" }, 30000);
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

        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await sendMessage(tab.id, { action: "stopScroll" }, 5000);
        statusDiv.textContent = 'Scrolling stopped. Extracting posts...';

        // Automatically extract posts after stopping scroll
        const injected = await ensureContentScriptInjected();
        if (!injected) {
          statusDiv.textContent = 'Error: Could not inject content script. Please refresh the LinkedIn page.';
          return;
        }
        const isResponsive = await testContentScript(tab.id);
        if (!isResponsive) {
          statusDiv.textContent = 'Error: Content script not responsive. Please refresh the LinkedIn page.';
          return;
        }
        const response = await sendMessage(tab.id, { action: "extractPosts" });
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
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        statusDiv.textContent = 'Ensuring content script is loaded...';
        resultsDiv.innerHTML = '';
        // Ensure content script is injected
        const injected = await ensureContentScriptInjected();
        if (!injected) {
          statusDiv.textContent = 'Error: Could not inject content script. Please refresh the LinkedIn page.';
          return;
        }
        // Test if content script is responsive
        const isResponsive = await testContentScript(tab.id);
        if (!isResponsive) {
          statusDiv.textContent = 'Error: Content script not responsive. Please refresh the LinkedIn page.';
          return;
        }
        statusDiv.textContent = 'Extracting posts...';
        const response = await sendMessage(tab.id, { action: "extractPosts" });
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
      findLeadsBtn.textContent = 'Generating Response...';
      statusDiv.textContent = 'Analyzing posts for hiring content...';
      resultsDiv.innerHTML = '';
      try {
        const hiringPosts = [];
        let processed = 0;
        for (const post of extractedPosts) {
          processed++;
          statusDiv.textContent = `Analyzed ${processed}/${extractedPosts.length} posts...`;
          try {
            const isHiring = await checkIfPostIsHiring(post);
            if (isHiring) {
              hiringPosts.push(post);
            }
          } catch (error) {
            // Continue with next post even if one fails
          }
        }
        await saveLeadsToStorage(hiringPosts, statusDiv);
        statusDiv.textContent = `Found ${hiringPosts.length} hiring-related posts!`;
        const jsonString = JSON.stringify(hiringPosts, null, 2);
        resultsDiv.innerHTML = `<div class=\"json-display\">${jsonString}</div>`;
        if (hiringPosts.length > 0) {
          exportLeadsToCSV(hiringPosts);
        }
      } catch (error) {
        statusDiv.textContent = `Error: ${error.message}`;
        resultsDiv.innerHTML = `<div style=\"color: red; padding: 10px;\">Failed to analyze leads: ${error.message}</div>`;
      } finally {
        findLeadsBtn.disabled = false;
        findLeadsBtn.textContent = 'Find Leads';
      }
    });
  });

  // Add event listener for Test Ollama button
  document.getElementById('testOllama').addEventListener('click', async () => {
    try {
      const statusDiv = document.getElementById('status');
      const resultsDiv = document.getElementById('results');
      
      statusDiv.textContent = 'Testing background script...';
      resultsDiv.innerHTML = '';
      
      // First test if background script is working
      try {
        const pingResponse = await sendMessageToBackground({ action: 'ping' });
        console.log('Ping response:', pingResponse);
        statusDiv.textContent = 'Background script working, testing Ollama...';
      } catch (error) {
        statusDiv.textContent = '❌ Background script not responding';
        resultsDiv.innerHTML = `<div style="color: red; padding: 10px;">Background script error: ${error.message}</div>`;
        return;
      }
      
      try {
        await checkOllamaPort();
        statusDiv.textContent = '✅ Ollama connection successful!';
        resultsDiv.innerHTML = '<div style="color: green; padding: 10px;">Ollama is running and responding on port 11435</div>';
        
        // Test if we can actually generate a response
        statusDiv.textContent = 'Testing model generation (this may take a while)...';
        
        // First, let's get the available models
        const modelsResponse = await sendMessageToBackground({
          action: 'ollamaRequest',
          endpoint: '/api/tags',
          method: 'GET'
        });
        
        console.log('Available models:', modelsResponse);
        
        if (modelsResponse && modelsResponse.success && modelsResponse.data && modelsResponse.data.models) {
          const availableModels = modelsResponse.data.models;
          console.log('Available models:', availableModels);
          
          // Use the first available model for testing
          const testModel = availableModels[0]?.name || 'gemma3:12b';
          statusDiv.textContent = `Testing model generation with ${testModel} (this may take 30-60 seconds)...`;
          
          const testResponse = await sendMessageToBackground({
            action: 'ollamaRequest',
            endpoint: '/api/generate',
            method: 'POST',
            body: {
              model: testModel,
              prompt: 'Hello, this is a test.',
              stream: false
            }
          });
          
          if (testResponse && testResponse.success) {
            statusDiv.textContent = '✅ Ollama connection and model generation successful!';
            resultsDiv.innerHTML = `<div style="color: green; padding: 10px;">Ollama is working perfectly! Model "${testModel}" can generate responses.</div>`;
          } else {
            statusDiv.textContent = '⚠️ Ollama connected but model generation failed';
            resultsDiv.innerHTML = `<div style="color: orange; padding: 10px;">Connection works but model generation failed: ${testResponse?.error || 'Unknown error'}</div>`;
          }
        } else {
          statusDiv.textContent = '⚠️ Could not get available models';
          resultsDiv.innerHTML = `<div style="color: orange; padding: 10px;">Connected to Ollama but could not retrieve model list.</div>`;
        }
      } catch (error) {
        statusDiv.textContent = '❌ Ollama connection failed';
        resultsDiv.innerHTML = `<div style="color: red; padding: 10px;">Failed to connect to Ollama: ${error.message}</div>`;
      }
    } catch (error) {
      document.getElementById('status').textContent = 'Error: ' + error.message;
    }
  });

  // Remove Excel export logic and add CSV export logic
  function exportLeadsToCSV(leads) {
    if (!leads || !leads.length) {
      alert('No leads to export!');
      return;
    }
    // Only these columns: name, headline, profileurl, age, message
    const headerKeys = [
      'name',
      'headline',
      'profileurl',
      'age',
      'message'
    ];
    const header = ['Name', 'Headline', 'Profile URL', 'Age', 'Message'];
    function escapeCSVField(field) {
      if (field === null || field === undefined) return '';
      const str = String(field);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }
    // Map each lead to the correct keys, with fallback for profileurl and message
    const rows = leads.map(lead => [
      escapeCSVField(lead.name || ''),
      escapeCSVField(lead.headline || ''),
      escapeCSVField(lead.profileurl || lead.linkedin_profile_url || lead.linkedinUrl || ''),
      escapeCSVField(lead.age || ''),
      escapeCSVField(lead.message || lead.content || '')
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