// Enhanced Content script for AI Tools Usage Tracker
// This runs on every page and tracks queries, tokens, and image generation

let lastUrl = location.href;
let observers = [];
let queryCounters = {};
let tokenCounters = {};
let imageCounters = {};

// Initialize counters for each tool
const initializeCounters = () => {
  const tools = ['chatgpt', 'claude', 'bard', 'copilot', 'perplexity', 'character', 'huggingface']; // Include all AI_TOOLS from background.js
  tools.forEach(tool => {
    queryCounters[tool] = 0;
    tokenCounters[tool] = { input: 0, output: 0 };
    imageCounters[tool] = 0;
  });
};

initializeCounters();

// Utility function to estimate token count (rough approximation)
const estimateTokens = (text) => {
  if (!text) return 0;
  // Rough estimation: 1 token ≈ 4 characters for English text
  return Math.ceil(text.length / 4);
};

// Send usage data to background script
const sendUsageData = (tool, data) => {
  chrome.runtime.sendMessage({
    action: 'usageTracked',
    tool: tool,
    data: {
      queries: data.queries || 0,
      inputTokens: data.inputTokens || 0,
      outputTokens: data.outputTokens || 0,
      images: data.images || 0,
      timestamp: Date.now(),
      url: window.location.href
    }
  });
};

// ChatGPT specific monitoring
const monitorChatGPT = () => {
  const chatContainer = document.querySelector('[data-testid="conversation-turn-0"]')?.parentElement ||
                       document.querySelector('.flex.flex-col.text-sm') ||
                       document.querySelector('[role="main"]');
  
  if (!chatContainer) return;

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check for new messages
          const messageElements = node.querySelectorAll('[data-message-author-role]');
          messageElements.forEach((element) => {
            const role = element.getAttribute('data-message-author-role');
            const text = element.textContent || '';
            
            // Only count user queries when the role is 'user'
            if (role === 'user' && text.trim()) {
              queryCounters.chatgpt++;
              tokenCounters.chatgpt.input += estimateTokens(text);
            } else if (role === 'assistant' && text.trim()) {
              tokenCounters.chatgpt.output += estimateTokens(text);
            }
          });

          // Check for generated images more specifically
          // Look for image elements within assistant messages that might indicate generation
          const images = node.querySelectorAll('[data-message-author-role="assistant"] img[alt*="generated"], [data-message-author-role="assistant"] img[src*="dalle"]');
          if (images.length > 0) {
            imageCounters.chatgpt += images.length;
          }

          // Send update if counters changed
          sendUsageData('chatgpt', {
            queries: queryCounters.chatgpt,
            inputTokens: tokenCounters.chatgpt.input,
            outputTokens: tokenCounters.chatgpt.output,
            images: imageCounters.chatgpt
          });
        }
      });
    });
  });

  observer.observe(chatContainer, { childList: true, subtree: true });
  observers.push(observer);
};

// Claude specific monitoring
const monitorClaude = () => {
  const chatContainer = document.querySelector('[data-testid="conversation"]') ||
                       document.querySelector('.flex-1.overflow-hidden') ||
                       document.querySelector('main');
  
  if (!chatContainer) return;

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Claude messages are often identified by their parent structure or specific classes.
          // Look for user messages and assistant responses within the chat container.

          // User messages often have a distinct parent or data attribute
          const userMessages = node.querySelectorAll('.text-message.user-message-container, [data-testid^="user-message"]');
          userMessages.forEach((element) => {
              const text = element.textContent || '';
              if (text.trim() && !element.dataset.processed) { // Prevent double counting
                  queryCounters.claude++;
                  tokenCounters.claude.input += estimateTokens(text);
                  element.dataset.processed = 'true'; // Mark as processed
              }
          });

          // Assistant responses usually follow a different structure
          const assistantMessages = node.querySelectorAll('.text-message.assistant-message-container, [data-testid^="assistant-message"]');
          assistantMessages.forEach((element) => {
              const text = element.textContent || '';
              if (text.trim() && !element.dataset.processed) { // Prevent double counting
                  tokenCounters.claude.output += estimateTokens(text);
                  element.dataset.processed = 'true';
              }
          });

          // Re-evaluate image detection for Claude - they don't natively generate images like DALL-E, 
          // but might display images from uploaded files or external sources.
          // For now, removing specific image counting until a clear pattern emerges.
          // If Claude introduces image generation, we'd need specific selectors for that.
          
          // Send update
          sendUsageData('claude', {
            queries: queryCounters.claude,
            inputTokens: tokenCounters.claude.input,
            outputTokens: tokenCounters.claude.output,
            images: imageCounters.claude // Will remain 0 unless Claude adds native image generation
          });
        }
      });
    });
  });

  observer.observe(chatContainer, { childList: true, subtree: true });
  observers.push(observer);
};

