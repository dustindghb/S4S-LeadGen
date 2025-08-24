// Prevent multiple injections of this script
if (window.S4S_CONTENT_SCRIPT_LOADED) {
  // Content script already loaded, exit early
  console.log('[S4S] Content script already loaded, skipping re-initialization');
} else {
  window.S4S_CONTENT_SCRIPT_LOADED = true;

// Anti-detection: Disable console logging in production
const DEBUG_MODE = false; // Set to false to disable all console logging

function safeLog(...args) {
  if (DEBUG_MODE) {
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
        
        // More targeted approach to find the post author's name and profile
        let name = '';
        let linkedinUrl = '';
        let nameContainer = null;
        
        // First, try to find the specific author name element with the exact class
        const authorNameElement = post.querySelector('span.sExBUDsubYecFzuEceaNRAkkGmqOjwDiPLAo span[aria-hidden="true"]');
        
        if (authorNameElement && authorNameElement.innerText.trim()) {
          name = authorNameElement.innerText.trim();
          
          // Find the closest container that should hold the profile link
          nameContainer = authorNameElement.closest('.feed-shared-actor__container, .update-components-actor, [class*="actor"]');
          
          if (nameContainer) {
            // Look for the profile link within this specific container
            const profileSelectors = [
              'a[data-control-name="actor_profile"]',
              'a[href*="/in/"]',
              'a[href*="linkedin.com/in/"]'
            ];
            
            for (const profileSelector of profileSelectors) {
              const profileLink = nameContainer.querySelector(profileSelector);
              if (profileLink && profileLink.href) {
                linkedinUrl = profileLink.href;
                break;
              }
            }
          }
        }
        
        // If we didn't find the specific author name, try broader search
        if (!name || !linkedinUrl) {
          
          // Try to find the main actor/author container
          const actorContainers = [
            '.feed-shared-actor__container',
            '.update-components-actor',
            '[class*="actor"]',
            '.feed-shared-actor'
          ];
          
          for (const containerSelector of actorContainers) {
            const container = post.querySelector(containerSelector);
            if (container) {
              
              // Look for the author's name within this container
              const nameSelectors = [
                'span.feed-shared-actor__name',
                'a[data-control-name="actor_profile"] span',
                'span[aria-hidden="true"]',
                'span.t-bold',
                'span[class*="name"]'
              ];
              
              for (const nameSelector of nameSelectors) {
                const nameElem = container.querySelector(nameSelector);
                if (nameElem && nameElem.innerText.trim() && nameElem.innerText.trim().length > 0) {
                  const candidateName = nameElem.innerText.trim();
                  // Filter out common non-name text
                  if (candidateName.length > 1 && 
                      candidateName.length < 50 && 
                      !candidateName.includes('•') &&
                      !candidateName.includes('Follow') &&
                      !candidateName.includes('Connect')) {
                    name = candidateName;
                    nameContainer = container;
                    break;
                  }
                }
              }
              
              // If we found a name, look for the corresponding profile link
              if (name) {
                const profileSelectors = [
                  'a[data-control-name="actor_profile"]',
                  'a[href*="/in/"]',
                  'a[href*="linkedin.com/in/"]'
                ];
                
                for (const profileSelector of profileSelectors) {
                  const profileLink = container.querySelector(profileSelector);
                  if (profileLink && profileLink.href) {
                    linkedinUrl = profileLink.href;
                    break;
                  }
                }
                break; // Found both name and container, exit
              }
            }
          }
        }
        
        // Check if this is an embedded post and extract inner post information
        const embeddedPostInfo = detectAndExtractRepostContent(post);
        if (embeddedPostInfo.isRepost) {
          safeLog(`[S4S] Post ${index + 1} is an embedded post, prioritizing inner post information`);
          
          // Store the container's information as fallback
          const containerName = name;
          const containerLinkedinUrl = linkedinUrl;
          
          // Look for inner post's author name within embedded post containers
          const innerAuthorSelectors = [
            // Nested embedded post author names (prioritize these)
            '.feed-shared-update-v2__content .feed-shared-update-v2 .feed-shared-actor__name',
            '.feed-shared-update-v2__content .feed-shared-update-v2 .update-components-actor__name',
            '.feed-shared-update-v2__content article .feed-shared-actor__name',
            '.feed-shared-update-v2__content article .update-components-actor__name',
            
            // Quote author names
            '.feed-shared-update-v2__content .feed-shared-update-v2__description .feed-shared-actor__name',
            '.feed-shared-update-v2__content .feed-shared-update-v2__description .update-components-actor__name',
            
            // Repost author names
            '.feed-shared-update-v2__content .feed-shared-actor__name',
            '.feed-shared-update-v2__content .update-components-actor__name',
            '.feed-shared-update-v2__content span[class*="name"]',
            '[data-test-id="repost-content"] .feed-shared-actor__name',
            '[data-test-id="repost-content"] .update-components-actor__name',
            '.repost-content .feed-shared-actor__name',
            '.repost-content .update-components-actor__name',
            '.shared-update-content .feed-shared-actor__name',
            '.shared-update-content .update-components-actor__name'
          ];
          
          // Try to find inner post author name
          for (const selector of innerAuthorSelectors) {
            const authorElem = post.querySelector(selector);
            if (authorElem && authorElem.innerText.trim()) {
              const innerName = authorElem.innerText.trim();
              if (innerName.length > 1 && innerName.length < 50 && innerName !== containerName) {
                name = innerName;
                safeLog(`[S4S] Post ${index + 1} found inner post author name: "${name}" (was: "${containerName}")`);
                break;
              }
            }
          }
          
          // Look for inner post's LinkedIn profile URL
          const innerProfileSelectors = [
            // Nested embedded post profile URLs (prioritize these)
            '.feed-shared-update-v2__content .feed-shared-update-v2 a[href*="/in/"]',
            '.feed-shared-update-v2__content .feed-shared-update-v2 a[data-control-name="actor_profile"]',
            '.feed-shared-update-v2__content article a[href*="/in/"]',
            '.feed-shared-update-v2__content article a[data-control-name="actor_profile"]',
            
            // Quote profile URLs
            '.feed-shared-update-v2__content .feed-shared-update-v2__description a[href*="/in/"]',
            '.feed-shared-update-v2__content .feed-shared-update-v2__description a[data-control-name="actor_profile"]',
            
            // Repost profile URLs
            '.feed-shared-update-v2__content a[href*="/in/"]',
            '.feed-shared-update-v2__content a[data-control-name="actor_profile"]',
            '[data-test-id="repost-content"] a[href*="/in/"]',
            '[data-test-id="repost-content"] a[data-control-name="actor_profile"]',
            '.repost-content a[href*="/in/"]',
            '.repost-content a[data-control-name="actor_profile"]',
            '.shared-update-content a[href*="/in/"]',
            '.shared-update-content a[data-control-name="actor_profile"]'
          ];
          
          // Try to find inner post profile URL
          for (const selector of innerProfileSelectors) {
            const profileElem = post.querySelector(selector);
            if (profileElem && profileElem.href && profileElem.href !== containerLinkedinUrl) {
              linkedinUrl = profileElem.href;
              safeLog(`[S4S] Post ${index + 1} found inner post profile URL: "${linkedinUrl}" (was: "${containerLinkedinUrl}")`);
              break;
            }
          }
        }
        
        // Fallback: if we didn't find both name and profile, try broader search
        if (!name || !linkedinUrl) {
          // Try to find any profile link in the post
          if (!linkedinUrl) {
            const anyProfile = post.querySelector('a[href*="/in/"]');
            if (anyProfile && anyProfile.href) {
              linkedinUrl = anyProfile.href;
            }
          }
          
          // Try to find any name in the post
          if (!name) {
            const anyName = post.querySelector('span[aria-hidden="true"]');
            if (anyName && anyName.innerText.trim()) {
              const candidateName = anyName.innerText.trim();
              if (candidateName.length > 1 && candidateName.length < 50) {
                name = candidateName;
              }
            }
          }
        }
        
        // Extract professional information - focused on headline
        let headline = '';
        let age = '';
        
        // Extract date and age using enhanced function
        const dateInfo = extractPostDateAndAge(post, index);
        const extractedAge = dateInfo.age;
        const postDate = dateInfo.postDate;
        const exactDate = dateInfo.exactDate;
        
        if (index < 3) {
          safeLog(`[S4S] Post ${index + 1} extracted data:`, {
            age: extractedAge,
            postDate: postDate,
            exactDate: exactDate
          });
        }
        
        // Extract headline using the specific HTML structure provided
        const headlineSelectors = [
          '.update-components-actor__description span[aria-hidden="true"]',
          '.feed-shared-actor__subline span[aria-hidden="true"]',
          '.feed-shared-actor__description span[aria-hidden="true"]',
          'span[data-test-id="actor-subline"] span[aria-hidden="true"]',
          'span[aria-hidden="true"]'
        ];
        
        // Also check for connection degree in headline elements
        let foundConnectionDegree = '';
        
        safeLog(`[S4S] Post ${index + 1} headline extraction - name: "${name}"`);
        
        for (const selector of headlineSelectors) {
          const headlineElem = post.querySelector(selector);
          if (headlineElem && headlineElem.innerText.trim()) {
            const text = headlineElem.innerText.trim();
            safeLog(`[S4S] Post ${index + 1} found headline candidate: "${text}" using selector: ${selector}`);
            
            // Check for connection degree in this text
            if (!foundConnectionDegree) {
              const connectionMatch = text.match(/\b(1st|2nd|3rd\+?)\b/i);
              if (connectionMatch) {
                foundConnectionDegree = connectionMatch[1];
                safeLog(`[S4S] Found connection degree in headline element: ${foundConnectionDegree}`);
              }
            }
            
            // Less restrictive filtering - just check if it's not the name and has reasonable length
            if (text && 
                text !== name && 
                text.length > 2 && 
                text.length < 200) {
              headline = text;
              safeLog(`[S4S] Post ${index + 1} selected headline: "${headline}"`);
              break;
            } else {
              safeLog(`[S4S] Post ${index + 1} rejected headline candidate: "${text}" (reason: ${text === name ? 'same as name' : text.length <= 2 ? 'too short' : 'too long'})`);
            }
          }
        }
        
        // Fallback headline extraction
        if (!headline) {
          safeLog(`[S4S] Post ${index + 1} trying fallback headline extraction`);
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
              safeLog(`[S4S] Post ${index + 1} fallback headline candidate: "${text}" using selector: ${selector}`);
              
              if (text && 
                  text !== name && 
                  text.length > 2 && 
                  text.length < 200) {
                headline = text;
                safeLog(`[S4S] Post ${index + 1} selected fallback headline: "${headline}"`);
                break;
              }
            }
          }
        }
        
        if (headline) {
          headline = headline
            .replace(/\s+•\s+.*$/, '')
            .trim();
          safeLog(`[S4S] Post ${index + 1} final cleaned headline: "${headline}"`);
        } else {
          safeLog(`[S4S] Post ${index + 1} no headline found`);
        }
        
        // Extract content - including reposted content
        const contentSelectors = [
          'div.feed-shared-update-v2__description',
          'div.feed-shared-text',
          'span.break-words',
          'div[data-test-id="post-content"]',
          '.feed-shared-update-v2__description-wrapper'
        ];
        
        let content = '';
        let contentFilteredReason = '';
        
        // First, try to extract the main post content
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
              safeLog(`[S4S] Post ${index + 1} found main content: "${content.substring(0, 100)}..."`);
              break;
            } else {
              contentFilteredReason = `Filtered out by length/keywords (length: ${text.length}, text: '${text.slice(0, 40)}...')`;
              safeLog(`[S4S] Post ${index + 1} content found but filtered:`, contentFilteredReason);
            }
          }
        }
        
        // Check if this is a repost but prioritize outer post content
        const repostInfo = detectAndExtractRepostContent(post);
        
        // For embedded posts, prioritize outer post content over inner post content
        if (repostInfo.isRepost) {
          safeLog(`[S4S] Post ${index + 1} is an embedded post, prioritizing outer post content`);
          
          // If we have outer post content, use it (even if short)
          if (content && content.length > 0) {
            safeLog(`[S4S] Post ${index + 1} using outer post content: "${content.substring(0, 100)}..."`);
          } else {
            // Only look for inner post content if outer post has no content at all
            safeLog(`[S4S] Post ${index + 1} outer post has no content, looking for inner post content...`);
            
            if (repostInfo.originalContent) {
              content = repostInfo.originalContent;
              safeLog(`[S4S] Post ${index + 1} using inner post content as fallback: "${content.substring(0, 100)}..."`);
            }
          }
        } else {
          // For regular posts, if main content is empty or very short, look for additional content
          if (!content || content.length < 50) {
            safeLog(`[S4S] Post ${index + 1} main content is empty or short, looking for additional content...`);
            
            if (repostInfo.originalContent) {
              content = repostInfo.originalContent;
              safeLog(`[S4S] Post ${index + 1} using detected additional content: "${content.substring(0, 100)}..."`);
            }
          }
        }
        
        // If we have both repost commentary and original content, combine them intelligently
        if (repostInfo.isRepost && repostInfo.originalContent && content && content !== repostInfo.originalContent) {
          const commentary = content;
          const originalContent = repostInfo.originalContent;
          
          // Combine them with clear separation
          content = `${commentary}\n\n--- Original Post ---\n${originalContent}`;
          safeLog(`[S4S] Post ${index + 1} combined repost commentary with original content`);
        }
        
        // If still no content, try to find any meaningful text in the post
        if (!content || content.length < 20) {
          safeLog(`[S4S] Post ${index + 1} still no content, trying broader search...`);
          
          // Look for any text content that might be meaningful
          const allTextElements = post.querySelectorAll('div, span, p');
          let bestContent = '';
          
          for (const elem of allTextElements) {
            const text = elem.innerText.trim();
            if (text && text.length > 30 && 
                !text.includes('Follow') && 
                !text.includes('Connect') && 
                !text.includes('•') && 
                !text.includes('1st') && 
                !text.includes('2nd') && 
                !text.includes('3rd+') &&
                !text.includes(name) && // Don't include the author name
                text.length > bestContent.length) {
              
              const cleanedText = cleanTextContent(text);
              if (cleanedText.length > bestContent.length) {
                bestContent = cleanedText;
              }
            }
          }
          
          if (bestContent && bestContent.length > content.length) {
            content = bestContent;
            safeLog(`[S4S] Post ${index + 1} found content via broad search: "${content.substring(0, 100)}..."`);
          }
        }
        
        // Debug log if content is still empty after all selectors
        if (!content) {
          safeLog(`[S4S] Post ${index + 1} content is empty after all selectors.`, contentFilteredReason, 'Post outerHTML:', post.outerHTML.slice(0, 1000));
        } else {
          safeLog(`[S4S] Post ${index + 1} final content length: ${content.length} characters`);
        }
        
        // Clean headline text as well
        if (headline) {
          headline = cleanTextContent(headline);
        }
        
        // Extract connection degree
        let connectionDegree = extractConnectionDegree(post);
        
        // If not found by dedicated extraction, use the one found in headline elements
        if (!connectionDegree && foundConnectionDegree) {
          connectionDegree = foundConnectionDegree;
          safeLog(`[S4S] Using connection degree from headline element: ${connectionDegree}`);
        }
        
        // Default to "3rd" if no connection degree found
        if (!connectionDegree) {
          connectionDegree = '3rd';
          safeLog(`[S4S] No connection degree found, defaulting to "3rd"`);
        }
        
        safeLog(`[S4S] Post ${index + 1} final connection degree: "${connectionDegree}"`);
        
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
            connectionDegree: connectionDegree || 'Unknown' // Add connection degree to post data
          });
        }
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
      'thought this was worth sharing',
      
      // Additional indicators for embedded posts
      'hiring',
      'job',
      'position',
      'opportunity',
      'team',
      'recruiting',
      'looking for',
      'seeking',
      'open position'
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
    
    // Enhanced detection: Look for specific inner post structure patterns
    if (!isRepost) {
      // Check for nested actor containers (indicates embedded post)
      const nestedActorContainers = post.querySelectorAll('.feed-shared-update-v2__content .update-components-actor__container, .feed-shared-update-v2__content .feed-shared-actor__container');
      if (nestedActorContainers.length > 0) {
        isRepost = true;
        safeLog(`[S4S] Detected nested actor containers (${nestedActorContainers.length} found)`);
      }
      
      // Check for nested post structures with meta information
      const nestedMetaInfo = post.querySelectorAll('.feed-shared-update-v2__content .update-components-actor__meta, .feed-shared-update-v2__content .feed-shared-actor__meta');
      if (nestedMetaInfo.length > 0) {
        isRepost = true;
        safeLog(`[S4S] Detected nested meta information (${nestedMetaInfo.length} found)`);
      }
      
      // Check for nested post descriptions (like "Sales Recruiting Lead, Latina & Nature Enthusiast")
      const nestedDescriptions = post.querySelectorAll('.feed-shared-update-v2__content .update-components-actor__description, .feed-shared-update-v2__content .feed-shared-actor__description');
      if (nestedDescriptions.length > 0) {
        isRepost = true;
        safeLog(`[S4S] Detected nested descriptions (${nestedDescriptions.length} found)`);
      }
      
      // Check for nested sub-descriptions (like "11h • globe-americas")
      const nestedSubDescriptions = post.querySelectorAll('.feed-shared-update-v2__content .update-components-actor__sub-description, .feed-shared-update-v2__content .feed-shared-actor__sub-description');
      if (nestedSubDescriptions.length > 0) {
        isRepost = true;
        safeLog(`[S4S] Detected nested sub-descriptions (${nestedSubDescriptions.length} found)`);
      }
    }
    
    // Look for repost-specific DOM structure
    const repostStructureSelectors = [
      '.feed-shared-update-v2__content',
      '.feed-shared-update-v2__content-wrapper',
      '[data-test-id="repost-content"]',
      '.repost-content',
      '.shared-update-content',
      
      // Specific inner post indicators from the provided HTML
      '.update-components-actor__container', // Inner post actor container
      '.update-components-actor__meta', // Inner post meta information
      '.update-components-actor__title', // Inner post title
      '.update-components-actor__description', // Inner post description
      '.update-components-actor__sub-description', // Inner post sub-description
      
      // Nested post structures
      '.feed-shared-update-v2__content .update-components-actor__container',
      '.feed-shared-update-v2__content .feed-shared-actor__container',
      '.feed-shared-update-v2__content article',
      '.feed-shared-update-v2__content .feed-shared-update-v2',
      
      // Quote and embedded post structures
      '.feed-shared-update-v2__description .update-components-actor__container',
      '.feed-shared-update-v2__description .feed-shared-actor__container'
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

  // Enhanced function to extract both age and actual date
  function extractPostDateAndAge(post, index = 0) {
    let age = '';
    let postDate = null;
    let postDateString = '';
    
    safeLog(`[S4S] Starting date extraction for post ${index + 1}`);
    
    const timeSelectors = [
      'time',
      'span[class*="time"]',
      'span[class*="ago"]',
      '.feed-shared-actor__subline time',
      '.feed-shared-actor__description time',
      '.update-components-actor__sub-description span[aria-hidden="true"]',
      'span[aria-hidden="true"]',
      '.feed-shared-actor__subline span[aria-hidden="true"]',
      '.update-components-actor__sub-description span[aria-hidden="true"]'
    ];
    
    // First, try to get the actual timestamp from HTML attributes
    for (const selector of timeSelectors) {
      const timeElems = post.querySelectorAll(selector);
      safeLog(`[S4S] Post ${index + 1} found ${timeElems.length} elements with selector: ${selector}`);
      
      for (const timeElem of timeElems) {
        // Check for datetime attribute (most reliable)
        const datetime = timeElem.getAttribute('datetime');
        if (datetime) {
          safeLog(`[S4S] Post ${index + 1} found datetime:`, datetime);
          postDate = new Date(datetime);
          postDateString = postDate.toISOString().split('T')[0]; // YYYY-MM-DD format
          safeLog(`[S4S] Post ${index + 1} exact date from datetime:`, postDateString);
          break;
        }
        
        // Check for timestamp in data attributes
        const timestamp = timeElem.getAttribute('data-timestamp') || 
                         timeElem.getAttribute('data-time') ||
                         timeElem.getAttribute('data-date');
        if (timestamp) {
          safeLog(`[S4S] Post ${index + 1} found timestamp:`, timestamp);
          postDate = new Date(parseInt(timestamp) * 1000); // Convert Unix timestamp
          postDateString = postDate.toISOString().split('T')[0];
          safeLog(`[S4S] Post ${index + 1} exact date from timestamp:`, postDateString);
          break;
        }
        
        // Check for title attribute with full date
        const title = timeElem.getAttribute('title');
        if (title && title.includes(',')) {
          safeLog(`[S4S] Post ${index + 1} found title:`, title);
          try {
            postDate = new Date(title);
            if (!isNaN(postDate)) {
              postDateString = postDate.toISOString().split('T')[0];
              safeLog(`[S4S] Post ${index + 1} exact date from title:`, postDateString);
              break;
            }
          } catch (e) {
            safeLog(`[S4S] Post ${index + 1} failed to parse title date:`, e);
          }
        }
      }
      if (postDate) break;
    }
    
    // If we couldn't get exact date, extract age and calculate approximate date
    if (!postDate) {
      safeLog(`[S4S] No exact date found, calculating from age for post ${index + 1}`);
      
      for (const selector of timeSelectors) {
        const timeElems = post.querySelectorAll(selector);
        for (const timeElem of timeElems) {
          if (timeElem && timeElem.innerText.trim()) {
            const text = timeElem.innerText.trim();
            safeLog(`[S4S] Post ${index + 1} time text: "${text}"`);
            
            // Extract age as before
            if (text.match(/\d+[hmdw]/) || text.includes('ago') || text.includes('min') || text.includes('hour') || text.includes('day') || text.includes('week') || text.includes('month') || text.includes('year')) {
              safeLog(`[S4S] Post ${index + 1} text matches time pattern: "${text}"`);
              
              let timeMatch = text.match(/(\d+)\s*(min|minute|hour|day|week|month|year)s?/i);
              if (!timeMatch) {
                timeMatch = text.match(/(\d+[hmdw])/);
              }
              
              safeLog(`[S4S] Post ${index + 1} timeMatch:`, timeMatch);
              
              if (timeMatch) {
                const value = parseInt(timeMatch[1]);
                const unit = timeMatch[2] ? timeMatch[2].toLowerCase() : timeMatch[1].slice(-1);
                
                age = value + (timeMatch[2] ? timeMatch[2].charAt(0) : unit);
                safeLog(`[S4S] Post ${index + 1} extracted age: "${age}" (value: ${value}, unit: ${unit})`);
                
                // Calculate approximate date
                const now = new Date();
                switch (unit.charAt(0)) {
                  case 'm':
                    if (unit === 'min' || unit === 'minute') {
                      postDate = new Date(now.getTime() - (value * 60 * 1000));
                    } else { // month
                      postDate = new Date(now.getTime() - (value * 30 * 24 * 60 * 60 * 1000));
                    }
                    break;
                  case 'h':
                    postDate = new Date(now.getTime() - (value * 60 * 60 * 1000));
                    break;
                  case 'd':
                    postDate = new Date(now.getTime() - (value * 24 * 60 * 60 * 1000));
                    break;
                  case 'w':
                    postDate = new Date(now.getTime() - (value * 7 * 24 * 60 * 60 * 1000));
                    break;
                  case 'y':
                    postDate = new Date(now.getTime() - (value * 365 * 24 * 60 * 60 * 1000));
                    break;
                }
                
                if (postDate) {
                  postDateString = postDate.toISOString().split('T')[0];
                  safeLog(`[S4S] Post ${index + 1} calculated date:`, postDateString, 'from age:', age);
                }
                break;
              } else {
                safeLog(`[S4S] Post ${index + 1} no time match found for text: "${text}"`);
              }
            } else {
              safeLog(`[S4S] Post ${index + 1} text does not match time pattern: "${text}"`);
            }
          }
        }
        if (age) break;
      }
    }
    
    // If we have exact date but no age, calculate age from date
    if (postDate && !age) {
      const now = new Date();
      const diffMs = now.getTime() - postDate.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffMinutes < 60) {
        age = diffMinutes + 'm';
      } else if (diffHours < 24) {
        age = diffHours + 'h';
      } else {
        age = diffDays + 'd';
      }
    }
    
    const result = {
      age: age,
      postDate: postDateString,
      exactDate: !!postDate // boolean indicating if we found exact date vs calculated
    };
    
    safeLog(`[S4S] Post ${index + 1} final result:`, result);
    
    return result;
  }





  // Improved post URL extraction function
  // Improved post URL extraction function
  function extractPostUrl(post, index = 0) {
    try {
      let postUrl = '';
      
      // Debug logging for first few posts
      if (index < 3) {
        safeLog(`[S4S] Analyzing post ${index + 1} for URL extraction`);
      }
      
      // Method 1: Look for outer post links first (prioritize the container post)
      const outerPostSelectors = [
        // Outer post specific selectors (prioritize these) - exclude nested content
        '.feed-shared-update-v2 > a[href*="/feed/update/"]',
        '.feed-shared-update-v2 > a[href*="/posts/"]',
        '.feed-shared-update-v2 > a[href*="/activity-"]',
        '.feed-shared-update-v2 > a[data-control-name="post_link"]',
        '.feed-shared-update-v2 > a[data-control-name="feed_detail"]',
        '.feed-shared-update-v2 > a[data-control-name="post_click"]',
        '.feed-shared-update-v2 > a[data-control-name="feed_detail_click"]',
        
        // Direct child selectors to avoid nested content
        '> a[href*="/feed/update/"]',
        '> a[href*="/posts/"]',
        '> a[href*="/activity-"]',
        '> a[data-control-name="post_link"]',
        '> a[data-control-name="feed_detail"]',
        '> a[data-control-name="post_click"]',
        '> a[data-control-name="feed_detail_click"]',
        
        // General post links (fallback) - but exclude nested content
        'a[href*="/feed/update/"]:not(.feed-shared-update-v2__content a)',
        'a[href*="/posts/"]:not(.feed-shared-update-v2__content a)',
        'a[href*="/activity-"]:not(.feed-shared-update-v2__content a)',
        'a[data-control-name="post_link"]:not(.feed-shared-update-v2__content a)',
        'a[data-control-name="feed_detail"]:not(.feed-shared-update-v2__content a)',
        'a[data-control-name="post_click"]:not(.feed-shared-update-v2__content a)',
        'a[data-control-name="feed_detail_click"]:not(.feed-shared-update-v2__content a)'
      ];
      
      for (const selector of outerPostSelectors) {
        const linkElem = post.querySelector(selector);
        if (linkElem && linkElem.href) {
          postUrl = linkElem.href;
          if (index < 3) {
            safeLog(`[S4S] Post ${index + 1} URL found via outer post link (${selector}):`, postUrl);
          }
          break;
        }
      }
      
      // Method 2: Extract from outer post timestamp/date links (prioritize container timestamps)
      if (!postUrl) {
        const outerTimeSelectors = [
          // Outer post timestamp selectors (prioritize these) - exclude nested content
          '.feed-shared-update-v2 > time a',
          '.feed-shared-update-v2 > a[aria-label*="ago"]',
          '.feed-shared-update-v2 > .update-components-actor__sub-description a',
          '.feed-shared-update-v2 > a[data-control-name="timestamp"]',
          
          // Direct child selectors to avoid nested content
          '> time a',
          '> a[aria-label*="ago"]',
          '> .update-components-actor__sub-description a',
          '> a[data-control-name="timestamp"]',
          
          // General timestamp selectors (fallback) - but exclude nested content
          'time a:not(.feed-shared-update-v2__content time a)',
          'a[aria-label*="ago"]:not(.feed-shared-update-v2__content a[aria-label*="ago"])',
          '.update-components-actor__sub-description a:not(.feed-shared-update-v2__content .update-components-actor__sub-description a)',
          'a[data-control-name="timestamp"]:not(.feed-shared-update-v2__content a[data-control-name="timestamp"])'
        ];
        
        for (const selector of outerTimeSelectors) {
          const timeLinks = post.querySelectorAll(selector);
          for (const timeLink of timeLinks) {
            if (timeLink.href && (timeLink.href.includes('/posts/') || timeLink.href.includes('/feed/update/'))) {
              postUrl = timeLink.href;
              if (index < 3) {
                safeLog(`[S4S] Post ${index + 1} URL found via outer timestamp link (${selector}):`, postUrl);
              }
              break;
            }
          }
          if (postUrl) break;
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
      
      // Method 4: Look for outer post URN-based construction (prioritize container URN)
      if (!postUrl) {
        // First try to find the outer post's URN (the main post container) - exclude nested content
        let urnElement = post.querySelector('.feed-shared-update-v2[data-urn]') || 
                        post.querySelector('[data-urn]:not(.feed-shared-update-v2__content [data-urn])') || 
                        post;
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

  // Global variables to track scrolling state
  let isScrolling = false;
  let shouldStopScrolling = false;
  let scrollTimeoutId = null;

  async function smoothScrollFeed() {
    isScrolling = true;
    shouldStopScrolling = false;
    
    // Anti-detection: Add random initial delay to avoid detection patterns
    const initialDelay = Math.random() * 2000 + 1000; // 1-3 seconds
    await new Promise(resolve => setTimeout(resolve, initialDelay));
    
    let lastHeight = document.documentElement.scrollHeight;
    let stuckCount = 0;
    const maxStuckCount = 20; // Be very patient with LinkedIn
    const maxScrollTime = 300000; // 5 minutes maximum scroll time
    const startTime = Date.now();
    
    // Human-like scroll settings - mimicking HR professional behavior
    const baseScrollSpeed = { min: 80, max: 250 }; // Variable base speed range
    const scrollInterval = { min: 300, max: 1200 }; // Variable interval range
    let currentBaseSpeed = getRandomInRange(baseScrollSpeed.min, baseScrollSpeed.max);
    let currentInterval = getRandomInRange(scrollInterval.min, scrollInterval.max);
    
    // Track scroll position and movement patterns
    let targetScrollY = window.scrollY;
    let scrollPhase = 0; // 0: reading, 1: scanning, 2: pausing
    let lastPauseTime = 0;
    let scrollCount = 0;
    let lastSpeedChange = Date.now();
    
    // Enhanced human behavior patterns
    const behaviorPatterns = {
      readingPause: { min: 3000, max: 15000 }, // Longer pauses for reading (3-15 seconds)
      scanningSpeed: { min: 0.3, max: 2.0 }, // Wider speed range when scanning
      readingSpeed: { min: 0.1, max: 0.6 }, // Even slower when reading
      pauseFrequency: { min: 2, max: 6 }, // More frequent pauses
      pauseDuration: { min: 1500, max: 8000 }, // Variable pause duration (longer for reading)
      microPause: { min: 150, max: 1200 }, // Longer micro pauses
      speedChangeInterval: { min: 5000, max: 15000 }, // Change base speed every 5-15 seconds
      scrollBurst: { min: 2, max: 5 }, // Number of wheel clicks in a burst (more realistic)
      burstPause: { min: 1000, max: 3000 }, // Pause between bursts
      // New reading-specific patterns
      deepReadingPause: { min: 8000, max: 25000 }, // Deep reading pauses (8-25 seconds)
      quickReadPause: { min: 1000, max: 4000 }, // Quick reading pauses (1-4 seconds)
      interestPause: { min: 5000, max: 12000 } // Pause when finding interesting content (5-12 seconds)
    };
    
    // Mouse wheel simulation patterns - realistic wheel "clicks" (slower)
    const wheelPatterns = {
      // Standard mouse wheel click distances (like actual mouse wheel) - reduced by 30%
      singleClick: { min: 84, max: 126 }, // One mouse wheel click (120px is standard) * 0.7
      doubleClick: { min: 168, max: 252 }, // Two rapid clicks * 0.7
      tripleClick: { min: 252, max: 378 }, // Three rapid clicks * 0.7
      // Scroll type probabilities - mostly single clicks with occasional bursts
      scrollTypeChance: { single: 0.75, double: 0.2, triple: 0.05 }
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
        
        // Check for scroll burst (rapid mouse wheel clicks)
        if (shouldDoScrollBurst()) {
          const burstCount = getBurstScrolls();
          
          for (let i = 0; i < burstCount && !shouldStopScrolling; i++) {
            const burstDistance = getScrollDistance();
            targetScrollY += burstDistance;
            
            // Instant scroll jump (like mouse wheel click)
            window.scrollTo(0, targetScrollY);
            
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
          const currentY = window.scrollY;
          const distance = targetScrollY - currentY;
          
          if (Math.abs(distance) > 5) { // Only scroll if there's meaningful distance
            // Use instant scroll for realistic mouse wheel behavior
            window.scrollTo(0, targetScrollY);
            
            scrollCount++;
          }
        }
        
        // Wait with variable delay
        const delay = getScrollDelay();
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Anti-detection: Randomize content check intervals
        const contentCheckInterval = Math.random() * 3000 + 4000; // 4-7 seconds
        if (Date.now() % Math.floor(contentCheckInterval) < scrollInterval) {
          let newHeight = document.documentElement.scrollHeight;
          if (newHeight === lastHeight) {
            stuckCount++;
            if (stuckCount >= maxStuckCount) {
              break;
            }
          } else {
            stuckCount = 0;
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
    const posts = document.querySelectorAll('div.feed-shared-update-v2[data-urn*="activity"], article.feed-shared-update-v2[data-urn*="activity"]');
    
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
    const posts = document.querySelectorAll('div.feed-shared-update-v2[data-urn*="activity"], article.feed-shared-update-v2[data-urn*="activity"]');
    
    posts.forEach((post, index) => {
      const repostInfo = detectAndExtractRepostContent(post);
      
      if (repostInfo.isRepost) {
        // Repost detected
      }
    });
  }

  // Make debug functions available globally
  window.debugRepostDetection = debugRepostDetection;

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
        withTimeout(smoothScrollFeed(), 300000) // Increased from 65s to 5 minutes
          .then(() => {
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

} // End of content script guard