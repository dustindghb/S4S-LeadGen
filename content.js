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
          console.log(`[S4S] Post ${index + 1} found author name: "${name}"`);
          
          // Find the closest container that should hold the profile link
          nameContainer = authorNameElement.closest('.feed-shared-actor__container, .update-components-actor, [class*="actor"]');
          
          if (nameContainer) {
            console.log(`[S4S] Post ${index + 1} found name container:`, nameContainer);
            
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
                console.log(`[S4S] Post ${index + 1} found author profile URL: ${linkedinUrl} for author: ${name}`);
                break;
              }
            }
          }
        }
        
        // If we didn't find the specific author name, try broader search
        if (!name || !linkedinUrl) {
          console.log(`[S4S] Post ${index + 1} trying broader search - name: "${name}", profile: "${linkedinUrl}"`);
          
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
              console.log(`[S4S] Post ${index + 1} found actor container:`, container);
              
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
                    console.log(`[S4S] Post ${index + 1} found author name: "${name}" using selector: ${nameSelector}`);
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
                    console.log(`[S4S] Post ${index + 1} found author profile URL: ${linkedinUrl} for author: ${name}`);
                    break;
                  }
                }
                break; // Found both name and container, exit
              }
            }
          }
        }
        
        // Fallback: if we didn't find both name and profile, try broader search
        if (!name || !linkedinUrl) {
          console.log(`[S4S] Post ${index + 1} fallback search - name: "${name}", profile: "${linkedinUrl}"`);
          
          // Try to find any profile link in the post
          if (!linkedinUrl) {
            const anyProfile = post.querySelector('a[href*="/in/"]');
            if (anyProfile && anyProfile.href) {
              linkedinUrl = anyProfile.href;
              console.log(`[S4S] Post ${index + 1} found fallback profile URL: ${linkedinUrl}`);
            }
          }
          
          // Try to find any name in the post
          if (!name) {
            const anyName = post.querySelector('span[aria-hidden="true"]');
            if (anyName && anyName.innerText.trim()) {
              const candidateName = anyName.innerText.trim();
              if (candidateName.length > 1 && candidateName.length < 50) {
                name = candidateName;
                console.log(`[S4S] Post ${index + 1} found fallback name: "${name}"`);
              }
            }
          }
        }
        
        if (!name) {
          console.log(`[S4S] Post ${index + 1} no author name found`);
        }
        if (!linkedinUrl) {
          console.log(`[S4S] Post ${index + 1} no LinkedIn profile URL found for author: ${name}`);
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
          console.log(`[S4S] Post ${index + 1} extracted data:`, {
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
        
        console.log(`[S4S] Post ${index + 1} headline extraction - name: "${name}"`);
        
        for (const selector of headlineSelectors) {
          const headlineElem = post.querySelector(selector);
          if (headlineElem && headlineElem.innerText.trim()) {
            const text = headlineElem.innerText.trim();
            console.log(`[S4S] Post ${index + 1} found headline candidate: "${text}" using selector: ${selector}`);
            
            // Check for connection degree in this text
            if (!foundConnectionDegree) {
              const connectionMatch = text.match(/\b(1st|2nd|3rd\+?)\b/i);
              if (connectionMatch) {
                foundConnectionDegree = connectionMatch[1];
                console.log(`[S4S] Found connection degree in headline element: ${foundConnectionDegree}`);
              }
            }
            
            // Less restrictive filtering - just check if it's not the name and has reasonable length
            if (text && 
                text !== name && 
                text.length > 2 && 
                text.length < 200) {
              headline = text;
              console.log(`[S4S] Post ${index + 1} selected headline: "${headline}"`);
              break;
            } else {
              console.log(`[S4S] Post ${index + 1} rejected headline candidate: "${text}" (reason: ${text === name ? 'same as name' : text.length <= 2 ? 'too short' : 'too long'})`);
            }
          }
        }
        
        // Fallback headline extraction
        if (!headline) {
          console.log(`[S4S] Post ${index + 1} trying fallback headline extraction`);
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
              console.log(`[S4S] Post ${index + 1} fallback headline candidate: "${text}" using selector: ${selector}`);
              
              if (text && 
                  text !== name && 
                  text.length > 2 && 
                  text.length < 200) {
                headline = text;
                console.log(`[S4S] Post ${index + 1} selected fallback headline: "${headline}"`);
                break;
              }
            }
          }
        }
        
        if (headline) {
          headline = headline
            .replace(/\s+•\s+.*$/, '')
            .trim();
          console.log(`[S4S] Post ${index + 1} final cleaned headline: "${headline}"`);
        } else {
          console.log(`[S4S] Post ${index + 1} no headline found`);
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
        let contentFilteredReason = '';
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
            } else {
              contentFilteredReason = `Filtered out by length/keywords (length: ${text.length}, text: '${text.slice(0, 40)}...')`;
              console.log(`[S4S] Post ${index + 1} content found but filtered:`, contentFilteredReason);
            }
          }
        }
        // Debug log if content is still empty after all selectors
        if (!content) {
          console.log(`[S4S] Post ${index + 1} content is empty after all selectors.`, contentFilteredReason, 'Post outerHTML:', post.outerHTML.slice(0, 1000));
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
          console.log(`[S4S] Using connection degree from headline element: ${connectionDegree}`);
        }
        
        // Default to "3rd" if no connection degree found
        if (!connectionDegree) {
          connectionDegree = '3rd';
          console.log(`[S4S] No connection degree found, defaulting to "3rd"`);
        }
        
        console.log(`[S4S] Post ${index + 1} final connection degree: "${connectionDegree}"`);
        
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
          console.log(`[S4S] Found connection degree "${degree}" using selector: ${selector}`);
          return degree;
        }
      }
    }
    
    // Fallback: search the entire post element
    const fallbackDegree = getConnectionDegree(postElement);
    if (fallbackDegree) {
      console.log(`[S4S] Found connection degree "${fallbackDegree}" using fallback search`);
      return fallbackDegree;
    }
    
    console.log('[S4S] No connection degree found');
    return null;
  }

  // Function to extract connection degree information (legacy wrapper)
  function extractConnectionDegree(post) {
    try {
      console.log('[S4S] Starting connection degree extraction for post');
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
    
    console.log(`[S4S] Starting date extraction for post ${index + 1}`);
    
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
      console.log(`[S4S] Post ${index + 1} found ${timeElems.length} elements with selector: ${selector}`);
      
      for (const timeElem of timeElems) {
        // Check for datetime attribute (most reliable)
        const datetime = timeElem.getAttribute('datetime');
        if (datetime) {
          console.log(`[S4S] Post ${index + 1} found datetime:`, datetime);
          postDate = new Date(datetime);
          postDateString = postDate.toISOString().split('T')[0]; // YYYY-MM-DD format
          console.log(`[S4S] Post ${index + 1} exact date from datetime:`, postDateString);
          break;
        }
        
        // Check for timestamp in data attributes
        const timestamp = timeElem.getAttribute('data-timestamp') || 
                         timeElem.getAttribute('data-time') ||
                         timeElem.getAttribute('data-date');
        if (timestamp) {
          console.log(`[S4S] Post ${index + 1} found timestamp:`, timestamp);
          postDate = new Date(parseInt(timestamp) * 1000); // Convert Unix timestamp
          postDateString = postDate.toISOString().split('T')[0];
          console.log(`[S4S] Post ${index + 1} exact date from timestamp:`, postDateString);
          break;
        }
        
        // Check for title attribute with full date
        const title = timeElem.getAttribute('title');
        if (title && title.includes(',')) {
          console.log(`[S4S] Post ${index + 1} found title:`, title);
          try {
            postDate = new Date(title);
            if (!isNaN(postDate)) {
              postDateString = postDate.toISOString().split('T')[0];
              console.log(`[S4S] Post ${index + 1} exact date from title:`, postDateString);
              break;
            }
          } catch (e) {
            console.log(`[S4S] Post ${index + 1} failed to parse title date:`, e);
          }
        }
      }
      if (postDate) break;
    }
    
    // If we couldn't get exact date, extract age and calculate approximate date
    if (!postDate) {
      console.log(`[S4S] No exact date found, calculating from age for post ${index + 1}`);
      
      for (const selector of timeSelectors) {
        const timeElems = post.querySelectorAll(selector);
        for (const timeElem of timeElems) {
          if (timeElem && timeElem.innerText.trim()) {
            const text = timeElem.innerText.trim();
            console.log(`[S4S] Post ${index + 1} time text: "${text}"`);
            
            // Extract age as before
            if (text.match(/\d+[hmdw]/) || text.includes('ago') || text.includes('min') || text.includes('hour') || text.includes('day') || text.includes('week') || text.includes('month') || text.includes('year')) {
              console.log(`[S4S] Post ${index + 1} text matches time pattern: "${text}"`);
              
              let timeMatch = text.match(/(\d+)\s*(min|minute|hour|day|week|month|year)s?/i);
              if (!timeMatch) {
                timeMatch = text.match(/(\d+[hmdw])/);
              }
              
              console.log(`[S4S] Post ${index + 1} timeMatch:`, timeMatch);
              
              if (timeMatch) {
                const value = parseInt(timeMatch[1]);
                const unit = timeMatch[2] ? timeMatch[2].toLowerCase() : timeMatch[1].slice(-1);
                
                age = value + (timeMatch[2] ? timeMatch[2].charAt(0) : unit);
                console.log(`[S4S] Post ${index + 1} extracted age: "${age}" (value: ${value}, unit: ${unit})`);
                
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
                  console.log(`[S4S] Post ${index + 1} calculated date:`, postDateString, 'from age:', age);
                }
                break;
              } else {
                console.log(`[S4S] Post ${index + 1} no time match found for text: "${text}"`);
              }
            } else {
              console.log(`[S4S] Post ${index + 1} text does not match time pattern: "${text}"`);
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
    
    console.log(`[S4S] Post ${index + 1} final result:`, result);
    
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
    console.log('[S4S] Starting continuous 5px/s scroll');
    isScrolling = true;
    shouldStopScrolling = false;
    
    let lastHeight = document.documentElement.scrollHeight;
    let stuckCount = 0;
    const maxStuckCount = 20; // Be very patient with LinkedIn
    const maxScrollTime = 300000; // 5 minutes maximum scroll time
    const startTime = Date.now();
    
    // Constant rate scroll settings
    const pixelsPerSecond = 400; // Fast scroll rate: 400 pixels per second
    const scrollInterval = 1000; // Update every 1 second
    const pixelsPerScroll = Math.floor(pixelsPerSecond / (1000 / scrollInterval)); // 400 pixels per second
    
    console.log('[S4S] Scroll settings - pixels per second:', pixelsPerSecond, 'interval:', scrollInterval, 'ms, pixels per scroll:', pixelsPerScroll);
    
    // Track absolute scroll position to maintain constant rate
    let targetScrollY = window.scrollY;
    
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
        
        // Calculate next target position (constant rate)
        targetScrollY += pixelsPerScroll;
        
        // Scroll to absolute position
        window.scrollTo(0, targetScrollY);
        
        console.log('[S4S] Scrolled to position:', targetScrollY, 'pixels');
        
        // Wait for the interval
        await new Promise(resolve => setTimeout(resolve, scrollInterval));
        
        // Check for new content every few seconds
        if (Date.now() % 5000 < scrollInterval) { // Check every ~5 seconds
          let newHeight = document.documentElement.scrollHeight;
          if (newHeight === lastHeight) {
            stuckCount++;
            console.log('[S4S] No new content loaded, stuck count:', stuckCount, 'of', maxStuckCount);
            if (stuckCount >= maxStuckCount) {
              console.log('[S4S] Max stuck count reached, stopping scroll');
              break;
            }
          } else {
            stuckCount = 0;
            console.log('[S4S] New content loaded, height changed from', lastHeight, 'to', newHeight);
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
        stopScrolling();
        sendResponse({ success: true, message: "Scrolling stopped" });
        return false; // Synchronous response
      }

      if (msg.action === "ping") {
        sendResponse({ success: true });
        return false; // Synchronous response
      }

      if (msg.action === "debugConnectionDegree") {
        debugConnectionDegree();
        sendResponse({ success: true, message: "Debug completed - check console" });
        return false; // Synchronous response
      }
      
    } catch (error) {
      console.error('[S4S] Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
    
    return false; // Default to synchronous response
  });
}