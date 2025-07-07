// Background script - simplified
chrome.action.onClicked.addListener((tab) => {
  // Extension icon clicked
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background script received message:', message);
  if (message.action === 'injectContentScript') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url && tabs[0].url.includes('linkedin.com')) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ['content.js']
        }).then(() => {
          sendResponse({ success: true });
        }).catch(err => {
          sendResponse({ success: false, error: err.message });
        });
      } else {
        sendResponse({ success: false, error: 'Not on LinkedIn page' });
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
    console.log('Background script received ping');
    sendResponse({ success: true, message: 'Background script is working' });
    return false; // Synchronous response
  }
});
