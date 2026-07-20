// Live Conditions Feed - Teable API Integration with Error Handling
class ConditionsFeed {
    constructor(config) {
        this.config = {
            teableBaseUrl: config.teableBaseUrl || 'https://teable-snickers-u27640.vm.elestio.app',
            tableId: config.tableId || '', // MUST be set to your reports table ID
            apiToken: config.apiToken || '',
            springSlug: config.springSlug || '',
            maxReports: config.maxReports || 5,
            ...config
        };
        
        this.container = document.getElementById('reports-container');
        this.lastVerifiedElement = document.getElementById('last-verified-time');
        this.reportButton = document.getElementById('report-conditions-btn');
        this.isLoading = false;
        this.hasError = false;
        
        this.initWithFallback();
    }
    
    // Initialize with graceful error handling
    initWithFallback() {
        // Validate configuration silently
        const errors = [];
        
        if (!this.config.apiToken) {
            errors.push('API token missing');
        }
        
        if (!this.config.tableId) {
            errors.push('Table ID missing');
        }
        
        if (!this.config.springSlug) {
            errors.push('Spring slug missing');
        }
        
        if (errors.length > 0) {
            console.warn('Conditions Feed: Configuration issues detected:', errors.join(', '));
            this.showErrorState('conditions-unavailable');
            this.setupReportButton(); // Always set up the report button
            return;
        }
        
        // Valid config, proceed with loading
        this.loadReportsSafely();
        this.setupReportButton();
    }
    
    // Safe wrapper around loadReports with try/catch
    async loadReportsSafely() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoadingState();
        