// Bard/Gemini specific monitoring
const monitorBard = () => {
  const chatContainer = document.querySelector('[data-test-id="conversation-container"]') ||
                       document.querySelector('.conversation-container') ||
                       document.querySelector('main');
  
  if (!chatContainer) return;

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check for user queries
          const userInputs = node.querySelectorAll('.user-query-text, [data-test-id="user-query-text"]'); // More specific selector
          
          userInputs.forEach((element) => {
            const text = element.textContent || '';
            if (text.trim() && !element.dataset.processed) {
              queryCounters.bard++;
              tokenCounters.bard.input += estimateTokens(text);
              element.dataset.processed = 'true';
            }
          });

          // Check for responses
          const responses = node.querySelectorAll('.model-response-text, [data-test-id="model-response-text"]'); // More specific selector
          
          responses.forEach((element) => {
            const text = element.textContent || '';
            if (text.trim() && !element.dataset.processed) {
              tokenCounters.bard.output += estimateTokens(text);
              element.dataset.processed = 'true';
            }
          });

          // Check for generated images more specifically
          // Gemini often uses specific classes or structures for generated images.
          const images = node.querySelectorAll('img.generated-image, [data-is-image-generation-output="true"] img');
          if (images.length > 0) {
            imageCounters.bard += images.length;
          }

          // Send update
          sendUsageData('bard', {
            queries: queryCounters.bard,
            inputTokens: tokenCounters.bard.input,
            outputTokens: tokenCounters.bard.output,
            images: imageCounters.bard
          });
        }
      });
    });
  });

  observer.observe(chatContainer, { childList: true, subtree: true });
  observers.push(observer);
};

// Copilot specific monitoring
const monitorCopilot = () => {
  const chatContainer = document.querySelector('[data-testid="chat-container"]') ||
                       document.querySelector('.chat-container') ||
                       document.querySelector('main');
  
  if (!chatContainer) return;

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check for user messages
          const userMessages = node.querySelectorAll('[data-testid="user-message-bubble"], .user-message-bubble'); // More specific
          
          userMessages.forEach((element) => {
            const text = element.textContent || '';
            if (text.trim() && !element.dataset.processed) {
              queryCounters.copilot++;
              tokenCounters.copilot.input += estimateTokens(text);
              element.dataset.processed = 'true';
            }
          });

          // Check for responses
          const responses = node.querySelectorAll('[data-testid="bot-message-bubble"], .bot-message-bubble'); // More specific
                           
          responses.forEach((element) => {
            const text = element.textContent || '';
            if (text.trim() && !element.dataset.processed) {
              tokenCounters.copilot.output += estimateTokens(text);
              element.dataset.processed = 'true';
            }
          });

          // Check for generated images more specifically
          const images = node.querySelectorAll('img[src*="bing.com/images/create"], img[alt*="DALL-E"]');
          if (images.length > 0) {
            imageCounters.copilot += images.length;
          }

          // Send update
          sendUsageData('copilot', {
            queries: queryCounters.copilot,
            inputTokens: tokenCounters.copilot.input,
            outputTokens: tokenCounters.copilot.output,
            images: imageCounters.copilot
          });
        }
      });
    });
  });

  observer.observe(chatContainer, { childList: true, subtree: true });
  observers.push(observer);
};

