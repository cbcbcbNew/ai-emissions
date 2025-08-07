// Enhanced Content script for AI Tools Usage Tracker
// This runs on every page and tracks queries, tokens, and image generation

let lastUrl = location.href;
let observers = [];
let queryCounters = {};
let tokenCounters = {};
let imageCounters = {};
let processedElements = new Set(); // Track processed elements to prevent double counting
let debounceTimers = {}; // Debounce usage data sending

// Initialize counters for each tool
const initializeCounters = () => {
  const tools = ['chatgpt', 'claude', 'bard', 'copilot', 'perplexity', 'character', 'huggingface'];
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

// Debounced function to send usage data
const debouncedSendUsageData = (tool, data) => {
  if (debounceTimers[tool]) {
    clearTimeout(debounceTimers[tool]);
  }
  
  debounceTimers[tool] = setTimeout(() => {
    sendUsageData(tool, data);
  }, 1000); // 1 second debounce
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

// Helper function to check if element was already processed
const isElementProcessed = (element) => {
  return processedElements.has(element) || element.dataset.processed === 'true';
};

// Helper function to mark element as processed
const markElementProcessed = (element) => {
  processedElements.add(element);
  element.dataset.processed = 'true';
};

// ChatGPT specific monitoring
const monitorChatGPT = () => {
  console.log('Setting up ChatGPT monitoring...');
  
  // Try multiple selectors for the chat container
  const chatContainer = document.querySelector('[data-testid="conversation-turn-0"]')?.parentElement ||
                       document.querySelector('.flex.flex-col.text-sm') ||
                       document.querySelector('[role="main"]') ||
                       document.querySelector('[data-testid="conversation-container"]') ||
                       document.querySelector('.conversation-container') ||
                       document.querySelector('main');
  
  if (!chatContainer) {
    console.log('ChatGPT: No chat container found, trying alternative approach...');
    // Fallback: monitor the entire document for ChatGPT-specific elements
    monitorChatGPTFallback();
    return;
  }

  console.log('ChatGPT: Chat container found:', chatContainer);

  const observer = new MutationObserver((mutations) => {
    let hasChanges = false;
    
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check for new messages with multiple selector strategies
          const messageElements = node.querySelectorAll('[data-message-author-role], [data-testid*="message"], .message, .chat-message');
          messageElements.forEach((element) => {
            if (isElementProcessed(element)) return;
            
            const role = element.getAttribute('data-message-author-role') || 
                        element.getAttribute('data-testid')?.includes('user') ? 'user' : 
                        element.getAttribute('data-testid')?.includes('assistant') ? 'assistant' : null;
            const text = element.textContent || '';
            
            console.log('ChatGPT: Found message element:', { role, text: text.substring(0, 50), element });
            
            // Only count user queries when the role is 'user'
            if (role === 'user' && text.trim()) {
              queryCounters.chatgpt++;
              tokenCounters.chatgpt.input += estimateTokens(text);
              hasChanges = true;
              console.log('ChatGPT: User query detected:', { queries: queryCounters.chatgpt, tokens: tokenCounters.chatgpt.input });
            } else if (role === 'assistant' && text.trim()) {
              tokenCounters.chatgpt.output += estimateTokens(text);
              hasChanges = true;
              console.log('ChatGPT: Assistant response detected:', { tokens: tokenCounters.chatgpt.output });
            }
            
            markElementProcessed(element);
          });

          // Check for generated images more specifically
          const images = node.querySelectorAll('[data-message-author-role="assistant"] img[alt*="generated"], [data-message-author-role="assistant"] img[src*="dalle"], img[alt*="generated"], img[src*="dalle"]');
          if (images.length > 0) {
            imageCounters.chatgpt += images.length;
            hasChanges = true;
            console.log('ChatGPT: Generated images detected:', { images: imageCounters.chatgpt });
          }
        }
      });
    });
    
    // Only send update if there were actual changes
    if (hasChanges) {
      console.log('ChatGPT: Sending usage update:', {
        queries: queryCounters.chatgpt,
        inputTokens: tokenCounters.chatgpt.input,
        outputTokens: tokenCounters.chatgpt.output,
        images: imageCounters.chatgpt
      });
      debouncedSendUsageData('chatgpt', {
        queries: queryCounters.chatgpt,
        inputTokens: tokenCounters.chatgpt.input,
        outputTokens: tokenCounters.chatgpt.output,
        images: imageCounters.chatgpt
      });
    }
  });

  observer.observe(chatContainer, { childList: true, subtree: true });
  observers.push(observer);
  
  // Also monitor form submissions specifically for ChatGPT
  monitorChatGPTFormSubmissions();
};

