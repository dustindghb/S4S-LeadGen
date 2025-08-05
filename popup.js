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
- "We're growing and need help" + specific role
- "Actively seeking" + job title
- "Hiring for" + specific position

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
- Personal announcements about moving cities or locations
- Company news articles or press releases
- Industry rankings or lists (e.g., "top fintech companies")
- General business updates without hiring intent
- Posts about company culture or values without job openings
- Personal reflections or opinions about business topics
- Posts about market trends or industry analysis
- Announcements about company achievements or milestones
- Posts about personal career changes or transitions

EXAMPLES OF WHAT TO RETURN "NO" FOR:
- "I'm moving back to SF from NYC" (personal announcement)
- "The world's top fintech companies: 2025" (industry list)
- "We're growing our team" (vague, no specific hiring)
- "Great to see our company in the news" (company update)
- "Here's what I learned about hiring" (advice/education)
- "We're expanding to new markets" (business update)

EXAMPLES OF WHAT TO RETURN "YES" FOR:
- "We're hiring Software Engineers" (specific role)
- "Looking for a Marketing Manager to join our team" (specific hiring)
- "Apply now for our open positions" (clear hiring intent)
- "We have openings for Data Scientists" (specific role)

KEY RULE: The post must contain CLEAR hiring language indicating the author/company is actively seeking candidates RIGHT NOW. If in doubt, return "NO".

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
    
    const positionPrompt = `You are an expert at analyzing LinkedIn hiring posts to extract the exact job positions being hired for.

Analyze this LinkedIn post content and extract ALL specific job positions:

POST CONTENT: ${post.content}

CRITICAL INSTRUCTIONS:
1. Use your reasoning to identify ANY job titles mentioned in the text, regardless of how they appear
2. Extract ALL job titles exactly as written (e.g., "VP of Merchandising", "Senior Software Engineer")
3. Look for job titles in any context - they might appear:
   - After hiring phrases like "looking for", "seeking", "hiring for", "actively seeking"
   - Directly in the text as standalone job titles
   - In the middle of sentences describing the role
   - In lists of multiple positions
   - In emphasized or quoted text
4. Pay attention to job titles that appear naturally in the text, even without obvious hiring language
5. If multiple positions are mentioned, list ALL of them separated by commas
6. Only return "None found in post" if no specific job title can be identified

EXAMPLES:
- "We are looking for a passionate VP of Merchandising" → "VP of Merchandising"
- "Hiring Senior Software Engineers" → "Senior Software Engineer"
- "Seeking Marketing Manager for our team" → "Marketing Manager"
- "Looking for someone to join our sales team" → "Sales Representative"
- "We're hiring for Software Engineers, Product Managers, and UX Designers" → "Software Engineers, Product Managers, UX Designers"
- "Multiple openings: Frontend Developer, Backend Developer, DevOps Engineer" → "Frontend Developer, Backend Developer, DevOps Engineer"
- "Boeing is actively seeking a Senior Manager, Small Business Subcontracting" → "Senior Manager, Small Business Subcontracting"
- "Senior Manager, Small Business Subcontracting to join our dynamic team" → "Senior Manager, Small Business Subcontracting"
- "We need a Data Scientist who can..." → "Data Scientist"
- "Join us as a Product Manager" → "Product Manager"
- "We're growing and need help" → "None found in post" (too vague)

Use your reasoning to identify job titles in any context, not just after specific trigger phrases.

Return ONLY the job titles as a string (comma-separated if multiple), or "None found in post" if no specific job title found:`;

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

IMPORTANT RULES:
1. Sometimes the headline contains just a company name (like "Acme Corporation" or "Tech Solutions Inc") which means this post is from the company's official LinkedIn account. In such cases:
   - Put the company name in the "company" field
   - Put "Company Account" in the "title" field

2. IGNORE follower counts, numbers, and metadata like "1,234 followers" or "500+ connections"

3. Focus on the actual company name or job title, not LinkedIn metrics

Return JSON only:
{"title": "job title", "company": "company name"}

