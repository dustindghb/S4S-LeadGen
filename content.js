console.log('[S4S] Content script loaded');

// Prevent multiple instances
if (window.s4sContentScriptLoaded) {
  console.log('[S4S] Content script already loaded, skipping');
} else {
  window.s4sContentScriptLoaded = true;

  // Add timeout wrapper for long-running operations
  function withTimeout(promise, timeoutMs = 30000) {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
      )
    ]);
  }

  async function extractPosts() {
    try {
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
      
      // Limit processing to prevent hanging
      const maxPosts = Math.min(foundPosts.length, 50); // Process max 50 posts at once
      
      for (let index = 0; index < maxPosts; index++) {
        const post = foundPosts[index];
        
        // Try to get cached URL first
        let postUrl = post.dataset.s4sPostUrl || extractPostUrl(post, index);
        
        // Cache the URL for future use if found
        if (postUrl) {
          post.dataset.s4sPostUrl = postUrl;
        }
        
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
        
        // Profile link extraction
        const profileLink = post.querySelector('a[data-control-name="actor_profile"], a[href*="/in/"]');
        if (profileLink && profileLink.href) {
          linkedinUrl = profileLink.href;
        } else {
          const anyProfile = post.querySelector('a[href*="/in/"]');
          if (anyProfile && anyProfile.href) {
            linkedinUrl = anyProfile.href;
          }
        }
        
        if (!linkedinUrl) {
          const header = post.querySelector('.feed-shared-actor__container, .update-components-actor');
          if (header) {
            const headerProfile = header.querySelector('a[href*="/in/"]');
            if (headerProfile && headerProfile.href) {
              linkedinUrl = headerProfile.href;
            }
          }
        }
        
        // Extract age (time posted) with fallback
        const timeSelectors = [
          'time',
          'span[class*="time"]',
          'span[class*="ago"]',
          '.feed-shared-actor__subline time',
          '.feed-shared-actor__description time',
          '.update-components-actor__sub-description span[aria-hidden="true"]',
          'span[aria-hidden="true"]',
          '.feed-shared-actor__subline span[aria-hidden="true"]',
          '.update-components-actor__sub-description span[aria-hidden="true"]',
          'span[aria-hidden="true"]:has(li-icon[type="globe-americas"])'
        ];
        
        // Debug logging for first few posts
        if (index < 3) {
          console.log(`[S4S] Extracting age for post ${index + 1}`);
        }
        
        for (const selector of timeSelectors) {
          const timeElems = post.querySelectorAll(selector);
          for (const timeElem of timeElems) {
            if (timeElem && timeElem.innerText.trim()) {
              const text = timeElem.innerText.trim();
              if (index < 3) {
                console.log(`[S4S] Post ${index + 1} time text: "${text}"`);
              }
              
              // More comprehensive time pattern matching
              if (text.match(/\d+[hmdw]/) || text.includes('ago') || text.includes('min') || text.includes('hour') || text.includes('day') || text.includes('week') || text.includes('month') || text.includes('year')) {
                // Try multiple regex patterns for different formats
                let timeMatch = text.match(/(\d+)\s*(min|hour|day|week|month|year)s?/i);
                if (!timeMatch) {
                  timeMatch = text.match(/(\d+[hmdw])/);
                }
                if (!timeMatch) {
                  timeMatch = text.match(/(\d+)\s*(?:minute|hour|day|week|month|year)s?/i);
                }
                
                if (timeMatch) {
                  age = timeMatch[1] + (timeMatch[2] ? timeMatch[2].charAt(0) : '');
                  if (index < 3) {
                    console.log(`[S4S] Post ${index + 1} age extracted: "${age}" from "${text}"`);
                  }
                  break;
                }
              }
            }
          }
          if (age) break;
        }
        
        if (!age) {
          const timeElem = post.querySelector('time, [aria-label*="ago"], [title*="ago"]');
          if (timeElem) {
            const text = timeElem.getAttribute('aria-label') || timeElem.getAttribute('title') || timeElem.innerText;
            if (index < 3) {
              console.log(`[S4S] Post ${index + 1} fallback time text: "${text}"`);
            }
            
            if (text && (text.match(/\d+[hmdw]/) || text.includes('ago') || text.includes('min') || text.includes('hour') || text.includes('day') || text.includes('week') || text.includes('month') || text.includes('year'))) {
              let timeMatch = text.match(/(\d+)\s*(min|hour|day|week|month|year)s?/i);
              if (!timeMatch) {
                timeMatch = text.match(/(\d+[hmdw])/);
              }
              if (!timeMatch) {
                timeMatch = text.match(/(\d+)\s*(?:minute|hour|day|week|month|year)s?/i);
              }
              
              if (timeMatch) {
                age = timeMatch[1] + (timeMatch[2] ? timeMatch[2].charAt(0) : '');
                if (index < 3) {
                  console.log(`[S4S] Post ${index + 1} fallback age extracted: "${age}" from "${text}"`);
                }
              }
            }
          }
        }
        
        if (index < 3) {
          console.log(`[S4S] Post ${index + 1} final age: "${age}"`);
        }
        
        // Extract headline using the specific HTML structure provided
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
        
        // Fallback headline extraction
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
        
        if (headline) {
          headline = headline
            .replace(/\s+•\s+.*$/, '')
            .trim();
        }
        
        // Extract content
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
            if (text.length > 10 && 
                !text.includes('Follow') && 
                !text.includes('Connect') && 
                !text.includes('•') && 
                !text.includes('1st') && 
                !text.includes('2nd') && 
                !text.includes('3rd+')) {
              content = cleanTextContent(text);
              break;
            }
          }
        }
        
        // Clean headline text as well
        if (headline) {
          headline = cleanTextContent(headline);
        }
        
        // Only add posts that have meaningful content
        if (name && (content || headline)) {
          posts.push({ name, content, headline, linkedinUrl, age, postUrl });
        }
      }
      
      return posts;
    } catch (error) {
      console.error('[S4S] Error in extractPosts:', error);
      return [];
    }
  }
  
  // Function to clean and normalize text content
  function cleanTextContent(text) {
    if (!text) return '';
    
    try {
      // Decode HTML entities first
      const textarea = document.createElement('textarea');
      textarea.innerHTML = text;
      let cleanedText = textarea.value;
      
      // Handle common encoding issues and weird characters
      cleanedText = cleanedText
        // Fix common encoding issues
        .replace(/‚Äô/g, "'") // Smart apostrophe
        .replace(/‚Äù/g, '"') // Smart quote
        .replace(/‚Äú/g, '"') // Smart quote
        .replace(/‚Äì/g, '–') // En dash
        .replace(/‚Äî/g, '—') // Em dash
        .replace(/‚Ä¶/g, '...') // Ellipsis
        .replace(/‚Äç/g, '') // Remove weird character
        .replace(/‚Äî/g, '—') // Em dash
        .replace(/‚Äì/g, '–') // En dash
        .replace(/‚Äù/g, '"') // Smart quote
        .replace(/‚Äú/g, '"') // Smart quote
        .replace(/‚Äô/g, "'") // Smart apostrophe
        .replace(/‚Ä¶/g, '...') // Ellipsis
        .replace(/‚Äç/g, '') // Remove weird character
        .replace(/‚Äî/g, '—') // Em dash
        .replace(/‚Äì/g, '–') // En dash
        .replace(/‚Äù/g, '"') // Smart quote
        .replace(/‚Äú/g, '"') // Smart quote
        .replace(/‚Äô/g, "'") // Smart apostrophe
        .replace(/‚Ä¶/g, '...') // Ellipsis
        .replace(/‚Äç/g, '') // Remove weird character
        // Handle other common encoding issues
        .replace(/â€™/g, "'") // Another smart apostrophe variant
        .replace(/â€œ/g, '"') // Another smart quote variant
        .replace(/â€/g, '"') // Another smart quote variant
        .replace(/â€"|â€"/g, '—') // Em dash variants
        .replace(/â€"|â€"/g, '–') // En dash variants
        .replace(/â€¦/g, '...') // Ellipsis variant
        .replace(/â€¦/g, '...') // Another ellipsis variant
        // Remove other weird characters that might appear
        .replace(/[^\x00-\x7F\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\s]/gu, (char) => {
          // Keep only printable ASCII, emojis, and whitespace
          if (char.charCodeAt(0) < 32 || char.charCodeAt(0) > 126) {
            // Check if it's a valid emoji or whitespace
            if (!/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\s]/u.test(char)) {
              return ''; // Remove invalid characters
            }
          }
          return char;
        });
      
      // Clean up newlines and whitespace
      cleanedText = cleanedText
        .replace(/\r\n/g, '\n') // Normalize line endings
        .replace(/\r/g, '\n')   // Convert remaining \r to \n
        .replace(/\n\s*\n/g, '\n') // Remove multiple consecutive newlines
        .replace(/\n{3,}/g, '\n\n') // Limit to max 2 consecutive newlines
        .trim(); // Remove leading/trailing whitespace
      
      // Remove excessive spaces
      cleanedText = cleanedText.replace(/\s{2,}/g, ' ');
      
      return cleanedText;
    } catch (error) {
      console.error('[S4S] Error cleaning text content:', error);
      return text; // Return original if cleaning fails
    }
  }





  // Improved post URL extraction function
  function extractPostUrl(post, index = 0) {
    try {
      let postUrl = '';
      
      // Debug logging for first few posts
      if (index < 3) {
        console.log(`[S4S] Analyzing post ${index + 1} for URL extraction`);
      }
      
      // Method 1: Look for direct post links (most reliable)
      const directPostSelectors = [
        'a[href*="/posts/"]',
        'a[href*="/feed/update/"]',
        'a[href*="/activity-"]',
        'a[data-control-name="post_link"]',
        'a[data-control-name="feed_detail"]'
      ];
      
      for (const selector of directPostSelectors) {
        const linkElem = post.querySelector(selector);
        if (linkElem && linkElem.href) {
          postUrl = linkElem.href;
          if (index < 3) {
            console.log(`[S4S] Post ${index + 1} URL found via direct link (${selector}):`, postUrl);
          }
          break;
        }
      }
      
      // Method 2: Extract from timestamp/date links
      if (!postUrl) {
        const timeLinks = post.querySelectorAll('time a, a[aria-label*="ago"], .update-components-actor__sub-description a');
        for (const timeLink of timeLinks) {
          if (timeLink.href && (timeLink.href.includes('/posts/') || timeLink.href.includes('/feed/update/'))) {
            postUrl = timeLink.href;
            if (index < 3) {
              console.log(`[S4S] Post ${index + 1} URL found via timestamp link:`, postUrl);
            }
            break;
          }
        }
      }
      
      // Method 3: Look for URN-based construction
      if (!postUrl) {
        const urnElement = post.querySelector('[data-urn]') || post;
        if (urnElement) {
          const dataUrn = urnElement.getAttribute('data-urn');
          if (dataUrn) {
            // Extract the activity ID from various URN formats
            let activityId = '';
            
            // Format: urn:li:activity:1234567890
            const activityMatch = dataUrn.match(/urn:li:activity:(\d+)/);
            if (activityMatch) {
              activityId = activityMatch[1];
            }
            
            // Format: urn:li:share:1234567890
            const shareMatch = dataUrn.match(/urn:li:share:(\d+)/);
            if (shareMatch) {
              activityId = shareMatch[1];
            }
            
            // Format: urn:li:fs_post:(activity:1234567890,...)
            const fsPostMatch = dataUrn.match(/urn:li:fs_post:\(activity:(\d+)/);
            if (fsPostMatch) {
              activityId = fsPostMatch[1];
            }
            
            if (activityId) {
              // LinkedIn's actual post URL format
              postUrl = `https://www.linkedin.com/posts/activity-${activityId}`;
              if (index < 3) {
                console.log(`[S4S] Post ${index + 1} URL constructed from URN:`, postUrl);
              }
            }
          }
        }
      }
      
      // Method 4: Try to find any clickable element that might lead to the post
      if (!postUrl) {
        const clickableElements = post.querySelectorAll('[data-control-name*="post"], [data-control-name*="feed"], [data-control-name*="detail"]');
        for (const elem of clickableElements) {
          // Look for href in the element or its children
          const href = elem.href || elem.querySelector('a')?.href;
          if (href && (href.includes('/posts/') || href.includes('/feed/update/') || href.includes('/activity-'))) {
            postUrl = href;
            if (index < 3) {
              console.log(`[S4S] Post ${index + 1} URL found via clickable element:`, postUrl);
            }
            break;
          }
        }
      }
      
      // Method 5: Look for author profile link and try to construct post URL
      if (!postUrl) {
        const authorLink = post.querySelector('a[href*="/in/"]');
        if (authorLink && authorLink.href) {
          const profileUrl = authorLink.href;
          // Try to find a timestamp or unique identifier to construct the post URL
          const timeElem = post.querySelector('time');
          if (timeElem) {
            const timeText = timeElem.textContent || timeElem.getAttribute('datetime');
            if (timeText) {
              // This is a fallback - we'll mark it as incomplete
              postUrl = `${profileUrl}#post-${Date.now()}-${index}`; // Temporary identifier
              if (index < 3) {
                console.log(`[S4S] Post ${index + 1} fallback URL constructed:`, postUrl);
              }
            }
          }
        }
      }
      
      // Clean and validate the URL
      if (postUrl) {
        postUrl = cleanAndValidatePostUrl(postUrl);
        if (index < 3) {
          console.log(`[S4S] Post ${index + 1} final cleaned URL:`, postUrl);
        }
      } else {
        if (index < 3) {
          console.log(`[S4S] Post ${index + 1} - NO URL FOUND`);
          // Log available attributes for debugging
          console.log(`[S4S] Post ${index + 1} debug info:`, {
            hasDataUrn: !!post.querySelector('[data-urn]'),
            dataUrn: post.querySelector('[data-urn]')?.getAttribute('data-urn'),
            allLinks: Array.from(post.querySelectorAll('a[href]')).map(a => a.href).slice(0, 5),
            timeElements: Array.from(post.querySelectorAll('time')).map(t => t.textContent || t.getAttribute('datetime')),
            controlNames: Array.from(post.querySelectorAll('[data-control-name]')).map(e => e.getAttribute('data-control-name')).slice(0, 5)
          });
        }
      }
      
      return postUrl;
    } catch (error) {
      console.error(`[S4S] Error extracting post URL for post ${index + 1}:`, error);
      return '';
    }
  }
  
  // Enhanced URL cleaning function
  function cleanAndValidatePostUrl(url) {
    try {
      // Remove any query parameters that might cause issues
      let cleanUrl = url.split('?')[0].split('#')[0];
      
      // Ensure it's a proper LinkedIn URL
      if (!cleanUrl.includes('linkedin.com')) {
        return '';
      }
      
      // Valid LinkedIn post URL patterns
      const validPatterns = [
        '/posts/',
        '/feed/update/',
        '/activity-',
        '/pulse/' // For articles
      ];
      
      const isValidPattern = validPatterns.some(pattern => cleanUrl.includes(pattern));
      
      if (isValidPattern) {
        return cleanUrl;
      }
      
      // If it's our fallback URL, mark it as such
      if (cleanUrl.includes('#post-')) {
        return cleanUrl + '-fallback';
      }
      
      return '';
    } catch (error) {
      console.error('[S4S] Error cleaning URL:', error);
      return '';
    }
  }

  // Global variables to track scrolling state
  let isScrolling = false;
  let shouldStopScrolling = false;
  let scrollTimeoutId = null;

  async function scrollToAbsoluteBottom() {
    console.log('[S4S] Starting scroll to bottom');
    isScrolling = true;
    shouldStopScrolling = false;
    
    let lastHeight = document.documentElement.scrollHeight;
    let stuckCount = 0;
    const maxStuckCount = 3;
    const maxScrollTime = 60000; // 1 minute maximum scroll time
    const startTime = Date.now();
    
    try {
      while (!shouldStopScrolling) {
        // Check timeout
        if (Date.now() - startTime > maxScrollTime) {
          console.log('[S4S] Scroll timeout reached');
          break;
        }
        
        // Check if we should stop
        if (shouldStopScrolling) {
          console.log('[S4S] Stopping scroll due to stop signal');
          break;
        }
        
        // Scroll to bottom
        window.scrollTo(0, document.documentElement.scrollHeight);
        console.log('[S4S] Scrolled to height:', document.documentElement.scrollHeight);
        
        // Wait for LinkedIn to load more content - with shorter timeout
        await new Promise(resolve => {
          scrollTimeoutId = setTimeout(resolve, 2000);
        });
        
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
            break;
          }
        } else {
          stuckCount = 0;
        }
        lastHeight = newHeight;
      }
    } catch (error) {
      console.error('[S4S] Error during scrolling:', error);
    } finally {
      isScrolling = false;
      if (scrollTimeoutId) {
        clearTimeout(scrollTimeoutId);
        scrollTimeoutId = null;
      }
      console.log('[S4S] Scroll completed');
    }
  }

  function stopScrolling() {
    console.log('[S4S] Stop scrolling requested');
    shouldStopScrolling = true;
    isScrolling = false;
    if (scrollTimeoutId) {
      clearTimeout(scrollTimeoutId);
      scrollTimeoutId = null;
    }
  }

  // Listen for messages from popup or background
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log('[S4S] Received message:', msg);
    
    try {
      if (msg.action === "extractPosts") {
        // Use timeout for extraction
        const extractionPromise = extractPosts();
        
        withTimeout(extractionPromise, 30000) // Increased timeout for menu interactions
          .then(posts => {
            console.log('[S4S] Extracted posts:', posts.length);
            sendResponse({ posts: posts });
          })
          .catch(error => {
            console.error('[S4S] Extraction timeout:', error);
            sendResponse({ posts: [], error: error.message });
          });
        
        return true; // Asynchronous response
      }

      if (msg.action === "performSingleScroll") {
        console.log('[S4S] Starting performSingleScroll');
        
        withTimeout(scrollToAbsoluteBottom(), 65000)
          .then(() => {
            console.log('[S4S] Scroll completed, sending response');
            sendResponse({ success: true, stopped: shouldStopScrolling });
          })
          .catch(error => {
            console.error('[S4S] Error in performSingleScroll:', error);
            sendResponse({ success: false, error: error.message });
          });
        
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