        try {
            const reports = await this.fetchReportsWithTimeout();
            this.hasError = false;
            
            if (!reports || reports.length === 0) {
                this.showEmptyState();
            } else {
                this.displayReports(reports);
                this.updateLastVerified(reports);
            }
        } catch (error) {
            console.error('Conditions Feed: Failed to load reports:', error);
            this.hasError = true;
            this.showErrorState('api-error');
        } finally {
            this.isLoading = false;
        }
    }
    
    // Fetch with timeout to prevent hanging
    async fetchReportsWithTimeout() {
        const timeoutMs = 10000; // 10 second timeout
        
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
        });
        
        const fetchPromise = this.fetchReports();
        
        return Promise.race([fetchPromise, timeoutPromise]);
    }
    
    // Fetch reports from Teable API
    async fetchReports() {
        try {
            const url = `${this.config.teableBaseUrl}/api/table/${this.config.tableId}/record`;
            
            const filter = {
                conjunction: "and",
                filterSet: [
                    {
                        fieldId: "spring_slug",
                        operator: "is",
                        value: this.config.springSlug
                    }
                ]
            };
            
            const params = new URLSearchParams({
                filter: JSON.stringify(filter),
                orderBy: JSON.stringify([{
                    fieldId: "created_at",
                    order: "desc"
                }]),
                take: this.config.maxReports,
                fieldKeyType: 'name'
            });
            
            const response = await fetch(`${url}?${params}`, {
                headers: {
                    'Authorization': `Bearer ${this.config.apiToken}`,
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                // Different error states
                if (response.status === 401) {
                    throw new Error('Authentication failed - invalid API token');
                } else if (response.status === 403) {
                    throw new Error('Access forbidden - check table permissions');
                } else if (response.status === 404) {
                    throw new Error('Table not found - check table ID');
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            }
            
            const data = await response.json();
            
            // Check if data has expected structure
            if (!data || !Array.isArray(data.records)) {
                console.warn('Conditions Feed: Unexpected API response format:', data);
                return [];
            }
            
            // Transform with null safety
            return data.records.map((record, index) => {
                try {
                    const fields = record.fields || {};
                    return {
                        id: record.id || `report-${index}`,
                        visitDate: fields.visit_date || null,
                        crowdLevel: this.parseCrowdLevel(fields.crowd_level),
                        waterTemp: this.parseNumber(fields.water_temp),
                        isOpen: this.parseBoolean(fields.is_open, true), // Default to open if unknown
                        photoUrl: fields.photo_url || null,
                        notes: fields.notes || null,
                        createdAt: fields.created_at || null
                    };
                } catch (err) {
                    console.warn('Conditions Feed: Error processing report record:', err, record);
                    return null;
                }
            }).filter(Boolean); // Remove null entries
            
        } catch (error) {
            // Network errors, JSON parse errors, etc.
            if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
                throw new Error('Network error - cannot connect to Teable');
            }
            throw error;
        }
    }
    
    // Parse crowd level safely
    parseCrowdLevel(value) {
        if (value === null || value === undefined) return null;
        const num = parseInt(value, 10);
        if (isNaN(num) || num < 1 || num > 5) return null;
        return num;
    }
    
    // Parse number safely
    parseNumber(value) {
        if (value === null || value === undefined) return null;
        const num = parseFloat(value);
        return isNaN(num) ? null : num;
    }
    
    // Parse boolean safely with default
    parseBoolean(value, defaultValue = true) {
        if (value === null || value === undefined) return defaultValue;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            return value.toLowerCase() === 'true' || value === '1';
        }
        return Boolean(value);
    }
    
    // Display loading state
    showLoadingState() {
        this.container.innerHTML = `
            <div class="loading-state">
                <div class="skeleton-loader"></div>
                <div class="skeleton-loader"></div>
                <div class="skeleton-loader short"></div>
            </div>
        `;
    }
    
    // Display error state
    showErrorState(errorType) {
        const messages = {
            'api-error': {
                title: 'Conditions temporarily unavailable',
                message: 'Unable to load recent reports. Please try refreshing the page.',
                showFallback: true
            },
            'conditions-unavailable': {
                title: 'Conditions feed not configured',
                message: 'Please check the integration setup.',
                showFallback: false
            },
            'timeout': {
                title: 'Request timed out',
                message: 'The server is taking too long to respond.',
                showFallback: true
            }
        };
        
        const error = messages[errorType] || messages['api-error'];
        
        // Show fallback to static data if available
        if (error.showFallback) {
            this.lastVerifiedElement.textContent = 'Not recently verified';
        }
        
        this.container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">⚠️</div>
                <div class="error-title">${error.title}</div>
                <div class="error-message">${error.message}</div>
                <button class="retry-btn" onclick="window.conditionsFeed.loadReportsSafely()">
                    🔄 Try Again
                </button>
            </div>
        `;
    }
    
    // Display empty state
    showEmptyState() {
        this.lastVerifiedElement.textContent = 'Not recently verified';
        
        this.container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📊</div>
                <div class="empty-title">No recent reports</div>
                <div class="empty-message">
                    Be the first to share current conditions!
                </div>
            </div>
        `;
    }
    
    // Safe display of reports
    displayReports(reports) {
        if (!reports || !Array.isArray(reports) || reports.length === 0) {
            this.showEmptyState();
            return;
        }
        
        try {
            const html = reports
                .map(report => this.createReportHTML(report))
                .filter(html => html) // Remove any null/undefined
                .join('');
            
            if (!html) {
                this.showEmptyState();
                return;
            }
            
            this.container.innerHTML = html;
        } catch (error) {
            console.error('Conditions Feed: Error displaying reports:', error);
            this.showErrorState('api-error');
        }
    }
    
    // Create report HTML with null safety
    createReportHTML(report) {
        try {
            // Check if report has minimum required data
            if (!report || (!report.crowdLevel && !report.isOpen && !report.notes)) {
                return '';
            }
            
            const timeAgo = this.formatTimeAgo(report.createdAt);
            const crowdIndicator = this.createCrowdIndicator(report.crowdLevel);
            const statusBadge = this.createStatusBadge(report.isOpen);
            
            // Only include elements if data exists
            const tempDisplay = report.waterTemp ? 
                this.createDetailItem('Water Temp', `${report.waterTemp}°F`) : '';
            
            const visitDateDisplay = report.visitDate ? 
                this.createDetailItem('Visit Date', this.formatDate(report.visitDate)) : '';
            
            const notesHTML = report.notes ? 
                this.createNotesHTML(report.notes) : '';
            
            const photoHTML = report.photoUrl ? 
                this.createPhotoHTML(report.photoUrl) : '';
            
            return `
                <div class="report-item">
                    <div class="report-header">
                        ${crowdIndicator ? `
                            <div class="crowd-indicator">
                                ${crowdIndicator}
                                <span class="crowd-label">${this.getCrowdLabel(report.crowdLevel) || 'Unknown'}</span>
                            </div>
                        ` : ''}
                        <div>${statusBadge}</div>
                        <div class="report-time">${timeAgo}</div>
                    </div>
                    
                    ${(tempDisplay || visitDateDisplay) ? `
                        <div class="report-details">
                            ${tempDisplay}
                            ${visitDateDisplay}
                        </div>
                    ` : ''}
                    
                    ${notesHTML}
                    ${photoHTML}
                </div>
            `;
        } catch (error) {
            console.warn('Conditions Feed: Error creating report HTML:', error, report);
            return '';
        }
    }
    
    // Create detail item HTML
    createDetailItem(label, value) {
        return `
            <div class="detail-item">
                <span class="detail-label">${label}</span>
                <span class="detail-value">${value}</span>
            </div>
        `;
    }
    
    // Create notes HTML
    createNotesHTML(notes) {
        const truncated = this.truncateText(notes, 200);
        if (!truncated) return '';
        
        return `
            <div class="report-notes">
                <strong>Note:</strong> ${truncated}
            </div>
        `;
    }
    
    // Create crowd indicator with null safety
    createCrowdIndicator(level) {
        if (!level || level < 1 || level > 5) return null;
        
        const dots = [];
        for (let i = 1; i <= 5; i++) {
            const active = i <= level ? 'active' : '';
            dots.push(`<div class="crowd-dot ${active}"></div>`);
        }
        return dots.join('');
    }
    
    // Create status badge
    createStatusBadge(isOpen) {
        const status = isOpen ? 'open' : 'closed';
        const text = isOpen ? 'Open' : 'Closed';
        return `<span class="status-badge status-${status}">${text}</span>`;
    }
    
    // Create photo HTML
    createPhotoHTML(photoUrl) {
        if (!photoUrl) return '';
        
        return `
            <div class="report-photo">
                <img src="${photoUrl}" alt="Report photo" loading="lazy" onerror="this.style.display='none';">
            </div>
        `;
    }
    
    // Safe last verified update
    updateLastVerified(reports) {
        try {
            if (reports && reports.length > 0 && reports[0].createdAt) {
                const latestReport = reports[0];
                const timeAgo = this.formatTimeAgo(latestReport.createdAt);
                this.lastVerifiedElement.textContent = timeAgo;
            } else {
                this.lastVerifiedElement.textContent = 'Not recently verified';
            }
        } catch (error) {
            console.warn('Conditions Feed: Error updating last verified:', error);
            this.lastVerifiedElement.textContent = 'Unknown';
        }
    }
    
    // Setup report button
    setupReportButton() {
        if (!this.reportButton) return;
        
        // Create safe reference for retry button
        window.conditionsFeed = this;
        
        this.reportButton.addEventListener('click', () => {
            try {
                const reportFormUrl = `https://teable-snickers-u27640.vm.elestio.app/share/form/your-form-id?prefill_spring_slug=${encodeURIComponent(this.config.springSlug)}`;
                window.open(reportFormUrl, '_blank', 'width=800,height=600');
            } catch (error) {
                console.error('Conditions Feed: Error opening report form:', error);
                alert('Unable to open report form. Please try again later.');
            }
        });
    }
    
    // Format time ago with null safety
    formatTimeAgo(dateString) {
        try {
            if (!dateString) return 'Unknown';
            
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'Unknown';
            
            const now = new Date();
            const diffMs = now - date;
            
            if (diffMs < 0) return 'Just now';
            
            const diffMins = Math.floor(diffMs / (1000 * 60));
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            
            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
            if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
            if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
            if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
            
            return date.toLocaleDateString();
        } catch (error) {
            console.warn('Conditions Feed: Error formatting time:', error);
            return 'Unknown';
        }
    }
    
    // Format date with null safety
    formatDate(dateString) {
        try {
            if (!dateString) return 'Unknown';
            const date = new Date(dateString);
            return isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString();
        } catch (error) {
            console.warn('Conditions Feed: Error formatting date:', error);
            return 'Unknown';
        }
    }
    
    // Truncate text with null safety
    truncateText(text, maxLength) {
        try {
            if (!text || typeof text !== 'string') return '';
            if (text.length <= maxLength) return text;
            return text.substring(0, maxLength).trim() + '...';
        } catch (error) {
            console.warn('Conditions Feed: Error truncating text:', error);
            return '';
        }
    }
    
    // Get crowd label with null safety
    getCrowdLabel(level) {
        if (!level || level < 1 || level > 5) return 'Not rated';
        
        const labels = {
            1: 'Quiet',
            2: 'Light',
            3: 'Moderate',
            4: 'Busy',
            5: 'Packed'
        };
        return labels[level] || 'Unknown';
    }
}
    
    createCrowdIndicator(level) {
        // Level 1-5, show that many active dots
        const dots = [];
        for (let i = 1; i <= 5; i++) {
            const active = i <= level ? 'active' : '';
            dots.push(`<div class="crowd-dot ${active}"></div>`);
        }
        return dots.join('');
    }
    
    createStatusBadge(isOpen) {
        const status = isOpen ? 'open' : 'closed';
        const text = isOpen ? 'Open' : 'Closed';
        return `<span class="status-badge status-${status}">${text}</span>`;
    }
    
    createPhotoHTML(photoUrl) {
        return `
            <div class="report-photo">
                <img src="${photoUrl}" alt="Report photo" loading="lazy">
            </div>
        `;
    }
    
    updateLastVerified(reports) {
        if (reports && reports.length > 0) {
            const latestReport = reports[0];
            const timeAgo = this.formatTimeAgo(latestReport.createdAt);
            this.lastVerifiedElement.textContent = timeAgo;
        } else {
            this.lastVerifiedElement.textContent = 'No reports yet';
        }
    }
    
    setupReportButton() {
        if (!this.reportButton) return;
        
        // Link to Teable form or external reporting form
        // You'll need to update this URL with your actual Teable form
        const reportFormUrl = `https://teable-snickers-u27640.vm.elestio.app/share/form/your-form-id?prefill_spring_slug=${encodeURIComponent(this.config.springSlug)}`;
        
        this.reportButton.addEventListener('click', () => {
            // Open report form in new window
            window.open(reportFormUrl, '_blank', 'width=800,height=600');
            
            // Or use a modal if you prefer
            // this.openReportModal();
        });
    }
    
    formatTimeAgo(dateString) {
        if (!dateString) return 'Unknown';
        
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffHours < 1) {
            const diffMins = Math.floor(diffMs / (1000 * 60));
            return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
        } else if (diffHours < 24) {
            return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        } else if (diffDays < 7) {
            return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleDateString();
        }
    }
    
    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        return new Date(dateString).toLocaleDateString();
    }
    
    truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
    
    getCrowdLabel(level) {
        const labels = {
            1: 'Quiet',
            2: 'Light',
            3: 'Moderate',
            4: 'Busy',
            5: 'Packed'
        };
        return labels[level] || 'Unknown';
    }
    
    showNoReports() {
        this.container.innerHTML = `
            <div class="no-reports">
                <p>No condition reports yet for this spring.</p>
                <p>Be the first to report current conditions!</p>
            </div>
        `;
    }
    
    showError(message) {
        this.container.innerHTML = `
            <div class="no-reports">
                <p>⚠️ ${message}</p>
            </div>
        `;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const conditionsFeed = document.getElementById('conditions-feed');
    
    if (conditionsFeed) {
        const springSlug = conditionsFeed.dataset.springSlug;
        const apiToken = window.TEABLE_API_TOKEN; // Set this in your template
        
        new ConditionsFeed({
            springSlug: springSlug,
            apiToken: apiToken,
            tableId: 'reports' // Replace with your actual reports table ID
        });
    }
});