// Fallback monitoring for ChatGPT
const monitorChatGPTFallback = () => {
  console.log('ChatGPT: Using fallback monitoring...');
  
  // Monitor the entire document for any ChatGPT-related elements
  const observer = new MutationObserver((mutations) => {
    let hasChanges = false;
    
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Look for any elements that might contain user messages
          const potentialUserMessages = node.querySelectorAll('[data-testid*="user"], [class*="user"], [class*="message"], [role="textbox"]');
          
          potentialUserMessages.forEach((element) => {
            if (isElementProcessed(element)) return;
            
            const text = element.textContent || '';
            // Only count if it looks like a user message (not empty, not just whitespace)
            if (text.trim() && text.length > 1 && !text.includes('ChatGPT') && !text.includes('Assistant')) {
              queryCounters.chatgpt++;
              tokenCounters.chatgpt.input += estimateTokens(text);
              hasChanges = true;
              console.log('ChatGPT Fallback: User message detected:', { text: text.substring(0, 50), queries: queryCounters.chatgpt });
              markElementProcessed(element);
            }
          });
        }
      });
    });
    
    if (hasChanges) {
      debouncedSendUsageData('chatgpt', {
        queries: queryCounters.chatgpt,
        inputTokens: tokenCounters.chatgpt.input,
        outputTokens: tokenCounters.chatgpt.output,
        images: imageCounters.chatgpt
      });
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
  observers.push(observer);
};

// Monitor ChatGPT form submissions specifically
const monitorChatGPTFormSubmissions = () => {
  // Monitor for the ChatGPT input form
  const inputForm = document.querySelector('form[data-testid="send-button-form"]') ||
                   document.querySelector('form[role="search"]') ||
                   document.querySelector('form');
  
  if (inputForm) {
    console.log('ChatGPT: Found input form, monitoring submissions...');
    
    inputForm.addEventListener('submit', (event) => {
      const textarea = inputForm.querySelector('textarea, input[type="text"], [contenteditable="true"]');
      if (textarea) {
        const text = textarea.value || textarea.textContent || '';
        if (text.trim()) {
          queryCounters.chatgpt++;
          tokenCounters.chatgpt.input += estimateTokens(text);
          console.log('ChatGPT Form: Query submitted:', { text: text.substring(0, 50), queries: queryCounters.chatgpt });
          sendUsageData('chatgpt', { queries: queryCounters.chatgpt, inputTokens: tokenCounters.chatgpt.input });
        }
      }
    });
  }
  
  // Also monitor for Enter key presses in textareas
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      const target = event.target;
      if (target.tagName === 'TEXTAREA' || target.getAttribute('contenteditable') === 'true') {
        const text = target.value || target.textContent || '';
        if (text.trim() && window.location.hostname.includes('chat.openai.com')) {
          queryCounters.chatgpt++;
          tokenCounters.chatgpt.input += estimateTokens(text);
          console.log('ChatGPT Keydown: Query submitted:', { text: text.substring(0, 50), queries: queryCounters.chatgpt });
          sendUsageData('chatgpt', { queries: queryCounters.chatgpt, inputTokens: tokenCounters.chatgpt.input });
        }
      }
    }
  });
};