Examples:
"Software Engineer at Google" -> {"title": "Software Engineer", "company": "Google"}
"Marketing Manager, Apple" -> {"title": "Marketing Manager", "company": "Apple"}
"CEO • Startup" -> {"title": "CEO", "company": "Startup"}
"Acme Corporation" -> {"title": "Company Account", "company": "Acme Corporation"}
"Tech Solutions Inc" -> {"title": "Company Account", "company": "Tech Solutions Inc"}
"Acme Corp • 1,234 followers" -> {"title": "Company Account", "company": "Acme Corp"}
"Tech Solutions • 500+ connections" -> {"title": "Company Account", "company": "Tech Solutions"}

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
  let postOrderCounter = 0; // New: track the order of posts discovered
  let analyzedPostCounter = 0; // New: track the order of ALL analyzed posts
  let buttonHealthInterval = null; // New: interval to check button health
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
  let limitCheckInterval = null; // New: interval for frequent limit checking
  let postLimit = 0; // New: limit for number of posts to analyze
  let postLimitReached = false; // New: flag to track if manual post limit has been reached
  let leadLimit = 0; // New: limit for number of leads to find
  let leadLimitReached = false; // New: flag to track if manual lead limit has been reached
  let autoRefreshEnabled = true; // New: enable auto-refresh after 50 posts
  let refreshCount = 0; // New: track number of refreshes performed
  let autoRefreshTriggered = false; // New: flag to track if auto-refresh has been triggered
  let totalPostsFoundAllTime = 0; // New: track total posts found across all sessions

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



  // Global error handler to prevent UI from becoming unresponsive
  window.addEventListener('error', function(event) {
    console.error('[S4S] Global error caught:', event.error);
    // Ensure buttons are re-enabled if there's an error
    setTimeout(() => {
      ensureButtonStates();
    }, 1000);
  });

  // Global unhandled promise rejection handler
  window.addEventListener('unhandledrejection', function(event) {
    console.error('[S4S] Unhandled promise rejection:', event.reason);
    // Ensure buttons are re-enabled if there's an error
    setTimeout(() => {
      ensureButtonStates();
    }, 1000);
  });

  document.addEventListener('DOMContentLoaded', function() {
    const controlsDiv = document.getElementById('controls');
    const downloadSection = document.getElementById('download-section');
    let statusDiv = document.getElementById('status');
    const resultsDiv = document.getElementById('results');

    // Initialize total posts found count to 0 on each extension restart
    totalPostsFoundAllTime = 0;
    console.log('[S4S] Total posts found reset to 0 for new session');
    updateMetrics(); // Update metrics to show the reset count

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

    // Initialize Settings Page
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPage = document.getElementById('settingsPage');
    const settingsBack = document.getElementById('settingsBack');
    
    // Settings page functionality
    if (settingsBtn && settingsPage && settingsBack) {
      settingsBtn.addEventListener('click', async () => {
        settingsPage.classList.add('show');
        await loadSettingsToModal();
      });
      
      settingsBack.addEventListener('click', async () => {
        await syncSettingsFromModal();
        settingsPage.classList.remove('show');
      });
    }
    
    // Initialize filter settings from storage on page load
    (async () => {
      try {
        const filterSettings = await loadFilterSettingsFromStorage();
        applyFilterSettingsToDOM(filterSettings);
        console.log('[S4S] Filter settings initialized from storage');
      } catch (error) {
        console.error('[S4S] Error initializing filter settings:', error);
      }
    })();
    
    // Load and display client lists from storage on page load
    (async () => {
      try {
        const clientLists = await loadClientListsFromStorage();
        if (clientLists.currentClients.length > 0 || clientLists.blacklistedClients.length > 0) {
          updateClientListsUI(clientLists);
          displayClientLists(clientLists);
          console.log('[S4S] Client lists loaded from storage');
        }
      } catch (error) {
        console.error('[S4S] Error loading client lists:', error);
      }
    })();
    
    // Function to load current settings into modal
    async function loadSettingsToModal() {
      // Load filter settings from storage
      const filterSettings = await loadFilterSettingsFromStorage();
      
      const modalDateFilterInput = document.getElementById('modalDateFilterDays');
      const modalPostLimitInput = document.getElementById('modalPostLimit');
      const modalLeadLimitInput = document.getElementById('modalLeadLimit');
      const modalAutoRefreshCheckbox = document.getElementById('modalAutoRefreshEnabled');
      const modalAutoRefreshPostsInput = document.getElementById('modalAutoRefreshPosts');
      
      if (modalDateFilterInput) {
        modalDateFilterInput.value = filterSettings.dateFilterDays || '';
      }
      
      if (modalPostLimitInput) {
        modalPostLimitInput.value = filterSettings.postLimit || '';
      }
      
      if (modalLeadLimitInput) {
        modalLeadLimitInput.value = filterSettings.leadLimit || '';
      }
      
      if (modalAutoRefreshCheckbox) {
        modalAutoRefreshCheckbox.checked = filterSettings.autoRefreshEnabled !== false;
      }
      
      if (modalAutoRefreshPostsInput) {
        modalAutoRefreshPostsInput.value = filterSettings.autoRefreshPosts || 15;
      }
      
      // Load AI provider settings
      const ollamaProviderRadio = document.getElementById('ollamaProvider');
      const modalOllamaProviderRadio = document.getElementById('modalOllamaProvider');
      const openaiProviderRadio = document.getElementById('openaiProvider');
      const modalOpenaiProviderRadio = document.getElementById('modalOpenaiProvider');
      
      if (ollamaProviderRadio && modalOllamaProviderRadio && openaiProviderRadio && modalOpenaiProviderRadio) {
        if (ollamaProviderRadio.checked) {
          modalOllamaProviderRadio.checked = true;
        } else {
          modalOpenaiProviderRadio.checked = true;
        }
      }
      
      // Load client lists status
      const clientLists = await loadClientListsFromStorage();
      updateClientListsUI(clientLists);
      
      // Load OpenAI config
      const openaiApiKeyInput = document.getElementById('openaiApiKey');
      const modalOpenaiApiKeyInput = document.getElementById('modalOpenaiApiKey');
      const openaiModelSelect = document.getElementById('openaiModel');
      const modalOpenaiModelSelect = document.getElementById('modalOpenaiModel');
      
      if (openaiApiKeyInput && modalOpenaiApiKeyInput) {
        modalOpenaiApiKeyInput.value = openaiApiKeyInput.value;
      }
      if (openaiModelSelect && modalOpenaiModelSelect) {
        modalOpenaiModelSelect.value = openaiModelSelect.value;
      }
      
      // Show/hide OpenAI config based on provider
      const modalOpenaiConfig = document.getElementById('modalOpenaiConfig');
      if (modalOpenaiConfig) {
        modalOpenaiConfig.style.display = modalOpenaiProviderRadio.checked ? 'block' : 'none';
      }
      

    }
    
    // Function to sync modal settings back to main form and save to storage
    async function syncSettingsFromModal() {
      // Get modal values
      const modalDateFilterInput = document.getElementById('modalDateFilterDays');
      const modalPostLimitInput = document.getElementById('modalPostLimit');
      const modalLeadLimitInput = document.getElementById('modalLeadLimit');
      const modalAutoRefreshCheckbox = document.getElementById('modalAutoRefreshEnabled');
      const modalAutoRefreshPostsInput = document.getElementById('modalAutoRefreshPosts');
      
      // Create settings object
      const filterSettings = {
        dateFilterDays: modalDateFilterInput ? modalDateFilterInput.value : '',
        postLimit: modalPostLimitInput ? modalPostLimitInput.value : '',
        leadLimit: modalLeadLimitInput ? modalLeadLimitInput.value : '',
        autoRefreshEnabled: modalAutoRefreshCheckbox ? modalAutoRefreshCheckbox.checked : true,
        autoRefreshPosts: modalAutoRefreshPostsInput ? parseInt(modalAutoRefreshPostsInput.value) || 15 : 15
      };
      
      // Save to storage
      await saveFilterSettingsToStorage(filterSettings);
      
      // Apply to main form
      applyFilterSettingsToDOM(filterSettings);
      
      // Sync AI provider settings
      const ollamaProviderRadio = document.getElementById('ollamaProvider');
      const modalOllamaProviderRadio = document.getElementById('modalOllamaProvider');
      const openaiProviderRadio = document.getElementById('openaiProvider');
      const modalOpenaiProviderRadio = document.getElementById('modalOpenaiProvider');
      
      if (ollamaProviderRadio && modalOllamaProviderRadio && openaiProviderRadio && modalOpenaiProviderRadio) {
        if (modalOllamaProviderRadio.checked) {
          ollamaProviderRadio.checked = true;
          openaiProviderRadio.checked = false;
        } else {
          openaiProviderRadio.checked = true;
          ollamaProviderRadio.checked = false;
        }
      }
      
      // Sync OpenAI config
      const openaiApiKeyInput = document.getElementById('openaiApiKey');
      const modalOpenaiApiKeyInput = document.getElementById('modalOpenaiApiKey');
      const openaiModelSelect = document.getElementById('openaiModel');
      const modalOpenaiModelSelect = document.getElementById('modalOpenaiModel');
      
      if (openaiApiKeyInput && modalOpenaiApiKeyInput) {
        openaiApiKeyInput.value = modalOpenaiApiKeyInput.value;
      }
      if (openaiModelSelect && modalOpenaiModelSelect) {
        openaiModelSelect.value = modalOpenaiModelSelect.value;
      }
      

    }

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

    // Initialize modal event listeners
    const modalOllamaProviderRadio = document.getElementById('modalOllamaProvider');
    const modalOpenaiProviderRadio = document.getElementById('modalOpenaiProvider');
    const modalOpenaiConfig = document.getElementById('modalOpenaiConfig');
    const modalSaveOpenAIConfigBtn = document.getElementById('modalSaveOpenAIConfig');
    const modalTestOpenAIBtn = document.getElementById('modalTestOpenAI');
    const modalClearDateFilterBtn = document.getElementById('modalClearDateFilter');
    const modalClearPostLimitBtn = document.getElementById('modalClearPostLimit');
    
    // Modal AI provider radio button event listeners
    if (modalOllamaProviderRadio && modalOpenaiProviderRadio && modalOpenaiConfig) {
      modalOllamaProviderRadio.addEventListener('change', () => {
        if (modalOllamaProviderRadio.checked) {
          modalOpenaiConfig.style.display = 'none';
        }
      });

      modalOpenaiProviderRadio.addEventListener('change', () => {
        if (modalOpenaiProviderRadio.checked) {
          modalOpenaiConfig.style.display = 'block';
        }
      });
    }
    
    // Modal OpenAI config save button
    if (modalSaveOpenAIConfigBtn) {
      modalSaveOpenAIConfigBtn.addEventListener('click', async () => {
        try {
          const modalOpenaiApiKeyInput = document.getElementById('modalOpenaiApiKey');
          const modalOpenaiModelSelect = document.getElementById('modalOpenaiModel');
          
          if (!modalOpenaiApiKeyInput || !modalOpenaiModelSelect) {
            console.error('[S4S] Modal OpenAI config elements not found');
            return;
          }

          const apiKey = modalOpenaiApiKeyInput.value.trim();
          const model = modalOpenaiModelSelect.value;

          if (!apiKey) {
            alert('OpenAI API key is required');
            return;
          }

          if (!apiKey.startsWith('sk-')) {
            alert('Invalid OpenAI API key format (should start with sk-)');
            return;
          }

          modalSaveOpenAIConfigBtn.disabled = true;
          modalSaveOpenAIConfigBtn.textContent = 'Saving...';

          const config = { apiKey, model };
          const success = await saveOpenAIConfigToStorage(config);
          
          if (success) {
            // Sync to main form
            const openaiApiKeyInput = document.getElementById('openaiApiKey');
            const openaiModelSelect = document.getElementById('openaiModel');
            if (openaiApiKeyInput) openaiApiKeyInput.value = apiKey;
            if (openaiModelSelect) openaiModelSelect.value = model;
            
            modalSaveOpenAIConfigBtn.textContent = 'Saved!';
            setTimeout(() => {
              modalSaveOpenAIConfigBtn.textContent = 'Save OpenAI Config';
              modalSaveOpenAIConfigBtn.disabled = false;
            }, 2000);
          } else {
            modalSaveOpenAIConfigBtn.textContent = 'Save OpenAI Config';
            modalSaveOpenAIConfigBtn.disabled = false;
            alert('Failed to save OpenAI configuration');
          }
        } catch (error) {
          console.error('[S4S] Error saving modal OpenAI configuration:', error);
          modalSaveOpenAIConfigBtn.textContent = 'Save OpenAI Config';
          modalSaveOpenAIConfigBtn.disabled = false;
          alert('Error: ' + error.message);
        }
      });
    }
    
    // Modal OpenAI test button
    if (modalTestOpenAIBtn) {
      modalTestOpenAIBtn.addEventListener('click', async () => {
        try {
          const modalOpenaiApiKeyInput = document.getElementById('modalOpenaiApiKey');
          const modalOpenaiModelSelect = document.getElementById('modalOpenaiModel');
          
          if (!modalOpenaiApiKeyInput || !modalOpenaiModelSelect) {
            console.error('[S4S] Modal OpenAI config elements not found');
            return;
          }

          const apiKey = modalOpenaiApiKeyInput.value.trim();
          const model = modalOpenaiModelSelect.value;

          if (!apiKey) {
            alert('OpenAI API key is required');
            return;
          }

          if (!apiKey.startsWith('sk-')) {
            alert('Invalid OpenAI API key format (should start with sk-)');
            return;
          }

          modalTestOpenAIBtn.disabled = true;
          modalTestOpenAIBtn.textContent = 'Testing...';
          
          // Test with a simple prompt
          const testResponse = await sendMessageToOpenAI('Respond with "OK" if you can see this message.', model);
          
          if (testResponse && testResponse.success) {
            modalTestOpenAIBtn.textContent = 'Test Passed!';
            setTimeout(() => {
              modalTestOpenAIBtn.textContent = 'Test Connection';
              modalTestOpenAIBtn.disabled = false;
            }, 2000);
          } else {
            modalTestOpenAIBtn.textContent = 'Test Failed';
            setTimeout(() => {
              modalTestOpenAIBtn.textContent = 'Test Connection';
              modalTestOpenAIBtn.disabled = false;
            }, 2000);
            alert('OpenAI connection test failed');
          }
        } catch (error) {
          console.error('[S4S] Error testing modal OpenAI connection:', error);
          modalTestOpenAIBtn.textContent = 'Test Connection';
          modalTestOpenAIBtn.disabled = false;
          alert('Error: ' + error.message);
        }
      });
    }
    

    
    // Modal clear date filter button
    if (modalClearDateFilterBtn) {
      modalClearDateFilterBtn.addEventListener('click', async () => {
        const modalDateFilterInput = document.getElementById('modalDateFilterDays');
        if (modalDateFilterInput) {
          modalDateFilterInput.value = '';
          // Save to storage and sync to main form
          const filterSettings = await loadFilterSettingsFromStorage();
          filterSettings.dateFilterDays = '';
          await saveFilterSettingsToStorage(filterSettings);
          applyFilterSettingsToDOM(filterSettings);
        }
      });
    }
    
    // Modal clear post limit button
    if (modalClearPostLimitBtn) {
      modalClearPostLimitBtn.addEventListener('click', async () => {
        const modalPostLimitInput = document.getElementById('modalPostLimit');
        if (modalPostLimitInput) {
          modalPostLimitInput.value = '';
          // Save to storage and sync to main form
          const filterSettings = await loadFilterSettingsFromStorage();
          filterSettings.postLimit = '';
          await saveFilterSettingsToStorage(filterSettings);
          applyFilterSettingsToDOM(filterSettings);
        }
      });
    }
    
    // Modal clear lead limit button
    const modalClearLeadLimitBtn = document.getElementById('modalClearLeadLimit');
    if (modalClearLeadLimitBtn) {
      modalClearLeadLimitBtn.addEventListener('click', async () => {
        const modalLeadLimitInput = document.getElementById('modalLeadLimit');
        if (modalLeadLimitInput) {
          modalLeadLimitInput.value = '';
          // Save to storage and sync to main form
          const filterSettings = await loadFilterSettingsFromStorage();
          filterSettings.leadLimit = '';
          await saveFilterSettingsToStorage(filterSettings);
          applyFilterSettingsToDOM(filterSettings);
        }
      });
    }
    
    // Add real-time save event listeners to modal inputs
    const modalDateFilterInput = document.getElementById('modalDateFilterDays');
    const modalPostLimitInput = document.getElementById('modalPostLimit');
    const modalLeadLimitInput = document.getElementById('modalLeadLimit');
    const modalAutoRefreshCheckbox = document.getElementById('modalAutoRefreshEnabled');
    const modalAutoRefreshPostsInput = document.getElementById('modalAutoRefreshPosts');
    
    if (modalDateFilterInput) {
      modalDateFilterInput.addEventListener('input', async () => {
        const filterSettings = await loadFilterSettingsFromStorage();
        filterSettings.dateFilterDays = modalDateFilterInput.value;
        await saveFilterSettingsToStorage(filterSettings);
        applyFilterSettingsToDOM(filterSettings);
      });
    }
    
    if (modalPostLimitInput) {
      modalPostLimitInput.addEventListener('input', async () => {
        const filterSettings = await loadFilterSettingsFromStorage();
        filterSettings.postLimit = modalPostLimitInput.value;
        await saveFilterSettingsToStorage(filterSettings);
        applyFilterSettingsToDOM(filterSettings);
      });
    }
    
    if (modalLeadLimitInput) {
      modalLeadLimitInput.addEventListener('input', async () => {
        const filterSettings = await loadFilterSettingsFromStorage();
        filterSettings.leadLimit = modalLeadLimitInput.value;
        await saveFilterSettingsToStorage(filterSettings);
        applyFilterSettingsToDOM(filterSettings);
      });
    }
    
    if (modalAutoRefreshCheckbox) {
      modalAutoRefreshCheckbox.addEventListener('change', async () => {
        const filterSettings = await loadFilterSettingsFromStorage();
        filterSettings.autoRefreshEnabled = modalAutoRefreshCheckbox.checked;
        await saveFilterSettingsToStorage(filterSettings);
        applyFilterSettingsToDOM(filterSettings);
      });
    }
    
    if (modalAutoRefreshPostsInput) {
      modalAutoRefreshPostsInput.addEventListener('input', async () => {
        const filterSettings = await loadFilterSettingsFromStorage();
        filterSettings.autoRefreshPosts = parseInt(modalAutoRefreshPostsInput.value) || 15;
        await saveFilterSettingsToStorage(filterSettings);
        applyFilterSettingsToDOM(filterSettings);
      });
    }

    // Client Lists Management Event Listeners
    const uploadClientListsBtn = document.getElementById('uploadClientLists');
    const clearClientListsBtn = document.getElementById('clearClientLists');

    if (uploadClientListsBtn) {
      uploadClientListsBtn.addEventListener('click', handleClientListsUpload);
    }

    if (clearClientListsBtn) {
      clearClientListsBtn.addEventListener('click', clearClientLists);
    }

    // Load and display client lists status on page load
    (async () => {
      try {
        const clientLists = await loadClientListsFromStorage();
        updateClientListsUI(clientLists);
        console.log('[S4S] Client lists initialized from storage');
      } catch (error) {
        console.error('[S4S] Error initializing client lists:', error);
      }
    })();

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
      clearDateFilterBtn.addEventListener('click', async () => {
        if (dateFilterInput) {
          dateFilterInput.value = '';
          statusDiv.textContent = 'Date filter cleared. All posts will be included in exports.';
          updateDateFilterUI();
          // Save to storage
          const filterSettings = await loadFilterSettingsFromStorage();
          filterSettings.dateFilterDays = '';
          await saveFilterSettingsToStorage(filterSettings);
        }
      });
    }

    // Add event listener for date filter input changes
    if (dateFilterInput) {
      dateFilterInput.addEventListener('input', async () => {
        updateDateFilterUI();
        // Save to storage
        const filterSettings = await loadFilterSettingsFromStorage();
        filterSettings.dateFilterDays = dateFilterInput.value;
        await saveFilterSettingsToStorage(filterSettings);
      });
    }

    // Initialize the UI
    updateDateFilterUI();

    // Initialize post limit functionality
    const postLimitInput = document.getElementById('postLimit');
    const clearPostLimitBtn = document.getElementById('clearPostLimit');
    
    if (clearPostLimitBtn) {
      clearPostLimitBtn.addEventListener('click', async () => {
        if (postLimitInput) {
          postLimitInput.value = '';
          postLimit = 0;
          postLimitReached = false;
          statusDiv.textContent = 'Post limit cleared. Analysis will continue until manually stopped.';
          updatePostLimitUI();
          // Save to storage
          const filterSettings = await loadFilterSettingsFromStorage();
          filterSettings.postLimit = '';
          await saveFilterSettingsToStorage(filterSettings);
        }
      });
    }

    // Add event listener for post limit input changes
    if (postLimitInput) {
      postLimitInput.addEventListener('input', async () => {
        updatePostLimitUI();
        // Save to storage
        const filterSettings = await loadFilterSettingsFromStorage();
        filterSettings.postLimit = postLimitInput.value;
        await saveFilterSettingsToStorage(filterSettings);
      });
    }

    // Initialize the post limit UI
    updatePostLimitUI();
    
    // Initialize lead limit functionality
    const leadLimitInput = document.getElementById('leadLimit');
    const clearLeadLimitBtn = document.getElementById('clearLeadLimit');
    
    if (clearLeadLimitBtn) {
      clearLeadLimitBtn.addEventListener('click', async () => {
        if (leadLimitInput) {
          leadLimitInput.value = '';
          leadLimit = 0;
          leadLimitReached = false;
          statusDiv.textContent = 'Lead limit cleared. Analysis will continue until manually stopped.';
          updateLeadLimitUI();
          // Save to storage
          const filterSettings = await loadFilterSettingsFromStorage();
          filterSettings.leadLimit = '';
          await saveFilterSettingsToStorage(filterSettings);
        }
      });
    }

    // Add event listener for lead limit input changes
    if (leadLimitInput) {
      leadLimitInput.addEventListener('input', async () => {
        updateLeadLimitUI();
        // Save to storage
        const filterSettings = await loadFilterSettingsFromStorage();
        filterSettings.leadLimit = leadLimitInput.value;
        await saveFilterSettingsToStorage(filterSettings);
      });
    }

    // Initialize the lead limit UI
    updateLeadLimitUI();
    
    // Set up auto-refresh checkbox
    const autoRefreshCheckbox = document.getElementById('autoRefreshEnabled');
    if (autoRefreshCheckbox) {
      autoRefreshCheckbox.checked = autoRefreshEnabled;
      autoRefreshCheckbox.addEventListener('change', async (e) => {
        autoRefreshEnabled = e.target.checked;
        console.log(`[S4S] Auto-refresh ${autoRefreshEnabled ? 'enabled' : 'disabled'}`);
        // Save to storage
        const filterSettings = await loadFilterSettingsFromStorage();
        filterSettings.autoRefreshEnabled = e.target.checked;
        await saveFilterSettingsToStorage(filterSettings);
      });
    }

    // Add auto-refresh posts count functionality
    const autoRefreshPostsInput = document.getElementById('autoRefreshPosts');
    if (autoRefreshPostsInput) {
      autoRefreshPostsInput.addEventListener('change', async (e) => {
        const value = parseInt(e.target.value);
        if (value >= 10 && value <= 200) {
          console.log(`[S4S] Auto-refresh posts count changed to: ${value}`);
          // Save to storage
          const filterSettings = await loadFilterSettingsFromStorage();
          filterSettings.autoRefreshPosts = value;
          await saveFilterSettingsToStorage(filterSettings);
        } else {
          // Reset to valid value
          e.target.value = 50;
          console.log('[S4S] Auto-refresh posts count reset to 50 (invalid value)');
          // Save to storage
          const filterSettings = await loadFilterSettingsFromStorage();
          filterSettings.autoRefreshPosts = 50;
          await saveFilterSettingsToStorage(filterSettings);
        }
      });
    }

    // Initialize collapsible filters functionality
    const filtersToggle = document.getElementById('filtersToggle');
    const filtersContent = document.getElementById('filtersContent');
    
    if (filtersToggle && filtersContent) {
      filtersToggle.addEventListener('click', () => {
        const isExpanded = filtersToggle.classList.contains('expanded');
        
        if (isExpanded) {
          // Collapse
          filtersToggle.classList.remove('expanded');
          filtersContent.classList.remove('expanded');
        } else {
          // Expand
          filtersToggle.classList.add('expanded');
          filtersContent.classList.add('expanded');
        }
      });
      
      // Start collapsed by default
      filtersToggle.classList.remove('expanded');
      filtersContent.classList.remove('expanded');
    }

    // Initialize help dialog functionality
    const infoIcons = document.querySelectorAll('.info-icon');
    const closeHelpBtn = document.getElementById('closeHelpBtn');
    const dialogOverlay = document.getElementById('dialogOverlay');
    
    // Add click listeners to all info icons
    infoIcons.forEach(icon => {
      icon.addEventListener('click', (e) => {
        e.preventDefault();
        const helpType = icon.getAttribute('data-help');
        if (helpType) {
          console.log('Info icon clicked for:', helpType);
          toggleHelp(helpType);
        }
      });
    });
    
    // Add click listener to close button
    if (closeHelpBtn) {
      closeHelpBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeHelpDialog();
      });
    }
    
    // Add click listener to overlay
    if (dialogOverlay) {
      dialogOverlay.addEventListener('click', (e) => {
        e.preventDefault();
        closeHelpDialog();
      });
    }

    // Restore Start/Stop Scrolling button functionality
    const startBtn = document.getElementById('startScroll');
    const stopAllBtn = document.getElementById('stopAll');
    if (!startBtn || !stopAllBtn) {
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
        stopAllBtn.disabled = false;
        statusDiv.textContent = 'Starting scroll with streaming analysis...';

        // Ensure content script is injected
        const injected = await ensureContentScriptInjected();
        if (!injected) {
          statusDiv.textContent = 'Error: Could not inject content script. Please refresh the LinkedIn page.';
          startBtn.disabled = false;
          stopAllBtn.disabled = true;
          return;
        }

        // Test if content script is responsive
        const isResponsive = await testContentScript(tabId);
        if (!isResponsive) {
          statusDiv.textContent = 'Error: Content script not responsive. Please refresh the LinkedIn page.';
          startBtn.disabled = false;
          stopAllBtn.disabled = true;
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
            stopAllBtn.disabled = true;
            return;
          }
        }

        statusDiv.textContent = 'Starting scroll with streaming analysis...';
        
        // Start streaming analysis before scrolling
        await startStreamingAnalysis(tabId, statusDiv, resultsDiv);
        
        // Check if limits are already reached before starting scroll
        if ((postLimit > 0 && allAnalyzedPosts.length >= postLimit) || 
            (leadLimit > 0 && streamingLeads.length >= leadLimit)) {
          console.log('[S4S] Limits already reached before starting scroll - postLimit:', postLimit, 'analyzed:', allAnalyzedPosts.length, 'leadLimit:', leadLimit, 'leads:', streamingLeads.length);
          statusDiv.textContent = 'Limits already reached. Analysis complete.';
          startBtn.disabled = false;
          stopAllBtn.disabled = true;
          return;
        }
        
        // Start scrolling with longer timeout
        await sendMessage(tabId, { action: "performSingleScroll" }, 120000); // 2 minutes
        
        // Scrolling completed, but analysis continues
        statusDiv.textContent = 'Scrolling completed. Analysis continues...';
        updateMetrics();
        
        // Analysis continues until user clicks stop
        startBtn.disabled = false;
        stopAllBtn.disabled = true;
      } catch (error) {
        statusDiv.textContent = 'Error: ' + error.message;
        startBtn.disabled = false;
        stopAllBtn.disabled = true;
      }
    });

    stopAllBtn.addEventListener('click', async () => {
      try {
        console.log('[S4S] Stop all button clicked');
        startBtn.disabled = false;
        stopAllBtn.disabled = true;
        statusDiv.textContent = 'Stopping scrolling and analysis...';

        const tab = await getMostRecentLinkedInTab();
        if (!tab) {
          statusDiv.textContent = 'No LinkedIn tab found. Please open a LinkedIn page.';
          ensureButtonStates(); // Ensure buttons are in correct state
          return;
        }
        const tabId = tab.id;
        
        // Stop scrolling
        try {
          await sendMessage(tabId, { action: "stopScroll" }, 5000);
        } catch (error) {
          console.error('[S4S] Error stopping scroll:', error);
        }
        
        // Stop the streaming analysis completely
        stopStreamingAnalysis();
        
        // Mark scrolling as stopped
        isScrollingActive = false;
        
        statusDiv.textContent = 'Scrolling and analysis stopped.';
        updateMetrics();
        ensureButtonStates(); // Ensure buttons are in correct state
      } catch (error) {
        console.error('[S4S] Error in stop all:', error);
        statusDiv.textContent = 'Error: ' + error.message;
        ensureButtonStates(); // Ensure buttons are in correct state even on error
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
      await exportLeadsToCSV(streamingLeads);
    });

    // Add button to download all analyzed posts for review
    const downloadAllPostsBtn = window.createDownloadAllPostsButton(controlsDiv, async () => {
      if (allAnalyzedPosts.length === 0) {
        statusDiv.textContent = 'Error: No analyzed posts found. Please start scrolling to analyze posts.';
        return;
      }
      
      statusDiv.textContent = `Downloading ${allAnalyzedPosts.length} analyzed posts for review...`;
      await exportAllPostsToCSV();
      statusDiv.textContent = `Downloaded ${allAnalyzedPosts.length} analyzed posts for review.`;
    });
  });

  // New: Function to analyze a single post in real-time
  async function analyzeSinglePostStreaming(post, statusDiv, resultsDiv, tabId) {
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
      
      // Increment the analyzed post counter for ALL posts
      analyzedPostCounter++;
      
      // Store the post with analysis result
      const analyzedPost = {
        ...post,
        isHiring: isHiring,
        analyzedAt: new Date().toISOString(),
        postOrder: analyzedPostCounter // Track which post number this was among ALL analyzed posts
      };
      
      // Add to all analyzed posts
      allAnalyzedPosts.push(analyzedPost);
      
      // Check if auto-refresh should be triggered (after configurable number of posts)
      // IMPORTANT: Check auto-refresh BEFORE post limit to ensure it triggers
      const autoRefreshPostsCount = parseInt(document.getElementById('autoRefreshPosts')?.value) || 15;
      const autoRefreshCheckbox = document.getElementById('autoRefreshEnabled');
      const isAutoRefreshEnabled = autoRefreshCheckbox ? autoRefreshCheckbox.checked : autoRefreshEnabled;
      
      // Debug logging for auto-refresh check
      if (allAnalyzedPosts.length % 10 === 0) { // Log every 10 posts to avoid spam
        console.log(`[S4S] Auto-refresh check - posts analyzed: ${allAnalyzedPosts.length}, threshold: ${autoRefreshPostsCount}, enabled: ${isAutoRefreshEnabled}, triggered: ${autoRefreshTriggered}, post limit: ${postLimit}`);
      }
      
      // Log when we're close to the threshold
      if (allAnalyzedPosts.length >= autoRefreshPostsCount - 5 && allAnalyzedPosts.length <= autoRefreshPostsCount + 5) {
        console.log(`[S4S] CLOSE TO AUTO-REFRESH - posts analyzed: ${allAnalyzedPosts.length}, threshold: ${autoRefreshPostsCount}, enabled: ${isAutoRefreshEnabled}, triggered: ${autoRefreshTriggered}`);
      }
      
      if (isAutoRefreshEnabled && allAnalyzedPosts.length >= autoRefreshPostsCount && !autoRefreshTriggered) {
        console.log(`[S4S] 🚀 AUTO-REFRESH TRIGGERED! Posts analyzed: ${allAnalyzedPosts.length}, threshold: ${autoRefreshPostsCount}`);
        autoRefreshTriggered = true;
        refreshCount++;
        console.log(`[S4S] Auto-refresh triggered: ${allAnalyzedPosts.length} posts analyzed (refresh #${refreshCount})`);
        console.log(`[S4S] Total posts found: ${totalPostCount}, Posts analyzed: ${allAnalyzedPosts.length}, Queue size: ${postQueue.length}`);
        console.log(`[S4S] Auto-refresh settings - enabled: ${autoRefreshEnabled}, triggered: ${autoRefreshTriggered}, refresh count: ${refreshCount}`);
        console.log(`[S4S] Auto-refresh posts count: ${autoRefreshPostsCount}, Post limit: ${postLimit}`);
        statusDiv.textContent = `Auto-refresh triggered! Analyzed ${allAnalyzedPosts.length} posts. Refreshing page to get fresh content...`;
        
        // Stop scrolling first
        try {
          const tab = await getMostRecentLinkedInTab();
          if (tab) {
            await sendMessage(tab.id, { action: "stopScroll" }, 5000);
          }
        } catch (error) {
          console.error('[S4S] Error stopping scroll:', error);
        }
        
        // Stop the streaming analysis temporarily
        stopStreamingAnalysis();
        
        // Refresh the page and restart analysis
        await refreshAndRestartAnalysis(tabId, statusDiv, resultsDiv);
        return false;
      }
      
      // Check if manual post limit has been reached (only if auto-refresh didn't trigger)
      if (postLimit > 0 && allAnalyzedPosts.length >= postLimit && !postLimitReached && !autoRefreshTriggered) {
        postLimitReached = true;
        console.log(`[S4S] Manual post limit reached: ${allAnalyzedPosts.length}/${postLimit} posts analyzed`);
        console.log(`[S4S] Total posts found: ${totalPostCount}, Posts analyzed: ${allAnalyzedPosts.length}, Queue size: ${postQueue.length}`);
        console.log(`[S4S] Attempting to stop scrolling due to post limit...`);
        statusDiv.textContent = `Post limit reached! Analyzed ${allAnalyzedPosts.length} posts. Stopping analysis and scrolling.`;
        
        // Stop scrolling first
        try {
          const tab = await getMostRecentLinkedInTab();
          if (tab) {
            console.log(`[S4S] Sending stopScroll message to tab ${tab.id}`);
            const stopResponse = await sendMessage(tab.id, { action: "stopScroll" }, 5000);
            console.log(`[S4S] Stop scroll response:`, stopResponse);
          } else {
            console.log(`[S4S] No LinkedIn tab found to stop scrolling`);
          }
        } catch (error) {
          console.error('[S4S] Error stopping scroll:', error);
        }
        
        // Stop the streaming analysis
        console.log(`[S4S] Stopping streaming analysis due to post limit`);
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
          position: titleCompanyData.position || 'None found in post'
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
        
        // Add to streaming leads with the overall post order
        const enrichedPostWithOrder = {
          ...enrichedPost,
          postOrder: analyzedPost.postOrder, // Use the overall post analysis order
          postOrderText: analyzedPost.postOrder.toString()
        };
        streamingLeads.push(enrichedPostWithOrder);
        
        // Check if lead limit has been reached
        if (leadLimit > 0 && streamingLeads.length >= leadLimit && !leadLimitReached) {
          leadLimitReached = true;
          console.log(`[S4S] Manual lead limit reached: ${streamingLeads.length}/${leadLimit} leads found`);
          console.log(`[S4S] Attempting to stop scrolling due to lead limit...`);
          statusDiv.textContent = `Lead limit reached! Found ${streamingLeads.length} leads. Stopping analysis and scrolling.`;
          
          // Stop scrolling first
          try {
            const tab = await getMostRecentLinkedInTab();
            if (tab) {
              console.log(`[S4S] Sending stopScroll message to tab ${tab.id} due to lead limit`);
              const stopResponse = await sendMessage(tab.id, { action: "stopScroll" }, 5000);
              console.log(`[S4S] Stop scroll response for lead limit:`, stopResponse);
            } else {
              console.log(`[S4S] No LinkedIn tab found to stop scrolling for lead limit`);
            }
          } catch (error) {
            console.error('[S4S] Error stopping scroll for lead limit:', error);
          }
          
          // Stop the streaming analysis
          console.log(`[S4S] Stopping streaming analysis due to lead limit`);
          stopStreamingAnalysis();
          
          // Handle completion
          handleAnalysisComplete(statusDiv, resultsDiv);
          return true;
        }
        
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
        
        // Update total posts found for current session
        // Only increment if we found more posts than before
        if (newPosts.length > previousCount) {
          const newPostsFound = newPosts.length - previousCount;
          totalPostsFoundAllTime += newPostsFound;
          console.log(`[S4S] Total posts found updated: +${newPostsFound} new posts, total this session: ${totalPostsFoundAllTime}`);
        }
        
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
        await processQueue(statusDiv, resultsDiv, tabId);
        
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
  async function startStreamingAnalysis(tabId, statusDiv, resultsDiv, preserveLeads = false) {
    isStreamingAnalysis = true;
    isScrollingActive = true;
    allPostsProcessed = false;
    
    // Only reset leads if this is a fresh start (not after refresh)
    if (!preserveLeads) {
      streamingLeads = [];
    }
    
    processedPostCount = 0;
    totalPostCount = 0;
    postOrderCounter = 0; // Reset post order counter
    analyzedPostCounter = 0; // Reset analyzed post counter
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
        updateLeadLimitUI(); // Update lead limit UI after reset
        leadLimitReached = false; // Reset lead limit reached flag
    autoRefreshTriggered = false; // Reset auto-refresh flag
    metricsUpdateInterval = null; // Reset metrics interval
    limitCheckInterval = null; // Reset limit check interval
    
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
    
    // Start frequent limit checking during scrolling
    limitCheckInterval = setInterval(() => {
      if (!isStreamingAnalysis) {
        clearInterval(limitCheckInterval);
        return;
      }
      
      // Check post limit
      if (postLimit > 0 && allAnalyzedPosts.length >= postLimit && !postLimitReached && !autoRefreshTriggered) {
        console.log(`[S4S] Frequent check: Post limit reached: ${allAnalyzedPosts.length}/${postLimit}`);
        postLimitReached = true;
        
        // Stop scrolling immediately
        getMostRecentLinkedInTab().then(tab => {
          if (tab) {
            console.log(`[S4S] Frequent check: Sending stopScroll message to tab ${tab.id}`);
            sendMessage(tab.id, { action: "stopScroll" }, 5000).then(response => {
              console.log(`[S4S] Frequent check: Stop scroll response:`, response);
            }).catch(error => {
              console.error('[S4S] Frequent check: Error stopping scroll:', error);
            });
          }
        });
        
        // Stop the streaming analysis
        stopStreamingAnalysis();
        clearInterval(limitCheckInterval);
      }
      
      // Check lead limit
      if (leadLimit > 0 && streamingLeads.length >= leadLimit && !leadLimitReached) {
        console.log(`[S4S] Frequent check: Lead limit reached: ${streamingLeads.length}/${leadLimit}`);
        leadLimitReached = true;
        
        // Stop scrolling immediately
        getMostRecentLinkedInTab().then(tab => {
          if (tab) {
            console.log(`[S4S] Frequent check: Sending stopScroll message to tab ${tab.id} for lead limit`);
            sendMessage(tab.id, { action: "stopScroll" }, 5000).then(response => {
              console.log(`[S4S] Frequent check: Stop scroll response for lead limit:`, response);
            }).catch(error => {
              console.error('[S4S] Frequent check: Error stopping scroll for lead limit:', error);
            });
          }
        });
        
        // Stop the streaming analysis
        stopStreamingAnalysis();
        clearInterval(limitCheckInterval);
      }
    }, 1000); // Check limits every 1 second
    
    // Start button health monitoring
    startButtonHealthMonitoring();
    
    return streamingAnalysisInterval;
  }

  // New: Function to update metrics display
  function updateMetrics() {
    const metricsDiv = document.getElementById('metrics');
    const postsFoundSpan = document.getElementById('postsFound');
    const postsAnalyzedSpan = document.getElementById('postsAnalyzed');
    const totalPostsFoundSpan = document.getElementById('totalPostsFound');
    const leadsFoundSpan = document.getElementById('leadsFound');
    const analysisStatusSpan = document.getElementById('analysisStatus');
    
    if (metricsDiv && postsFoundSpan && postsAnalyzedSpan && totalPostsFoundSpan && leadsFoundSpan && analysisStatusSpan) {
      // Show posts found vs analyzed with more context
      postsFoundSpan.textContent = `${totalPostCount} (${postQueue.length} queued)`;
      postsAnalyzedSpan.textContent = allAnalyzedPosts.length;
      totalPostsFoundSpan.textContent = totalPostsFoundAllTime;
      
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
          const refreshText = refreshCount > 0 ? ` (R:${refreshCount})` : '';
          let statusText = `Scrolling & Analyzing (Q:${postQueue.length}, B:${optimalBatchSize})${refreshText}`;
          
          // Add auto-refresh indicator
          if (autoRefreshEnabled && !autoRefreshTriggered && allAnalyzedPosts.length > 0) {
            const autoRefreshPostsCount = parseInt(document.getElementById('autoRefreshPosts')?.value) || 15;
            const postsUntilRefresh = autoRefreshPostsCount - allAnalyzedPosts.length;
            if (postsUntilRefresh > 0) {
              statusText += ` (${postsUntilRefresh} until refresh)`;
            } else if (postsUntilRefresh <= 0) {
              statusText += ` (refresh pending)`;
            }
          }
          
          analysisStatusSpan.textContent = statusText;
          analysisStatusSpan.style.color = '#007bff';
        } else {
          const refreshText = refreshCount > 0 ? ` (R:${refreshCount})` : '';
          analysisStatusSpan.textContent = `Analyzing Remaining (Q:${postQueue.length}, B:${optimalBatchSize})${refreshText}`;
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
    if (limitCheckInterval) {
      clearInterval(limitCheckInterval);
      limitCheckInterval = null;
    }
    if (buttonHealthInterval) {
      clearInterval(buttonHealthInterval);
      buttonHealthInterval = null;
    }
    console.log('[S4S] Streaming analysis stopped by user');
    updateMetrics();
    ensureButtonStates(); // Ensure buttons are in correct state
  }

  // New: Function to refresh page and restart analysis
  async function refreshAndRestartAnalysis(tabId, statusDiv, resultsDiv) {
    try {
      console.log('[S4S] Starting page refresh and analysis restart...');
      
      // Save current leads to storage before refresh
      if (streamingLeads.length > 0) {
        await saveLeadsToStorage(streamingLeads, statusDiv);
        console.log(`[S4S] Saved ${streamingLeads.length} leads to storage before refresh`);
      }
      
      // Refresh the page
      statusDiv.textContent = 'Refreshing LinkedIn page...';
      await chrome.tabs.reload(tabId);
      
      // Wait for page to load (increased wait time for better reliability)
      statusDiv.textContent = 'Waiting for page to load after refresh...';
      await new Promise(resolve => setTimeout(resolve, 5000)); // Increased from 3s to 5s
      
      // Wait for content script to be ready with more robust retry logic
      let retries = 0;
      const maxRetries = 20; // Increased from 15 to 20
      while (retries < maxRetries) {
        try {
          const response = await sendMessage(tabId, { action: "ping" }, 3000); // Increased timeout
          if (response && response.success) {
            console.log('[S4S] Content script ready after refresh');
            break;
          }
        } catch (error) {
          console.log(`[S4S] Content script not ready yet, retry ${retries + 1}/${maxRetries}`);
          
          // Try to inject content script manually if it's not responding
          if (retries > 5) {
            console.log('[S4S] Attempting manual content script injection...');
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
              });
              console.log('[S4S] Manual content script injection completed');
              // Wait a bit more after injection
              await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (injectionError) {
              console.log('[S4S] Manual injection failed:', injectionError);
            }
          }
        }
        await new Promise(resolve => setTimeout(resolve, 1500)); // Increased wait time
        retries++;
      }
      
      if (retries >= maxRetries) {
        console.error('[S4S] Content script failed to load after refresh');
        statusDiv.textContent = 'Error: Page failed to load properly after refresh. Please try again.';
        return;
      }
      
      // Reset analysis state for fresh start (but preserve leads)
      postLimitReached = false;
      leadLimitReached = false;
      autoRefreshTriggered = false; // Reset auto-refresh flag so it can trigger again
      analyzedPostCounter = 0;
      processedPostCount = 0;
      totalPostCount = 0;
      processedPostIds.clear();
      analysisIterationCount = 0;
      postQueue = [];
      isProcessingQueue = false;
      optimalBatchSize = 3;
      lastProcessingTime = 0;
      allAnalyzedPosts = [];
      
      // Restore leads from storage to maintain continuity
      try {
        const restoredLeads = await loadLeadsFromStorage(statusDiv);
        if (restoredLeads && restoredLeads.length > 0) {
          streamingLeads = restoredLeads;
          console.log(`[S4S] Restored ${streamingLeads.length} leads from storage after refresh`);
          statusDiv.textContent = `Restored ${streamingLeads.length} leads from previous analysis. Restarting analysis...`;
        } else {
          console.log('[S4S] No leads found in storage to restore');
        }
      } catch (error) {
        console.error('[S4S] Error restoring leads from storage:', error);
      }
      
      // Restart streaming analysis
      statusDiv.textContent = `Restarting analysis after refresh #${refreshCount}...`;
      console.log('[S4S] Restarting streaming analysis after refresh');
      
      // Start fresh analysis (but preserve leads from previous refresh)
      await startStreamingAnalysis(tabId, statusDiv, resultsDiv, true);
      
      // Wait a bit longer before restarting scrolling to ensure analysis is fully ready
      setTimeout(async () => {
        try {
          statusDiv.textContent = `Restarting scrolling after refresh #${refreshCount}...`;
          console.log('[S4S] Restarting scrolling after refresh');
          
          // Start scrolling again
          await sendMessage(tabId, { action: "performSingleScroll" }, 120000); // 2 minutes
          
          statusDiv.textContent = `Scrolling restarted after refresh #${refreshCount}. Analysis continues...`;
          console.log('[S4S] Scrolling successfully restarted after refresh');
        } catch (error) {
          console.error('[S4S] Error restarting scrolling after refresh:', error);
          statusDiv.textContent = 'Error restarting scrolling after refresh. Analysis continues without scrolling.';
        }
      }, 3000); // Increased from 2s to 3s
      
      statusDiv.textContent = `Analysis restarted after refresh #${refreshCount}. Preparing to restart scrolling...`;
      console.log('[S4S] Analysis successfully restarted after refresh');
      
    } catch (error) {
      console.error('[S4S] Error during refresh and restart:', error);
      statusDiv.textContent = 'Error during page refresh. Please try again.';
      ensureButtonStates();
    }
  }

  // Help Dialog Functions
  function showHelpDialog(title, content) {
    console.log('showHelpDialog called with:', title);
    const titleElement = document.getElementById('helpDialogTitle');
    const contentElement = document.getElementById('helpDialogContent');
    const dialogElement = document.getElementById('helpDialog');
    const overlayElement = document.getElementById('dialogOverlay');
    
    if (titleElement && contentElement && dialogElement && overlayElement) {
      titleElement.textContent = title;
      contentElement.innerHTML = content;
      dialogElement.style.display = 'block';
      overlayElement.style.display = 'block';
      console.log('Dialog should now be visible');
    } else {
      console.error('Dialog elements not found:', {
        titleElement: !!titleElement,
        contentElement: !!contentElement,
        dialogElement: !!dialogElement,
        overlayElement: !!overlayElement
      });
    }
  }
  
  function closeHelpDialog() {
    console.log('closeHelpDialog called');
    const dialogElement = document.getElementById('helpDialog');
    const overlayElement = document.getElementById('dialogOverlay');
    
    if (dialogElement && overlayElement) {
      dialogElement.style.display = 'none';
      overlayElement.style.display = 'none';
    }
  }
  
  function toggleHelp(helpType) {
    console.log('toggleHelp called with:', helpType);
    
    const helpData = {
      'dateFilter': {
        title: 'Date Filter',
        content: '<p>Leave empty to include all posts. Enter a number to only include posts from the last N days.</p><p>This is useful for focusing on recent hiring activity and avoiding outdated posts.</p>'
      },
      'stopAnalysis': {
        title: 'Stop Analysis Limits',
        content: '<p><strong>Post Limit:</strong> Leave empty to analyze all posts. Enter a number to stop analysis after N posts have been analyzed.</p><p><strong>Lead Limit:</strong> Leave empty for no limit. Enter a number to stop analysis after N leads have been found.</p><p>These limits help you control the analysis scope and find your target number of leads efficiently.</p>'
      },
      'autoRefresh': {
        title: 'Auto-Refresh Settings',
        content: '<p>Automatically refresh the page after analyzing the specified number of posts to get fresh content.</p><p>LinkedIn\'s algorithm shows the most relevant posts at the top of your feed, so refreshing ensures you\'re always analyzing the highest-quality, most recent content.</p><p>This dramatically improves efficiency by allowing you to find more leads while analyzing fewer total posts.</p>'
      },
      'clientLists': {
        title: 'Client Lists Management',
        content: '<p>Upload a CSV or Excel file structured with Column A for Current/Past Clients and Column C for Excluded Clients.</p><p>The tool will use this to customize messages and mark blocked companies during lead generation.</p><p>This helps you avoid contacting companies you\'ve already worked with or want to avoid.</p>'
      }
    };
    
    if (helpData[helpType]) {
      console.log('Found help data for:', helpType);
      showHelpDialog(helpData[helpType].title, helpData[helpType].content);
    } else {
      console.error('No help data found for:', helpType);
    }
  }

  // New: Function to ensure button states are correct
  function ensureButtonStates() {
    const startBtn = document.getElementById('startScroll');
    const stopAllBtn = document.getElementById('stopAll');
    
    if (!startBtn || !stopAllBtn) {
      console.error('[S4S] Button elements not found during state check');
      return;
    }
    
    // Ensure buttons are enabled/disabled based on current state
    if (isStreamingAnalysis) {
      // Analysis is running
      startBtn.disabled = true;
      stopAllBtn.disabled = false;
    } else {
      // Analysis is stopped
      startBtn.disabled = false;
      stopAllBtn.disabled = true;
    }
    
    // Force re-enable if buttons seem stuck
    if (startBtn.disabled && !isStreamingAnalysis) {
      console.log('[S4S] Re-enabling start button');
      startBtn.disabled = false;
    }
    if (stopAllBtn.disabled && isStreamingAnalysis) {
      console.log('[S4S] Re-enabling stop all button');
      stopAllBtn.disabled = false;
    }
  }

  // New: Function to start button health monitoring
  function startButtonHealthMonitoring() {
    if (buttonHealthInterval) {
      clearInterval(buttonHealthInterval);
    }
    
    buttonHealthInterval = setInterval(() => {
      ensureButtonStates();
    }, 2000); // Check every 2 seconds
    
    console.log('[S4S] Started button health monitoring');
  }

  // New: Function to stop button health monitoring
  function stopButtonHealthMonitoring() {
    if (buttonHealthInterval) {
      clearInterval(buttonHealthInterval);
      buttonHealthInterval = null;
    }
    console.log('[S4S] Stopped button health monitoring');
  }

  // New: Function to generate personalized connection messages
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
  async function processQueue(statusDiv, resultsDiv, tabId) {
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
          const result = await analyzeSinglePostStreaming(post, statusDiv, resultsDiv, tabId);
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

  // Function to update lead limit UI (global scope)
  function updateLeadLimitUI() {
    const leadLimitInput = document.getElementById('leadLimit');
    const clearLeadLimitBtn = document.getElementById('clearLeadLimit');
    const statusDiv = document.getElementById('status');
    
    if (!leadLimitInput) return;
    
    const limit = parseInt(leadLimitInput.value) || 0;
    leadLimit = limit; // Update the global variable
    
    if (limit > 0) {
      leadLimitInput.style.borderColor = '#ff6b6b';
      leadLimitInput.style.backgroundColor = '#fff5f5';
      if (clearLeadLimitBtn) {
        clearLeadLimitBtn.style.display = 'inline-block';
      }
      
      // Show preview of lead limit
      if (statusDiv) {
        statusDiv.textContent = `Lead limit set to ${limit} leads. Analysis will stop after ${limit} leads have been found.`;
      }
    } else {
      leadLimitInput.style.borderColor = '#ddd';
      leadLimitInput.style.backgroundColor = 'white';
      if (clearLeadLimitBtn) {
        clearLeadLimitBtn.style.display = 'none';
      }
      
      // Clear status if no limit
      if (statusDiv) {
        statusDiv.textContent = `No lead limit set. Analysis will continue until manually stopped.`;
      }
    }
    
    // Reset the lead limit reached flag when limit changes
    leadLimitReached = false;
  }

  // Function to export leads to CSV
  async function exportLeadsToCSV(leads) {
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
    const header = ['Name', 'Title', 'Company', 'Position Hiring For', 'Connection Degree', 'Connection Note', 'Blocked Status', 'Post URL', 'Profile URL', 'Post Date', 'Post Content'];
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
    
    // Process leads asynchronously
    const rows = [];
    for (const lead of filteredLeads) {
      const connectionMessage = await generateConnectionMessage(lead.name, lead.connection_degree || lead.connectionDegree, lead.title, lead.company);
              const isExcluded = await isExcludedClient(lead.company);
        const blockedStatus = isExcluded ? 'BLOCKED' : '';
      
      rows.push([
        escapeCSVField(lead.name || ''),
        escapeCSVField(lead.title || 'Unknown Title'),
        escapeCSVField(lead.company || 'Unknown Company'),
        escapeCSVField(lead.position || 'None found in post'),
        escapeCSVField(lead.connection_degree || lead.connectionDegree || '3rd'),
        escapeCSVField(connectionMessage),
        escapeCSVField(blockedStatus),
        escapeCSVField(lead.posturl || lead.postUrl || ''),
        escapeCSVField(lead.profileurl || lead.linkedin_profile_url || lead.linkedinUrl || ''),
        escapeCSVField(lead.post_date || lead.postDate || ''),
        escapeCSVField(lead.post_content || lead.content || '')
      ]);
    }
    
    // Add summary row with total posts found metric
    const summaryRow = [
      'SUMMARY', // Name
      '', // Title
      '', // Company
      '', // Position
      '', // Connection Degree
      '', // Connection Note
      '', // Blocked Status
      '', // Post URL
      '', // Profile URL
      '', // Post Date
      `Found ${filteredLeads.length} leads among ${totalPostsFoundAllTime} total posts discovered in this session` // Post Content
    ];
    
    const csvContent = [header, ...rows, summaryRow].map(e => e.join(',')).join('\n');
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
  async function exportAllPostsToCSV() {
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
      'Connection Note', 
      'Blocked Status',
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
    
    // Process posts asynchronously
    const rows = [];
    for (const post of filteredPosts) {
      const connectionMessage = await generateConnectionMessage(post.name, post.connection_degree || post.connectionDegree, post.title, post.company);
              const isExcluded = await isExcludedClient(post.company);
        const blockedStatus = isExcluded ? 'BLOCKED' : '';
      
      rows.push([
        escapeCSVField(post.name || ''),
        escapeCSVField(post.headline || ''),
        escapeCSVField(post.isHiring ? 'YES' : 'NO'),
        escapeCSVField(post.title || ''),
        escapeCSVField(post.company || ''),
        escapeCSVField(post.position || 'None found in post'),
        escapeCSVField(post.connection_degree || post.connectionDegree || '3rd'),
        escapeCSVField(connectionMessage),
        escapeCSVField(blockedStatus),
        escapeCSVField(post.posturl || post.postUrl || ''),
        escapeCSVField(post.profileurl || post.linkedin_profile_url || post.linkedinUrl || ''),
        escapeCSVField(post.post_date || post.postDate || ''),
        escapeCSVField(post.post_content || post.content || ''),
        escapeCSVField(post.analysisError || ''),
        escapeCSVField(post.analyzedAt || '')
      ]);
    }
    
    // Add summary row with total posts found metric
    const summaryRow = [
      'SUMMARY', // Name
      '', // Headline
      '', // Is Hiring
      '', // Title
      '', // Company
      '', // Position
      '', // Connection Degree
      '', // Connection Note
      '', // Blocked Status
      '', // Post URL
      '', // Profile URL
      '', // Post Date
      `Analyzed ${filteredPosts.length} posts among ${totalPostsFoundAllTime} total posts discovered in this session`, // Post Content
      '', // Analysis Error
      '' // Analyzed At
    ];
    
    const csvContent = [header, ...rows, summaryRow].map(e => e.join(',')).join('\n');
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

  // Function to save filter settings to storage
  async function saveFilterSettingsToStorage(settings) {
    try {
      await chrome.storage.local.set({ filterSettings: settings });
      console.log('[S4S] Filter settings saved to storage:', settings);
      return true;
    } catch (error) {
      console.error('[S4S] Error saving filter settings to storage:', error);
      return false;
    }
  }

  // Function to load filter settings from storage
  async function loadFilterSettingsFromStorage() {
    try {
      const result = await chrome.storage.local.get(['filterSettings']);
      const settings = result.filterSettings || {
        dateFilterDays: '',
        postLimit: '',
        leadLimit: '',
        autoRefreshEnabled: true,
        autoRefreshPosts: 15
      };
      console.log('[S4S] Filter settings loaded from storage:', settings);
      return settings;
    } catch (error) {
      console.error('[S4S] Error loading filter settings from storage:', error);
      return {
        dateFilterDays: '',
        postLimit: '',
        leadLimit: '',
        autoRefreshEnabled: true,
        autoRefreshPosts: 15
      };
    }
  }

  // Function to apply filter settings to DOM elements
  function applyFilterSettingsToDOM(settings) {
    const dateFilterInput = document.getElementById('dateFilterDays');
    const modalDateFilterInput = document.getElementById('modalDateFilterDays');
    const postLimitInput = document.getElementById('postLimit');
    const modalPostLimitInput = document.getElementById('modalPostLimit');
    const leadLimitInput = document.getElementById('leadLimit');
    const modalLeadLimitInput = document.getElementById('modalLeadLimit');
    const autoRefreshCheckbox = document.getElementById('autoRefreshEnabled');
    const modalAutoRefreshCheckbox = document.getElementById('modalAutoRefreshEnabled');
    const autoRefreshPostsInput = document.getElementById('autoRefreshPosts');
    const modalAutoRefreshPostsInput = document.getElementById('modalAutoRefreshPosts');

    if (dateFilterInput) dateFilterInput.value = settings.dateFilterDays || '';
    if (modalDateFilterInput) modalDateFilterInput.value = settings.dateFilterDays || '';
    if (postLimitInput) postLimitInput.value = settings.postLimit || '';
    if (modalPostLimitInput) modalPostLimitInput.value = settings.postLimit || '';
    if (leadLimitInput) leadLimitInput.value = settings.leadLimit || '';
    if (modalLeadLimitInput) modalLeadLimitInput.value = settings.leadLimit || '';
    if (autoRefreshCheckbox) autoRefreshCheckbox.checked = settings.autoRefreshEnabled !== false;
    if (modalAutoRefreshCheckbox) modalAutoRefreshCheckbox.checked = settings.autoRefreshEnabled !== false;
    if (autoRefreshPostsInput) autoRefreshPostsInput.value = settings.autoRefreshPosts || 15;
    if (modalAutoRefreshPostsInput) modalAutoRefreshPostsInput.value = settings.autoRefreshPosts || 15;

    // Update UI
    updateDateFilterUI();
    updatePostLimitUI();
    updateLeadLimitUI();
    autoRefreshEnabled = settings.autoRefreshEnabled !== false;
  }

  // Client Lists Management Functions
  async function saveClientListsToStorage(clientLists) {
    try {
      await chrome.storage.local.set({ clientLists: clientLists });
      console.log('[S4S] Client lists saved to storage:', clientLists);
      return true;
    } catch (error) {
      console.error('[S4S] Error saving client lists to storage:', error);
      return false;
    }
  }

  async function loadClientListsFromStorage() {
    try {
      const result = await chrome.storage.local.get(['clientLists']);
          const clientLists = result.clientLists || {
      currentClients: [],
      excludedClients: []
    };
      console.log('[S4S] Client lists loaded from storage:', clientLists);
      return clientLists;
    } catch (error) {
      console.error('[S4S] Error loading client lists from storage:', error);
      return {
        currentClients: [],
        excludedClients: []
      };
    }
  }

  function updateClientListsUI(clientLists) {
    // Now just call displayClientLists since we've moved the clear button there
    displayClientLists(clientLists);
  }

  function displayClientLists(clientLists) {
    const displayDiv = document.getElementById('clientListsDisplay');
    const currentClientsList = document.getElementById('currentClientsList');
    const excludedClientsList = document.getElementById('excludedClientsList');
    const currentClientsCount = document.getElementById('currentClientsCount');
    const excludedClientsCount = document.getElementById('excludedClientsCount');
    
    if (!displayDiv || !currentClientsList || !excludedClientsList) {
      console.error('[S4S] Client lists display elements not found');
      return;
    }
    
    // Show/hide the display section based on whether there are any clients
    if (clientLists.currentClients.length > 0 || clientLists.excludedClients.length > 0) {
      displayDiv.style.display = 'block';
    } else {
      displayDiv.style.display = 'none';
      return;
    }
    
    // Update counts
    if (currentClientsCount) {
      currentClientsCount.textContent = clientLists.currentClients.length;
    }
    if (excludedClientsCount) {
      excludedClientsCount.textContent = clientLists.excludedClients.length;
    }
    
    // Display current/past clients
    if (clientLists.currentClients.length > 0) {
      const currentClientsHtml = clientLists.currentClients
        .map(client => `<div style="padding: 2px 0;">- ${client}</div>`)
        .join('');
      currentClientsList.innerHTML = currentClientsHtml;
    } else {
      currentClientsList.innerHTML = '<em>No current/past clients found</em>';
    }
    
    // Display excluded clients
    if (clientLists.excludedClients.length > 0) {
      const excludedClientsHtml = clientLists.excludedClients
        .map(client => `<div style="padding: 2px 0;">- ${client}</div>`)
        .join('');
      excludedClientsList.innerHTML = excludedClientsHtml;
    } else {
      excludedClientsList.innerHTML = '<em>No excluded clients found</em>';
    }
    
    console.log('[S4S] Client lists displayed:', {
      currentClients: clientLists.currentClients.length,
      excludedClients: clientLists.excludedClients.length
    });
  }

  // Function to parse CSV line properly, handling quotes and escaping
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i += 2;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = '';
        i++;
      } else {
        // Regular character
        current += char;
        i++;
      }
    }
    
    // Add the last field
    result.push(current.trim());
    
    return result;
  }

  async function parseCSVFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = function(e) {
        try {
          const csv = e.target.result;
          const lines = csv.split('\n');
          const currentClients = [];
          const excludedClients = [];
          
          // Always skip the first row (header row)
          const startRow = 1;
          
          for (let i = startRow; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
              // Better CSV parsing that handles quotes properly
              const columns = parseCSVLine(line);
              
              // Process each row regardless of column count, but ensure we have at least 1 column
              if (columns.length >= 1) {
                const currentClient = (columns[0] || '').trim();
                const excludedClient = columns.length >= 3 ? (columns[2] || '').trim() : '';
                
                // Add current client if it exists
                if (currentClient && currentClient !== '') {
                  currentClients.push(currentClient);
                }
                
                // Add excluded client if it exists
                if (excludedClient && excludedClient !== '') {
                  excludedClients.push(excludedClient);
                }
              }
            }
          }
          
          console.log('[S4S] Parsed clients - Current:', currentClients.length, 'Excluded:', excludedClients.length);
          
          resolve({
            currentClients: currentClients,
            excludedClients: excludedClients
          });
        } catch (error) {
          reject(new Error('Failed to parse CSV file: ' + error.message));
        }
      };
      
      reader.onerror = function() {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsText(file, 'UTF-8');
    });
  }

  async function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
      console.log('[S4S] Starting Excel file parsing...');
      console.log('[S4S] XLSX library available:', typeof XLSX !== 'undefined');
      console.log('[S4S] XLSX object:', XLSX);
      
      // Check if XLSX library is available
      if (typeof XLSX === 'undefined') {
        console.error('[S4S] XLSX library not loaded');
        reject(new Error('XLSX library not loaded. Please refresh the page and try again.'));
        return;
      }
      
      const reader = new FileReader();
      
      reader.onload = function(e) {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          
          // Get the first worksheet
          if (workbook.SheetNames.length === 0) {
            reject(new Error('No worksheets found in the Excel file'));
            return;
          }
          
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          if (!worksheet) {
            reject(new Error('Could not read the first worksheet'));
            return;
          }
          
          // Convert to JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          console.log('[S4S] Excel file parsed, rows found:', jsonData.length);
          console.log('[S4S] First few rows:', jsonData.slice(0, 3));
          
          const currentClients = [];
          const excludedClients = [];
          
          // Always skip the first row (header row)
          const startRow = 1;
          
          for (let i = startRow; i < jsonData.length; i++) {
            const row = jsonData[i];
            
            // Process each row regardless of column count, but ensure we have at least 1 column
            if (row && row.length >= 1) {
              const currentClient = row[0] ? row[0].toString().trim() : '';
              const excludedClient = row.length >= 3 ? (row[2] ? row[2].toString().trim() : '') : '';
              
              // Add current client if it exists
              if (currentClient && currentClient !== '') {
                currentClients.push(currentClient);
              }
              
              // Add excluded client if it exists
              if (excludedClient && excludedClient !== '') {
                excludedClients.push(excludedClient);
              }
            }
          }
          
          resolve({
            currentClients: currentClients,
            excludedClients: excludedClients
          });
        } catch (error) {
          reject(new Error('Failed to parse Excel file: ' + error.message));
        }
      };
      
      reader.onerror = function() {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsArrayBuffer(file);
    });
  }

  async function handleClientListsUpload() {
    const fileInput = document.getElementById('clientListsFile');
    const file = fileInput.files[0];
    
    if (!file) {
      alert('Please select a file to upload.');
      return;
    }
    
    try {
      let clientLists;
      
      if (file.name.toLowerCase().endsWith('.csv')) {
        clientLists = await parseCSVFile(file);
      } else if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        try {
          clientLists = await parseExcelFile(file);
        } catch (error) {
          console.error('[S4S] Excel parsing error:', error);
          if (error.message.includes('XLSX library not loaded')) {
            alert('Excel library failed to load. Please try converting your Excel file to CSV format and upload it as a CSV file instead.\n\nTo convert Excel to CSV:\n1. Open the Excel file\n2. Go to File > Save As\n3. Choose CSV format\n4. Save and upload the CSV file');
          } else {
            alert('Error parsing Excel file: ' + error.message + '\n\nPlease ensure the file has the correct format with three columns: Column A for Current/Past Clients and Column C for Excluded Clients.');
          }
          return;
        }
      } else {
        alert('Please select a CSV or Excel file (.csv, .xlsx, .xls).');
        return;
      }
      
      await saveClientListsToStorage(clientLists);
      updateClientListsUI(clientLists);
      displayClientLists(clientLists);
      
      alert(`Successfully uploaded client lists!\nCurrent/Past Clients: ${clientLists.currentClients.length}\nExcluded Clients: ${clientLists.excludedClients.length}`);
      
      // Clear the file input
      fileInput.value = '';
      
    } catch (error) {
      console.error('[S4S] Error uploading client lists:', error);
      alert('Error uploading file: ' + error.message);
    }
  }

  async function clearClientLists() {
    try {
      await saveClientListsToStorage({ currentClients: [], excludedClients: [] });
      updateClientListsUI({ currentClients: [], excludedClients: [] });
      
      // Hide the display section
      const displayDiv = document.getElementById('clientListsDisplay');
      if (displayDiv) {
        displayDiv.style.display = 'none';
      }
      
      alert('Client lists cleared successfully.');
    } catch (error) {
      console.error('[S4S] Error clearing client lists:', error);
      alert('Error clearing client lists: ' + error.message);
    }
  }

  // Function to check if a company is in the current/past clients list
  async function isCurrentClient(companyName) {
    try {
      const clientLists = await loadClientListsFromStorage();
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

  // Function to check if a company is in the excluded clients list
  async function isExcludedClient(companyName) {
    try {
      const clientLists = await loadClientListsFromStorage();
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