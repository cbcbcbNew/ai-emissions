// Enhanced Background service worker for AI Tools Usage Tracker

// AI tool patterns to detect
const AI_TOOLS = {
  'chatgpt': {
    name: 'ChatGPT',
    patterns: ['chat.openai.com', 'chatgpt.com']
  },
  'claude': {
    name: 'Claude',
    patterns: ['claude.ai']
  },
  'gemini': {
    name: 'Gemini',
    patterns: ['bard.google.com', 'gemini.google.com']
  },
  'copilot': {
    name: 'Copilot',
    patterns: ['copilot.microsoft.com', 'bing.com/chat']
  },
  'perplexity': {
    name: 'Perplexity',
    patterns: ['perplexity.ai']
  },
  'character': {
    name: 'Character.AI',
    patterns: ['character.ai']
  },
  'huggingface': {
    name: 'Hugging Face',
    patterns: ['huggingface.co/chat']
  }
};

// Initialize storage on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['aiUsageStats'], (result) => {
    if (!result.aiUsageStats) {
      const initialStats = {};
      Object.keys(AI_TOOLS).forEach(key => {
        initialStats[key] = {
          visits: 0,
          queries: 0,
          inputTokens: 0,
          outputTokens: 0,
          images: 0,
          firstUsed: null,
          lastUsed: null,
          sessions: []
        };
      });
      chrome.storage.local.set({ aiUsageStats: initialStats });
    }
  });
});

// Listen for tab updates (for basic visit tracking)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    checkAndTrackVisit(tab.url);
  }
});

// Check if URL matches any AI tool and increment visit counter
function checkAndTrackVisit(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    for (const [key, tool] of Object.entries(AI_TOOLS)) {
      if (tool.patterns.some(pattern => hostname.includes(pattern))) {
        incrementVisit(key);
        break;
      }
    }
  } catch (error) {
    // Invalid URL, ignore
  }
}

// Increment visit counter for a specific AI tool
function incrementVisit(toolKey) {
  chrome.storage.local.get(['aiUsageStats'], (result) => {
    const stats = result.aiUsageStats || {};
    
    if (!stats[toolKey]) {
      stats[toolKey] = {
        visits: 0,
        queries: 0,
        inputTokens: 0,
        outputTokens: 0,
        images: 0,
        firstUsed: null,
        lastUsed: null,
        sessions: []
      };
    }
    
    stats[toolKey].visits += 1;
    stats[toolKey].lastUsed = Date.now();
    
    if (!stats[toolKey].firstUsed) {
      stats[toolKey].firstUsed = Date.now();
    }
    
    chrome.storage.local.set({ aiUsageStats: stats });
    
    console.log(`AI Tool visited: ${AI_TOOLS[toolKey].name}, Visits: ${stats[toolKey].visits}`);
  });
}

