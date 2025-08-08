// Enhanced Popup JavaScript for AI Tools Usage Tracker

document.addEventListener('DOMContentLoaded', function() {
    loadStats();
    
    // Event listeners
    document.getElementById('refreshBtn').addEventListener('click', loadStats);
    document.getElementById('resetBtn').addEventListener('click', resetStats);
    document.getElementById('exportBtn').addEventListener('click', exportStats);
    
    // Listen for storage changes to auto-refresh the popup
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.aiUsageStats) {
            console.log('Popup: Storage changed, refreshing stats...', changes.aiUsageStats);
            // Small delay to ensure the storage update is complete
            setTimeout(loadStats, 100);
        }
    });
    
    // Periodic refresh as fallback (every 2 seconds)
    setInterval(() => {
        console.log('Popup: Periodic refresh check...');
        loadStats();
    }, 2000);
    
    // Add test button for debugging
    const testButton = document.createElement('button');
    testButton.textContent = 'Test Storage Update';
    testButton.style.marginTop = '10px';
    testButton.addEventListener('click', () => {
        console.log('Popup: Test button clicked');
        // Manually trigger a storage update to test the listener
        chrome.storage.local.get(['aiUsageStats'], (result) => {
            const stats = result.aiUsageStats || {};
            if (stats.chatgpt) {
                stats.chatgpt.queries = (stats.chatgpt.queries || 0) + 1;
                chrome.storage.local.set({ aiUsageStats: stats }, () => {
                    console.log('Popup: Test storage update completed');
                });
            }
        });
    });
    document.body.appendChild(testButton);
});

// Load and display statistics
function loadStats() {
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('content');
    
    loadingEl.style.display = 'block';
    contentEl.style.display = 'none';
    
    console.log('Popup: Loading stats...');
    
    // Get AI tools list and detailed stats
    Promise.all([
        sendMessage({ action: 'getAITools' }),
        sendMessage({ action: 'getDetailedStats' })
    ]).then(([toolsResponse, statsResponse]) => {
        const tools = toolsResponse.tools;
        const stats = statsResponse.stats || {};
        
        console.log('Popup: Received stats:', stats);
        
        displayStats(tools, stats);
        
        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';
    }).catch(error => {
        console.error('Error loading stats:', error);
        loadingEl.textContent = 'Error loading statistics';
    });
}

// Display statistics in the popup
function displayStats(tools, stats) {
    const statsContainer = document.getElementById('statsContainer');
    const totalCountEl = document.getElementById('totalCount');
    const carbonIntensityEl = document.getElementById('carbonIntensity');
    
    // Calculate totals across all tools
    const totals = Object.values(stats).reduce((acc, toolStats) => {
        acc.visits += toolStats.visits || 0;
        acc.queries += toolStats.queries || 0;
        acc.inputTokens += toolStats.inputTokens || 0;
        acc.outputTokens += toolStats.outputTokens || 0;
        acc.images += toolStats.images || 0;
        return acc;
    }, { visits: 0, queries: 0, inputTokens: 0, outputTokens: 0, images: 0 });
    
    // Always display total queries as the main total
    totalCountEl.textContent = `${totals.queries} queries`;
    
    // Calculate carbon intensity: total tokens * 0.09 grams CO2
    const totalTokens = totals.inputTokens + totals.outputTokens;
    const carbonIntensity = totalTokens * 0.09;
    carbonIntensityEl.textContent = `${carbonIntensity.toFixed(2)} g CO₂`;
    
    // Clear existing stats
    statsContainer.innerHTML = '';
    
    if (totals.visits === 0 && totals.queries === 0) {
        statsContainer.innerHTML = `
            <div class="empty-state">
                <h3>No AI tools used yet</h3>
                <p>Start using AI chatbots to see your usage statistics here!</p>
            </div>
        `;
        return;
    }
    
    // Sort tools by query count (descending)
    const sortedTools = Object.entries(tools)
        .map(([key, tool]) => ({
            key,
            name: tool.name,
            stats: stats[key] || {
                visits: 0,
                queries: 0,
                inputTokens: 0,
                outputTokens: 0,
                images: 0,
                totalTokens: 0,
                avgTokensPerQuery: 0,
                firstUsed: null,
                lastUsed: null,
                sessions: [] // Ensure sessions is initialized for getDailyStats in background
            }
        }))
        .sort((a, b) => b.stats.queries - a.stats.queries); // Always sort by queries
    
    // Display each tool
    sortedTools.forEach(tool => {
        const statItem = document.createElement('div');
        statItem.className = 'stat-item';
        
        const mainCount = tool.stats.queries; // Always display queries here
        const mainLabel = 'queries';
        
        // Format numbers for display
        const formatNumber = (num) => {
            if (num === undefined || num === null) return '0'; // Handle undefined/null
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
            return num.toString();
        };
        
        // Create detailed stats HTML
        const detailedStats = `
            <div class="tool-details">
                <div class="detail-row">
                    <span class="detail-label">Visits:</span>
                    <span class="detail-value">${tool.stats.visits || 0}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Queries:</span>
                    <span class="detail-value">${tool.stats.queries || 0}</span>
                </div>
                ${tool.stats.totalTokens > 0 ? `
                <div class="detail-row">
                    <span class="detail-label">Tokens:</span>
                    <span class="detail-value">${formatNumber(tool.stats.totalTokens)}</span>
                </div>
                ` : ''}
                ${tool.stats.images > 0 ? `
                <div class="detail-row">
                    <span class="detail-label">Images:</span>
                    <span class="detail-value">${tool.stats.images}</span>
                </div>
                ` : ''}
                ${tool.stats.firstUsed ? `
                <div class="detail-row">
                    <span class="detail-label">First used:</span>
                    <span class="detail-value">${formatDate(tool.stats.firstUsed)}</span>
                </div>
                ` : ''}
                ${tool.stats.lastUsed ? `
                <div class="detail-row">
                    <span class="detail-label">Last used:</span>
                    <span class="detail-value">${formatDate(tool.stats.lastUsed)}</span>
                </div>
                ` : ''}
            </div>
        `;
        
        statItem.innerHTML = `
            <div class="tool-header" onclick="toggleDetails(this)">
                <div class="tool-name">${tool.name}</div>
                <div class="count">${mainCount} ${mainLabel}</div>
                <div class="expand-icon">▼</div>
            </div>
            ${detailedStats}
        `;
        
        statsContainer.appendChild(statItem);
    });
    
    // Add summary statistics if there's usage
    if (totals.visits > 0 || totals.queries > 0) {
        addSummaryStats(totals);
    }
}

