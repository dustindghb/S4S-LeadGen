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
  
  document.getElementById('extract').addEventListener('click', async () => {
    try {
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const statusDiv = document.getElementById('status');
      const resultsDiv = document.getElementById('results');
      resultsDiv.innerHTML = '';
      statusDiv.textContent = 'Ensuring content script is loaded...';
      
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
        if (response.posts.length > 0) {
          showDownloadButton();
        }
      } else {
        resultsDiv.textContent = 'No posts found or not on LinkedIn feed page.';
      }
    } catch (error) {
      document.getElementById('status').textContent = 'Error: ' + error.message;
      document.getElementById('results').textContent = 'Failed to extract posts. Please refresh the LinkedIn page and try again.';
    }
  });
  
  document.getElementById('startScroll').addEventListener('click', async () => {
    try {
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const statusDiv = document.getElementById('status');
      const startBtn = document.getElementById('startScroll');
      const stopBtn = document.getElementById('stopScroll');
      
      currentTabId = tab.id;
      isScrolling = true;
      startBtn.disabled = true;
      stopBtn.disabled = false;
      statusDiv.textContent = 'Preparing to scroll...';
      
      // Ensure content script is injected
      const injected = await ensureContentScriptInjected();
      if (!injected) {
        statusDiv.textContent = 'Error: Could not inject content script. Please refresh the LinkedIn page.';
        resetButtonStates();
        return;
      }
      
      // Test if content script is responsive
      const isResponsive = await testContentScript(tab.id);
      if (!isResponsive) {
        statusDiv.textContent = 'Error: Content script not responsive. Please refresh the LinkedIn page.';
        resetButtonStates();
        return;
      }
      
      statusDiv.textContent = 'Starting scroll...';
      performScroll();
    } catch (error) {
      document.getElementById('status').textContent = 'Error: ' + error.message;
      resetButtonStates();
    }
  });
  
  document.getElementById('stopScroll').addEventListener('click', async () => {
    try {
      const statusDiv = document.getElementById('status');
      const startBtn = document.getElementById('startScroll');
      const stopBtn = document.getElementById('stopScroll');
      
      isScrolling = false;
      startBtn.disabled = false;
      stopBtn.disabled = true;
      statusDiv.textContent = `Stopping scroll...`;
      
      if (currentTabId) {
        try {
          // Send stopScroll to content script
          await sendMessage(currentTabId, { action: "stopScroll" }, 5000);
          statusDiv.textContent = `Stopped. Extracting posts...`;
          
          // Now extract posts
          const response = await sendMessage(currentTabId, { action: "extractPosts" });
          if (response && response.posts) {
            extractedPosts = response.posts;
            statusDiv.textContent = `Found ${response.posts.length} posts after scrolling`;
            displayJSONData(response.posts);
            if (response.posts.length > 0) {
              showDownloadButton();
            }
          }
        } catch (error) {
          statusDiv.textContent = 'Scroll stopped. Please try extracting posts manually.';
        }
      }
    } catch (error) {
      document.getElementById('status').textContent = 'Error: ' + error.message;
    }
  });
  
  async function performScroll() {
    if (!isScrolling || !currentTabId) return;
    
    try {
      const statusDiv = document.getElementById('status');
      statusDiv.textContent = `Scrolling...`;
      
      // Check if content script is still responsive before scrolling
      const isResponsive = await testContentScript(currentTabId);
      if (!isResponsive) {
        statusDiv.textContent = 'Content script became unresponsive. Please refresh the page.';
        resetButtonStates();
        return;
      }
      
      const response = await sendMessage(currentTabId, { action: "performSingleScroll" }, 30000);
      
      if (response && response.stopped) {
        statusDiv.textContent = 'Scrolling was stopped.';
        resetButtonStates();
        return;
      }
      
      // Check again after scroll completes, before scheduling next scroll
      if (!isScrolling) return;
      
      setTimeout(() => {
        if (isScrolling) {
          performScroll();
        }
      }, 3000);
      
    } catch (error) {
      const statusDiv = document.getElementById('status');
      if (error.message.includes('timeout')) {
        statusDiv.textContent = 'Scroll timeout. Retrying...';
      } else if (error.message.includes('port closed')) {
        statusDiv.textContent = 'Connection lost. Please refresh the page.';
        resetButtonStates();
        return;
      } else {
        statusDiv.textContent = 'Scroll error. Retrying...';
      }
      
      // Retry after delay if still scrolling
      setTimeout(() => {
        if (isScrolling) {
          performScroll();
        }
      }, 5000);
    }
  }
  
  function resetButtonStates() {
    const startBtn = document.getElementById('startScroll');
    const stopBtn = document.getElementById('stopScroll');
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    isScrolling = false;
  }
  
  // Function to show download button
  function showDownloadButton() {
    const downloadDiv = document.getElementById('download-section');
    if (downloadDiv) {
      downloadDiv.style.display = 'block';
    }
  }
  
  // Add event listener for Find Leads button
  document.getElementById('findLeads').addEventListener('click', async () => {
    try {
      const statusDiv = document.getElementById('status');
      const resultsDiv = document.getElementById('results');
      const promptInput = document.getElementById('prompt');
      const findLeadsBtn = document.getElementById('findLeads');
      
      if (extractedPosts.length === 0) {
        statusDiv.textContent = 'Error: No posts extracted yet. Please extract posts first.';
        return;
      }
      
      const prompt = promptInput.value.trim();
      if (!prompt) {
        statusDiv.textContent = 'Error: Please enter a prompt for lead analysis.';
        return;
      }
      
      // Disable button and show generating status
      findLeadsBtn.disabled = true;
      findLeadsBtn.textContent = 'Generating Response...';
      statusDiv.textContent = 'Connecting to Ollama...';
      resultsDiv.innerHTML = '';
      
      try {
        statusDiv.textContent = 'Starting hiring post analysis...';
        
        // Use the new individual post filtering approach
        const hiringPosts = await filterHiringPosts(extractedPosts, statusDiv);
        
        if (hiringPosts.length > 0) {
          statusDiv.textContent = `Found ${hiringPosts.length} hiring-related posts!`;
          const jsonString = JSON.stringify(hiringPosts, null, 2);
          resultsDiv.innerHTML = `<div class="json-display">${jsonString}</div>`;
        } else {
          statusDiv.textContent = 'No hiring-related posts found.';
          resultsDiv.innerHTML = '<div style="color: orange; padding: 10px;">No posts about hiring, recruiting, or job opportunities were found in the extracted data.</div>';
        }
      } catch (error) {
        statusDiv.textContent = `Error: ${error.message}`;
        resultsDiv.innerHTML = `<div style="color: red; padding: 10px;">Failed to analyze leads: ${error.message}</div>`;
      } finally {
        // Re-enable button
        findLeadsBtn.disabled = false;
        findLeadsBtn.textContent = 'Find Leads';
      }
    } catch (error) {
      document.getElementById('status').textContent = 'Error: ' + error.message;
      // Re-enable button on error
      const findLeadsBtn = document.getElementById('findLeads');
      if (findLeadsBtn) {
        findLeadsBtn.disabled = false;
        findLeadsBtn.textContent = 'Find Leads';
      }
    }
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

  // Add event listener for download button
  document.addEventListener('DOMContentLoaded', function() {
    const downloadBtn = document.getElementById('downloadJSON');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        if (extractedPosts.length > 0) {
          const jsonData = organizeDataForJSON(extractedPosts);
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const filename = `linkedin_posts_${timestamp}.json`;
          downloadJSON(jsonData, filename);
        }
      });
    }
  });