// Claude specific monitoring
const monitorClaude = () => {
  const chatContainer = document.querySelector('[data-testid="conversation"]') ||
                       document.querySelector('.flex-1.overflow-hidden') ||
                       document.querySelector('main');
  
  if (!chatContainer) return;

  const observer = new MutationObserver((mutations) => {
    let hasChanges = false;
    
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // User messages often have a distinct parent or data attribute
          const userMessages = node.querySelectorAll('.text-message.user-message-container, [data-testid^="user-message"]');
          userMessages.forEach((element) => {
            if (isElementProcessed(element)) return;
            
            const text = element.textContent || '';
            if (text.trim()) {
              queryCounters.claude++;
              tokenCounters.claude.input += estimateTokens(text);
              hasChanges = true;
              markElementProcessed(element);
            }
          });

          // Assistant responses usually follow a different structure
          const assistantMessages = node.querySelectorAll('.text-message.assistant-message-container, [data-testid^="assistant-message"]');
          assistantMessages.forEach((element) => {
            if (isElementProcessed(element)) return;
            
            const text = element.textContent || '';
            if (text.trim()) {
              tokenCounters.claude.output += estimateTokens(text);
              hasChanges = true;
              markElementProcessed(element);
            }
          });
        }
      });
    });
    
    // Only send update if there were actual changes
    if (hasChanges) {
      debouncedSendUsageData('claude', {
        queries: queryCounters.claude,
        inputTokens: tokenCounters.claude.input,
        outputTokens: tokenCounters.claude.output,
        images: imageCounters.claude
      });
    }
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
    let hasChanges = false;
    
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check for user queries
          const userInputs = node.querySelectorAll('.user-query-text, [data-test-id="user-query-text"]');
          
          userInputs.forEach((element) => {
            if (isElementProcessed(element)) return;
            
            const text = element.textContent || '';
            if (text.trim()) {
              queryCounters.bard++;
              tokenCounters.bard.input += estimateTokens(text);
              hasChanges = true;
              markElementProcessed(element);
            }
          });

          // Check for responses
          const responses = node.querySelectorAll('.model-response-text, [data-test-id="model-response-text"]');
          
          responses.forEach((element) => {
            if (isElementProcessed(element)) return;
            
            const text = element.textContent || '';
            if (text.trim()) {
              tokenCounters.bard.output += estimateTokens(text);
              hasChanges = true;
              markElementProcessed(element);
            }
          });

          // Check for generated images more specifically
          const images = node.querySelectorAll('img.generated-image, [data-is-image-generation-output="true"] img');
          if (images.length > 0) {
            imageCounters.bard += images.length;
            hasChanges = true;
          }
        }
      });
    });
    
    // Only send update if there were actual changes
    if (hasChanges) {
      debouncedSendUsageData('bard', {
        queries: queryCounters.bard,
        inputTokens: tokenCounters.bard.input,
        outputTokens: tokenCounters.bard.output,
        images: imageCounters.bard
      });
    }
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
    let hasChanges = false;
    
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check for user messages
          const userMessages = node.querySelectorAll('[data-testid="user-message-bubble"], .user-message-bubble');
          
          userMessages.forEach((element) => {
            if (isElementProcessed(element)) return;
            
            const text = element.textContent || '';
            if (text.trim()) {
              queryCounters.copilot++;
              tokenCounters.copilot.input += estimateTokens(text);
              hasChanges = true;
              markElementProcessed(element);
            }
          });

          // Check for responses
          const responses = node.querySelectorAll('[data-testid="bot-message-bubble"], .bot-message-bubble');
                           
          responses.forEach((element) => {
            if (isElementProcessed(element)) return;
            
            const text = element.textContent || '';
            if (text.trim()) {
              tokenCounters.copilot.output += estimateTokens(text);
              hasChanges = true;
              markElementProcessed(element);
            }
          });

          // Check for generated images more specifically
          const images = node.querySelectorAll('img[src*="bing.com/images/create"], img[alt*="DALL-E"]');
          if (images.length > 0) {
            imageCounters.copilot += images.length;
            hasChanges = true;
          }
        }
      });
    });
    
    // Only send update if there were actual changes
    if (hasChanges) {
      debouncedSendUsageData('copilot', {
        queries: queryCounters.copilot,
        inputTokens: tokenCounters.copilot.input,
        outputTokens: tokenCounters.copilot.output,
        images: imageCounters.copilot
      });
    }
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
      const text = input.value || input.textContent || '';
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
        } else if (hostname.includes('perplexity.ai')) {
          queryCounters.perplexity++;
          tokenCounters.perplexity.input += estimateTokens(text);
          sendUsageData('perplexity', { queries: queryCounters.perplexity, inputTokens: tokenCounters.perplexity.input });
        } else if (hostname.includes('character.ai')) {
          queryCounters.character++;
          tokenCounters.character.input += estimateTokens(text);
          sendUsageData('character', { queries: queryCounters.character, inputTokens: tokenCounters.character.input });
        } else if (hostname.includes('huggingface.co/chat')) {
          queryCounters.huggingface++;
          tokenCounters.huggingface.input += estimateTokens(text);
          sendUsageData('huggingface', { queries: queryCounters.huggingface, inputTokens: tokenCounters.huggingface.input });
        }
      }
    });
  });
};