// Monitor for form submissions (additional query detection)
const monitorFormSubmissions = () => {
  document.addEventListener('submit', (event) => {
    const form = event.target;
    // Target common input fields for chat interfaces
    const inputs = form.querySelectorAll('input[type="text"], textarea, input[role="textbox"], div[contenteditable="true"]');
    
    inputs.forEach(input => {
      const text = input.value || input.textContent || ''; // Get value for input, textContent for contenteditable
      if (text.trim()) {
        const hostname = window.location.hostname.toLowerCase();
        
        if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) {
          queryCounters.chatgpt++;
          tokenCounters.chatgpt.input += estimateTokens(text);
          sendUsageData('chatgpt', { queries: queryCounters.chatgpt, inputTokens: tokenCounters.chatgpt.input });
        } else if (hostname.includes('claude.ai')) {
          queryCounters.claude++;
          tokenCounters.claude.input += estimateTokens(text);
          sendUsageData('claude', { queries: queryCounters.claude, inputTokens: tokenCounters.claude.input });
        } else if (hostname.includes('bard.google.com') || hostname.includes('gemini.google.com')) {
          queryCounters.bard++;
          tokenCounters.bard.input += estimateTokens(text);
          sendUsageData('bard', { queries: queryCounters.bard, inputTokens: tokenCounters.bard.input });
        } else if (hostname.includes('copilot.microsoft.com') || hostname.includes('bing.com/chat')) {
          queryCounters.copilot++;
          tokenCounters.copilot.input += estimateTokens(text);
          sendUsageData('copilot', { queries: queryCounters.copilot, inputTokens: tokenCounters.copilot.input });
        }
      }
    });
  });
};

// Check for URL changes (for SPAs)
const urlChangeObserver = new MutationObserver(() => { // Renamed to avoid conflict
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // Clean up previous observers
    observers.forEach(obs => obs.disconnect());
    observers = [];
    
    // Reset counters for the new page load
    initializeCounters(); 

    // Restart monitoring after URL change
    setTimeout(() => {
      checkForAIToolUsage();
    }, 500); // Reduced delay slightly
  }
});

// Observe the document body for URL changes (common in SPAs)
urlChangeObserver.observe(document.body, { 
  childList: true, 
  subtree: true,
  attributes: true, // Watch for attribute changes like data-url or similar
  attributeFilter: ['href', 'data-url'] // Optimize which attributes to watch if needed
});


