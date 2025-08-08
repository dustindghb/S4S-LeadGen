console.log('[S4S] Content script loaded');

// Prevent multiple instances
if (window.s4sContentScriptLoaded) {
  console.log('[S4S] Content script already loaded, skipping');
} else {
  window.s4sContentScriptLoaded = true;
  
  // Add a small delay to ensure the page is fully loaded
  setTimeout(() => {
    console.log('[S4S] Content script initialized and ready');
  }, 500);

  // Session fingerprinting for behavior variation
  const sessionFingerprint = (() => {
    const sessionId = Date.now() % 10000; // Unique session identifier
    const userAgent = navigator.userAgent;
    const screenRes = `${screen.width}x${screen.height}`;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Create a simple hash of session characteristics
    let hash = 0;
    const str = `${sessionId}-${userAgent}-${screenRes}-${timezone}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return {
      id: Math.abs(hash) % 1000,
      characteristics: {
        sessionId,
        userAgent: userAgent.substring(0, 50), // Truncated for privacy
        screenRes,
        timezone
      }
    };
  })();

  // Enhanced stealth utilities for human-like behavior
  const stealthUtils = {
    // Generate random delays between operations with more natural distribution
    randomDelay: (min, max) => {
      // Use a more natural distribution (slightly weighted toward lower values)
      const base = Math.random();
      const weighted = Math.pow(base, 1.5); // Creates more natural distribution
      return Math.floor(weighted * (max - min + 1)) + min;
    },
    
    // Human-like scrolling speeds with more variation
    getRandomScrollSpeed: () => {
      // More varied speeds with some preference for slower speeds (more human-like)
      const speeds = [100, 120, 150, 180, 200, 250, 300, 350, 400, 450, 500, 550, 600];
      const weights = [0.15, 0.12, 0.10, 0.08, 0.08, 0.07, 0.06, 0.06, 0.05, 0.05, 0.04, 0.04, 0.04]; // Weighted toward slower speeds
      
      const random = Math.random();
      let cumulativeWeight = 0;
      for (let i = 0; i < weights.length; i++) {
        cumulativeWeight += weights[i];
        if (random <= cumulativeWeight) {
          return speeds[i];
        }
      }
      return speeds[0]; // Fallback
    },
    
    // More natural pause intervals
    getRandomPauseInterval: () => {
      // Humans pause more frequently when reading content
      const intervals = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 10];
      const weights = [0.25, 0.20, 0.15, 0.12, 0.08, 0.06, 0.04, 0.03, 0.02, 0.02, 0.02, 0.01];
      
      const random = Math.random();
      let cumulativeWeight = 0;
      for (let i = 0; i < weights.length; i++) {
        cumulativeWeight += weights[i];
        if (random <= cumulativeWeight) {
          return intervals[i];
        }
      }
      return 2; // Fallback
    },
    
    // More varied pause durations
    getRandomPauseDuration: () => {
      // Humans pause for varying durations based on content
      const durations = [300, 500, 800, 1200, 1800, 2500, 3500, 5000, 8000];
      const weights = [0.30, 0.25, 0.20, 0.12, 0.06, 0.03, 0.02, 0.01, 0.01];
      
      const random = Math.random();
      let cumulativeWeight = 0;
      for (let i = 0; i < weights.length; i++) {
        cumulativeWeight += weights[i];
        if (random <= cumulativeWeight) {
          return durations[i];
        }
      }
      return 800; // Fallback
    },
    
    // Enhanced throttled DOM queries with more natural timing
    throttledQuerySelector: (() => {
      let lastQuery = 0;
      let queryCount = 0;
      const minInterval = 30; // Reduced minimum interval for more natural behavior
      
      return (element, selector) => {
        const now = Date.now();
        const timeSinceLastQuery = now - lastQuery;
        
        // Vary the minimum interval based on query count (humans slow down when tired)
        const dynamicMinInterval = minInterval + (queryCount * 2);
        
        if (timeSinceLastQuery < dynamicMinInterval) {
          return new Promise(resolve => {
            setTimeout(() => {
              lastQuery = Date.now();
              queryCount++;
              resolve(element.querySelector(selector));
            }, dynamicMinInterval - timeSinceLastQuery);
          });
        }
        
        lastQuery = now;
        queryCount++;
        return Promise.resolve(element.querySelector(selector));
      };
    })(),
    
    // Batch DOM queries with natural grouping
    batchQuerySelector: async (element, selectors) => {
      const results = [];
      for (const selector of selectors) {
        const result = await stealthUtils.throttledQuerySelector(element, selector);
        results.push(result);
        
        // Natural delay between queries (humans don't process everything instantly)
        const naturalDelay = stealthUtils.randomDelay(8, 25);
        await new Promise(resolve => setTimeout(resolve, naturalDelay));
      }
      return results;
    },
    
    // Simulate human-like mouse movements
    simulateMouseMovement: async () => {
      // Occasionally simulate natural mouse movements to appear more human
      if (Math.random() < 0.05) { // 5% chance to simulate mouse movement
        try {
          // Create a subtle mouse movement event
          const event = new MouseEvent('mousemove', {
            clientX: Math.random() * window.innerWidth,
            clientY: Math.random() * window.innerHeight,
            bubbles: true,
            cancelable: true
          });
          
          // Dispatch the event to simulate mouse movement
          document.dispatchEvent(event);
          
          // Reduced logging for stealth
          if (Math.random() < 0.1) { // Only log 10% of mouse movements
            console.log('[S4S] Simulated mouse movement');
          }
        } catch (error) {
          // Silently fail if mouse simulation fails
        }
      }
    },
    
    // More sophisticated operation randomization
    randomizeOperation: async (operation, baseDelay = 100) => {
      // Add natural variation to operation timing
      const variation = stealthUtils.randomDelay(-50, 150);
      const delay = Math.max(50, baseDelay + variation);
      await new Promise(resolve => setTimeout(resolve, delay));
      return operation();
    },
    
    // Simulate human reading patterns
    simulateReadingTime: async (contentLength) => {
      // Humans read at different speeds based on content length and complexity
      const wordsPerMinute = stealthUtils.randomDelay(150, 300); // Natural reading speed variation
      const words = contentLength / 5; // Rough estimate of words
      const readingTimeMs = (words / wordsPerMinute) * 60 * 1000;
      
      // Add natural variation and ensure minimum time
      const finalTime = Math.max(200, readingTimeMs + stealthUtils.randomDelay(-100, 200));
      await new Promise(resolve => setTimeout(resolve, finalTime));
    },
    
    // Simulate human decision-making delays
    simulateDecisionTime: async (complexity = 'medium') => {
      // Humans take time to make decisions based on complexity
      const baseDelays = {
        'simple': [100, 300],
        'medium': [300, 800],
        'complex': [800, 1500]
      };
      
      const [min, max] = baseDelays[complexity] || baseDelays.medium;
      const decisionTime = stealthUtils.randomDelay(min, max);
      await new Promise(resolve => setTimeout(resolve, decisionTime));
    },
    
    // Simulate natural browsing patterns
    simulateBrowsingBehavior: async () => {
      // Occasionally simulate natural browsing behaviors
      const behaviors = [
        () => stealthUtils.simulateReadingTime(stealthUtils.randomDelay(50, 200)),
        () => stealthUtils.simulateDecisionTime('simple'),
        () => new Promise(resolve => setTimeout(resolve, stealthUtils.randomDelay(100, 400)))
      ];
      
      const randomBehavior = behaviors[Math.floor(Math.random() * behaviors.length)];
      await randomBehavior();
    },
    
    // Session-based behavior variation using fingerprint
    getSessionVariation: () => {
      // Vary behavior based on session fingerprint to avoid patterns
      const sessionId = sessionFingerprint.id;
      const variations = {
        scrollSpeedMultiplier: 0.7 + (sessionId % 600) / 1000, // 0.7 to 1.3
        pauseFrequencyMultiplier: 0.6 + (sessionId % 800) / 1000, // 0.6 to 1.4
        queryDelayMultiplier: 0.8 + (sessionId % 400) / 1000, // 0.8 to 1.2
        attentionBaseline: 0.8 + (sessionId % 400) / 1000, // 0.8 to 1.2
        fatigueRate: 0.8 + (sessionId % 400) / 1000 // 0.8 to 1.2
      };
      
      // Reduced logging for stealth
      if (Math.random() < 0.001) { // Only log 0.1% of session variations
        console.log('[S4S] Session fingerprint:', sessionId, 'variations:', variations);
      }
      
      return variations;
    },
    
    // Simulate natural browsing interruptions
    simulateBrowsingInterruption: async () => {
      // Occasionally simulate natural interruptions (phone calls, distractions, etc.)
      const interruptionTypes = [
        { probability: 0.02, duration: [5000, 15000], name: 'short_break' },
        { probability: 0.01, duration: [15000, 30000], name: 'medium_break' },
        { probability: 0.005, duration: [30000, 60000], name: 'long_break' }
      ];
      
      for (const interruption of interruptionTypes) {
        if (Math.random() < interruption.probability) {
          const duration = stealthUtils.randomDelay(interruption.duration[0], interruption.duration[1]);
          console.log(`[S4S] Simulating ${interruption.name} for ${Math.round(duration/1000)}s`);
          await new Promise(resolve => setTimeout(resolve, duration));
          return true; // Indicates an interruption occurred
        }
      }
      return false; // No interruption
    },
    
    // Simulate human attention patterns with session baseline
    simulateAttentionPattern: async () => {
      // Humans have varying attention spans and focus levels
      const sessionVars = stealthUtils.getSessionVariation();
      const attentionBaseline = sessionVars.attentionBaseline;
      
      const attentionStates = [
        { probability: 0.6, multiplier: 1.0, name: 'focused' },
        { probability: 0.3, multiplier: 0.7, name: 'distracted' },
        { probability: 0.1, multiplier: 0.4, name: 'very_distracted' }
      ];
      
      const random = Math.random();
      let cumulativeProb = 0;
      
      for (const state of attentionStates) {
        cumulativeProb += state.probability;
        if (random <= cumulativeProb) {
          // Apply session baseline to attention multiplier
          const adjustedMultiplier = state.multiplier * attentionBaseline;
          
          // Reduced logging for stealth
          if (Math.random() < 0.005) { // Only log 0.5% of attention changes
            console.log(`[S4S] Attention state: ${state.name} (multiplier: ${adjustedMultiplier.toFixed(2)}, baseline: ${attentionBaseline.toFixed(2)})`);
          }
          return adjustedMultiplier;
        }
      }
      return attentionBaseline; // Default to session baseline
    }
  };

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
        // Use throttled query selector for stealth
        const posts = await stealthUtils.throttledQuerySelector(document, selector);
        if (posts) {
          foundPosts = document.querySelectorAll(selector);
          if (foundPosts.length > 0) {
            break;
          }
        }
        // Random delay between selector attempts
        await new Promise(resolve => setTimeout(resolve, stealthUtils.randomDelay(50, 150)));
      }
      
      // Process all found posts (removed 50 post limit)
      const maxPosts = foundPosts.length;
      
      for (let index = 0; index < maxPosts; index++) {
        const post = foundPosts[index];
        
        // Simulate human reading time based on content length
        if (post.innerText) {
          const contentLength = post.innerText.length;
          await stealthUtils.simulateReadingTime(contentLength);
        } else {
          // Fallback delay if no content
          await new Promise(resolve => setTimeout(resolve, stealthUtils.randomDelay(50, 150)));
        }
        
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
        const authorNameElement = await stealthUtils.throttledQuerySelector(post, 'span.sExBUDsubYecFzuEceaNRAkkGmqOjwDiPLAo span[aria-hidden="true"]');
        
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
              const profileLink = await stealthUtils.throttledQuerySelector(nameContainer, profileSelector);
              if (profileLink && profileLink.href) {
                linkedinUrl = profileLink.href;
                break;
              }
              // Small delay between profile link searches
              await new Promise(resolve => setTimeout(resolve, stealthUtils.randomDelay(5, 15)));
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
            const container = await stealthUtils.throttledQuerySelector(post, containerSelector);
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
                const nameElem = await stealthUtils.throttledQuerySelector(container, nameSelector);
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
                // Small delay between name searches
                await new Promise(resolve => setTimeout(resolve, stealthUtils.randomDelay(5, 15)));
              }
              
              // If we found a name, look for the corresponding profile link
              if (name) {
                const profileSelectors = [
                  'a[data-control-name="actor_profile"]',
                  'a[href*="/in/"]',
                  'a[href*="linkedin.com/in/"]'
                ];
                
                for (const profileSelector of profileSelectors) {
                  const profileLink = await stealthUtils.throttledQuerySelector(container, profileSelector);
                  if (profileLink && profileLink.href) {
                    linkedinUrl = profileLink.href;
                    break;
                  }
                  // Small delay between profile link searches
                  await new Promise(resolve => setTimeout(resolve, stealthUtils.randomDelay(5, 15)));
                }
                break; // Found both name and container, exit
              }
            }
            // Small delay between container searches
            await new Promise(resolve => setTimeout(resolve, stealthUtils.randomDelay(10, 25)));
          }
        }
        
        // Fallback: if we didn't find both name and profile, try broader search
        if (!name || !linkedinUrl) {
          // Try to find any profile link in the post
          if (!linkedinUrl) {
            const anyProfile = await stealthUtils.throttledQuerySelector(post, 'a[href*="/in/"]');
            if (anyProfile && anyProfile.href) {
              linkedinUrl = anyProfile.href;
            }
          }
          
          // Try to find any name in the post
          if (!name) {
            const anyName = await stealthUtils.throttledQuerySelector(post, 'span[aria-hidden="true"]');
            if (anyName && anyName.innerText.trim()) {
              const candidateName = anyName.innerText.trim();
              if (candidateName.length > 1 && candidateName.length < 50) {
                name = candidateName;
              }
            }
          }
        }
        
        if (!name) {
          // Reduced logging for stealth
        }
        if (!linkedinUrl) {
          // Reduced logging for stealth
        }
        
        // Extract professional information - focused on headline
        let headline = '';
        let age = '';
        
        // Extract date and age using enhanced function
        const dateInfo = extractPostDateAndAge(post, index);
        const extractedAge = dateInfo.age;
        const postDate = dateInfo.postDate;
        const exactDate = dateInfo.exactDate;
        
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
        
        for (const selector of headlineSelectors) {
          const headlineElem = await stealthUtils.throttledQuerySelector(post, selector);
          if (headlineElem && headlineElem.innerText.trim()) {
            const text = headlineElem.innerText.trim();
            
            // Check for connection degree in this text
            if (!foundConnectionDegree) {
              const connectionMatch = text.match(/\b(1st|2nd|3rd\+?)\b/i);
              if (connectionMatch) {
                foundConnectionDegree = connectionMatch[1];
              }
            }
            
            // Less restrictive filtering - just check if it's not the name and has reasonable length
            if (text && 
                text !== name && 
                text.length > 2 && 
                text.length < 200) {
              headline = text;
              break;
            }
          }
          // Small delay between headline searches
          await new Promise(resolve => setTimeout(resolve, stealthUtils.randomDelay(5, 15)));
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
            const headlineElem = await stealthUtils.throttledQuerySelector(post, selector);
            if (headlineElem && headlineElem.innerText.trim()) {
              const text = headlineElem.innerText.trim();
              
              if (text && 
                  text !== name && 
                  text.length > 2 && 
                  text.length < 200) {
                headline = text;
                break;
              }
            }
            // Small delay between fallback searches
            await new Promise(resolve => setTimeout(resolve, stealthUtils.randomDelay(5, 15)));
          }
        }
        
        if (headline) {
          headline = headline
            .replace(/\s+•\s+.*$/, '')
            .trim();
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
          const contentElem = await stealthUtils.throttledQuerySelector(post, selector);
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
            } else {
              contentFilteredReason = `Filtered out by length/keywords (length: ${text.length}, text: '${text.slice(0, 40)}...')`;
            }
          }
          // Small delay between content searches
          await new Promise(resolve => setTimeout(resolve, stealthUtils.randomDelay(5, 15)));
        }
        
        // Check if this is a repost and extract original content
        const repostInfo = detectAndExtractRepostContent(post);
        
        // If main content is empty or very short, look for reposted content
        if (!content || content.length < 50) {
          // If we detected a repost, use the original content
          if (repostInfo.isRepost && repostInfo.originalContent) {
            content = repostInfo.originalContent;
          } else {
            // Look for reposted content - LinkedIn reposts are often in different containers
            const repostSelectors = [
              // Repost containers
              '.feed-shared-update-v2__content',
              '.feed-shared-update-v2__content-wrapper',
              '.feed-shared-update-v2__description-wrapper',
              '.feed-shared-update-v2__description',
              
              // Nested content within reposts
              '.feed-shared-update-v2__content .feed-shared-update-v2__description',
              '.feed-shared-update-v2__content .feed-shared-text',
              '.feed-shared-update-v2__content .break-words',
              
              // Repost specific selectors
              '[data-test-id="repost-content"]',
              '.repost-content',
              '.shared-update-content',
              
              // Fallback: any nested content that might be the original post
              '.feed-shared-update-v2__content div[class*="description"]',
              '.feed-shared-update-v2__content div[class*="text"]',
              '.feed-shared-update-v2__content span[class*="break"]'
            ];
            
            for (const selector of repostSelectors) {
              const repostElems = post.querySelectorAll(selector);
              for (const repostElem of repostElems) {
                const text = repostElem.innerText.trim();
                if (text && text.length > 20 && 
                    !text.includes('Follow') && 
                    !text.includes('Connect') && 
                    !text.includes('•') && 
                    !text.includes('1st') && 
                    !text.includes('2nd') && 
                    !text.includes('3rd+') &&
                    text !== content) { // Make sure it's different from what we already have
                  
                  const cleanedText = cleanTextContent(text);
                  if (cleanedText.length > content.length) {
                    content = cleanedText;
                    break;
                  }
                }
              }
              if (content && content.length > 50) break; // Found good content, stop searching
            }
          }
        }
        
        // If we have both repost commentary and original content, combine them intelligently
        if (repostInfo.isRepost && repostInfo.originalContent && content && content !== repostInfo.originalContent) {
          const commentary = content;
          const originalContent = repostInfo.originalContent;
          
          // Combine them with clear separation
          content = `${commentary}\n\n--- Original Post ---\n${originalContent}`;
        }
        
        // If still no content, try to find any meaningful text in the post
        if (!content || content.length < 20) {
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
          }
        }
        
        // Debug log if content is still empty after all selectors
        if (!content) {
          // Reduced logging for stealth
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
        }
        
        // Default to "3rd" if no connection degree found
        if (!connectionDegree) {
          connectionDegree = '3rd';
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
      'thought this was worth sharing'
    ];
    
    // Check if the main content contains repost indicators
    const mainContent = post.innerText.toLowerCase();
    let isRepost = false;
    
    for (const indicator of repostIndicators) {
      if (mainContent.includes(indicator)) {
        isRepost = true;
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
          return degree;
        }
      }
    }
    
    // Fallback: search the entire post element
    const fallbackDegree = getConnectionDegree(postElement);
    if (fallbackDegree) {
      return fallbackDegree;
    }
    
    return null;
  }

  // Function to extract connection degree information (legacy wrapper)
  function extractConnectionDegree(post) {
    try {
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
      
      for (const timeElem of timeElems) {
        // Check for datetime attribute (most reliable)
        const datetime = timeElem.getAttribute('datetime');
        if (datetime) {
          postDate = new Date(datetime);
          postDateString = postDate.toISOString().split('T')[0]; // YYYY-MM-DD format
          break;
        }
        
        // Check for timestamp in data attributes
        const timestamp = timeElem.getAttribute('data-timestamp') || 
                         timeElem.getAttribute('data-time') ||
                         timeElem.getAttribute('data-date');
        if (timestamp) {
          postDate = new Date(parseInt(timestamp) * 1000); // Convert Unix timestamp
          postDateString = postDate.toISOString().split('T')[0];
          break;
        }
        
        // Check for title attribute with full date
        const title = timeElem.getAttribute('title');
        if (title && title.includes(',')) {
          try {
            postDate = new Date(title);
            if (!isNaN(postDate)) {
              postDateString = postDate.toISOString().split('T')[0];
              break;
            }
          } catch (e) {
          }
        }
      }
      if (postDate) break;
    }
    
    // If we couldn't get exact date, extract age and calculate approximate date
    if (!postDate) {
      for (const selector of timeSelectors) {
        const timeElems = post.querySelectorAll(selector);
        for (const timeElem of timeElems) {
          if (timeElem && timeElem.innerText.trim()) {
            const text = timeElem.innerText.trim();
            
            // Extract age as before
            let timeMatch = text.match(/(\d+)\s*(min|minute|hour|day|week|month|year)s?/i);
            if (!timeMatch) {
              timeMatch = text.match(/(\d+[hmdw])/);
            }
            
            if (timeMatch) {
              const value = parseInt(timeMatch[1]);
              const unit = timeMatch[2] ? timeMatch[2].toLowerCase() : timeMatch[1].slice(-1);
              
              age = value + (timeMatch[2] ? timeMatch[2].charAt(0) : unit);
              
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
              }
              break;
            }
          }
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
    
    return result;
  }





  // Improved post URL extraction function
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
            console.log(`[S4S] Post ${index + 1} URL found via direct link (${selector}):`, postUrl);
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
              console.log(`[S4S] Post ${index + 1} URL found via timestamp link:`, postUrl);
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
                  console.log(`[S4S] Post ${index + 1} URL constructed from share button URN:`, postUrl);
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
                console.log(`[S4S] Post ${index + 1} URL constructed from URN:`, postUrl);
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
              console.log(`[S4S] Post ${index + 1} URL found via clickable element:`, postUrl);
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
                console.log(`[S4S] Post ${index + 1} URL constructed from activity ID in link:`, postUrl);
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
    console.log('[S4S] Starting enhanced human-like scroll behavior');
    isScrolling = true;
    shouldStopScrolling = false;
    
    let lastHeight = document.documentElement.scrollHeight;
    let stuckCount = 0;
    const maxStuckCount = 25; // Increased patience for more human-like behavior
    const maxScrollTime = 600000; // 10 minutes maximum scroll time (more realistic)
    const startTime = Date.now();
    
    // Get session variations for more natural behavior
    const sessionVars = stealthUtils.getSessionVariation();
    
    // Enhanced stealth scroll settings with session variation
    let currentScrollSpeed = Math.floor(stealthUtils.getRandomScrollSpeed() * sessionVars.scrollSpeedMultiplier);
    let scrollInterval = Math.floor(stealthUtils.randomDelay(1000, 2000) * sessionVars.queryDelayMultiplier); // More varied intervals
    let pixelsPerScroll = Math.floor(currentScrollSpeed / (1000 / scrollInterval));
    
    // Human-like scroll state tracking
    let scrollMomentum = 1.0; // Simulate momentum
    let fatigueLevel = 0; // Simulate fatigue over time
    let lastPauseTime = 0;
    let consecutiveScrolls = 0;
    
    console.log('[S4S] Enhanced scroll settings - speed:', currentScrollSpeed, 'pixels/s, interval:', scrollInterval, 'ms');
    
    // Track absolute scroll position with momentum
    let targetScrollY = window.scrollY;
    let pauseCounter = 0;
    let pauseInterval = Math.floor(stealthUtils.getRandomPauseInterval() * 1000 * sessionVars.pauseFrequencyMultiplier);
    
    try {
      while (!shouldStopScrolling) {
        // Check timeout
        if (Date.now() - startTime > maxScrollTime) {
          console.log('[S4S] Scroll timeout reached after', Math.round((Date.now() - startTime) / 1000), 'seconds');
          break;
        }
        
        // Check if we should stop
        if (shouldStopScrolling) {
          console.log('[S4S] Stopping scroll due to stop signal');
          break;
        }
        
        // Simulate human fatigue (slower scrolling over time) with session variation
        const fatigueRate = sessionVars.fatigueRate;
        fatigueLevel = Math.min(1.0, (Date.now() - startTime) / (300000 * fatigueRate)); // Fatigue over 5 minutes * rate
        const fatigueMultiplier = 1.0 - (fatigueLevel * 0.3); // Slow down by up to 30%
        
        // Randomly change scroll behavior (more human-like variations)
        if (Math.random() < 0.15) { // 15% chance to change behavior
          currentScrollSpeed = Math.floor(stealthUtils.getRandomScrollSpeed() * sessionVars.scrollSpeedMultiplier * fatigueMultiplier);
          scrollInterval = Math.floor(stealthUtils.randomDelay(800, 1800) * sessionVars.queryDelayMultiplier);
          pixelsPerScroll = Math.floor(currentScrollSpeed / (1000 / scrollInterval));
          
          // Occasionally change momentum
          if (Math.random() < 0.3) {
            scrollMomentum = 0.7 + Math.random() * 0.6; // 0.7 to 1.3
          }
          
          // Reduced logging for stealth
          if (Math.random() < 0.02) { // Only log 2% of behavior changes
            console.log('[S4S] Changed scroll behavior - speed:', currentScrollSpeed, 'momentum:', scrollMomentum.toFixed(2));
          }
        }
        
        // Simulate natural pauses based on content and fatigue
        pauseCounter += scrollInterval;
        if (pauseCounter >= pauseInterval || consecutiveScrolls > 10) {
          const basePauseDuration = stealthUtils.getRandomPauseDuration();
          const fatiguePauseBonus = fatigueLevel * 1000; // Longer pauses when tired
          const consecutivePauseBonus = Math.min(2000, consecutiveScrolls * 100); // Longer pauses after many scrolls
          const pauseDuration = basePauseDuration + fatiguePauseBonus + consecutivePauseBonus;
          
          // Reduced logging for stealth
          if (Math.random() < 0.03) { // Only log 3% of pauses
            console.log('[S4S] Taking natural pause for', Math.round(pauseDuration), 'ms (fatigue:', fatigueLevel.toFixed(2), ')');
          }
          
          await new Promise(resolve => setTimeout(resolve, pauseDuration));
          pauseCounter = 0;
          consecutiveScrolls = 0;
          lastPauseTime = Date.now();
          
          // Reset pause interval with variation
          pauseInterval = Math.floor(stealthUtils.getRandomPauseInterval() * 1000 * sessionVars.pauseFrequencyMultiplier);
        }
        
        // Simulate browsing behavior occasionally
        if (Math.random() < 0.08) { // 8% chance to simulate browsing
          await stealthUtils.simulateBrowsingBehavior();
        }
        
        // Simulate mouse movements occasionally
        await stealthUtils.simulateMouseMovement();
        
        // Simulate natural interruptions
        const interruptionOccurred = await stealthUtils.simulateBrowsingInterruption();
        if (interruptionOccurred) {
          // Reset some counters after interruption
          consecutiveScrolls = 0;
          fatigueLevel = Math.max(0, fatigueLevel - 0.1); // Slight recovery
        }
        
        // Simulate attention patterns
        const attentionMultiplier = await stealthUtils.simulateAttentionPattern();
        const adjustedScrollSpeed = Math.floor(currentScrollSpeed * attentionMultiplier);
        
        // Calculate next target position with momentum, fatigue, and attention
        const adjustedPixelsPerScroll = Math.floor(pixelsPerScroll * scrollMomentum * fatigueMultiplier * attentionMultiplier);
        targetScrollY += adjustedPixelsPerScroll;
        consecutiveScrolls++;
        
        // Smooth scroll with natural easing
        const currentY = window.scrollY;
        const distance = targetScrollY - currentY;
        const scrollStep = Math.max(1, Math.floor(distance * 0.3)); // Natural easing
        
        window.scrollTo(0, currentY + scrollStep);
        
        // Reduced logging for stealth
        if (Math.random() < 0.01) { // Only log 1% of scroll events
          console.log('[S4S] Scrolled to position:', targetScrollY, 'pixels (momentum:', scrollMomentum.toFixed(2), ')');
        }
        
        // Wait with natural variation
        const baseInterval = scrollInterval * (1 + fatigueLevel * 0.2); // Slower when tired
        const actualInterval = baseInterval + stealthUtils.randomDelay(-100, 200);
        await new Promise(resolve => setTimeout(resolve, actualInterval));
        
        // Check for new content with natural timing
        if (Date.now() % (5000 + stealthUtils.randomDelay(0, 3000)) < actualInterval) { // More varied check interval
          let newHeight = document.documentElement.scrollHeight;
          if (newHeight === lastHeight) {
            stuckCount++;
            if (stuckCount % 8 === 0) { // Only log every 8th stuck count
              console.log('[S4S] No new content loaded, stuck count:', stuckCount, 'of', maxStuckCount);
            }
            if (stuckCount >= maxStuckCount) {
              console.log('[S4S] Max stuck count reached, stopping scroll');
              break;
            }
          } else {
            stuckCount = 0;
            // Reduced logging for stealth
            if (Math.random() < 0.1) { // Only log 10% of content loads
              console.log('[S4S] New content loaded, height changed from', lastHeight, 'to', newHeight);
            }
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
      console.log('[S4S] Enhanced human-like scroll completed');
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

  // Debug function to test connection degree extraction
  function debugConnectionDegree() {
    console.log('[S4S] Debugging connection degree extraction...');
    const posts = document.querySelectorAll('div.feed-shared-update-v2[data-urn*="activity"], article.feed-shared-update-v2[data-urn*="activity"]');
    console.log(`[S4S] Found ${posts.length} posts to test`);
    
    for (let i = 0; i < Math.min(posts.length, 3); i++) {
      const post = posts[i];
      console.log(`[S4S] Testing post ${i + 1}:`);
      console.log(`[S4S] Post HTML:`, post.outerHTML.substring(0, 500) + '...');
      
      // Test both the new and legacy functions
      const newResult = getConnectionDegreeFromDOM(post);
      const legacyResult = extractConnectionDegree(post);
      
      console.log(`[S4S] New function result: "${newResult}"`);
      console.log(`[S4S] Legacy function result: "${legacyResult}"`);
      
      // Also test with text content
      const textResult = getConnectionDegree(post.textContent);
      console.log(`[S4S] Text content result: "${textResult}"`);
    }
  }

  // Debug function for repost detection
  function debugRepostDetection() {
    console.log('[S4S] Debugging repost detection...');
    
    const posts = document.querySelectorAll('div.feed-shared-update-v2[data-urn*="activity"], article.feed-shared-update-v2[data-urn*="activity"]');
    console.log(`[S4S] Found ${posts.length} posts to analyze for reposts`);
    
    posts.forEach((post, index) => {
      const repostInfo = detectAndExtractRepostContent(post);
      console.log(`[S4S] Post ${index + 1}:`, {
        isRepost: repostInfo.isRepost,
        originalContentLength: repostInfo.originalContent.length,
        originalContentPreview: repostInfo.originalContent.substring(0, 100) + '...'
      });
      
      if (repostInfo.isRepost) {
        console.log(`[S4S] Post ${index + 1} REPOST DETECTED! Original content:`, repostInfo.originalContent);
      }
    });
  }

  // Make debug functions available globally
  window.debugRepostDetection = debugRepostDetection;

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
        
        withTimeout(smoothScrollFeed(), 300000) // Increased from 65s to 5 minutes
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
        console.log('[S4S] Received stopScroll message from popup');
        console.log('[S4S] Current scrolling state - isScrolling:', isScrolling, 'shouldStopScrolling:', shouldStopScrolling);
        stopScrolling();
        console.log('[S4S] After stopScrolling() - isScrolling:', isScrolling, 'shouldStopScrolling:', shouldStopScrolling);
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
        console.log('[S4S] Manual refresh test requested');
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
}