// Update usage statistics from content script with incremental updates
function updateUsageStats(toolKey, usageData) {
  console.log(`Background: Received usage data for ${toolKey}:`, {
    queries: usageData.queries,
    inputTokens: usageData.inputTokens,
    outputTokens: usageData.outputTokens,
    images: usageData.images
  });
  
  chrome.storage.local.get(['aiUsageStats'], (result) => {
    const stats = result.aiUsageStats || {};
    
    if (!stats[toolKey]) {
      stats[toolKey] = {
        visits: 0,
        queries: 0,
        inputTokens: 0,
        outputTokens: 0,
        images: 0,
        firstUsed: null,
        lastUsed: null,
        sessions: []
      };
    }
    
    // Use incremental updates instead of replacing values
    // This prevents data loss when multiple content scripts send data
    if (usageData.queries !== undefined) {
      const oldQueries = stats[toolKey].queries;
      stats[toolKey].queries = Math.max(stats[toolKey].queries, usageData.queries);
      if (stats[toolKey].queries !== oldQueries) {
        console.log(`Background: Updated queries for ${toolKey}: ${oldQueries} -> ${stats[toolKey].queries}`);
      }
    }
    if (usageData.inputTokens !== undefined) {
      const oldInputTokens = stats[toolKey].inputTokens;
      stats[toolKey].inputTokens = Math.max(stats[toolKey].inputTokens, usageData.inputTokens);
      if (stats[toolKey].inputTokens !== oldInputTokens) {
        console.log(`Background: Updated input tokens for ${toolKey}: ${oldInputTokens} -> ${stats[toolKey].inputTokens}`);
      }
    }
    if (usageData.outputTokens !== undefined) {
      const oldOutputTokens = stats[toolKey].outputTokens;
      stats[toolKey].outputTokens = Math.max(stats[toolKey].outputTokens, usageData.outputTokens);
      if (stats[toolKey].outputTokens !== oldOutputTokens) {
        console.log(`Background: Updated output tokens for ${toolKey}: ${oldOutputTokens} -> ${stats[toolKey].outputTokens}`);
      }
    }
    if (usageData.images !== undefined) {
      const oldImages = stats[toolKey].images;
      stats[toolKey].images = Math.max(stats[toolKey].images, usageData.images);
      if (stats[toolKey].images !== oldImages) {
        console.log(`Background: Updated images for ${toolKey}: ${oldImages} -> ${stats[toolKey].images}`);
      }
    }
    
    stats[toolKey].lastUsed = usageData.timestamp || Date.now();
    
    if (!stats[toolKey].firstUsed) {
      stats[toolKey].firstUsed = usageData.timestamp || Date.now();
    }
    
    // Store session data for detailed analytics
    if (usageData.queries > 0 || usageData.inputTokens > 0 || usageData.outputTokens > 0 || usageData.images > 0) {
      const sessionData = {
        timestamp: usageData.timestamp || Date.now(),
        queries: usageData.queries || 0,
        inputTokens: usageData.inputTokens || 0,
        outputTokens: usageData.outputTokens || 0,
        images: usageData.images || 0,
        url: usageData.url || ''
      };
      
      // Keep only last 100 sessions to prevent excessive storage
      if (!stats[toolKey].sessions) {
        stats[toolKey].sessions = [];
      }
      
      // Check if this session data is significantly different from the last one
      const lastSession = stats[toolKey].sessions[stats[toolKey].sessions.length - 1];
      const isNewSession = !lastSession || 
        Math.abs(lastSession.timestamp - sessionData.timestamp) > 60000 || // 1 minute gap
        lastSession.queries !== sessionData.queries ||
        lastSession.inputTokens !== sessionData.inputTokens ||
        lastSession.outputTokens !== sessionData.outputTokens ||
        lastSession.images !== sessionData.images;
      
      if (isNewSession) {
        stats[toolKey].sessions.push(sessionData);
        if (stats[toolKey].sessions.length > 100) {
          stats[toolKey].sessions = stats[toolKey].sessions.slice(-100);
        }
      }
    }
    
    chrome.storage.local.set({ aiUsageStats: stats }, () => {
      console.log(`Background: Successfully saved stats for ${toolKey}`);
    });
    
    console.log(`AI Tool usage updated: ${AI_TOOLS[toolKey]?.name || toolKey}`, {
      queries: stats[toolKey].queries,
      inputTokens: stats[toolKey].inputTokens,
      outputTokens: stats[toolKey].outputTokens,
      images: stats[toolKey].images
    });
  });
}