// Check for URL changes (for SPAs) - but don't reset counters
const urlChangeObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // Clean up previous observers
    observers.forEach(obs => obs.disconnect());
    observers = [];
    
    // Clear processed elements set for new page
    processedElements.clear();
    
    // Clear debounce timers
    Object.keys(debounceTimers).forEach(key => {
      clearTimeout(debounceTimers[key]);
    });
    debounceTimers = {};

    // Restart monitoring after URL change
    setTimeout(() => {
      checkForAIToolUsage();
    }, 500);
  }
});

// Observe the document body for URL changes (common in SPAs)
urlChangeObserver.observe(document.body, { 
  childList: true, 
  subtree: true,
  attributes: true,
  attributeFilter: ['href', 'data-url']
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
  // Perplexity AI
  else if (hostname.includes('perplexity.ai')) {
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

      const answerContainer = document.querySelector('.answer-box, .text-block');
      if (answerContainer) {
          const observer = new MutationObserver((mutations) => {
              let hasChanges = false;
              
              mutations.forEach(mutation => {
                  if (mutation.addedNodes.length > 0) {
                      mutation.addedNodes.forEach(node => {
                          if (node.nodeType === Node.ELEMENT_NODE && node.textContent.trim() && !isElementProcessed(node)) {
                              tokenCounters.perplexity.output += estimateTokens(node.textContent);
                              hasChanges = true;
                              markElementProcessed(node);
                          }
                      });
                  }
              });
              
              if (hasChanges) {
                  debouncedSendUsageData('perplexity', { outputTokens: tokenCounters.perplexity.output });
              }
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
              let hasChanges = false;
              
              mutations.forEach(mutation => {
                  mutation.addedNodes.forEach(node => {
                      if (node.nodeType === Node.ELEMENT_NODE) {
                          // User messages
                          const userMessages = node.querySelectorAll('.ch-message-bubble.ch-message-user');
                          userMessages.forEach(msg => {
                              if (isElementProcessed(msg)) return;
                              
                              const text = msg.textContent || '';
                              if (text.trim()) {
                                  queryCounters.character++;
                                  tokenCounters.character.input += estimateTokens(text);
                                  hasChanges = true;
                                  markElementProcessed(msg);
                              }
                          });
                          // Character responses
                          const botMessages = node.querySelectorAll('.ch-message-bubble.ch-message-bot');
                          botMessages.forEach(msg => {
                              if (isElementProcessed(msg)) return;
                              
                              const text = msg.textContent || '';
                              if (text.trim()) {
                                  tokenCounters.character.output += estimateTokens(text);
                                  hasChanges = true;
                                  markElementProcessed(msg);
                              }
                          });
                      }
                  });
              });
              
              if (hasChanges) {
                  debouncedSendUsageData('character', {
                      queries: queryCounters.character,
                      inputTokens: tokenCounters.character.input,
                      outputTokens: tokenCounters.character.output
                  });
              }
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
              let hasChanges = false;
              
              mutations.forEach(mutation => {
                  mutation.addedNodes.forEach(node => {
                      if (node.nodeType === Node.ELEMENT_NODE) {
                          // User and bot messages typically have distinct styling or attributes
                          const userMessages = node.querySelectorAll('.message-bubble.user, .user-message-container');
                          userMessages.forEach(msg => {
                              if (isElementProcessed(msg)) return;
                              
                              const text = msg.textContent || '';
                              if (text.trim()) {
                                  queryCounters.huggingface++;
                                  tokenCounters.huggingface.input += estimateTokens(text);
                                  hasChanges = true;
                                  markElementProcessed(msg);
                              }
                          });

                          const botMessages = node.querySelectorAll('.message-bubble.bot, .bot-message-container');
                          botMessages.forEach(msg => {
                              if (isElementProcessed(msg)) return;
                              
                              const text = msg.textContent || '';
                              if (text.trim()) {
                                  tokenCounters.huggingface.output += estimateTokens(text);
                                  hasChanges = true;
                                  markElementProcessed(msg);
                              }
                          });
                      }
                  });
              });
              
              if (hasChanges) {
                  debouncedSendUsageData('huggingface', {
                      queries: queryCounters.huggingface,
                      inputTokens: tokenCounters.huggingface.input,
                      outputTokens: tokenCounters.huggingface.output
                  });
              }
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
  urlChangeObserver.disconnect();
  
  // Clear all debounce timers
  Object.keys(debounceTimers).forEach(key => {
    clearTimeout(debounceTimers[key]);
  });
});