// Enhanced AI tool detection and monitoring setup
function checkForAIToolUsage() {
  const hostname = window.location.hostname.toLowerCase();
  
  // ChatGPT
  if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) {
    monitorChatGPT();
    chrome.runtime.sendMessage({ action: 'toolDetected', tool: 'chatgpt', url: window.location.href });
  }
  
  // Claude
  else if (hostname.includes('claude.ai')) {
    monitorClaude();
    chrome.runtime.sendMessage({ action: 'toolDetected', tool: 'claude', url: window.location.href });
  }
  
  // Bard/Gemini
  else if (hostname.includes('bard.google.com') || hostname.includes('gemini.google.com')) {
    monitorBard();
    chrome.runtime.sendMessage({ action: 'toolDetected', tool: 'bard', url: window.location.href });
  }
  
  // Copilot
  else if (hostname.includes('copilot.microsoft.com') || hostname.includes('bing.com/chat')) {
    monitorCopilot();
    chrome.runtime.sendMessage({ action: 'toolDetected', tool: 'copilot', url: window.location.href });
  }
  // Add more tools here as needed, using similar patterns
  // Perplexity AI
  else if (hostname.includes('perplexity.ai')) {
      // Perplexity might not have traditional "queries" in the same way,
      // but we can track searches.
      // Look for search input and answer sections.
      const searchInput = document.querySelector('textarea[placeholder*="Ask"]');
      if (searchInput) {
          searchInput.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' && searchInput.value.trim()) {
                  queryCounters.perplexity++;
                  tokenCounters.perplexity.input += estimateTokens(searchInput.value);
                  sendUsageData('perplexity', {
                      queries: queryCounters.perplexity,
                      inputTokens: tokenCounters.perplexity.input
                  });
              }
          });
      }

      const answerContainer = document.querySelector('.answer-box, .text-block'); // Common class for answers
      if (answerContainer) {
          const observer = new MutationObserver((mutations) => {
              mutations.forEach(mutation => {
                  if (mutation.addedNodes.length > 0) {
                      mutation.addedNodes.forEach(node => {
                          if (node.nodeType === Node.ELEMENT_NODE && node.textContent.trim() && !node.dataset.processed) {
                              tokenCounters.perplexity.output += estimateTokens(node.textContent);
                              sendUsageData('perplexity', { outputTokens: tokenCounters.perplexity.output });
                              node.dataset.processed = 'true';
                          }
                      });
                  }
              });
          });
          observer.observe(answerContainer, { childList: true, subtree: true });
          observers.push(observer);
      }
      chrome.runtime.sendMessage({ action: 'toolDetected', tool: 'perplexity', url: window.location.href });
  }
  // Character.AI
  else if (hostname.includes('character.ai')) {
      const chatContainer = document.querySelector('div.chat-feed-container');
      if (chatContainer) {
          const observer = new MutationObserver((mutations) => {
              mutations.forEach(mutation => {
                  mutation.addedNodes.forEach(node => {
                      if (node.nodeType === Node.ELEMENT_NODE) {
                          // User messages
                          const userMessages = node.querySelectorAll('.ch-message-bubble.ch-message-user');
                          userMessages.forEach(msg => {
                              const text = msg.textContent || '';
                              if (text.trim() && !msg.dataset.processed) {
                                  queryCounters.character++;
                                  tokenCounters.character.input += estimateTokens(text);
                                  msg.dataset.processed = 'true';
                              }
                          });
                          // Character responses
                          const botMessages = node.querySelectorAll('.ch-message-bubble.ch-message-bot');
                          botMessages.forEach(msg => {
                              const text = msg.textContent || '';
                              if (text.trim() && !msg.dataset.processed) {
                                  tokenCounters.character.output += estimateTokens(text);
                                  msg.dataset.processed = 'true';
                              }
                          });
                          sendUsageData('character', {
                              queries: queryCounters.character,
                              inputTokens: tokenCounters.character.input,
                              outputTokens: tokenCounters.character.output
                          });
                      }
                  });
              });
          });
          observer.observe(chatContainer, { childList: true, subtree: true });
          observers.push(observer);
      }
      chrome.runtime.sendMessage({ action: 'toolDetected', tool: 'character', url: window.location.href });
  }
  // Hugging Face Chat
  else if (hostname.includes('huggingface.co/chat')) {
      const chatContainer = document.querySelector('.chat-container, .dark\\:bg-gray-900');
      if (chatContainer) {
          const observer = new MutationObserver((mutations) => {
              mutations.forEach(mutation => {
                  mutation.addedNodes.forEach(node => {
                      if (node.nodeType === Node.ELEMENT_NODE) {
                          // User and bot messages typically have distinct styling or attributes
                          const userMessages = node.querySelectorAll('.message-bubble.user, .user-message-container');
                          userMessages.forEach(msg => {
                              const text = msg.textContent || '';
                              if (text.trim() && !msg.dataset.processed) {
                                  queryCounters.huggingface++;
                                  tokenCounters.huggingface.input += estimateTokens(text);
                                  msg.dataset.processed = 'true';
                              }
                          });

                          const botMessages = node.querySelectorAll('.message-bubble.bot, .bot-message-container');
                          botMessages.forEach(msg => {
                              const text = msg.textContent || '';
                              if (text.trim() && !msg.dataset.processed) {
                                  tokenCounters.huggingface.output += estimateTokens(text);
                                  msg.dataset.processed = 'true';
                              }
                          });
                          sendUsageData('huggingface', {
                              queries: queryCounters.huggingface,
                              inputTokens: tokenCounters.huggingface.input,
                              outputTokens: tokenCounters.huggingface.output
                          });
                      }
                  });
              });
          });
          observer.observe(chatContainer, { childList: true, subtree: true });
          observers.push(observer);
      }
      chrome.runtime.sendMessage({ action: 'toolDetected', tool: 'huggingface', url: window.location.href });
  }
}

// Initialize monitoring
checkForAIToolUsage();
monitorFormSubmissions();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  observers.forEach(obs => obs.disconnect());
  urlChangeObserver.disconnect(); // Disconnect the URL change observer too
});