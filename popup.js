

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

  // Default hiring classifier prompt
  const DEFAULT_HIRING_CLASSIFIER_PROMPT = `SYSTEM: You are a hiring post classifier. Return ONLY "YES" or "NO".
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

POST CONTENT: {post.content || post.message || ''}
POST HEADLINE: {post.headline || ''}
RESPONSE: Return ONLY "YES" or "NO"`;

  // Function to save prompt to storage
  async function savePromptToStorage(prompt) {
    return new Promise((resolve) => {
      console.log('[S4S] Attempting to save prompt to storage');
      
      if (typeof chrome === 'undefined') {
        console.error('[S4S] Chrome object is undefined');
        resolve(false);
        return;
      }
      
      if (!chrome.storage) {
        console.error('[S4S] chrome.storage is not available');
        resolve(false);
        return;
      }
      
      if (!chrome.storage.local) {
        console.error('[S4S] chrome.storage.local is not available, using fallback storage');
        fallbackStorage.hiringClassifierPrompt = prompt;
        resolve(true);
        return;
      }
      
      try {
        chrome.storage.local.set({ hiringClassifierPrompt: prompt }, () => {
          if (chrome.runtime.lastError) {
            console.error('[S4S] Error saving prompt to storage:', chrome.runtime.lastError);
            console.log('[S4S] Using fallback storage instead');
            fallbackStorage.hiringClassifierPrompt = prompt;
            resolve(true);
          } else {
            console.log('[S4S] Prompt saved to storage successfully');
            resolve(true);
          }
        });
      } catch (error) {
        console.error('[S4S] Exception while saving prompt to storage:', error);
        console.log('[S4S] Using fallback storage instead');
        fallbackStorage.hiringClassifierPrompt = prompt;
        resolve(true);
      }
    });
  }

  // Function to load prompt from storage
  async function loadPromptFromStorage() {
    return new Promise((resolve) => {
      console.log('[S4S] Attempting to load prompt from storage');
      
      if (typeof chrome === 'undefined') {
        console.error('[S4S] Chrome object is undefined');
        resolve(DEFAULT_HIRING_CLASSIFIER_PROMPT);
        return;
      }
      
      if (!chrome.storage) {
        console.error('[S4S] chrome.storage is not available');
        resolve(DEFAULT_HIRING_CLASSIFIER_PROMPT);
        return;
      }
      
      if (!chrome.storage.local) {
        console.error('[S4S] chrome.storage.local is not available, using fallback storage');
        resolve(fallbackStorage.hiringClassifierPrompt || DEFAULT_HIRING_CLASSIFIER_PROMPT);
        return;
      }
      
      try {
        chrome.storage.local.get(['hiringClassifierPrompt'], (result) => {
          if (chrome.runtime.lastError) {
            console.error('[S4S] Error loading prompt from storage:', chrome.runtime.lastError);
            console.log('[S4S] Using fallback storage instead');
            resolve(fallbackStorage.hiringClassifierPrompt || DEFAULT_HIRING_CLASSIFIER_PROMPT);
          } else {
            const savedPrompt = result.hiringClassifierPrompt;
            if (savedPrompt) {
              console.log('[S4S] Loaded saved prompt from storage');
              resolve(savedPrompt);
            } else {
              console.log('[S4S] No saved prompt found, using default');
              resolve(DEFAULT_HIRING_CLASSIFIER_PROMPT);
            }
          }
        });
      } catch (error) {
        console.error('[S4S] Exception while loading prompt from storage:', error);
        console.log('[S4S] Using fallback storage instead');
        resolve(fallbackStorage.hiringClassifierPrompt || DEFAULT_HIRING_CLASSIFIER_PROMPT);
      }
    });
  }

  // Function to get the current prompt (either saved or default)
  async function getCurrentPrompt() {
    return await loadPromptFromStorage();
  }

  // Function to save OpenAI configuration to storage
  async function saveOpenAIConfigToStorage(config) {
    return new Promise((resolve) => {
      console.log('[S4S] Attempting to save OpenAI config:', config);
      console.log('[S4S] Chrome object available:', typeof chrome !== 'undefined');
      console.log('[S4S] Chrome storage available:', typeof chrome !== 'undefined' && chrome.storage);
      console.log('[S4S] Chrome storage.local available:', typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local);
      
      if (typeof chrome === 'undefined') {
        console.error('[S4S] Chrome object is undefined');
        resolve(false);
        return;
      }
      
      if (!chrome.storage) {
        console.error('[S4S] chrome.storage is not available');
        resolve(false);
        return;
      }
      
      if (!chrome.storage.local) {
        console.error('[S4S] chrome.storage.local is not available, using fallback storage');
        fallbackStorage.openaiConfig = config;
        resolve(true);
        return;
      }
      
      try {
        chrome.storage.local.set({ openaiConfig: config }, () => {
          if (chrome.runtime.lastError) {
            console.error('[S4S] Error saving to storage:', chrome.runtime.lastError);
            console.log('[S4S] Using fallback storage instead');
            fallbackStorage.openaiConfig = config;
            resolve(true);
          } else {
            console.log('[S4S] OpenAI config saved to storage successfully');
            resolve(true);
          }
        });
      } catch (error) {
        console.error('[S4S] Exception while saving to storage:', error);
        console.log('[S4S] Using fallback storage instead');
        fallbackStorage.openaiConfig = config;
        resolve(true);
      }
    });
  }

  // Function to load OpenAI configuration from storage
  async function loadOpenAIConfigFromStorage() {
    return new Promise((resolve) => {
      console.log('[S4S] Attempting to load OpenAI config from storage');
      
      if (typeof chrome === 'undefined') {
        console.error('[S4S] Chrome object is undefined');
        resolve({ apiKey: '', model: 'gpt-4o-mini' });
        return;
      }
      
      if (!chrome.storage) {
        console.error('[S4S] chrome.storage is not available');
        resolve({ apiKey: '', model: 'gpt-4o-mini' });
        return;
      }
      
      if (!chrome.storage.local) {
        console.error('[S4S] chrome.storage.local is not available, using fallback storage');
        resolve(fallbackStorage.openaiConfig || { apiKey: '', model: 'gpt-4o-mini' });
        return;
      }
      
      try {
        chrome.storage.local.get(['openaiConfig'], (result) => {
          if (chrome.runtime.lastError) {
            console.error('[S4S] Error loading from storage:', chrome.runtime.lastError);
            console.log('[S4S] Using fallback storage instead');
            resolve(fallbackStorage.openaiConfig || { apiKey: '', model: 'gpt-4o-mini' });
          } else {
            const savedConfig = result.openaiConfig;
            if (savedConfig) {
              console.log('[S4S] Loaded saved OpenAI config from storage');
              resolve(savedConfig);
            } else {
              console.log('[S4S] No saved OpenAI config found, using defaults');
              resolve({ apiKey: '', model: 'gpt-4o-mini' });
            }
          }
        });
      } catch (error) {
        console.error('[S4S] Exception while loading from storage:', error);
        console.log('[S4S] Using fallback storage instead');
        resolve(fallbackStorage.openaiConfig || { apiKey: '', model: 'gpt-4o-mini' });
      }
    });
  }

  // Function to save AI provider preference to storage
  async function saveAIProviderToStorage(provider) {
    return new Promise((resolve) => {
      console.log('[S4S] Attempting to save AI provider:', provider);
      
      if (typeof chrome === 'undefined') {
        console.error('[S4S] Chrome object is undefined');
        resolve(false);
        return;
      }
      
      if (!chrome.storage) {
        console.error('[S4S] chrome.storage is not available');
        resolve(false);
        return;
      }
      
      if (!chrome.storage.local) {
        console.error('[S4S] chrome.storage.local is not available, using fallback storage');
        fallbackStorage.aiProvider = provider;
        resolve(true);
        return;
      }
      
      try {
        chrome.storage.local.set({ aiProvider: provider }, () => {
          if (chrome.runtime.lastError) {
            console.error('[S4S] Error saving AI provider to storage:', chrome.runtime.lastError);
            console.log('[S4S] Using fallback storage instead');
            fallbackStorage.aiProvider = provider;
            resolve(true);
          } else {
            console.log('[S4S] AI provider saved to storage successfully:', provider);
            resolve(true);
          }
        });
      } catch (error) {
        console.error('[S4S] Exception while saving AI provider to storage:', error);
        console.log('[S4S] Using fallback storage instead');
        fallbackStorage.aiProvider = provider;
        resolve(true);
      }
    });
  }

  // Function to load AI provider preference from storage
  async function loadAIProviderFromStorage() {
    return new Promise((resolve) => {
      console.log('[S4S] Attempting to load AI provider from storage');
      
      if (typeof chrome === 'undefined') {
        console.error('[S4S] Chrome object is undefined');
        resolve('openai');
        return;
      }
      
      if (!chrome.storage) {
        console.error('[S4S] chrome.storage is not available');
        resolve('openai');
        return;
      }
      
      if (!chrome.storage.local) {
        console.error('[S4S] chrome.storage.local is not available, using fallback storage');
        resolve(fallbackStorage.aiProvider || 'openai');
        return;
      }
      
      try {
        chrome.storage.local.get(['aiProvider'], (result) => {
          if (chrome.runtime.lastError) {
            console.error('[S4S] Error loading AI provider from storage:', chrome.runtime.lastError);
            console.log('[S4S] Using fallback storage instead');
            resolve(fallbackStorage.aiProvider || 'openai');
          } else {
            const savedProvider = result.aiProvider;
            if (savedProvider) {
              console.log('[S4S] Loaded saved AI provider from storage:', savedProvider);
              resolve(savedProvider);
            } else {
              console.log('[S4S] No saved AI provider found, using openai');
              resolve('openai');
            }
          }
        });
      } catch (error) {
        console.error('[S4S] Exception while loading AI provider from storage:', error);
        console.log('[S4S] Using fallback storage instead');
        resolve(fallbackStorage.aiProvider || 'openai');
      }
    });
  }

  // Function to send request to OpenAI
  async function sendMessageToOpenAI(prompt, model = 'gpt-4o-mini') {
    const config = await loadOpenAIConfigFromStorage();
    
    if (!config.apiKey) {
      throw new Error('OpenAI API key not configured. Please enter your API key in the settings.');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 50,
        temperature: 0.0
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return {
      success: true,
      data: {
        response: data.choices[0]?.message?.content?.trim() || ''
      }
    };
  }

  // Fallback in-memory storage for when chrome.storage is not available
  const fallbackStorage = {
    openaiConfig: null,
    aiProvider: 'openai',
    hiringClassifierPrompt: null
  };

  // Function to get current AI provider
  async function getCurrentAIProvider() {
    return await loadAIProviderFromStorage();
  }

  // Debug function to check storage status
  function debugStorageStatus() {
    console.log('[S4S] === Storage Debug Info ===');
    console.log('[S4S] Chrome object available:', typeof chrome !== 'undefined');
    console.log('[S4S] Chrome storage available:', typeof chrome !== 'undefined' && chrome.storage);
    console.log('[S4S] Chrome storage.local available:', typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local);
    console.log('[S4S] Fallback storage:', fallbackStorage);
    
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(null, (result) => {
        console.log('[S4S] All stored data:', result);
      });
    }
  }

  // Function to check if a single post is about hiring
  async function checkIfPostIsHiring(post) {
    const currentPrompt = await getCurrentPrompt();
    
    // Validate prompt
    if (!currentPrompt || currentPrompt.trim() === '') {
      console.error('[S4S] Empty prompt detected, using default');
      const defaultPrompt = DEFAULT_HIRING_CLASSIFIER_PROMPT
        .replace('{post.content || post.message || \'\'}', post.content || post.message || '')
        .replace('{post.headline || \'\'}', post.headline || '');
      return await sendPromptToAI(defaultPrompt);
    }
    
    const HIRING_CLASSIFIER_PROMPT = currentPrompt
      .replace('{post.content || post.message || \'\'}', post.content || post.message || '')
      .replace('{post.headline || \'\'}', post.headline || '');
    
    return await sendPromptToAI(HIRING_CLASSIFIER_PROMPT);
  }

  // Helper function to send prompt to AI provider (Ollama or OpenAI)
  async function sendPromptToAI(prompt) {
    const provider = await getCurrentAIProvider();
    
    if (provider === 'openai') {
      const config = await loadOpenAIConfigFromStorage();
      const response = await sendMessageToOpenAI(prompt, config.model);
      
      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to get response from OpenAI');
      }
      
      const result = response.data.response.trim().toUpperCase();
      return result === 'YES';
    } else {
      // Default to Ollama
      const response = await sendMessageToBackground({
        action: 'ollamaRequest',
        endpoint: '/api/generate',
        method: 'POST',
        body: {
          model: 'gemma3:12b',
          prompt: prompt,
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
        throw new Error(response?.error || `Failed to get response from ${provider}`);
      }
      
      const result = response.data.response.trim().toUpperCase();
      return result === 'YES';
    }
  }

  // Function to reason about what position they are hiring for using AI
  async function extractPositionFromContent(post) {
    console.log(`[S4S] Extracting hiring position from post content:`, {
      name: post.name,
      content: post.content?.substring(0, 200) + '...'
    });
    
    if (!post.content || post.content.trim() === '') {
      console.log(`[S4S] No content found for post "${post.name}", no position to extract`);
      return '';
    }
    
    // Log the full content for debugging
    console.log(`[S4S] Full post content for position extraction:`, post.content);
    
    const positionPrompt = `You are an expert at analyzing LinkedIn hiring posts to extract the exact job position being hired for.

Analyze this LinkedIn post content and extract the specific job position:

POST CONTENT: ${post.content}

CRITICAL INSTRUCTIONS:
1. Look for EXACT job titles mentioned in the text
2. Extract the job title exactly as written (e.g., "VP of Merchandising", "Senior Software Engineer")
3. Look for job titles after phrases like "looking for", "seeking", "hiring for", "we are looking for"
4. Pay attention to job titles in quotes or emphasized text
5. If multiple positions are mentioned, choose the most specific/senior one
6. Only return empty string if no specific job title can be identified

EXAMPLES:
- "We are looking for a passionate VP of Merchandising" → "VP of Merchandising"
- "Hiring Senior Software Engineers" → "Senior Software Engineer"
- "Seeking Marketing Manager for our team" → "Marketing Manager"
- "Looking for someone to join our sales team" → "Sales Representative"
- "We're growing and need help" → "" (too vague)

Return ONLY the job title as a string, or empty string if no specific job title found:`;

    console.log(`[S4S] Sending position extraction prompt to AI`);

    const provider = await getCurrentAIProvider();
    let response;

    if (provider === 'openai') {
      const config = await loadOpenAIConfigFromStorage();
      response = await sendMessageToOpenAI(positionPrompt, config.model);
    } else {
      // Default to Ollama
      response = await sendMessageToBackground({
        action: 'ollamaRequest',
        endpoint: '/api/generate',
        method: 'POST',
        body: {
          model: 'gemma3:12b',
          prompt: positionPrompt,
          stream: false,
          options: {
            temperature: 0.0,
            num_predict: 50,
            top_k: 1,
            top_p: 0.1,
            repeat_penalty: 1.0,
            num_ctx: 4096
          }
        }
      });
    }
    
    if (!response || !response.success) {
      console.error(`[S4S] Position extraction AI request failed:`, response);
      return '';
    }
    
    console.log(`[S4S] ${provider} position extraction response:`, response.data.response);
    
    const position = response.data.response.trim();
    console.log(`[S4S] Extracted position:`, position);
    
    return position;
  }



  // Function to extract title, company, and position from a post's headline and content
  async function extractTitleAndCompany(post) {
    console.log(`[S4S] Extracting title/company/position for post:`, {
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
        company: 'Unknown Company',
        position: ''
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

    console.log(`[S4S] Sending prompt to AI:`, titleCompanyPrompt);

    const provider = await getCurrentAIProvider();
    let response;

    if (provider === 'openai') {
      const config = await loadOpenAIConfigFromStorage();
      response = await sendMessageToOpenAI(titleCompanyPrompt, config.model);
    } else {
      // Default to Ollama
      response = await sendMessageToBackground({
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
    }
    
    if (!response || !response.success) {
      console.error(`[S4S] AI request failed:`, response);
      throw new Error(response?.error || `Failed to get response from ${provider}`);
    }
    
    console.log(`[S4S] ${provider} response:`, response.data.response);
    
    let titleCompanyData;
    try {
      const result = JSON.parse(response.data.response.trim());
      console.log(`[S4S] Parsed result:`, result);
      titleCompanyData = {
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
            titleCompanyData = {
              title: titleMatch[1] || 'Unknown Title',
              company: companyMatch[1] || 'Unknown Company'
            };
          }
        } catch (manualError) {
          console.error('[S4S] Manual extraction also failed:', manualError);
        }
      }
      
      if (!titleCompanyData) {
        titleCompanyData = {
          title: 'Unknown Title',
          company: 'Unknown Company'
        };
      }
    }
    
    // Now extract position from content
    const position = await extractPositionFromContent(post);
    
    return {
      ...titleCompanyData,
      position: position
    };
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
  async function analyzeLeadsWithAI(posts, prompt) {
    const provider = await getCurrentAIProvider();
    const jsonData = organizeDataForJSON(posts);
    
    console.log(`Sending posts to ${provider}:`, jsonData.length, 'posts');
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
    
    let response;
    
    if (provider === 'openai') {
      const config = await loadOpenAIConfigFromStorage();
      response = await sendMessageToOpenAI(finalPrompt, config.model);
    } else {
      // Default to Ollama
      await checkOllamaPort(); // Verify Ollama is running
      response = await sendMessageToBackground({
        action: 'ollamaRequest',
        endpoint: '/api/generate',
        method: 'POST',
        body: {
          model: 'gemma3:12b',
          prompt: finalPrompt,
          stream: false
        }
      });
    }
    
    if (!response || !response.success) {
      throw new Error(response?.error || `Failed to get response from ${provider}`);
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
  let postLimit = 0; // New: limit for number of posts to analyze
  let postLimitReached = false; // New: flag to track if post limit has been reached

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

    // Initialize AI provider configuration
    const ollamaProviderRadio = document.getElementById('ollamaProvider');
    const openaiProviderRadio = document.getElementById('openaiProvider');
    const openaiConfigDiv = document.getElementById('openaiConfig');
    const openaiApiKeyInput = document.getElementById('openaiApiKey');
    const openaiModelSelect = document.getElementById('openaiModel');
    const saveOpenAIConfigBtn = document.getElementById('saveOpenAIConfig');
    const testOpenAIBtn = document.getElementById('testOpenAI');

    // Initialize prompt editing functionality
    const classifierPromptTextarea = document.getElementById('classifierPrompt');
    const savePromptBtn = document.getElementById('savePrompt');
    const resetPromptBtn = document.getElementById('resetPrompt');

    if (!ollamaProviderRadio || !openaiProviderRadio || !openaiConfigDiv || !openaiApiKeyInput || !openaiModelSelect || !saveOpenAIConfigBtn || !testOpenAIBtn) {
      console.error('[S4S] AI provider configuration elements not found');
    } else {
      // Debug storage status on load
      debugStorageStatus();
      // Load saved AI provider preference
      (async () => {
        try {
          const savedProvider = await loadAIProviderFromStorage();
          if (savedProvider === 'openai') {
            openaiProviderRadio.checked = true;
            openaiConfigDiv.style.display = 'block';
          } else {
            ollamaProviderRadio.checked = true;
            openaiConfigDiv.style.display = 'none';
          }
          console.log('[S4S] Loaded AI provider preference:', savedProvider);
        } catch (error) {
          console.error('[S4S] Error loading AI provider preference:', error);
          // Default to OpenAI if there's an error
          openaiProviderRadio.checked = true;
          openaiConfigDiv.style.display = 'block';
        }
      })();

      // Load saved OpenAI configuration
      (async () => {
        try {
          const savedConfig = await loadOpenAIConfigFromStorage();
          openaiApiKeyInput.value = savedConfig.apiKey || '';
          openaiModelSelect.value = savedConfig.model || 'gpt-4o-mini';
          console.log('[S4S] Loaded OpenAI configuration');
        } catch (error) {
          console.error('[S4S] Error loading OpenAI configuration:', error);
        }
      })();

      // AI provider radio button event listeners
      ollamaProviderRadio.addEventListener('change', async () => {
        if (ollamaProviderRadio.checked) {
          openaiConfigDiv.style.display = 'none';
          await saveAIProviderToStorage('ollama');
          statusDiv.textContent = 'Switched to Ollama (Local)';
        }
      });

      openaiProviderRadio.addEventListener('change', async () => {
        if (openaiProviderRadio.checked) {
          openaiConfigDiv.style.display = 'block';
          await saveAIProviderToStorage('openai');
          statusDiv.textContent = 'Switched to OpenAI (Cloud)';
        }
      });

      // Save OpenAI configuration button event listener
      saveOpenAIConfigBtn.addEventListener('click', async () => {
        try {
          console.log('[S4S] Starting OpenAI configuration save...');
          const apiKey = openaiApiKeyInput.value.trim();
          const model = openaiModelSelect.value;

          console.log('[S4S] API Key length:', apiKey.length);
          console.log('[S4S] Selected model:', model);

          if (!apiKey) {
            statusDiv.textContent = 'Error: OpenAI API key is required';
            return;
          }

          if (!apiKey.startsWith('sk-')) {
            statusDiv.textContent = 'Error: Invalid OpenAI API key format (should start with sk-)';
            return;
          }

          saveOpenAIConfigBtn.disabled = true;
          saveOpenAIConfigBtn.textContent = 'Saving...';
          
          const config = { apiKey, model };
          console.log('[S4S] Saving config:', { ...config, apiKey: config.apiKey.substring(0, 10) + '...' });
          const success = await saveOpenAIConfigToStorage(config);
          
          console.log('[S4S] Save result:', success);
          
          if (success) {
            statusDiv.textContent = 'OpenAI configuration saved successfully!';
            saveOpenAIConfigBtn.textContent = 'Saved!';
            setTimeout(() => {
              saveOpenAIConfigBtn.textContent = 'Save OpenAI Config';
              saveOpenAIConfigBtn.disabled = false;
            }, 2000);
          } else {
            statusDiv.textContent = 'Error: Failed to save OpenAI configuration';
            saveOpenAIConfigBtn.textContent = 'Save OpenAI Config';
            saveOpenAIConfigBtn.disabled = false;
          }
        } catch (error) {
          console.error('[S4S] Error saving OpenAI configuration:', error);
          statusDiv.textContent = 'Error: ' + error.message;
          saveOpenAIConfigBtn.textContent = 'Save OpenAI Config';
          saveOpenAIConfigBtn.disabled = false;
        }
      });

      // Test OpenAI connection button event listener
      testOpenAIBtn.addEventListener('click', async () => {
        try {
          console.log('[S4S] Starting OpenAI connection test...');
          const apiKey = openaiApiKeyInput.value.trim();
          const model = openaiModelSelect.value;

          console.log('[S4S] API Key length:', apiKey.length);
          console.log('[S4S] Selected model:', model);

          if (!apiKey) {
            statusDiv.textContent = 'Error: OpenAI API key is required';
            return;
          }

          if (!apiKey.startsWith('sk-')) {
            statusDiv.textContent = 'Error: Invalid OpenAI API key format (should start with sk-)';
            return;
          }

          testOpenAIBtn.disabled = true;
          testOpenAIBtn.textContent = 'Testing...';
          
          console.log('[S4S] Sending test request to OpenAI...');
          // Test with a simple prompt
          const testResponse = await sendMessageToOpenAI('Respond with "OK" if you can see this message.', model);
          
          console.log('[S4S] Test response received:', testResponse);
          
          if (testResponse && testResponse.success) {
            statusDiv.textContent = 'OpenAI connection test successful!';
            testOpenAIBtn.textContent = 'Test Passed!';
            setTimeout(() => {
              testOpenAIBtn.textContent = 'Test Connection';
              testOpenAIBtn.disabled = false;
            }, 2000);
          } else {
            statusDiv.textContent = 'Error: OpenAI connection test failed';
            testOpenAIBtn.textContent = 'Test Failed';
            setTimeout(() => {
              testOpenAIBtn.textContent = 'Test Connection';
              testOpenAIBtn.disabled = false;
            }, 2000);
          }
        } catch (error) {
          console.error('[S4S] Error testing OpenAI connection:', error);
          statusDiv.textContent = 'Error: ' + error.message;
          testOpenAIBtn.textContent = 'Test Connection';
          testOpenAIBtn.disabled = false;
        }
      });
    }

    if (!classifierPromptTextarea || !savePromptBtn || !resetPromptBtn) {
      console.error('[S4S] Prompt editing elements not found');
    } else {
      // Load saved prompt or default on page load
      (async () => {
        try {
          const currentPrompt = await loadPromptFromStorage();
          classifierPromptTextarea.value = currentPrompt;
          console.log('[S4S] Loaded prompt into textarea');
        } catch (error) {
          console.error('[S4S] Error loading prompt:', error);
          classifierPromptTextarea.value = DEFAULT_HIRING_CLASSIFIER_PROMPT;
        }
      })();

      // Track if prompt has been modified
      let originalPrompt = '';
      classifierPromptTextarea.addEventListener('input', () => {
        const currentValue = classifierPromptTextarea.value;
        if (currentValue !== originalPrompt) {
          savePromptBtn.textContent = 'Save Prompt*';
          savePromptBtn.style.background = '#ff9800';
        } else {
          savePromptBtn.textContent = 'Save Prompt';
          savePromptBtn.style.background = '#ffb300';
        }
      });

      // Set original prompt after loading
      setTimeout(() => {
        originalPrompt = classifierPromptTextarea.value;
      }, 100);

      // Save prompt button event listener
      savePromptBtn.addEventListener('click', async () => {
        try {
          const newPrompt = classifierPromptTextarea.value.trim();
          if (!newPrompt) {
            statusDiv.textContent = 'Error: Prompt cannot be empty';
            return;
          }

          savePromptBtn.disabled = true;
          savePromptBtn.textContent = 'Saving...';
          
          const success = await savePromptToStorage(newPrompt);
          
          if (success) {
            statusDiv.textContent = 'Prompt saved successfully!';
            savePromptBtn.textContent = 'Saved!';
            savePromptBtn.style.background = '#4caf50';
            originalPrompt = newPrompt; // Update original prompt
            setTimeout(() => {
              savePromptBtn.textContent = 'Save Prompt';
              savePromptBtn.style.background = '#ffb300';
              savePromptBtn.disabled = false;
            }, 2000);
          } else {
            statusDiv.textContent = 'Error: Failed to save prompt';
            savePromptBtn.textContent = 'Save Prompt';
            savePromptBtn.style.background = '#ffb300';
            savePromptBtn.disabled = false;
          }
        } catch (error) {
          console.error('[S4S] Error saving prompt:', error);
          statusDiv.textContent = 'Error: ' + error.message;
          savePromptBtn.textContent = 'Save Prompt';
          savePromptBtn.disabled = false;
        }
      });

      // Reset prompt button event listener
      resetPromptBtn.addEventListener('click', async () => {
        try {
          resetPromptBtn.disabled = true;
          resetPromptBtn.textContent = 'Resetting...';
          
          classifierPromptTextarea.value = DEFAULT_HIRING_CLASSIFIER_PROMPT;
          
          // Save the default prompt to storage
          await savePromptToStorage(DEFAULT_HIRING_CLASSIFIER_PROMPT);
          
          // Reset the modified state
          originalPrompt = DEFAULT_HIRING_CLASSIFIER_PROMPT;
          savePromptBtn.textContent = 'Save Prompt';
          savePromptBtn.style.background = '#ffb300';
          
          statusDiv.textContent = 'Prompt reset to default successfully!';
          resetPromptBtn.textContent = 'Reset Complete!';
          setTimeout(() => {
            resetPromptBtn.textContent = 'Reset to Default';
            resetPromptBtn.disabled = false;
          }, 2000);
        } catch (error) {
          console.error('[S4S] Error resetting prompt:', error);
          statusDiv.textContent = 'Error: ' + error.message;
          resetPromptBtn.textContent = 'Reset to Default';
          resetPromptBtn.disabled = false;
        }
      });
    }

    // Initialize date filter functionality
    const dateFilterInput = document.getElementById('dateFilterDays');
    const clearDateFilterBtn = document.getElementById('clearDateFilter');
    
    if (clearDateFilterBtn) {
      clearDateFilterBtn.addEventListener('click', () => {
        if (dateFilterInput) {
          dateFilterInput.value = '';
          statusDiv.textContent = 'Date filter cleared. All posts will be included in exports.';
          updateDateFilterUI();
        }
      });
    }

    // Add event listener for date filter input changes
    if (dateFilterInput) {
      dateFilterInput.addEventListener('input', updateDateFilterUI);
    }

    // Initialize the UI
    updateDateFilterUI();

    // Initialize post limit functionality
    const postLimitInput = document.getElementById('postLimit');
    const clearPostLimitBtn = document.getElementById('clearPostLimit');
    
    if (clearPostLimitBtn) {
      clearPostLimitBtn.addEventListener('click', () => {
        if (postLimitInput) {
          postLimitInput.value = '';
          postLimit = 0;
          postLimitReached = false;
          statusDiv.textContent = 'Post limit cleared. Analysis will continue until manually stopped.';
          updatePostLimitUI();
        }
      });
    }

    // Add event listener for post limit input changes
    if (postLimitInput) {
      postLimitInput.addEventListener('input', updatePostLimitUI);
    }

    // Initialize the post limit UI
    updatePostLimitUI();

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

        // Check AI provider configuration
        const currentProvider = await getCurrentAIProvider();
        if (currentProvider === 'openai') {
          const config = await loadOpenAIConfigFromStorage();
          if (!config.apiKey || config.apiKey.trim() === '') {
            alert('OpenAI API key is required to start analysis. Please configure your OpenAI API key in the settings.');
            statusDiv.textContent = 'Error: OpenAI API key not configured. Please enter your API key.';
            startBtn.disabled = false;
            stopBtn.disabled = true;
            return;
          }
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
          
          // Check if date filter is active
          const dateFilterDays = parseInt(document.getElementById('dateFilterDays')?.value) || 0;
          let leadsCount = streamingLeads.length;
          
          if (dateFilterDays > 0) {
            const filteredLeads = filterPostsByDate(streamingLeads, dateFilterDays);
            leadsCount = filteredLeads.length;
          }
          
          statusDiv.textContent = `Loaded ${leadsCount} leads from storage.`;
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
      // Check if date filter is active
      const dateFilterDays = parseInt(document.getElementById('dateFilterDays')?.value) || 0;
      let leadsCount = streamingLeads.length;
      
      if (dateFilterDays > 0) {
        const filteredLeads = filterPostsByDate(streamingLeads, dateFilterDays);
        leadsCount = filteredLeads.length;
      }
      
      statusDiv.textContent = `Found ${leadsCount} leads!`;
      resultsDiv.innerHTML = `<div style="background: #e3f2fd; padding: 10px; border-radius: 5px; margin: 10px 0; font-size: 12px; color: #1976d2; border-left: 4px solid #2196f3;">Analysis complete! Found ${leadsCount} leads. Use the download buttons to export results.</div>`;
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
  async function analyzeSinglePostStreaming(post, statusDiv, resultsDiv) {
    try {
      // Check if this post was already analyzed to prevent duplicates
      const postId = post.postUrl || post.linkedinUrl || `${post.name}-${post.content?.substring(0, 50)}`;
      const alreadyAnalyzed = allAnalyzedPosts.some(analyzedPost => {
        const analyzedPostId = analyzedPost.postUrl || analyzedPost.linkedinUrl || `${analyzedPost.name}-${analyzedPost.content?.substring(0, 50)}`;
        return analyzedPostId === postId;
      });
      
      if (alreadyAnalyzed) {
        console.log(`[S4S] Post already analyzed, skipping: ${post.name}`);
        console.log(`[S4S] Duplicate post skipped - this reduces the number of posts that get analyzed`);
        return false;
      }
      
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
      
              // Check if post limit has been reached
        if (postLimit > 0 && allAnalyzedPosts.length >= postLimit && !postLimitReached) {
          postLimitReached = true;
          console.log(`[S4S] Post limit reached: ${allAnalyzedPosts.length}/${postLimit} posts analyzed`);
          console.log(`[S4S] Total posts found: ${totalPostCount}, Posts analyzed: ${allAnalyzedPosts.length}, Queue size: ${postQueue.length}`);
          statusDiv.textContent = `Post limit reached! Analyzed ${allAnalyzedPosts.length} posts. Stopping analysis and scrolling.`;
        
        // Stop scrolling first
        try {
          const tab = await getMostRecentLinkedInTab();
          if (tab) {
            await sendMessage(tab.id, { action: "stopScroll" }, 5000);
          }
        } catch (error) {
          console.error('[S4S] Error stopping scroll:', error);
        }
        
        // Stop the streaming analysis
        stopStreamingAnalysis();
        
        // Handle completion
        handleAnalysisComplete(statusDiv, resultsDiv);
        return false;
      }
      
      // Update date filter UI to show new post count
      updateDateFilterUI();
      
      if (isHiring) {
        console.log(`[S4S] Streaming: Post is hiring - ${post.name}`);
        
        // Extract title, company, and position
        const titleCompanyData = await extractTitleAndCompany(post);
        
        // Add to leads regardless of whether position was found
        const enrichedPost = {
          ...analyzedPost,
          title: titleCompanyData.title,
          company: titleCompanyData.company,
          position: titleCompanyData.position || 'No hiring position found from post'
        };
        
        // Check if this lead was already added to prevent duplicates
        const leadId = enrichedPost.postUrl || enrichedPost.linkedinUrl || `${enrichedPost.name}-${enrichedPost.content?.substring(0, 50)}`;
        const alreadyAdded = streamingLeads.some(lead => {
          const existingLeadId = lead.postUrl || lead.linkedinUrl || `${lead.name}-${lead.content?.substring(0, 50)}`;
          return existingLeadId === leadId;
        });
        
        if (alreadyAdded) {
          console.log(`[S4S] Lead already added, skipping: ${enrichedPost.name}`);
          return true; // Still return true since it was a valid lead
        }
        
        // Add to streaming leads
        streamingLeads.push(enrichedPost);
        
        // Update status and metrics immediately
        const positionText = titleCompanyData.position ? ` (${titleCompanyData.position})` : ' (No specific position found)';
        
        // Check if date filter is active and show filtered count
        const dateFilterDays = parseInt(document.getElementById('dateFilterDays')?.value) || 0;
        let leadCountText = streamingLeads.length.toString();
        
        if (dateFilterDays > 0) {
          const filteredLeads = filterPostsByDate(streamingLeads, dateFilterDays);
          const filteredCount = filteredLeads.length;
          leadCountText = filteredCount.toString();
        }
        
        statusDiv.textContent = `Found lead ${leadCountText}: ${post.name} - ${titleCompanyData.title} at ${titleCompanyData.company}${positionText}`;
        updateMetrics();
        
        // Save to storage
        await saveLeadsToStorage(streamingLeads, statusDiv);
        
        // Update metrics again after storage
        updateMetrics();
        
        // Log with filtered count if date filter is active
        let logMessage = `[S4S] Streaming: Added lead - ${post.name} (${streamingLeads.length} total)`;
        
        if (dateFilterDays > 0) {
          const filteredLeads = filterPostsByDate(streamingLeads, dateFilterDays);
          const filteredCount = filteredLeads.length;
          logMessage = `[S4S] Streaming: Added lead - ${post.name} (${filteredCount} within ${dateFilterDays} days)`;
        }
        
        console.log(logMessage);
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
      
      // Update date filter UI to show new post count
      updateDateFilterUI();
      
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
        
        console.log(`[S4S] Streaming: Found ${newPosts.length} total posts (was ${previousCount}), Queue size: ${postQueue.length}, Analyzed: ${allAnalyzedPosts.length}, Analysis running: ${isStreamingAnalysis}, Scrolling active: ${isScrollingActive}`);
        
        // Log discrepancy explanation
        const discrepancy = newPosts.length - allAnalyzedPosts.length;
        if (discrepancy > 0) {
          console.log(`[S4S] Post count discrepancy: ${discrepancy} posts (${newPosts.length} found - ${allAnalyzedPosts.length} analyzed)`);
          console.log(`[S4S] Reasons: ${postQueue.length} in queue, ${processedPostCount - allAnalyzedPosts.length} duplicates filtered`);
        }
        
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
    
    // Update date filter UI after reset
    updateDateFilterUI();
    updatePostLimitUI(); // Update post limit UI after reset
    postLimitReached = false; // Reset post limit reached flag
    metricsUpdateInterval = null; // Reset metrics interval
    
    // Show metrics
    showMetrics(true);
    updateMetrics();
    
    // Check current AI provider and test connection if needed
    const currentProvider = await getCurrentAIProvider();
    
    if (currentProvider === 'ollama') {
      // Test Ollama connection only if using Ollama
      const connectionTest = await testOllamaConnection();
      if (!connectionTest.success) {
        throw new Error(`Ollama connection failed: ${connectionTest.error}`);
      }
      statusDiv.textContent = `Ollama connected. Starting streaming analysis...`;
    } else {
      // Using OpenAI, no connection test needed
      statusDiv.textContent = `Using ${currentProvider}. Starting streaming analysis...`;
    }
    
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
      // Show posts found vs analyzed with more context
      postsFoundSpan.textContent = `${totalPostCount} (${postQueue.length} queued)`;
      postsAnalyzedSpan.textContent = allAnalyzedPosts.length;
      
      // Check if date filter is active
      const dateFilterDays = parseInt(document.getElementById('dateFilterDays')?.value) || 0;
      let leadsCount = streamingLeads.length;
      let leadsText = leadsCount.toString();
      
      if (dateFilterDays > 0 && streamingLeads.length > 0) {
        // Filter leads by date and show only the filtered count
        const filteredLeads = filterPostsByDate(streamingLeads, dateFilterDays);
        const filteredCount = filteredLeads.length;
        leadsText = filteredCount.toString();
      }
      
      leadsFoundSpan.textContent = leadsText;
      
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
        
        console.log(`[S4S] Processing post ${allAnalyzedPosts.length + 1}/${totalPostCount}: ${post.name}`);
        
        try {
          const result = await analyzeSinglePostStreaming(post, statusDiv, resultsDiv);
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
      statusDiv.textContent = `Analyzed ${allAnalyzedPosts.length}/${totalPostCount} posts (Batch: ${batchSize})`;
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
        // Check if date filter is active
        const dateFilterDays = parseInt(document.getElementById('dateFilterDays')?.value) || 0;
        let leadsMessage = `Analysis complete! Found ${streamingLeads.length} leads!`;
        let resultsMessage = `Analysis complete! Found ${streamingLeads.length} leads.`;
        
        if (dateFilterDays > 0) {
          const filteredLeads = filterPostsByDate(streamingLeads, dateFilterDays);
          const filteredCount = filteredLeads.length;
          leadsMessage = `Analysis complete! Found ${filteredCount} leads within ${dateFilterDays} days!`;
          resultsMessage = `Analysis complete! Found ${filteredCount} leads within ${dateFilterDays} days.`;
        }
        
        statusDiv.textContent = leadsMessage + ' Click "Download Leads as CSV" to export.';
        resultsDiv.innerHTML = `<div style="background: #e3f2fd; padding: 10px; border-radius: 5px; margin: 10px 0; font-size: 12px; color: #1976d2; border-left: 4px solid #2196f3;">${resultsMessage} Use the download buttons to export results.</div>`;
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
    console.log(`[S4S] FINAL SUMMARY: Total posts found: ${totalPostCount}, Posts analyzed: ${allAnalyzedPosts.length}, Leads found: ${streamingLeads.length}`);
    console.log(`[S4S] If you set a post limit, the difference between 'posts found' and 'posts analyzed' may be due to:`);
    console.log(`[S4S] - Duplicate posts that were already analyzed`);
    console.log(`[S4S] - Posts that failed to be processed`);
    console.log(`[S4S] - Posts still in queue when limit was reached`);
  }

  // Function to parse post date and check if it's within the specified days
  function isPostWithinDateRange(post, daysAgo) {
    if (!daysAgo || daysAgo <= 0) return true; // No filter applied
    
    const postDate = post.post_date || post.postDate;
    if (!postDate) return true; // If no date, include it
    
    // Try to parse various date formats
    let parsedDate;
    
    try {
      // Handle relative dates like "2 days ago", "1 week ago", etc.
      if (typeof postDate === 'string') {
        const relativeMatch = postDate.match(/(\d+)\s+(day|week|month|year)s?\s+ago/i);
        if (relativeMatch) {
          const amount = parseInt(relativeMatch[1]);
          const unit = relativeMatch[2].toLowerCase();
          const now = new Date();
          
          switch (unit) {
            case 'day':
              parsedDate = new Date(now.getTime() - (amount * 24 * 60 * 60 * 1000));
              break;
            case 'week':
              parsedDate = new Date(now.getTime() - (amount * 7 * 24 * 60 * 60 * 1000));
              break;
            case 'month':
              parsedDate = new Date(now.getTime() - (amount * 30 * 24 * 60 * 60 * 1000));
              break;
            case 'year':
              parsedDate = new Date(now.getTime() - (amount * 365 * 24 * 60 * 60 * 1000));
              break;
          }
        } else {
          // Try to parse as absolute date
          parsedDate = new Date(postDate);
        }
      } else if (postDate instanceof Date) {
        parsedDate = postDate;
      }
      
      if (!parsedDate || isNaN(parsedDate.getTime())) {
        console.log(`[S4S] Could not parse date: ${postDate}, including post in results`);
        return true; // If we can't parse the date, include it
      }
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
      
      const isWithinRange = parsedDate >= cutoffDate;
      console.log(`[S4S] Date comparison: ${parsedDate.toISOString()} >= ${cutoffDate.toISOString()} = ${isWithinRange}`);
      
      return isWithinRange;
    } catch (error) {
      console.error(`[S4S] Error parsing date ${postDate}:`, error);
      return true; // If there's an error parsing, include the post
    }
  }

  // Function to filter posts by date range
  function filterPostsByDate(posts, daysAgo) {
    if (!daysAgo || daysAgo <= 0) return posts;
    
    const filteredPosts = posts.filter(post => isPostWithinDateRange(post, daysAgo));
    console.log(`[S4S] Date filter: ${posts.length} posts -> ${filteredPosts.length} posts (within ${daysAgo} days)`);
    return filteredPosts;
  }

  // Test function for date filtering (can be called from console)
  window.testDateFiltering = function() {
    const testPosts = [
      { name: 'Test User 1', post_date: '2 days ago' },
      { name: 'Test User 2', post_date: '5 days ago' },
      { name: 'Test User 3', post_date: '1 week ago' },
      { name: 'Test User 4', post_date: '2024-01-01' },
      { name: 'Test User 5', post_date: '' }
    ];
    
    console.log('Testing date filtering with 3 days ago filter:');
    const filtered = filterPostsByDate(testPosts, 3);
    console.log('Original posts:', testPosts.length);
    console.log('Filtered posts:', filtered.length);
    console.log('Filtered posts:', filtered);
    
    return filtered;
  };

  // Debug function to understand post processing discrepancy
  window.debugPostProcessing = function() {
    console.log('=== POST PROCESSING DEBUG ===');
    console.log('Total posts found on page:', totalPostCount);
    console.log('Posts in queue:', postQueue.length);
    console.log('Posts analyzed:', allAnalyzedPosts.length);
    console.log('Posts processed (including duplicates):', processedPostCount);
    console.log('Processed post IDs:', Array.from(processedPostIds));
    console.log('Queue contents:', postQueue.map(p => p.name));
    console.log('Analyzed posts:', allAnalyzedPosts.map(p => p.name));
    
    const discrepancy = totalPostCount - allAnalyzedPosts.length;
    console.log(`Discrepancy: ${discrepancy} posts (${totalPostCount} found - ${allAnalyzedPosts.length} analyzed)`);
    
    if (discrepancy > 0) {
      console.log('Possible reasons for discrepancy:');
      console.log('1. Posts still in queue:', postQueue.length);
      console.log('2. Duplicate posts filtered out:', processedPostCount - allAnalyzedPosts.length);
      console.log('3. Analysis failures or timeouts');
      console.log('4. Posts found faster than they can be analyzed');
    }
    
    return {
      totalFound: totalPostCount,
      inQueue: postQueue.length,
      analyzed: allAnalyzedPosts.length,
      processed: processedPostCount,
      discrepancy: discrepancy
    };
  };

  // Debug function to check for duplicate leads
  window.debugLeadDuplicates = function() {
    console.log('=== LEAD DUPLICATES DEBUG ===');
    console.log('Total leads found:', streamingLeads.length);
    
    // Check for duplicates by post URL
    const leadIds = streamingLeads.map(lead => {
      return lead.postUrl || lead.linkedinUrl || `${lead.name}-${lead.content?.substring(0, 50)}`;
    });
    
    const duplicates = leadIds.filter((id, index) => leadIds.indexOf(id) !== index);
    const uniqueIds = [...new Set(leadIds)];
    
    console.log('Unique lead IDs:', uniqueIds.length);
    console.log('Duplicate IDs found:', duplicates.length);
    
    if (duplicates.length > 0) {
      console.log('Duplicate IDs:', duplicates);
      
      // Show which leads are duplicates
      const duplicateLeads = streamingLeads.filter((lead, index) => {
        const leadId = lead.postUrl || lead.linkedinUrl || `${lead.name}-${lead.content?.substring(0, 50)}`;
        return leadIds.indexOf(leadId) !== index;
      });
      
      console.log('Duplicate leads:', duplicateLeads.map(l => ({ name: l.name, postUrl: l.postUrl })));
    }
    
    return {
      totalLeads: streamingLeads.length,
      uniqueLeads: uniqueIds.length,
      duplicates: duplicates.length,
      duplicateIds: duplicates
    };
  };

  // Function to remove duplicate leads from streamingLeads
  window.removeDuplicateLeads = function() {
    console.log('=== REMOVING DUPLICATE LEADS ===');
    const originalCount = streamingLeads.length;
    
    // Create a map to track unique leads by ID
    const uniqueLeadsMap = new Map();
    
    streamingLeads.forEach(lead => {
      const leadId = lead.postUrl || lead.linkedinUrl || `${lead.name}-${lead.content?.substring(0, 50)}`;
      
      if (!uniqueLeadsMap.has(leadId)) {
        uniqueLeadsMap.set(leadId, lead);
      } else {
        console.log(`[S4S] Removing duplicate lead: ${lead.name}`);
      }
    });
    
    // Replace streamingLeads with unique leads
    streamingLeads = Array.from(uniqueLeadsMap.values());
    
    const newCount = streamingLeads.length;
    const removedCount = originalCount - newCount;
    
    console.log(`[S4S] Removed ${removedCount} duplicate leads (${originalCount} -> ${newCount})`);
    
    // Update metrics and storage
    updateMetrics();
    saveLeadsToStorage(streamingLeads, null);
    
    return {
      originalCount,
      newCount,
      removedCount
    };
  };

  // Test function for position extraction (can be called from console)
  window.testPositionExtraction = function(content) {
    console.log('Testing position extraction for:', content);
    
    // Test with a mock post object
    const mockPost = { name: 'Test User', content: content };
    
    // Test the full extraction (this will call AI if available)
    extractPositionFromContent(mockPost).then(result => {
      console.log('Full extraction result:', result);
    }).catch(error => {
      console.error('Full extraction error:', error);
    });
    
    return 'Testing AI extraction...';
  };

  // Function to update date filter UI (global scope)
  function updateDateFilterUI() {
    const dateFilterInput = document.getElementById('dateFilterDays');
    const clearDateFilterBtn = document.getElementById('clearDateFilter');
    const statusDiv = document.getElementById('status');
    
    if (!dateFilterInput) return;
    
    const days = parseInt(dateFilterInput.value) || 0;
    if (days > 0) {
      dateFilterInput.style.borderColor = '#28a745';
      dateFilterInput.style.backgroundColor = '#f8fff9';
      if (clearDateFilterBtn) {
        clearDateFilterBtn.style.display = 'inline-block';
      }
      
      // Show preview of how many posts would be included
      if (allAnalyzedPosts && allAnalyzedPosts.length > 0) {
        const filteredCount = filterPostsByDate(allAnalyzedPosts, days).length;
        const totalCount = allAnalyzedPosts.length;
        if (statusDiv) {
          statusDiv.textContent = `Date filter: ${days} days ago. ${filteredCount}/${totalCount} posts will be included in exports.`;
        }
      } else if (statusDiv) {
        statusDiv.textContent = `Date filter set to ${days} days ago. No posts analyzed yet.`;
      }
    } else {
      dateFilterInput.style.borderColor = '#ddd';
      dateFilterInput.style.backgroundColor = 'white';
      if (clearDateFilterBtn) {
        clearDateFilterBtn.style.display = 'none';
      }
      
      // Clear status if no filter
      if (allAnalyzedPosts && allAnalyzedPosts.length > 0 && statusDiv) {
        statusDiv.textContent = `No date filter. All ${allAnalyzedPosts.length} posts will be included in exports.`;
      }
    }
    
    // Update metrics to reflect the new filter
    updateMetrics();
  }

  // Function to update post limit UI (global scope)
  function updatePostLimitUI() {
    const postLimitInput = document.getElementById('postLimit');
    const clearPostLimitBtn = document.getElementById('clearPostLimit');
    const statusDiv = document.getElementById('status');
    
    if (!postLimitInput) return;
    
    const limit = parseInt(postLimitInput.value) || 0;
    postLimit = limit; // Update the global variable
    
    if (limit > 0) {
      postLimitInput.style.borderColor = '#ff6b6b';
      postLimitInput.style.backgroundColor = '#fff5f5';
      if (clearPostLimitBtn) {
        clearPostLimitBtn.style.display = 'inline-block';
      }
      
      // Show preview of post limit
      if (statusDiv) {
        statusDiv.textContent = `Post limit set to ${limit} posts. Analysis will stop after ${limit} posts have been analyzed.`;
      }
    } else {
      postLimitInput.style.borderColor = '#ddd';
      postLimitInput.style.backgroundColor = 'white';
      if (clearPostLimitBtn) {
        clearPostLimitBtn.style.display = 'none';
      }
      
      // Clear status if no limit
      if (statusDiv) {
        statusDiv.textContent = `No post limit set. Analysis will continue until manually stopped.`;
      }
    }
    
    // Reset the post limit reached flag when limit changes
    postLimitReached = false;
  }

  // Function to export leads to CSV
  function exportLeadsToCSV(leads) {
    if (!leads || !leads.length) {
      alert('No leads to export!');
      return;
    }
    
    // Get the date filter value
    const dateFilterDays = parseInt(document.getElementById('dateFilterDays').value) || 0;
    
    // Filter leads by date if filter is applied
    let filteredLeads = leads;
    if (dateFilterDays > 0) {
      filteredLeads = filterPostsByDate(leads, dateFilterDays);
      if (filteredLeads.length === 0) {
        alert(`No leads found within the last ${dateFilterDays} days. Try adjusting the date filter or analyzing more recent posts.`);
        return;
      }
    }
    
    // Updated columns to include title, company, position, connection degree, post URL and post date
    const headerKeys = [
      'name',
      'title',
      'company',
      'position',
      'connection_degree',
      'posturl',
      'profileurl',
      'post_date',
      'post_content'
    ];
    const header = ['Name', 'Title', 'Company', 'Position Hiring For', 'Connection Degree', 'Post URL', 'Profile URL', 'Post Date', 'Post Content'];
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
    const rows = filteredLeads.map(lead => [
      escapeCSVField(lead.name || ''),
      escapeCSVField(lead.title || 'Unknown Title'),
      escapeCSVField(lead.company || 'Unknown Company'),
      escapeCSVField(lead.position || 'No hiring position found from post'),
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
    const filterSuffix = dateFilterDays > 0 ? `_last${dateFilterDays}days` : '';
    a.download = `linkedin_leads${filterSuffix}_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
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
    
    // Get the date filter value
    const dateFilterDays = parseInt(document.getElementById('dateFilterDays').value) || 0;
    
    // Filter posts by date if filter is applied
    let filteredPosts = allAnalyzedPosts;
    if (dateFilterDays > 0) {
      filteredPosts = filterPostsByDate(allAnalyzedPosts, dateFilterDays);
      if (filteredPosts.length === 0) {
        alert(`No posts found within the last ${dateFilterDays} days. Try adjusting the date filter or analyzing more recent posts.`);
        return;
      }
    }
    
    const header = [
      'Name', 
      'Headline', 
      'Is Hiring', 
      'Title', 
      'Company', 
      'Position Hiring For',
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
    const rows = filteredPosts.map(post => [
      escapeCSVField(post.name || ''),
      escapeCSVField(post.headline || ''),
      escapeCSVField(post.isHiring ? 'YES' : 'NO'),
      escapeCSVField(post.title || ''),
      escapeCSVField(post.company || ''),
      escapeCSVField(post.position || 'No hiring position found from post'),
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
    const filterSuffix = dateFilterDays > 0 ? `_last${dateFilterDays}days` : '';
    a.download = `linkedin_all_posts_analysis${filterSuffix}_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }