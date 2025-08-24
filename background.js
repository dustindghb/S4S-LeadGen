// Background script - simplified
console.log('[S4S] Background script starting...');

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[S4S] Extension installed/updated:', details.reason);
  if (details.reason === 'install') {
    console.log('[S4S] First time installation');
  } else if (details.reason === 'update') {
    console.log('[S4S] Extension updated from version', details.previousVersion);
  }
});

// Keep service worker alive with periodic ping
setInterval(() => {
  console.log('[S4S] Background script heartbeat');
}, 30000); // Every 30 seconds

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  try {
    console.log('[S4S] Extension icon clicked');
    // Extension icon clicked - open popup in detachable window
    chrome.windows.create({
      url: 'popup.html',
      type: 'normal',
      width: 450,
      height: 600,
      focused: true,
      left: 100,
      top: 100
    }).then(() => {
      console.log('[S4S] Popup window created successfully');
    }).catch(err => {
      console.error('[S4S] Failed to create popup window:', err);
    });
  } catch (error) {
    console.error('[S4S] Error in icon click handler:', error);
  }
});

// Listen for tab updates to ensure content script is injected after page refresh
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('linkedin.com')) {
    console.log('[S4S] LinkedIn page loaded, ensuring content script is injected');
    // Small delay to ensure page is fully loaded
    setTimeout(() => {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      }).then(() => {
        console.log('[S4S] Content script injected after page load');
      }).catch(err => {
        console.log('[S4S] Content script injection failed:', err);
      });
    }, 1000);
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    console.log('[S4S] Background script received message:', message);
  if (message.action === 'injectContentScript') {
    // Find the most recently active LinkedIn tab in any window
    chrome.tabs.query({ url: '*://www.linkedin.com/*' }, (tabs) => {
      if (tabs && tabs.length > 0) {
        // Pick the most recently active tab
        let targetTab = tabs[0];
        for (const tab of tabs) {
          if (!targetTab.lastAccessed || (tab.lastAccessed && tab.lastAccessed > targetTab.lastAccessed)) {
            targetTab = tab;
          }
        }
        chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          files: ['content.js']
        }).then(() => {
          sendResponse({ success: true, tabId: targetTab.id });
        }).catch(err => {
          sendResponse({ success: false, error: err.message });
        });
      } else {
        sendResponse({ success: false, error: 'No LinkedIn tab found. Please open a LinkedIn page.' });
      }
    });
    return true; // Keep the message channel open for async response
  }
  
  if (message.action === 'ollamaRequest') {
    console.log('Background script received ollamaRequest:', message);
    
    // Check if this is a generate request (which takes longer)
    const isGenerateRequest = message.endpoint === '/api/generate';
    console.log('Is generate request:', isGenerateRequest);
    
    // Proxy Ollama requests to avoid CORS issues
    fetch(`http://localhost:11435${message.endpoint}`, {
      method: message.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...message.headers
      },
      body: message.body ? JSON.stringify(message.body) : undefined
    })
    .then(response => {
      console.log('Ollama response status:', response.status);
      console.log('Ollama response headers:', response.headers);
      if (!response.ok) {
        return response.text().then(text => {
          console.log('Error response body:', text);
          throw new Error(`HTTP ${response.status}: ${response.statusText} - ${text}`);
        });
      }
      return response.json();
    })
    .then(data => {
      console.log('Ollama response data:', data);
      try {
        sendResponse({ success: true, data: data });
      } catch (e) {
        console.error('Failed to send response:', e);
      }
    })
    .catch(error => {
      console.error('Ollama request failed:', error);
      try {
        if (error.name === 'AbortError') {
          console.log('Request was aborted - this might be due to popup closing or browser timeout');
          sendResponse({ success: false, error: 'Request was cancelled. Please try again.' });
        } else {
          sendResponse({ success: false, error: error.message });
        }
      } catch (e) {
        console.error('Failed to send error response:', e);
      }
    });
    return true; // Keep the message channel open for async response
  }
  
  if (message.action === 'ping') {
    console.log('[S4S] Background script received ping');
    sendResponse({ success: true, message: 'Background script is working' });
    return false; // Synchronous response
  }
  } catch (error) {
    console.error('[S4S] Error in message listener:', error);
    sendResponse({ success: false, error: error.message });
  }
});