// Calculate daily statistics
function getDailyStats(toolKey, days = 7) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['aiUsageStats'], (result) => {
      const stats = result.aiUsageStats || {};
      const toolStats = stats[toolKey];
      
      if (!toolStats || !toolStats.sessions) {
        resolve([]);
        return;
      }
      
      const now = Date.now();
      const msPerDay = 24 * 60 * 60 * 1000;
      const dailyStats = [];
      
      for (let i = 0; i < days; i++) {
        const dayStart = now - (i * msPerDay);
        const dayEnd = dayStart + msPerDay;
        
        const daySessions = toolStats.sessions.filter(session => 
          session.timestamp >= dayStart && session.timestamp < dayEnd
        );
        
        const dayData = {
          date: new Date(dayStart).toISOString().split('T')[0],
          queries: daySessions.reduce((sum, session) => sum + (session.queries || 0), 0),
          inputTokens: daySessions.reduce((sum, session) => sum + (session.inputTokens || 0), 0),
          outputTokens: daySessions.reduce((sum, session) => sum + (session.outputTokens || 0), 0),
          images: daySessions.reduce((sum, session) => sum + (session.images || 0), 0),
          sessions: daySessions.length
        };
        
        dailyStats.unshift(dayData);
      }
      
      resolve(dailyStats);
    });
  });
}

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background: Received message:', request.action, request);
  
  // Handle tool detection from content script
  if (request.action === 'toolDetected') {
    console.log(`AI Tool detected: ${request.tool} on ${request.url}`);
    return;
  }
  
  // Handle usage tracking from content script
  if (request.action === 'usageTracked') {
    console.log(`Background: Processing usage data for ${request.tool}`, request.data);
    updateUsageStats(request.tool, request.data);
    return;
  }
  
  // Handle requests from popup
  if (request.action === 'getStats') {
    console.log('Background: Popup requested stats');
    chrome.storage.local.get(['aiUsageStats'], (result) => {
      console.log('Background: Current storage data:', result.aiUsageStats);
      sendResponse({ stats: result.aiUsageStats || {} });
    });
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'getDetailedStats') {
    console.log('Background: Popup requested detailed stats');
    chrome.storage.local.get(['aiUsageStats'], async (result) => {
      const stats = result.aiUsageStats || {};
      console.log('Background: Sending detailed stats to popup:', stats);
      
      const detailedStats = {};
      
      for (const [toolKey, toolStats] of Object.entries(stats)) {
        const dailyStats = await getDailyStats(toolKey, 7);
        detailedStats[toolKey] = {
          ...toolStats,
          dailyStats: dailyStats,
          totalTokens: (toolStats.inputTokens || 0) + (toolStats.outputTokens || 0),
          avgTokensPerQuery: toolStats.queries > 0 ? 
            Math.round(((toolStats.inputTokens || 0) + (toolStats.outputTokens || 0)) / toolStats.queries) : 0
        };
      }
      
      console.log('Background: Final detailed stats being sent:', detailedStats);
      sendResponse({ stats: detailedStats });
    });
    return true;
  }
  
  if (request.action === 'resetStats') {
    console.log('Background: Resetting all stats');
    const resetStats = {};
    Object.keys(AI_TOOLS).forEach(key => {
      resetStats[key] = {
        visits: 0,
        queries: 0,
        inputTokens: 0,
        outputTokens: 0,
        images: 0,
        firstUsed: null,
        lastUsed: null,
        sessions: []
      };
    });
    chrome.storage.local.set({ aiUsageStats: resetStats }, () => {
      console.log('Background: Stats reset successfully');
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'resetTool') {
    console.log(`Background: Resetting stats for tool: ${request.tool}`);
    const toolKey = request.tool;
    chrome.storage.local.get(['aiUsageStats'], (result) => {
      const stats = result.aiUsageStats || {};
      stats[toolKey] = {
        visits: 0,
        queries: 0,
        inputTokens: 0,
        outputTokens: 0,
        images: 0,
        firstUsed: null,
        lastUsed: null,
        sessions: []
      };
      chrome.storage.local.set({ aiUsageStats: stats }, () => {
        console.log(`Background: Stats reset for ${toolKey}`);
        sendResponse({ success: true });
      });
    });
    return true;
  }
  
  if (request.action === 'getAITools') {
    console.log('Background: Sending AI tools list');
    sendResponse({ tools: AI_TOOLS });
    return true;
  }
  
  if (request.action === 'exportData') {
    console.log('Background: Exporting data');
    chrome.storage.local.get(['aiUsageStats'], (result) => {
      const exportData = {
        exportDate: new Date().toISOString(),
        version: '2.0',
        tools: AI_TOOLS,
        stats: result.aiUsageStats || {}
      };
      sendResponse({ data: exportData });
    });
    return true;
  }
});

// Periodic cleanup of old session data (run daily)
// Note: Requires "alarms" permission in manifest.json
function initializeCleanup() {
  try {
    if (chrome.alarms) {
      chrome.alarms.create('cleanupSessions', { periodInMinutes: 1440 }); // 24 hours
      
      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'cleanupSessions') {
          cleanupOldSessions();
        }
      });
    }
  } catch (error) {
    console.log('Alarms API not available or permission missing. Cleanup will run manually.');
  }
}

// Manual cleanup function that can be called anytime
function cleanupOldSessions() {
  chrome.storage.local.get(['aiUsageStats'], (result) => {
    const stats = result.aiUsageStats || {};
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    let updated = false;
    Object.keys(stats).forEach(toolKey => {
      if (stats[toolKey].sessions) {
        const originalLength = stats[toolKey].sessions.length;
        stats[toolKey].sessions = stats[toolKey].sessions.filter(
          session => session.timestamp > thirtyDaysAgo
        );
        if (stats[toolKey].sessions.length !== originalLength) {
          updated = true;
        }
      }
    });
    
    if (updated) {
      chrome.storage.local.set({ aiUsageStats: stats });
      console.log('Cleaned up old session data');
    }
  });
}

// Initialize cleanup when extension starts
initializeCleanup();