console.log('[S4S] Content script loaded');

// Prevent multiple instances
if (window.s4sContentScriptLoaded) {
  console.log('[S4S] Content script already loaded, skipping');
} else {
  window.s4sContentScriptLoaded = true;

  function extractPosts() {
    const posts = [];
    
    // More specific selectors for LinkedIn posts to avoid navigation elements
    const postSelectors = [
      'div.feed-shared-update-v2[data-urn*="activity"]',
      'article.feed-shared-update-v2[data-urn*="activity"]',
      'div[data-urn*="activity"]:not([data-urn*="navigation"])',
      'article[data-urn*="activity"]:not([data-urn*="navigation"])'
    ];
    
    let foundPosts = [];
    for (const selector of postSelectors) {
      foundPosts = document.querySelectorAll(selector);
      if (foundPosts.length > 0) {
        break;
      }
    }
    
    foundPosts.forEach((post, index) => {
      // More specific name selectors
      const nameSelectors = [
        'span.feed-shared-actor__name',
        'a[data-control-name="actor_profile"] span',
        'span[aria-hidden="true"]:not([class*="navigation"])'
      ];
      
      let name = '';
      for (const selector of nameSelectors) {
        const nameElem = post.querySelector(selector);
        if (nameElem && nameElem.innerText.trim() && nameElem.innerText.trim().length > 0) {
          name = nameElem.innerText.trim();
          break;
        }
      }
      
      // Extract professional information - focused on headline
      let headline = '';
      let linkedinUrl = '';
      let age = '';
      
      // Extract LinkedIn URL first
      const profileLink = post.querySelector('a[data-control-name="actor_profile"], a[href*="/in/"]');
      if (profileLink) {
        linkedinUrl = profileLink.href;
      }
      
      // Extract age (time posted)
      const timeSelectors = [
        'time',
        'span[class*="time"]',
        'span[class*="ago"]',
        '.feed-shared-actor__subline time',
        '.feed-shared-actor__description time'
      ];
      
      for (const selector of timeSelectors) {
        const timeElem = post.querySelector(selector);
        if (timeElem && timeElem.innerText.trim()) {
          age = timeElem.innerText.trim();
          break;
        }
      }
      
      // Extract headline using the specific HTML structure provided
      // Look for span with aria-hidden="true" that contains the headline
      const headlineSelectors = [
        '.update-components-actor__description span[aria-hidden="true"]',
        '.feed-shared-actor__subline span[aria-hidden="true"]',
        '.feed-shared-actor__description span[aria-hidden="true"]',
        'span[data-test-id="actor-subline"] span[aria-hidden="true"]',
        'span[aria-hidden="true"]'
      ];
      
      for (const selector of headlineSelectors) {
        const headlineElem = post.querySelector(selector);
        if (headlineElem && headlineElem.innerText.trim()) {
          const text = headlineElem.innerText.trim();
          // Filter out navigation elements and time
          if (text && 
              text !== name && 
              text.length > 3 && 
              !text.includes('Follow') && 
              !text.includes('Connect') && 
              !text.includes('•') && 
              !text.includes('1st') && 
              !text.includes('2nd') && 
              !text.includes('3rd+') &&
              !text.includes('connection') &&
              !text.includes('mutual') &&
              !text.includes('ago') &&
              !text.includes('min') &&
              !text.includes('hour') &&
              !text.includes('day') &&
              !text.includes('week')) {
            headline = text;
            break;
          }
        }
      }
      
      // Fallback: If no headline found with aria-hidden, try other selectors
      if (!headline) {
        const fallbackSelectors = [
          '.update-components-actor__description',
          '.feed-shared-actor__subline',
          '.feed-shared-actor__description',
          'span[data-test-id="actor-subline"]',
          '.feed-shared-actor__info'
        ];
        
        for (const selector of fallbackSelectors) {
          const headlineElem = post.querySelector(selector);
          if (headlineElem && headlineElem.innerText.trim()) {
            const text = headlineElem.innerText.trim();
            // Filter out navigation elements and time
            if (text && 
                text !== name && 
                text.length > 3 && 
                !text.includes('Follow') && 
                !text.includes('Connect') && 
                !text.includes('•') && 
                !text.includes('1st') && 
                !text.includes('2nd') && 
                !text.includes('3rd+') &&
                !text.includes('connection') &&
                !text.includes('mutual') &&
                !text.includes('ago') &&
                !text.includes('min') &&
                !text.includes('hour') &&
                !text.includes('day') &&
                !text.includes('week')) {
              headline = text;
              break;
            }
          }
        }
      }
      
      // Clean up headline
      if (headline) {
        headline = headline
          .replace(/\s+•\s+.*$/, '') // Remove everything after bullet point
          .trim();
      }
      
      // More specific content selectors to avoid navigation
      const contentSelectors = [
        'div.feed-shared-update-v2__description',
        'div.feed-shared-text',
        'span.break-words',
        'div[data-test-id="post-content"]',
        '.feed-shared-update-v2__description-wrapper'
      ];
      
      let content = '';
      for (const selector of contentSelectors) {
        const contentElem = post.querySelector(selector);
        if (contentElem && contentElem.innerText.trim()) {
          const text = contentElem.innerText.trim();
          // Filter out navigation-like content
          if (text.length > 10 && 
              !text.includes('Follow') && 
              !text.includes('Connect') && 
              !text.includes('•') && 
              !text.includes('1st') && 
              !text.includes('2nd') && 
              !text.includes('3rd+')) {
            content = text;
            break;
          }
        }
      }
      
      // Only add posts that have meaningful content
      if (name && (content || headline)) {
        posts.push({ name, content, headline, linkedinUrl, age });
      }
    });
    
    return posts;
  }
  
  // Global variables to track scrolling state
  let isScrolling = false;
  let shouldStopScrolling = false;

  async function scrollToAbsoluteBottom() {
    console.log('[S4S] Starting scroll to bottom');
    isScrolling = true;
    shouldStopScrolling = false;
    
    let lastHeight = document.documentElement.scrollHeight;
    let stuckCount = 0;
    const maxStuckCount = 3;
    
    try {
      while (!shouldStopScrolling) {
        // Check if we should stop
        if (shouldStopScrolling) {
          console.log('[S4S] Stopping scroll due to stop signal');
          break;
        }
        
        // Scroll to bottom
        window.scrollTo(0, document.documentElement.scrollHeight);
        console.log('[S4S] Scrolled to height:', document.documentElement.scrollHeight);
        
        // Wait for LinkedIn to load more content
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if we should stop again after waiting
        if (shouldStopScrolling) {
          console.log('[S4S] Stopping scroll after wait');
          break;
        }
        
        let newHeight = document.documentElement.scrollHeight;
        if (newHeight === lastHeight) {
          stuckCount++;
          console.log('[S4S] No new content loaded, stuck count:', stuckCount);
          if (stuckCount >= maxStuckCount) {
            console.log('[S4S] Max stuck count reached, stopping scroll');
            break; // No more new content loaded after several attempts
          }
        } else {
          stuckCount = 0; // Reset stuck count when new content loads
        }
        lastHeight = newHeight;
      }
    } catch (error) {
      console.error('[S4S] Error during scrolling:', error);
    } finally {
      isScrolling = false;
      console.log('[S4S] Scroll completed');
    }
  }

  function stopScrolling() {
    console.log('[S4S] Stop scrolling requested');
    shouldStopScrolling = true;
    isScrolling = false;
  }

  // Listen for messages from popup or background
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log('[S4S] Received message:', msg);
    
    try {
      if (msg.action === "extractPosts") {
        const posts = extractPosts();
        console.log('[S4S] Extracted posts:', posts.length);
        sendResponse({ posts: posts });
        return false; // Synchronous response
      }

      if (msg.action === "performSingleScroll") {
        console.log('[S4S] Starting performSingleScroll');
        (async () => {
          try {
            await scrollToAbsoluteBottom();
            console.log('[S4S] Scroll completed, sending response');
            sendResponse({ success: true, stopped: shouldStopScrolling });
          } catch (error) {
            console.error('[S4S] Error in performSingleScroll:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true; // Asynchronous response
      }

      if (msg.action === "stopScroll") {
        stopScrolling();
        sendResponse({ success: true, message: "Scrolling stopped" });
        return false; // Synchronous response
      }

      if (msg.action === "ping") {
        sendResponse({ success: true });
        return false; // Synchronous response
      }
      
    } catch (error) {
      console.error('[S4S] Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
    
    return false; // Default to synchronous response
  });
}