// Add summary statistics section
function addSummaryStats(totals) {
    const summaryEl = document.getElementById('summary');
    if (!summaryEl) return;
    
    const formatNumber = (num) => {
        if (num === undefined || num === null) return '0';
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    };
    
    summaryEl.innerHTML = `
        <div class="summary-stats">
            <div class="summary-item">
                <div class="summary-number">${totals.queries}</div>
                <div class="summary-label">Total Queries</div>
            </div>
            <div class="summary-item">
                <div class="summary-number">${formatNumber(totals.inputTokens + totals.outputTokens)}</div>
                <div class="summary-label">Total Tokens</div>
            </div>
            ${totals.images > 0 ? `
            <div class="summary-item">
                <div class="summary-number">${totals.images}</div>
                <div class="summary-label">Images Generated</div>
            </div>
            ` : ''}
        </div>
    `;
}

// Toggle tool details visibility
function toggleDetails(headerElement) {
    const statItem = headerElement.parentElement;
    const details = statItem.querySelector('.tool-details');
    const icon = headerElement.querySelector('.expand-icon');
    
    if (details.style.display === 'none' || !details.style.display) {
        details.style.display = 'block';
        icon.textContent = '▲';
        statItem.classList.add('expanded');
    } else {
        details.style.display = 'none';
        icon.textContent = '▼';
        statItem.classList.remove('expanded');
    }
}

// Format date for display
function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (diffInHours < 1) {
        return 'Just now';
    } else if (diffInHours < 24) {
        return `${diffInHours}h ago`;
    } else if (diffInHours < 48) {
        return 'Yesterday';
    } else {
        const diffInDays = Math.floor(diffInHours / 24);
        // Check if it's within the current year for a more concise format
        if (date.getFullYear() === now.getFullYear()) {
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        return date.toLocaleDateString('en-US');
    }
}

// Reset all statistics
function resetStats() {
    if (confirm('Are you sure you want to reset all statistics? This action cannot be undone.')) {
        sendMessage({ action: 'resetStats' })
            .then(response => {
                if (response.success) {
                    loadStats(); // Reload stats after reset
                } else {
                    alert('Failed to reset statistics');
                }
            })
            .catch(error => {
                console.error('Error resetting stats:', error);
                alert('Error resetting statistics');
            });
    }
}

// Export statistics
function exportStats() {
    sendMessage({ action: 'exportData' })
        .then(response => {
            const dataStr = JSON.stringify(response.data, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            // Create a downloadable link and click it
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `ai-usage-stats-${new Date().toISOString().split('T')[0]}.json`;
            
            // Append to body, click, and remove
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            URL.revokeObjectURL(link.href); // Clean up the URL object
        })
        .catch(error => {
            console.error('Error exporting stats:', error);
            alert('Error exporting statistics');
        });
}

// Helper function to send messages to background script
function sendMessage(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, response => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(response);
            }
        });
    });
}

// Make functions available globally for HTML onclick handlers
window.toggleDetails = toggleDetails;
window.exportStats = exportStats;