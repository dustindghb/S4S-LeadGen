// Anti-detection: Disable console logging in production
if (typeof window.DEBUG_MODE === 'undefined') {
  window.DEBUG_MODE = true; // TEMPORARILY enabled for debugging
}

// Immediate load confirmation
console.log('[S4S] Content script file loaded at:', new Date().toISOString());

function safeLog(...args) {
  if (window.DEBUG_MODE) {
    console.log(...args);
  }
}

// Only keep essential loading log
safeLog('[S4S] Content script loaded');

  // Prevent multiple instances
  if (window.s4sContentScriptLoaded) {
    // Content script already loaded, skipping
  } else {
    window.s4sContentScriptLoaded = true;
    
    // Add a small delay to ensure the page is fully loaded
    setTimeout(() => {
      // Content script initialized and ready
    }, 500);

  // Add timeout wrapper for long-running operations
  function withTimeout(promise, timeoutMs = 30000) {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
      )
    ]);
  }

  // Anti-detection: Random delay function
  function randomDelay(min = 100, max = 500) {
    return new Promise(resolve => 
      setTimeout(resolve, Math.random() * (max - min) + min)
    );
  }

  // Anti-detection: Throttled DOM queries
  let lastDomQuery = 0;
  const DOM_QUERY_THROTTLE = 50; // Minimum ms between DOM queries

  async function throttledQuerySelector(element, selector) {
    const now = Date.now();
    if (now - lastDomQuery < DOM_QUERY_THROTTLE) {
      await randomDelay(DOM_QUERY_THROTTLE - (now - lastDomQuery));
    }
    lastDomQuery = Date.now();
    return element.querySelector(selector);
  }

  async function throttledQuerySelectorAll(element, selector) {
    const now = Date.now();
    if (now - lastDomQuery < DOM_QUERY_THROTTLE) {
      await randomDelay(DOM_QUERY_THROTTLE - (now - lastDomQuery));
    }
    lastDomQuery = Date.now();
    return element.querySelectorAll(selector);
  }

  async function extractPosts() {
    try {
      const posts = [];

      // More specific selectors for LinkedIn posts to avoid navigation elements
      // Updated for LinkedIn's 2024-2026 DOM structure
      const postSelectors = [
        // NEW LinkedIn structure (2026) - uses data-view-name attributes
        '[data-view-name="feed-full-update"]',
        'div[role="listitem"][data-view-name="feed-full-update"]',
        // Posts with componentkey that contain feed updates (2026 variants)
        'div[role="listitem"][componentkey*="Feed"]',
        'div[role="listitem"][componentkey*="expanded"]',
        'div[role="listitem"][componentkey]',
        // New LinkedIn structure (2024-2025)
        '[data-id^="urn:li:activity"]',
        'div[data-urn^="urn:li:activity"]',
        'article[data-urn^="urn:li:activity"]',
        // Feed items with data-id
        '.feed-shared-update-v2[data-id]',
        '.update-components-actor__container',
        // Fallback to older selectors
        'div.feed-shared-update-v2[data-urn*="activity"]',
        'article.feed-shared-update-v2[data-urn*="activity"]',
        'div[data-urn*="activity"]:not([data-urn*="navigation"])',
        'article[data-urn*="activity"]:not([data-urn*="navigation"])',
        // Generic feed post containers
        '.occludable-update',
        '[data-urn*="urn:li:activity"]'
      ];

      let foundPosts = [];
      let usedSelector = '';
      for (const selector of postSelectors) {
        foundPosts = document.querySelectorAll(selector);
        if (foundPosts.length > 0) {
          usedSelector = selector;
          console.log('[S4S] extractPosts: Found', foundPosts.length, 'posts using selector:', selector);
          break;
        }
      }

      // NEW APPROACH: If standard selectors fail, find posts by looking for profile links
      if (foundPosts.length === 0) {
        console.log('[S4S] Trying profile-link based post detection...');

        // Find all profile links in the main feed area
        const mainEl = document.querySelector('main');
        if (mainEl) {
          const profileLinks = mainEl.querySelectorAll('a[href*="/in/"]');
          console.log('[S4S] Found', profileLinks.length, 'profile links in main');

          // For each profile link, try to find the containing post element
          const postContainers = new Set();

          for (const link of profileLinks) {
            // Walk up the DOM tree to find a container that looks like a post
            let parent = link.parentElement;
            let depth = 0;

            while (parent && depth < 15) {
              // Look for containers that have significant size (likely a post)
              const rect = parent.getBoundingClientRect();
              const hasSize = rect.width > 400 && rect.height > 100;

              // Check if this container has post-like characteristics
              const hasMultipleLinks = parent.querySelectorAll('a').length > 2;
              const hasText = parent.innerText && parent.innerText.length > 100;
              const isNotTooLarge = rect.height < 2000; // Not the entire feed

              // Check if it's a direct child of main or close to it
              const isNearMain = parent.closest('main') === mainEl;

              if (hasSize && hasMultipleLinks && hasText && isNotTooLarge && isNearMain) {
                // Make sure we're not selecting the same container multiple times
                // by checking if any existing container contains this one or vice versa
                let isDuplicate = false;
                for (const existing of postContainers) {
                  if (existing.contains(parent) || parent.contains(existing)) {
                    isDuplicate = true;
                    // Keep the larger container
                    if (parent.contains(existing)) {
                      postContainers.delete(existing);
                      postContainers.add(parent);
                    }
                    break;
                  }
                }
                if (!isDuplicate) {
                  postContainers.add(parent);
                }
                break;
              }

              parent = parent.parentElement;
              depth++;
            }
          }

          foundPosts = Array.from(postContainers);
          console.log('[S4S] Found', foundPosts.length, 'post containers via profile-link method');

          if (foundPosts.length > 0) {
            usedSelector = 'profile-link-detection';
            console.log('[S4S] First post container:', foundPosts[0].tagName, 'classes:', foundPosts[0].className?.substring(0, 60));
          }
        }
      }

      // Debug: Log if no posts found
      if (foundPosts.length === 0) {
        console.log('[S4S] No posts found with any selector');
      }
      
      // Process all found posts (removed 50 post limit)
      const maxPosts = foundPosts.length;
      
      for (let index = 0; index < maxPosts; index++) {
        const post = foundPosts[index];
        
        // Try to get cached URL first
        let postUrl = post.dataset.s4sPostUrl || extractPostUrl(post, index);
        
        // Cache the URL for future use if found
        if (postUrl) {
          post.dataset.s4sPostUrl = postUrl;
        }
        
        // Extract author name and URL - always from the same link so they stay in sync
        let name = '';
        let linkedinUrl = '';
        let nameContainer = null;

        const profileLinks = post.querySelectorAll('a[href*="/in/"]');
        for (const link of profileLinks) {
          // Skip avatar/image links - they have no text, only figures/imgs
          if (link.querySelector('figure, img') || link.getAttribute('data-view-name') === 'feed-actor-image') {
            continue;
          }

          const nameSpan = link.querySelector('span[aria-hidden="true"]');
          if (nameSpan) {
            const nameClone = nameSpan.cloneNode(true);
            nameClone.querySelectorAll('span').forEach(s => s.remove());
            const cleanName = nameClone.textContent.trim();
            if (cleanName && cleanName.length > 1 && cleanName.length < 50) {
              name = cleanName;
              linkedinUrl = normalizeLinkedInProfileUrl(link.href); // URL from same link as name
              nameContainer = link;
              break;
            }
          }
        }

        // Fallback: any profile link with a span containing text
        if (!name && profileLinks.length > 0) {
          for (const link of profileLinks) {
            const nameSpan = link.querySelector('span[aria-hidden="true"]');
            if (nameSpan) {
              const nameClone = nameSpan.cloneNode(true);
              nameClone.querySelectorAll('span').forEach(s => s.remove());
              const cleanName = nameClone.textContent.trim();
              if (cleanName && cleanName.length > 1 && cleanName.length < 50) {
                name = cleanName;
                linkedinUrl = normalizeLinkedInProfileUrl(link.href);
                nameContainer = link;
                break;
              }
            }
          }
        }

        if (index < 3) {
          safeLog(`[S4S] Post ${index + 1} - Author: "${name}", URL: ${linkedinUrl?.substring(0, 50)}`);
        }
        
        // Extract date/age
        let headline = '';
        const dateInfo = extractPostDateAndAge(post, index);
        const extractedAge = dateInfo.age;
        const postDate = dateInfo.postDate;
        const exactDate = dateInfo.exactDate;

        // Extract headline from author link container (LinkedIn 2026 structure)
        if (nameContainer) {
          const paragraphs = nameContainer.querySelectorAll('p');
          for (const p of paragraphs) {
            const text = p.textContent.trim();
            // Skip name, connection degree, timestamp, or website link
            if (text.includes(name) ||
                text.match(/\b(1st|2nd|3rd\+?)\b/i) ||
                text.match(/^\d+[hdwmy]\s*•/) ||
                text.includes('Visit my website') ||
                text.length < 5 || text.length > 200) {
              continue;
            }
            headline = text;
            break;
          }
        }

        // Clean headline
        if (headline) {
          headline = headline.replace(/\s+•\s+.*$/, '').trim();
        }

        if (index < 3) {
          safeLog(`[S4S] Post ${index + 1} - Headline: "${headline?.substring(0, 50)}...", Age: ${extractedAge}`);
        }
        
        // Extract content - prioritize new LinkedIn 2026 structure
        let content = '';

        // Try data-testid="expandable-text-box" first (stable across LinkedIn 2025-2026)
        const expandableTextBox = post.querySelector('[data-testid="expandable-text-box"]');
        if (expandableTextBox && expandableTextBox.innerText.trim().length > 10) {
          content = cleanTextContent(expandableTextBox.innerText.trim());
        }

        // Try feed-commentary (another LinkedIn 2026 variant)
        if (!content || content.length < 10) {
          const commentaryElem = post.querySelector('[data-view-name="feed-commentary"]');
          if (commentaryElem) {
            const span = commentaryElem.querySelector('span');
            content = cleanTextContent((span || commentaryElem).innerText.trim());
          }
        }

        // Fallback to older selectors if no content found
        if (!content || content.length < 10) {
          const fallbackSelectors = [
            'div.feed-shared-update-v2__description',
            'div.feed-shared-text',
            'span.break-words'
          ];
          for (const selector of fallbackSelectors) {
            const elem = post.querySelector(selector);
            if (elem && elem.innerText.trim().length > 10) {
              content = cleanTextContent(elem.innerText.trim());
              break;
            }
          }
        }

        // Check for repost content if main content is short
        if (!content || content.length < 50) {
          const repostInfo = detectAndExtractRepostContent(post);
          if (repostInfo.isRepost && repostInfo.originalContent) {
            content = content ? `${content}\n\n--- Original Post ---\n${repostInfo.originalContent}` : repostInfo.originalContent;
          }
        }

        // Detect embedded LinkedIn job cards (even if post text doesn't mention hiring)
        const jobCardLink = post.querySelector('a[href*="/jobs/view/"]');
        if (jobCardLink) {
          const lines = jobCardLink.innerText.split('\n').map(l => l.trim()).filter(l => l && l !== 'View job' && !l.startsWith('$') && !l.includes('benefit') && !l.includes('applicants'));
          const jobTitle = lines[0] || '';
          const jobCompany = lines[1] || '';
          const jobLocation = lines[2] || '';
          if (jobTitle) {
            const jobInfo = `[Embedded Job Posting] Job Title: ${jobTitle}${jobCompany ? `, Company: ${jobCompany}` : ''}${jobLocation ? `, Location: ${jobLocation}` : ''}`;
            content = content ? `${content}\n\n${jobInfo}` : jobInfo;
          }
        }

        // Clean headline
        if (headline) {
          headline = cleanTextContent(headline);
        }

        // Extract connection degree
        let connectionDegree = extractConnectionDegree(post) || '3rd';

        if (index < 3) {
          safeLog(`[S4S] Post ${index + 1} - Content: ${content?.length || 0} chars, Connection: ${connectionDegree}`);
        }

        // Only add posts that have meaningful content
        if (name && (content || headline)) {
          posts.push({
            name,
            content,
            headline,
            linkedinUrl,
            age: extractedAge,
            postDate,
            exactDate,
            postUrl,
            connectionDegree
          });
        }
      }

      console.log('[S4S] extractPosts: Returning', posts.length, 'processed posts from', foundPosts.length, 'found elements');
      if (posts.length > 0) {
        console.log('[S4S] First post sample:', {
          name: posts[0].name,
          linkedinUrl: posts[0].linkedinUrl?.substring(0, 50),
          hasContent: !!posts[0].content
        });
      }

      return posts;
    } catch (error) {
      console.error('[S4S] Error in extractPosts:', error);
      return [];
    }
    }

  /**
   * Detects if a post is a repost and extracts the original content
   * @param {Element} post - The DOM element containing the LinkedIn post
   * @returns {Object} - Object with isRepost boolean and originalContent string
   */
  function detectAndExtractRepostContent(post) {
    if (!post) return { isRepost: false, originalContent: '' };
    
    // Look for repost indicators
    const repostIndicators = [
      // Repost text indicators
      'repost',
      'reposted',
      'shared',
      'via',
      'from',
      'check out',
      'look at this',
      'great opportunity',
      'amazing post',
      'worth sharing',
      'must read',
      'interesting',
      'thought this was worth sharing'
    ];
    
    // Check if the main content contains repost indicators
    const mainContent = post.innerText.toLowerCase();
    let isRepost = false;
    
    for (const indicator of repostIndicators) {
      if (mainContent.includes(indicator)) {
        isRepost = true;
        safeLog(`[S4S] Detected repost indicator: "${indicator}"`);
        break;
      }
    }
    
    // Look for repost-specific DOM structure
    const repostStructureSelectors = [
      '.feed-shared-update-v2__content',
      '.feed-shared-update-v2__content-wrapper',
      '[data-test-id="repost-content"]',
      '.repost-content',
      '.shared-update-content'
    ];
    
    for (const selector of repostStructureSelectors) {
      if (post.querySelector(selector)) {
        isRepost = true;
        safeLog(`[S4S] Detected repost structure: ${selector}`);
        break;
      }
    }
    
    if (!isRepost) {
      return { isRepost: false, originalContent: '' };
    }
    
    // Extract the original content from the repost
    const originalContentSelectors = [
      // Nested content within repost containers
      '.feed-shared-update-v2__content .feed-shared-update-v2__description',
      '.feed-shared-update-v2__content .feed-shared-text',
      '.feed-shared-update-v2__content .break-words',
      '.feed-shared-update-v2__content div[class*="description"]',
      '.feed-shared-update-v2__content div[class*="text"]',
      
      // Repost specific content
      '[data-test-id="repost-content"] .feed-shared-text',
      '[data-test-id="repost-content"] .break-words',
      '.repost-content .feed-shared-text',
      '.shared-update-content .feed-shared-text',
      
      // Fallback: any substantial text content within repost containers
      '.feed-shared-update-v2__content div',
      '.feed-shared-update-v2__content span'
    ];
    
    let originalContent = '';
    let bestContent = '';
    
    for (const selector of originalContentSelectors) {
      const elements = post.querySelectorAll(selector);
      for (const elem of elements) {
        const text = elem.innerText.trim();
        if (text && text.length > 30 && 
            !text.includes('Follow') && 
            !text.includes('Connect') && 
            !text.includes('•') && 
            !text.includes('1st') && 
            !text.includes('2nd') && 
            !text.includes('3rd+') &&
            text.length > bestContent.length) {
          
          const cleanedText = cleanTextContent(text);
          if (cleanedText.length > bestContent.length) {
            bestContent = cleanedText;
          }
        }
      }
    }
    
    if (bestContent) {
      originalContent = bestContent;
      safeLog(`[S4S] Extracted original repost content: "${originalContent.substring(0, 100)}..."`);
    }
    
    return { isRepost, originalContent };
  }

  /**
   * Extracts the degree of connection from a LinkedIn post
   * @param {string|Element} postContent - The LinkedIn post content (HTML string or DOM element)
   * @returns {string|null} - The connection degree ('1st', '2nd', '3rd', '3rd+') or null if not found
   */
  function getConnectionDegree(postContent) {
    let content;
    
    // Handle both string and DOM element inputs
    if (typeof postContent === 'string') {
      content = postContent;
    } else if (postContent instanceof Element) {
      content = postContent.innerHTML || postContent.textContent;
    } else {
      return null;
    }
    
    // Common patterns for LinkedIn connection degrees
    const degreePatterns = [
      /\b(1st|2nd|3rd|3rd\+)\b/gi,
      /\b(First|Second|Third)\s+degree\s+connection\b/gi,
      /\b(1st|2nd|3rd|3rd\+)\s+degree\b/gi,
      /\b(1st|2nd|3rd|3rd\+)\s+connection\b/gi
    ];
    
    for (const pattern of degreePatterns) {
      const match = content.match(pattern);
      if (match) {
        const degree = match[0].toLowerCase();
        
        // Normalize the result
        if (degree.includes('1st') || degree.includes('first')) {
          return '1st';
        } else if (degree.includes('2nd') || degree.includes('second')) {
          return '2nd';
        } else if (degree.includes('3rd+')) {
          return '3rd+';
        } else if (degree.includes('3rd') || degree.includes('third')) {
          return '3rd';
        }
      }
    }
    
    return null;
  }

  /**
   * Alternative function that works with DOM selectors for live LinkedIn pages
   * @param {Element} postElement - The DOM element containing the LinkedIn post
   * @returns {string|null} - The connection degree or null if not found
   */
  function getConnectionDegreeFromDOM(postElement) {
    if (!postElement) return null;
    
    // Common selectors where connection degree appears in LinkedIn posts
    const selectors = [
      '.feed-shared-actor__sub-description',
      '.update-components-actor__sub-description',
      '.feed-shared-actor__description',
      '[data-test-id="post-author-details"]',
      '.feed-shared-actor__meta',
      '.feed-shared-actor__subline',
      '.update-components-actor__description',
      '.feed-shared-actor__info',
      'span[data-test-id="actor-subline"]',
      '.feed-shared-actor__container',
      '.update-components-actor'
    ];
    
    for (const selector of selectors) {
      const element = postElement.querySelector(selector);
      if (element) {
        const degree = getConnectionDegree(element.textContent);
        if (degree) {
          safeLog(`[S4S] Found connection degree "${degree}" using selector: ${selector}`);
          return degree;
        }
      }
    }
    
    // Fallback: search the entire post element
    const fallbackDegree = getConnectionDegree(postElement);
    if (fallbackDegree) {
      safeLog(`[S4S] Found connection degree "${fallbackDegree}" using fallback search`);
      return fallbackDegree;
    }
    
    safeLog('[S4S] No connection degree found');
    return null;
  }

  // Function to extract connection degree information (legacy wrapper)
  function extractConnectionDegree(post) {
    try {
      safeLog('[S4S] Starting connection degree extraction for post');
      const result = getConnectionDegreeFromDOM(post);
      return result || '3rd'; // Return "3rd" instead of empty string for backward compatibility
    } catch (error) {
      console.error('[S4S] Error extracting connection degree:', error);
      return '3rd';
    }
  }

  /**
   * Batch process multiple LinkedIn posts
   * @param {Array<string|Element>} posts - Array of post contents or DOM elements
   * @returns {Array<{index: number, degree: string|null}>} - Array of results with indices
   */
  function getConnectionDegreesFromPosts(posts) {
    return posts.map((post, index) => ({
      index,
      degree: getConnectionDegree(post)
    }));
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
        // More aggressive character filtering - only allow basic ASCII, common punctuation, and spaces
        .replace(/[^\x20-\x7E]/g, (char) => {
          const code = char.charCodeAt(0);
          // Allow only printable ASCII (32-126) and common whitespace
          if (code >= 32 && code <= 126) {
            return char;
          }
          // Replace with space or remove
          return ' ';
        })
        // Remove any remaining weird characters that might have slipped through
        .replace(/[^\w\s.,!?;:'"()\-–—…]/g, ' ')
        // Clean up multiple spaces
        .replace(/\s+/g, ' ')
        .trim();
      
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

  // Extract post age and date
  function extractPostDateAndAge(post, index = 0) {
    let age = '';
    let postDate = null;
    let postDateString = '';

    // Look for time text patterns like "5h", "3d", "1w"
    const timeSelectors = ['time', 'span[aria-hidden="true"]', 'p'];

    for (const selector of timeSelectors) {
      const elems = post.querySelectorAll(selector);
      for (const elem of elems) {
        const text = elem.innerText?.trim() || '';

        // Match patterns like "5h •", "3d", "1w ago"
        const timeMatch = text.match(/^(\d+)([hmdwy])\s*•?/i) || text.match(/(\d+)\s*(hour|day|week|month|year)s?\s*(ago)?/i);
        if (timeMatch) {
          const value = parseInt(timeMatch[1]);
          const unit = timeMatch[2].charAt(0).toLowerCase();
          age = value + unit;

          // Calculate approximate date
          const now = new Date();
          const msMap = { m: 60000, h: 3600000, d: 86400000, w: 604800000, y: 31536000000 };
          const multiplier = msMap[unit] || (unit === 'o' ? 2592000000 : 86400000); // 'o' for month
          postDate = new Date(now.getTime() - (value * multiplier));
          postDateString = postDate.toISOString().split('T')[0];
          break;
        }

        // Check for datetime attribute
        const datetime = elem.getAttribute?.('datetime');
        if (datetime) {
          postDate = new Date(datetime);
          postDateString = postDate.toISOString().split('T')[0];
          break;
        }
      }
      if (age || postDate) break;
    }

    // Calculate age from date if we have date but no age
    if (postDate && !age) {
      const diffHours = Math.floor((Date.now() - postDate.getTime()) / 3600000);
      age = diffHours < 24 ? diffHours + 'h' : Math.floor(diffHours / 24) + 'd';
    }

    return { age, postDate: postDateString, exactDate: !!postDate };
  }





  // Improved post URL extraction function
  function extractPostUrl(post, index = 0) {
    try {
      let postUrl = '';

      // Method 0 (NEW): Decode activity URN from data-view-tracking-scope byte buffer
      // LinkedIn 2026 embeds the URN as a UTF-8 byte array in tracking scope JSON
      if (!postUrl) {
        const trackingElems = post.querySelectorAll('[data-view-tracking-scope]');
        for (const elem of trackingElems) {
          try {
            const raw = elem.getAttribute('data-view-tracking-scope');
            if (!raw) continue;

            // Try direct string match first (sometimes URN appears as plain text)
            const directMatch = raw.match(/"(?:update|sourceUpdate)Urn"\s*:\s*"(urn:li:activity:\d+)"/);
            if (directMatch) {
              postUrl = `https://www.linkedin.com/feed/update/${directMatch[1]}/`;
              break;
            }

            // Decode the byte array: "data":[123,34,...] -> JSON string -> URN
            const dataMatch = raw.match(/"data"\s*:\s*\[([^\]]+)\]/);
            if (dataMatch) {
              const bytes = dataMatch[1].split(',').map(Number);
              const jsonStr = String.fromCharCode(...bytes);
              const urnMatch = jsonStr.match(/"(?:update|sourceUpdate)Urn"\s*:\s*"(urn:li:activity:\d+)"/);
              if (urnMatch) {
                postUrl = `https://www.linkedin.com/feed/update/${urnMatch[1]}/`;
                break;
              }
            }
          } catch (e) { /* skip malformed tracking data */ }
        }
        if (postUrl && index < 3) {
          safeLog(`[S4S] Post ${index + 1} URL from tracking scope:`, postUrl);
        }
      }

      // Method 1: Look for direct post links (most reliable)
      const directPostSelectors = [
        'a[href*="/feed/update/"]',
        'a[href*="/posts/"]',
        'a[href*="/activity-"]',
        'a[data-control-name="post_link"]',
        'a[data-control-name="feed_detail"]',
        'a[data-control-name="post_click"]',
        'a[data-control-name="feed_detail_click"]'
      ];
      
      for (const selector of directPostSelectors) {
        const linkElem = post.querySelector(selector);
        if (linkElem && linkElem.href) {
          postUrl = linkElem.href;
          if (index < 3) {
            safeLog(`[S4S] Post ${index + 1} URL found via direct link (${selector}):`, postUrl);
          }
          break;
        }
      }
      
      // Method 2: Extract from timestamp/date links
      if (!postUrl) {
        const timeLinks = post.querySelectorAll('time a, a[aria-label*="ago"], .update-components-actor__sub-description a, a[data-control-name="timestamp"]');
        for (const timeLink of timeLinks) {
          if (timeLink.href && (timeLink.href.includes('/posts/') || timeLink.href.includes('/feed/update/'))) {
            postUrl = timeLink.href;
            if (index < 3) {
              safeLog(`[S4S] Post ${index + 1} URL found via timestamp link:`, postUrl);
            }
            break;
          }
        }
      }
      
      // Method 3: Look for share/comment buttons that might have post URLs
      if (!postUrl) {
        const shareButtons = post.querySelectorAll('button[data-control-name="share"], button[data-control-name="comment"], a[data-control-name="share"], a[data-control-name="comment"]');
        for (const button of shareButtons) {
          const parent = button.closest('[data-urn]') || button.parentElement;
          if (parent) {
            const dataUrn = parent.getAttribute('data-urn');
            if (dataUrn) {
              // Try to construct URL from URN
              const activityMatch = dataUrn.match(/urn:li:activity:(\d+)/);
              if (activityMatch) {
                const activityId = activityMatch[1];
                // Use the correct working LinkedIn post URL format
                postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`;
                if (index < 3) {
                  safeLog(`[S4S] Post ${index + 1} URL constructed from share button URN:`, postUrl);
                }
                break;
              }
            }
          }
        }
      }
      
      // Method 4: Look for URN-based construction with working URL format
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
              // Use the correct working LinkedIn post URL format
              postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`;
              if (index < 3) {
                safeLog(`[S4S] Post ${index + 1} URL constructed from URN:`, postUrl);
              }
            }
          }
        }
      }
      
      // Method 5: Try to find any clickable element that might lead to the post
      if (!postUrl) {
        const clickableElements = post.querySelectorAll('[data-control-name*="post"], [data-control-name*="feed"], [data-control-name*="detail"]');
        for (const elem of clickableElements) {
          // Look for href in the element or its children
          const href = elem.href || elem.querySelector('a')?.href;
          if (href && (href.includes('/posts/') || href.includes('/feed/update/') || href.includes('/activity-'))) {
            postUrl = href;
            if (index < 3) {
              safeLog(`[S4S] Post ${index + 1} URL found via clickable element:`, postUrl);
            }
            break;
          }
        }
      }
      
      // Method 6: Look for any link that contains activity ID
      if (!postUrl) {
        const allLinks = post.querySelectorAll('a[href]');
        for (const link of allLinks) {
          const href = link.href;
          if (href && href.includes('linkedin.com')) {
            // Look for activity ID in the URL
            const activityMatch = href.match(/activity-(\d+)/);
            if (activityMatch) {
              const activityId = activityMatch[1];
              postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`;
              if (index < 3) {
                safeLog(`[S4S] Post ${index + 1} URL constructed from activity ID in link:`, postUrl);
              }
              break;
            }
          }
        }
      }
      
      // Method 7: Look for author profile link and try to construct post URL
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
                safeLog(`[S4S] Post ${index + 1} fallback URL constructed:`, postUrl);
              }
            }
          }
        }
      }
      
      // Clean and validate the URL
      if (postUrl) {
        postUrl = cleanAndValidatePostUrl(postUrl);
        if (index < 3) {
          safeLog(`[S4S] Post ${index + 1} final cleaned URL:`, postUrl);
        }
      } else {
        if (index < 3) {
          safeLog(`[S4S] Post ${index + 1} - NO URL FOUND`);
          // Log available attributes for debugging
          safeLog(`[S4S] Post ${index + 1} debug info:`, {
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
  
  // Enhanced URL cleaning function (UPDATED)
  function cleanAndValidatePostUrl(url) {
    try {
      // Remove any query parameters that might cause issues
      let cleanUrl = url.split('?')[0].split('#')[0];
      
      // Ensure it's a proper LinkedIn URL
      if (!cleanUrl.includes('linkedin.com')) {
        return '';
      }
      
      // Convert old format to new format if needed
      if (cleanUrl.includes('/posts/activity-')) {
        const activityIdMatch = cleanUrl.match(/\/posts\/activity-(\d+)/);
        if (activityIdMatch) {
          const activityId = activityIdMatch[1];
          cleanUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`;
        }
      }
      
      // Ensure URN format is correct
      if (cleanUrl.includes('/feed/update/urn:li:activity:')) {
        const urnMatch = cleanUrl.match(/\/feed\/update\/urn:li:activity:(\d+)/);
        if (urnMatch) {
          const activityId = urnMatch[1];
          cleanUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`;
        }
      }
      
      // Valid LinkedIn post URL patterns
      const validPatterns = [
        '/feed/update/',
        '/posts/',
        '/activity-',
        '/pulse/', // For articles
        'urn:li:activity:' // For URN-based URLs
      ];
      
      const isValidPattern = validPatterns.some(pattern => cleanUrl.includes(pattern));
      
      if (isValidPattern) {
        // Ensure proper format for feed/update URLs
        if (cleanUrl.includes('/feed/update/') && !cleanUrl.endsWith('/')) {
          cleanUrl += '/';
        }
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

  // Normalize LinkedIn profile URLs to canonical form: https://www.linkedin.com/in/<handle>/
  function normalizeLinkedInProfileUrl(url) {
    try {
      if (!url) return '';
      if (!url.includes('linkedin.com/in/')) return url;
      // Strip query and hash
      let base = url.split('#')[0].split('?')[0];
      // Ensure starts with https://www.linkedin.com
      if (base.startsWith('http://')) base = 'https://' + base.slice(7);
      if (base.startsWith('https://linkedin.com')) base = base.replace('https://linkedin.com', 'https://www.linkedin.com');
      // Cut after /in/<handle>
      const idx = base.indexOf('/in/');
      if (idx === -1) return base;
      const after = base.slice(idx + 4);
      const handle = after.split('/')[0];
      const canonical = `https://www.linkedin.com/in/${handle}/`;
      return canonical;
    } catch (e) {
      return url;
    }
  }

  // Global variables to track scrolling state
  let isScrolling = false;
  let shouldStopScrolling = false;
  let scrollTimeoutId = null;

  async function smoothScrollFeed(speedMultiplier = 1.0) {
    isScrolling = true;
    shouldStopScrolling = false;
    
    console.log('[S4S] Starting smoothScrollFeed with speedMultiplier:', speedMultiplier);
    console.log('[S4S] Current page state - scrollHeight:', document.documentElement.scrollHeight, 'scrollY:', window.scrollY);
    
    // Wait for page to be ready and LinkedIn feed to load
    // Updated selectors for LinkedIn 2024-2026 structure
    const feedSelectors = [
      '[data-view-name="feed-full-update"]',
      'div[role="listitem"][componentkey*="Feed"]',
      '[data-id^="urn:li:activity"]',
      'div[data-urn^="urn:li:activity"]',
      '.feed-shared-update-v2',
      '.occludable-update'
    ];

    let attempts = 0;
    const maxAttempts = 10;
    let feedFound = false;

    while (attempts < maxAttempts) {
      for (const selector of feedSelectors) {
        const feedElements = document.querySelectorAll(selector);
        if (feedElements.length > 0) {
          console.log('[S4S] LinkedIn feed detected with', feedElements.length, 'elements using selector:', selector);
          feedFound = true;
          break;
        }
      }
      if (feedFound) break;

      console.log('[S4S] Waiting for LinkedIn feed to load, attempt', attempts + 1);
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    if (!feedFound) {
      console.warn('[S4S] LinkedIn feed not detected after', maxAttempts, 'attempts');
      // Log available elements for debugging
      console.log('[S4S] DEBUG - Looking for scrollable containers...');
      const mainElement = document.querySelector('main');
      const scaffoldContent = document.querySelector('.scaffold-finite-scroll__content');
      const feedContainer = document.querySelector('.feed-shared-update-v2') || document.querySelector('[class*="feed"]');
      console.log('[S4S] main element:', mainElement ? 'found' : 'not found');
      console.log('[S4S] scaffold-finite-scroll__content:', scaffoldContent ? 'found' : 'not found');
      console.log('[S4S] feed container:', feedContainer ? feedContainer.className : 'not found');

      // More aggressive discovery - find ANY elements that might be posts
      console.log('[S4S] DEBUG - Searching for any post-like elements...');
      const allDataUrn = document.querySelectorAll('[data-urn]');
      console.log('[S4S] Elements with data-urn:', allDataUrn.length);
      if (allDataUrn.length > 0) {
        console.log('[S4S] First data-urn value:', allDataUrn[0].getAttribute('data-urn'));
        console.log('[S4S] First data-urn element tag:', allDataUrn[0].tagName, allDataUrn[0].className?.substring(0, 80));
      }

      const allDataId = document.querySelectorAll('[data-id]');
      console.log('[S4S] Elements with data-id:', allDataId.length);
      if (allDataId.length > 0) {
        for (let i = 0; i < Math.min(3, allDataId.length); i++) {
          const dataIdVal = allDataId[i].getAttribute('data-id');
          if (dataIdVal && dataIdVal.includes('urn:li')) {
            console.log('[S4S] Found data-id with urn:', dataIdVal);
            console.log('[S4S] Element:', allDataId[i].tagName, allDataId[i].className?.substring(0, 80));
          }
        }
      }

      // Look for any article or div that might contain posts
      const articles = document.querySelectorAll('article');
      console.log('[S4S] Article elements:', articles.length);

      // Check for any element containing "activity" in class or data attributes
      const activityElements = document.querySelectorAll('[class*="activity"], [data-urn*="activity"], [data-id*="activity"]');
      console.log('[S4S] Elements with "activity":', activityElements.length);

      // Check main element's children to understand structure
      if (mainElement) {
        console.log('[S4S] Main element children count:', mainElement.children.length);
        for (let i = 0; i < Math.min(5, mainElement.children.length); i++) {
          const child = mainElement.children[i];
          console.log('[S4S] Main child', i, ':', child.tagName, child.className?.substring(0, 60));
        }
      }

      // Check current URL
      console.log('[S4S] Current URL:', window.location.href);
    }

    // Find the scrollable container (LinkedIn may use a custom scrollable element)
    function findScrollableContainer() {
      // Check common LinkedIn scrollable containers
      const candidates = [
        document.querySelector('main.scaffold-layout__main'),
        document.querySelector('.scaffold-layout__main'),
        document.querySelector('main'),
        document.querySelector('.authentication-outlet'),
        document.querySelector('.feed-shared-update-v2')?.closest('[class*="scaffold"]'),
        document.documentElement
      ];

      for (const candidate of candidates) {
        if (candidate && candidate.scrollHeight > candidate.clientHeight) {
          console.log('[S4S] Found scrollable container:', candidate.tagName, candidate.className?.substring(0, 50));
          return candidate;
        }
      }

      // Fallback: find any element with overflow-y: auto/scroll
      const allElements = document.querySelectorAll('main, div[class*="scaffold"], div[class*="feed"]');
      for (const el of allElements) {
        const style = window.getComputedStyle(el);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
          console.log('[S4S] Found scrollable by overflow:', el.tagName, el.className?.substring(0, 50));
          return el;
        }
      }

      console.log('[S4S] No scrollable container found, using window');
      return null; // Will use window.scrollTo
    }

    const scrollContainer = findScrollableContainer();
    const useWindowScroll = !scrollContainer || scrollContainer === document.documentElement;
    console.log('[S4S] Scroll method:', useWindowScroll ? 'window' : 'container element');

    // Anti-detection: Add random initial delay to avoid detection patterns
    const initialDelay = Math.random() * 2000 + 1000; // 1-3 seconds
    console.log('[S4S] Waiting initial delay:', initialDelay, 'ms');
    await new Promise(resolve => setTimeout(resolve, initialDelay));
    
    // Initialize height from correct element
    let lastHeight = useWindowScroll ? document.documentElement.scrollHeight : (scrollContainer ? scrollContainer.scrollHeight : document.documentElement.scrollHeight);
    let stuckCount = 0;
    const maxStuckCount = 20; // Be very patient with LinkedIn
    const maxScrollTime = 300000; // 5 minutes maximum scroll time
    const startTime = Date.now();

    const baseScrollSpeed = {
      min: Math.max(80, 80 * speedMultiplier),
      max: Math.max(250, 250 * speedMultiplier)
    };
    const scrollInterval = {
      min: Math.max(100, 300 / speedMultiplier),
      max: Math.max(200, 1200 / speedMultiplier)
    };
    let currentBaseSpeed = getRandomInRange(baseScrollSpeed.min, baseScrollSpeed.max);
    let currentInterval = getRandomInRange(scrollInterval.min, scrollInterval.max);

    console.log('[S4S] Scroll settings with speed multiplier', speedMultiplier, ':', {
      baseScrollSpeed,
      scrollInterval,
      currentBaseSpeed,
      currentInterval,
      initialHeight: lastHeight,
      scrollMethod: useWindowScroll ? 'window' : 'container'
    });

    // Track scroll position and movement patterns
    let targetScrollY = useWindowScroll ? window.scrollY : (scrollContainer ? scrollContainer.scrollTop : 0);
    let scrollPhase = 0; // 0: reading, 1: scanning, 2: pausing
    let lastPauseTime = 0;
    let scrollCount = 0;
    let lastSpeedChange = Date.now();
    
    const behaviorPatterns = {
      readingPause: { 
        min: Math.max(1000, 3000 / speedMultiplier), 
        max: Math.max(3000, 15000 / speedMultiplier) 
      },
      scanningSpeed: { min: 0.3, max: 2.0 },
      readingSpeed: { min: 0.1, max: 0.6 },
      pauseFrequency: { min: 2, max: 6 },
      pauseDuration: { 
        min: Math.max(500, 1500 / speedMultiplier), 
        max: Math.max(1000, 8000 / speedMultiplier) 
      },
      microPause: { 
        min: Math.max(50, 150 / speedMultiplier), 
        max: Math.max(200, 1200 / speedMultiplier) 
      },
      speedChangeInterval: { min: 5000, max: 15000 },
      scrollBurst: { min: 2, max: 5 },
      burstPause: { 
        min: Math.max(300, 1000 / speedMultiplier), 
        max: Math.max(500, 3000 / speedMultiplier) 
      },
      deepReadingPause: { 
        min: Math.max(2000, 8000 / speedMultiplier), 
        max: Math.max(5000, 25000 / speedMultiplier) 
      },
      quickReadPause: { 
        min: Math.max(300, 1000 / speedMultiplier), 
        max: Math.max(800, 4000 / speedMultiplier) 
      },
      interestPause: { 
        min: Math.max(1000, 5000 / speedMultiplier), 
        max: Math.max(2000, 12000 / speedMultiplier) 
      }
    };
    
    const wheelPatterns = {
      singleClick: { 
        min: Math.max(84, 84 * speedMultiplier), 
        max: Math.max(126, 126 * speedMultiplier) 
      },
      doubleClick: { 
        min: Math.max(168, 168 * speedMultiplier), 
        max: Math.max(252, 252 * speedMultiplier) 
      },
      tripleClick: { 
        min: Math.max(252, 252 * speedMultiplier), 
        max: Math.max(378, 378 * speedMultiplier) 
      },
      scrollTypeChance: speedMultiplier >= 2.0 ? 
        { single: 0.6, double: 0.3, triple: 0.1 } :
        speedMultiplier > 1.5 ? 
        { single: 0.7, double: 0.25, triple: 0.05 } :
        { single: 0.75, double: 0.2, triple: 0.05 }
    };
    
    function getRandomInRange(min, max) {
      return Math.random() * (max - min) + min;
    }
    
    function getRandomScrollType() {
      const rand = Math.random();
      if (rand < wheelPatterns.scrollTypeChance.single) {
        return 'single';
      } else if (rand < wheelPatterns.scrollTypeChance.single + wheelPatterns.scrollTypeChance.double) {
        return 'double';
      } else {
        return 'triple';
      }
    }
    
    function shouldPause() {
      // More complex pause logic to simulate reading posts
      const basePauseChance = scrollPhase === 0 ? 0.6 : 0.3; // Higher chance when reading
      
      // Increase pause chance after many scrolls (like getting tired of scrolling)
      const scrollBasedChance = Math.min(0.4, scrollCount * 0.08);
      
      // Add random reading pauses (like finding interesting content)
      const readingPauseChance = Math.random() < 0.25; // 25% chance of reading pause
      
      // Random variation
      const randomFactor = getRandomInRange(0.7, 1.3);
      
      const finalChance = (basePauseChance + scrollBasedChance) * randomFactor;
      return Math.random() < finalChance || readingPauseChance;
    }
    
    function shouldChangeSpeed() {
      const timeSinceChange = Date.now() - lastSpeedChange;
      return timeSinceChange > getRandomInRange(behaviorPatterns.speedChangeInterval.min, behaviorPatterns.speedChangeInterval.max);
    }
    
    function getCurrentSpeed() {
      // Change base speed periodically
      if (shouldChangeSpeed()) {
        currentBaseSpeed = getRandomInRange(baseScrollSpeed.min, baseScrollSpeed.max);
        currentInterval = getRandomInRange(scrollInterval.min, scrollInterval.max);
        lastSpeedChange = Date.now();
      }
      
      let speedMultiplier = 1.0;
      
      // Vary speed based on current phase
      if (scrollPhase === 0) { // Reading phase
        speedMultiplier = getRandomInRange(behaviorPatterns.readingSpeed.min, behaviorPatterns.readingSpeed.max);
      } else if (scrollPhase === 1) { // Scanning phase
        speedMultiplier = getRandomInRange(behaviorPatterns.scanningSpeed.min, behaviorPatterns.scanningSpeed.max);
      }
      
      // Add natural variation with more randomness
      speedMultiplier *= getRandomInRange(0.6, 1.4);
      
      // Calculate pixels per scroll based on current interval
      const pixelsPerScroll = Math.floor(currentBaseSpeed / (1000 / currentInterval));
      
      return Math.floor(pixelsPerScroll * speedMultiplier);
    }
    
    function getScrollDistance() {
      const scrollType = getRandomScrollType();
      let distance;
      
      switch (scrollType) {
        case 'single':
          distance = getRandomInRange(wheelPatterns.singleClick.min, wheelPatterns.singleClick.max);
          break;
        case 'double':
          distance = getRandomInRange(wheelPatterns.doubleClick.min, wheelPatterns.doubleClick.max);
          break;
        case 'triple':
          distance = getRandomInRange(wheelPatterns.tripleClick.min, wheelPatterns.tripleClick.max);
          break;
        default:
          distance = getRandomInRange(wheelPatterns.singleClick.min, wheelPatterns.singleClick.max);
      }
      
      // Add some variation based on phase
      if (scrollPhase === 0) { // Reading - smaller scrolls
        distance *= getRandomInRange(0.7, 1.0); // Less variation for more realistic wheel clicks
      } else { // Scanning - larger scrolls
        distance *= getRandomInRange(1.0, 1.3); // Slightly larger but still realistic
      }
      
      return Math.floor(distance);
    }
    
    function getScrollDelay() {
      // Base delay between mouse wheel clicks
      let delay = currentInterval;
      
      // Add natural variation to simulate human mouse wheel timing
      if (Math.random() < 0.4) { // 40% chance of slight variation
        delay += getRandomInRange(50, 300);
      }
      
      // Occasionally add longer pauses (like stopping to read)
      if (Math.random() < 0.2) { // 20% chance (increased)
        delay += getRandomInRange(1000, 3000);
      }
      
      // Rare longer pauses (like deep reading)
      if (Math.random() < 0.08) { // 8% chance (increased)
        delay += getRandomInRange(3000, 8000);
      }
      
      // Add random micro-pauses for reading (like glancing at content)
      if (Math.random() < 0.3) { // 30% chance
        delay += getRandomInRange(200, 800);
      }
      
      return Math.floor(delay);
    }
    
    function shouldDoScrollBurst() {
      // Do burst scrolling occasionally (like rapid mouse wheel clicks)
      return Math.random() < 0.25; // 25% chance - more realistic for mouse wheel
    }
    
    function getBurstScrolls() {
      return Math.floor(getRandomInRange(behaviorPatterns.scrollBurst.min, behaviorPatterns.scrollBurst.max));
    }
    
    try {
      while (!shouldStopScrolling) {
        // Check timeout
        if (Date.now() - startTime > maxScrollTime) {
          break;
        }
        
        // Check if we should stop
        if (shouldStopScrolling) {
          break;
        }
        
        // Determine current behavior phase
        const timeSinceLastPause = Date.now() - lastPauseTime;
        
        // Switch between reading and scanning phases
        if (scrollPhase === 0 && timeSinceLastPause > 15000) { // Reading for 15+ seconds
          scrollPhase = 1; // Switch to scanning
        } else if (scrollPhase === 1 && timeSinceLastPause > 10000) { // Scanning for 10+ seconds
          scrollPhase = 0; // Switch back to reading
        }
        
        // Decide if we should pause (simulating reading a post)
        if (shouldPause() && timeSinceLastPause > 2000) { // Allow more frequent pauses for reading
          let pauseDuration;
          let pauseType;
          
          // Determine type of reading pause based on probability
          const pauseTypeRand = Math.random();
          if (pauseTypeRand < 0.1) { // 10% chance of deep reading
            pauseDuration = getRandomInRange(behaviorPatterns.deepReadingPause.min, behaviorPatterns.deepReadingPause.max);
            pauseType = 'deep reading';
          } else if (pauseTypeRand < 0.3) { // 20% chance of interest pause
            pauseDuration = getRandomInRange(behaviorPatterns.interestPause.min, behaviorPatterns.interestPause.max);
            pauseType = 'interesting content';
          } else if (pauseTypeRand < 0.6) { // 30% chance of normal reading
            pauseDuration = getRandomInRange(behaviorPatterns.pauseDuration.min, behaviorPatterns.pauseDuration.max);
            pauseType = 'reading';
          } else { // 40% chance of quick read
            pauseDuration = getRandomInRange(behaviorPatterns.quickReadPause.min, behaviorPatterns.quickReadPause.max);
            pauseType = 'quick read';
          }
          
          await new Promise(resolve => setTimeout(resolve, pauseDuration));
          lastPauseTime = Date.now();
          
          // After a pause, we're likely in reading mode
          scrollPhase = 0;
          scrollCount = 0; // Reset scroll count after pause
        }
        
        // Helper function to perform scroll on the correct element
        function performScroll(targetY) {
          if (useWindowScroll) {
            window.scrollTo(0, targetY);
          } else if (scrollContainer) {
            scrollContainer.scrollTop = targetY;
          }
        }

        // Helper function to get current scroll position
        function getCurrentScrollY() {
          if (useWindowScroll) {
            return window.scrollY;
          } else if (scrollContainer) {
            return scrollContainer.scrollTop;
          }
          return 0;
        }

        // Check for scroll burst (rapid mouse wheel clicks)
        if (shouldDoScrollBurst()) {
          const burstCount = getBurstScrolls();

          for (let i = 0; i < burstCount && !shouldStopScrolling; i++) {
            const burstDistance = getScrollDistance();
            targetScrollY += burstDistance;

            // Instant scroll jump (like mouse wheel click)
            performScroll(targetScrollY);

            // Very short delay between wheel clicks (like rapid mouse wheel)
            await new Promise(resolve => setTimeout(resolve, getRandomInRange(30, 100)));
            scrollCount++;
          }

          // Pause after burst
          const burstPause = getRandomInRange(behaviorPatterns.burstPause.min, behaviorPatterns.burstPause.max);
          await new Promise(resolve => setTimeout(resolve, burstPause));

        } else {
          // Normal single mouse wheel click
          const scrollDistance = getScrollDistance();
          targetScrollY += scrollDistance;

          // Instant scroll jump (like single mouse wheel click)
          const currentY = getCurrentScrollY();
          const distance = targetScrollY - currentY;

          if (Math.abs(distance) > 5) { // Only scroll if there's meaningful distance
            // Use instant scroll for realistic mouse wheel behavior
            performScroll(targetScrollY);

            // Verify scroll actually happened
            setTimeout(() => {
              const afterScrollY = getCurrentScrollY();
              if (Math.abs(afterScrollY - targetScrollY) > 10) {
                console.warn('[S4S] Scroll may have failed - expected:', targetScrollY, 'actual:', afterScrollY);
                // Try alternative scroll methods
                if (useWindowScroll) {
                  document.documentElement.scrollTop = targetScrollY;
                  document.body.scrollTop = targetScrollY;
                } else if (scrollContainer) {
                  // Try scrollIntoView as fallback
                  const posts = document.querySelectorAll('[data-id^="urn:li:activity"], .feed-shared-update-v2, .occludable-update');
                  if (posts.length > 0) {
                    const lastPost = posts[posts.length - 1];
                    lastPost.scrollIntoView({ behavior: 'instant', block: 'end' });
                  }
                }
              }
            }, 50);

            scrollCount++;
          }
        }
        
        // Wait with variable delay
        const delay = getScrollDelay();
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Anti-detection: Randomize content check intervals
        const contentCheckInterval = Math.random() * 3000 + 4000; // 4-7 seconds
        if (Date.now() % Math.floor(contentCheckInterval) < scrollInterval) {
          // Get height from correct element
          let newHeight = useWindowScroll ? document.documentElement.scrollHeight : (scrollContainer ? scrollContainer.scrollHeight : document.documentElement.scrollHeight);
          if (newHeight === lastHeight) {
            stuckCount++;
            console.log('[S4S] Page height unchanged, stuck count:', stuckCount, '/', maxStuckCount);
            if (stuckCount >= maxStuckCount) {
              console.log('[S4S] Max stuck count reached, stopping scroll');
              break;
            }
          } else {
            stuckCount = 0;
            console.log('[S4S] New content loaded, height:', newHeight);
          }
          lastHeight = newHeight;
        }
      }
    } catch (error) {
      console.error('[S4S] Error during scrolling:', error);
    } finally {
      isScrolling = false;
      if (scrollTimeoutId) {
        clearTimeout(scrollTimeoutId);
        scrollTimeoutId = null;
      }
    }
  }

  function stopScrolling() {
    shouldStopScrolling = true;
    isScrolling = false;
    if (scrollTimeoutId) {
      clearTimeout(scrollTimeoutId);
      scrollTimeoutId = null;
    }
  }

  // Debug function to test connection degree extraction
  function debugConnectionDegree() {
    // Use updated selectors
    const posts = document.querySelectorAll('[data-id^="urn:li:activity"], div[data-urn^="urn:li:activity"], .feed-shared-update-v2, .occludable-update');
    
    for (let i = 0; i < Math.min(posts.length, 3); i++) {
      const post = posts[i];
      
      // Test both the new and legacy functions
      const newResult = getConnectionDegreeFromDOM(post);
      const legacyResult = extractConnectionDegree(post);
      
      // Also test with text content
      const textResult = getConnectionDegree(post.textContent);
    }
  }

  // Debug function for repost detection
  function debugRepostDetection() {
    // Use updated selectors
    const posts = document.querySelectorAll('[data-id^="urn:li:activity"], div[data-urn^="urn:li:activity"], .feed-shared-update-v2, .occludable-update');
    
    posts.forEach((post, index) => {
      const repostInfo = detectAndExtractRepostContent(post);
      
      if (repostInfo.isRepost) {
        // Repost detected
      }
    });
  }

  // Debug function for testing scroll functionality
  function debugScrollTest() {
    console.log('[S4S] === SCROLL DEBUG TEST ===');
    console.log('[S4S] Page ready state:', document.readyState);
    console.log('[S4S] Current scroll position (window):', window.scrollY);
    console.log('[S4S] Page height (document):', document.documentElement.scrollHeight);
    console.log('[S4S] Window height:', window.innerHeight);
    console.log('[S4S] Can scroll (window):', document.documentElement.scrollHeight > window.innerHeight);

    // Test all post selectors
    const allSelectors = [
      '[data-id^="urn:li:activity"]',
      'div[data-urn^="urn:li:activity"]',
      '.feed-shared-update-v2',
      '.occludable-update',
      '[data-urn*="urn:li:activity"]',
      '.scaffold-finite-scroll__content > div',
      'div.feed-shared-update-v2[data-urn*="activity"]',
      'article.feed-shared-update-v2[data-urn*="activity"]'
    ];

    console.log('[S4S] Testing post selectors:');
    for (const selector of allSelectors) {
      const elements = document.querySelectorAll(selector);
      console.log(`[S4S]   ${selector}: ${elements.length} elements`);
    }

    // Find scrollable containers
    console.log('[S4S] Checking scrollable containers:');
    const mainEl = document.querySelector('main');
    const scaffoldMain = document.querySelector('.scaffold-layout__main');
    const authOutlet = document.querySelector('.authentication-outlet');

    if (mainEl) {
      console.log('[S4S]   main: scrollHeight=' + mainEl.scrollHeight + ', clientHeight=' + mainEl.clientHeight);
    }
    if (scaffoldMain) {
      console.log('[S4S]   .scaffold-layout__main: scrollHeight=' + scaffoldMain.scrollHeight + ', clientHeight=' + scaffoldMain.clientHeight);
    }
    if (authOutlet) {
      console.log('[S4S]   .authentication-outlet: scrollHeight=' + authOutlet.scrollHeight + ', clientHeight=' + authOutlet.clientHeight);
    }

    // Test basic scroll functionality on window
    const testScrollY = window.scrollY + 100;
    console.log('[S4S] Testing window.scrollTo:', testScrollY);
    window.scrollTo(0, testScrollY);

    setTimeout(() => {
      console.log('[S4S] After test scroll (window):', window.scrollY);
      console.log('[S4S] Window scroll test result:', Math.abs(window.scrollY - testScrollY) < 10 ? 'SUCCESS' : 'FAILED');

      // If window scroll failed, try scrolling main element
      if (Math.abs(window.scrollY - testScrollY) > 10 && mainEl) {
        console.log('[S4S] Trying to scroll main element...');
        const mainBefore = mainEl.scrollTop;
        mainEl.scrollTop = mainBefore + 100;
        setTimeout(() => {
          console.log('[S4S] Main element scroll test:', mainEl.scrollTop > mainBefore ? 'SUCCESS' : 'FAILED');
        }, 100);
      }
    }, 100);

    // Check for potential blockers
    const bodyStyle = window.getComputedStyle(document.body);
    console.log('[S4S] Body overflow:', bodyStyle.overflow);

    console.log('[S4S] === END SCROLL DEBUG TEST ===');
  }

  // Make debug functions available globally
  window.debugRepostDetection = debugRepostDetection;
  window.debugScrollTest = debugScrollTest;

  // Listen for messages from popup or background
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    
    try {
      if (msg.action === "extractPosts") {
        // Use timeout for extraction
        const extractionPromise = extractPosts();
        
        withTimeout(extractionPromise, 30000) // Increased timeout for menu interactions
          .then(posts => {
            sendResponse({ posts: posts });
          })
          .catch(error => {
            console.error('[S4S] Extraction timeout:', error);
            sendResponse({ posts: [], error: error.message });
          });
        
        return true; // Asynchronous response
      }

      if (msg.action === "performSingleScroll") {
        const speedMultiplier = msg.speedMultiplier || 1.0;
        console.log('[S4S] Starting scroll with speed multiplier:', speedMultiplier);
        
        // Check if already scrolling
        if (isScrolling) {
          console.warn('[S4S] Already scrolling, ignoring new scroll request');
          sendResponse({ success: false, message: "Already scrolling" });
          return false;
        }
        
        // Validate page state before starting
        if (document.readyState !== 'complete') {
          console.warn('[S4S] Page not fully loaded, waiting...');
          window.addEventListener('load', () => {
            smoothScrollFeed(speedMultiplier).then(() => {
              console.log('[S4S] Scroll operation completed');
            }).catch(error => {
              console.error('[S4S] Error in performSingleScroll:', error);
            });
          });
        } else {
          smoothScrollFeed(speedMultiplier).then(() => {
            console.log('[S4S] Scroll operation completed');
          }).catch(error => {
            console.error('[S4S] Error in performSingleScroll:', error);
          });
        }
        
        sendResponse({ success: true, message: "Scrolling started in background" });
        return false;
      }

      if (msg.action === "stopScroll") {
        stopScrolling();
        sendResponse({ success: true, message: "Scrolling stopped" });
        return false; // Synchronous response
      }

      if (msg.action === "ping") {
        sendResponse({ success: true, message: "Content script is ready", timestamp: Date.now() });
        return false; // Synchronous response
      }

      if (msg.action === "debugConnectionDegree") {
        debugConnectionDegree();
        sendResponse({ success: true, message: "Debug completed - check console" });
        return false; // Synchronous response
      }

      if (msg.action === "debugRepostDetection") {
        debugRepostDetection();
        sendResponse({ success: true, message: "Repost debug completed - check console" });
        return false; // Synchronous response
      }

      if (msg.action === "debugScrollTest") {
        debugScrollTest();
        sendResponse({ success: true, message: "Scroll debug test completed - check console" });
        return false; // Synchronous response
      }

      if (msg.action === "testRefresh") {
        // This will be handled by the popup script
        sendResponse({ success: true, message: "Refresh test request received" });
        return false; // Synchronous response
      }
      
    } catch (error) {
      console.error('[S4S] Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
    
    return false; // Default to synchronous response
  });
}