// assets/js/main.js - UPDATED with Configuration Integration
import { ServiceLoader } from './modules/serviceLoader.js';
import { SearchManager } from './modules/searchManager.js';
import { ComponentLoader } from './modules/componentLoader.js';
import { ThemeManager } from './modules/themeManager.js';
import { HealthChecker } from './modules/healthChecker.js';

export class DashboardManager {
    constructor() {
        this.serviceLoader = new ServiceLoader();
        this.searchManager = new SearchManager();
        this.componentLoader = new ComponentLoader();
        this.themeManager = new ThemeManager();
        this.healthChecker = new HealthChecker();
        this.services = [];
        this.categories = [];
        
        // Loading state management
        this.loadingElement = null;
        this.isLoading = false;
        
        // Default configuration (will be overridden by config file)
        this.config = {
            enableHealthChecking: false, // Start disabled to avoid errors
            enableAutoRefresh: true,
            autoRefreshInterval: 300000,
            healthCheckInterval: 120000,
            services: {
                healthCheckEnabled: false,
                healthCheckInterval: 120000,
                healthCheckTimeout: 5000
            },
            debugging: {
                enabled: false,
                healthCheckDebugging: false
            },
            features: {
                shortcuts: {
                    enabled: true
                },
                notifications: {
                    enabled: true,
                    showHealthChanges: true
                }
            }
        };
    }

    // Loading management methods
    showLoading(show = true, message = 'Loading...') {
        if (show) {
            console.log('🔄 Loading:', message);
            
            // Create loading overlay if it doesn't exist
            if (!this.loadingElement) {
                this.loadingElement = document.createElement('div');
                this.loadingElement.id = 'dashboard-loading-overlay';
                this.loadingElement.innerHTML = `
                    <div class="loading-container">
                        <div class="loading-spinner"></div>
                        <div class="loading-message">${message}</div>
                        <div class="loading-subtitle">7gram Network Dashboard</div>
                    </div>
                `;
                
                this.addLoadingStyles();
                document.body.appendChild(this.loadingElement);
            }
            
            // Update message
            const messageEl = this.loadingElement.querySelector('.loading-message');
            if (messageEl) {
                messageEl.textContent = message;
            }
            
            this.loadingElement.style.display = 'flex';
            this.isLoading = true;
        } else {
            this.hideLoading();
        }
    }

    hideLoading() {
        console.log('✅ Loading complete');
        
        if (this.loadingElement) {
            this.loadingElement.style.opacity = '0';
            setTimeout(() => {
                if (this.loadingElement && this.loadingElement.parentNode) {
                    this.loadingElement.style.display = 'none';
                }
            }, 300);
        }
        this.isLoading = false;
    }

    updateLoadingProgress(message) {
        if (this.isLoading && this.loadingElement) {
            const messageEl = this.loadingElement.querySelector('.loading-message');
            if (messageEl) {
                messageEl.textContent = message;
            }
        }
        console.log('📦', message);
    }

    addLoadingStyles() {
        if (document.getElementById('dashboard-loading-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'dashboard-loading-styles';
        style.textContent = `
            #dashboard-loading-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.95));
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                backdrop-filter: blur(12px);
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                transition: opacity 0.3s ease;
            }
            
            .loading-container {
                text-align: center;
                color: #f8fafc;
                max-width: 400px;
                padding: 3rem 2rem;
                background: rgba(30, 41, 59, 0.9);
                border-radius: 20px;
                border: 1px solid rgba(99, 102, 241, 0.3);
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(20px);
            }
            
            .loading-spinner {
                width: 60px;
                height: 60px;
                border: 4px solid rgba(99, 102, 241, 0.2);
                border-top: 4px solid #6366f1;
                border-radius: 50%;
                animation: dashboardSpin 1s linear infinite;
                margin: 0 auto 25px;
            }
            
            .loading-message {
                font-size: 18px;
                font-weight: 600;
                color: #e2e8f0;
                margin-bottom: 10px;
                animation: dashboardPulse 2s ease-in-out infinite alternate;
                line-height: 1.5;
            }
            
            .loading-subtitle {
                font-size: 14px;
                color: #94a3b8;
                font-weight: 400;
                opacity: 0.8;
            }
            
            @keyframes dashboardSpin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            @keyframes dashboardPulse {
                from { opacity: 0.7; }
                to { opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    showError(message, details = null) {
        console.error('❌ Dashboard Error:', message, details);
        
        const errorEl = document.createElement('div');
        errorEl.className = 'dashboard-error-message';
        errorEl.innerHTML = `
            <div class="error-content">
                <div class="error-icon">⚠️</div>
                <h3>Dashboard Error</h3>
                <p>${message}</p>
                ${details ? `<details style="margin-top: 10px;"><summary>Technical Details</summary><pre style="font-size: 12px; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; overflow-x: auto;">${details}</pre></details>` : ''}
                <div class="error-actions">
                    <button onclick="location.reload()" class="error-btn-primary">Reload Dashboard</button>
                    <button onclick="this.closest('.dashboard-error-message').remove()" class="error-btn-secondary">Dismiss</button>
                </div>
            </div>
        `;
        
        this.addErrorStyles();
        document.body.appendChild(errorEl);
        
        // Auto-remove after 15 seconds
        setTimeout(() => {
            if (errorEl.parentNode) {
                errorEl.remove();
            }
        }, 15000);
    }

    addErrorStyles() {
        if (document.getElementById('dashboard-error-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'dashboard-error-styles';
        style.textContent = `
            .dashboard-error-message {
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #dc2626, #b91c1c);
                color: white;
                padding: 0;
                border-radius: 12px;
                box-shadow: 0 10px 25px rgba(220, 38, 38, 0.4);
                z-index: 10000;
                max-width: 450px;
                min-width: 350px;
                animation: slideInRight 0.3s ease-out;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            }
            
            .error-content {
                padding: 24px;
            }
            
            .error-icon {
                font-size: 28px;
                margin-bottom: 12px;
                display: block;
            }
            
            .error-content h3 {
                margin: 0 0 12px 0;
                font-size: 20px;
                font-weight: 700;
            }
            
            .error-content p {
                margin: 0 0 18px 0;
                line-height: 1.5;
                opacity: 0.95;
                font-size: 15px;
            }
            
            .error-actions {
                display: flex;
                gap: 12px;
                margin-top: 20px;
            }
            
            .error-btn-primary, .error-btn-secondary {
                padding: 10px 18px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.2s;
                font-family: inherit;
            }
            
            .error-btn-primary {
                background: rgba(255, 255, 255, 0.2);
                color: white;
                flex: 1;
            }
            
            .error-btn-primary:hover {
                background: rgba(255, 255, 255, 0.3);
                transform: translateY(-1px);
            }
            
            .error-btn-secondary {
                background: transparent;
                color: rgba(255, 255, 255, 0.8);
                border: 2px solid rgba(255, 255, 255, 0.3);
            }
            
            .error-btn-secondary:hover {
                background: rgba(255, 255, 255, 0.1);
                color: white;
                border-color: rgba(255, 255, 255, 0.5);
            }
            
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }

    async initialize() {
        try {
            console.log('🚀 Initializing 7gram Dashboard...');
            
            // Show loading state
            this.showLoading(true, 'Initializing 7gram Dashboard...');

            // Load configuration FIRST
            this.updateLoadingProgress('Loading configuration...');
            await this.loadConfig();

            // Apply URL parameter overrides
            this.applyUrlParameterOverrides();

            // Initialize debugging if enabled
            if (this.config.debugging?.enabled) {
                this.enableDebugging();
            }

            // Load components first
            this.updateLoadingProgress('Loading components...');
            await this.loadComponents();

            // Initialize theme manager
            this.updateLoadingProgress('Applying theme...');
            await this.themeManager.initialize();

            // Load services
            this.updateLoadingProgress('Loading services...');
            this.services = await this.serviceLoader.loadAllServices();
            this.categories = this.organizeServicesByCategory(this.services);

            // Initialize health checker with configuration
            const healthCheckEnabled = this.config.services?.healthCheckEnabled !== false && this.config.enableHealthChecking;
            if (healthCheckEnabled) {
                console.log('🏥 Health checking enabled - initializing...');
                this.updateLoadingProgress('Setting up health monitoring...');
                try {
                    // Configure health checker with loaded settings
                    this.configureHealthChecker();
                    await this.healthChecker.initialize(this.services);
                    this.setupHealthMonitoring();
                } catch (error) {
                    console.warn('⚠️ Health checker failed to initialize:', error.message);
                    console.log('🔄 Continuing without health checking...');
                    this.showNotification('Health checking unavailable', 'warning');
                    this.setAllServicesUnknown();
                }
            } else {
                console.log('⚠️ Health checking disabled in configuration');
                this.setAllServicesUnknown();
            }

            // Render the dashboard
            this.updateLoadingProgress('Rendering dashboard...');
            this.renderDashboard();

            // Initialize search
            this.updateLoadingProgress('Setting up search...');
            this.searchManager.initialize(this.services, this.categories);

            // Update timestamp
            this.updateTimestamp();

            // Start auto-refresh if enabled
            if (this.config.enableAutoRefresh) {
                this.startAutoRefresh();
            }

            // Setup keyboard shortcuts
            this.setupKeyboardShortcuts();

            this.updateLoadingProgress('Finalizing...');
            await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause to show completion

            console.log(`✅ Dashboard loaded with ${this.services.length} services`);
            
        } catch (error) {
            console.error('❌ Failed to initialize dashboard:', error);
            this.showError('Failed to load dashboard. Please refresh the page.', error.stack);
        } finally {
            this.showLoading(false);
        }
    }

    async loadConfig() {
        try {
            const response = await fetch('config/dashboard.json');
            if (response.ok) {
                const config = await response.json();
                // Deep merge with defaults
                this.config = this.deepMerge(this.config, config);
                console.log('✅ Configuration loaded successfully');
                
                if (this.config.debugging?.enabled) {
                    console.log('🔧 Debug mode enabled via configuration');
                    console.log('Configuration:', this.config);
                }
            } else {
                console.warn('⚠️ Could not load dashboard.json, using defaults');
            }
        } catch (error) {
            console.warn('⚠️ Error loading configuration, using defaults:', error.message);
        }
    }

    applyUrlParameterOverrides() {
        const urlParams = new URLSearchParams(window.location.search);
        
        // Health checking override
        if (urlParams.has('health')) {
            const healthEnabled = urlParams.get('health') === 'true';
            this.config.services = this.config.services || {};
            this.config.services.healthCheckEnabled = healthEnabled;
            console.log(`🔧 Health checking ${healthEnabled ? 'enabled' : 'disabled'} via URL parameter`);
        }

        // Debug mode override
        if (urlParams.has('debug')) {
            const debugEnabled = urlParams.get('debug') === 'true';
            this.config.debugging = this.config.debugging || {};
            this.config.debugging.enabled = debugEnabled;
            this.config.debugging.healthCheckDebugging = debugEnabled;
            console.log(`🔧 Debug mode ${debugEnabled ? 'enabled' : 'disabled'} via URL parameter`);
        }

        // Theme override
        if (urlParams.has('theme')) {
            const theme = urlParams.get('theme');
            this.config.ui = this.config.ui || {};
            this.config.ui.theme = theme;
            console.log(`🔧 Theme override: ${theme}`);
        }

        // Compact mode override
        if (urlParams.has('compact')) {
            const compactEnabled = urlParams.get('compact') === 'true';
            this.config.ui = this.config.ui || {};
            this.config.ui.compactMode = compactEnabled;
            console.log(`🔧 Compact mode ${compactEnabled ? 'enabled' : 'disabled'} via URL parameter`);
        }
    }

    configureHealthChecker() {
        const healthConfig = this.config.healthChecker || {};
        
        // Apply configuration to health checker
        this.healthChecker.setGlobalDefaults({
            timeout: healthConfig.timeout || 5000,
            interval: healthConfig.interval || 120000,
            maxRetries: healthConfig.maxRetries || 2,
            retryDelay: healthConfig.retryDelay || 1000,
            maxHistorySize: healthConfig.maxHistorySize || 10,
            proxyEndpoint: healthConfig.proxyEndpoint || '/api/health-proxy',
            enabled: healthConfig.enabled !== false
        });

        console.log('🔧 Health checker configured with settings:', {
            timeout: healthConfig.timeout || 5000,
            interval: healthConfig.interval || 120000,
            retries: healthConfig.maxRetries || 2,
            proxy: healthConfig.proxyEndpoint || '/api/health-proxy'
        });
    }

    enableDebugging() {
        // Enable more verbose logging
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;

        console.log = (...args) => {
            originalLog('[7GRAM]', ...args);
        };

        console.warn = (...args) => {
            originalWarn('[7GRAM WARN]', ...args);
        };

        console.error = (...args) => {
            originalError('[7GRAM ERROR]', ...args);
        };

        // Show performance metrics if enabled
        if (this.config.debugging?.showPerformanceMetrics) {
            this.enablePerformanceMetrics();
        }

        console.log('🐛 Debug mode enabled');
    }

    enablePerformanceMetrics() {
        // Track performance metrics
        const startTime = performance.now();
        
        window.addEventListener('load', () => {
            const loadTime = performance.now() - startTime;
            console.log(`⚡ Dashboard loaded in ${loadTime.toFixed(2)}ms`);
        });

        // Monitor health check performance
        document.addEventListener('serviceHealthChange', (event) => {
            if (this.config.debugging?.healthCheckDebugging) {
                const { service, currentResult } = event.detail;
                console.log(`🏥 [${service.name}] Health check completed:`, {
                    status: currentResult.status,
                    responseTime: currentResult.responseTime,
                    method: currentResult.method,
                    message: currentResult.message
                });
            }
        });
    }

    setupKeyboardShortcuts() {
        const shortcuts = this.config.features?.shortcuts;
        if (!shortcuts?.enabled) return;

        document.addEventListener('keydown', (e) => {
            // Only handle shortcuts if not typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            const key = e.key.toLowerCase();
            const hasModifier = e.ctrlKey || e.metaKey;

            // Search shortcut
            if (hasModifier && key === (shortcuts.searchKey || 'k')) {
                e.preventDefault();
                const searchInput = document.getElementById('search-input');
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
                return;
            }

            // Theme toggle shortcut
            if (hasModifier && key === (shortcuts.themeToggleKey || 't')) {
                e.preventDefault();
                this.themeManager.toggleTheme();
                return;
            }

            // Health check shortcut
            if (hasModifier && key === (shortcuts.healthCheckKey || 'h')) {
                e.preventDefault();
                if (this.config.services?.healthCheckEnabled) {
                    this.healthChecker.checkAllServices(this.services);
                    this.showNotification('Running health checks...', 'info');
                } else {
                    this.showNotification('Health checking is disabled', 'warning');
                }
                return;
            }

            // Toggle health checking shortcut
            if (hasModifier && e.shiftKey && key === (shortcuts.toggleHealthKey?.toLowerCase() || 'h')) {
                e.preventDefault();
                this.toggleHealthChecking();
                return;
            }

            // Refresh shortcut
            if (hasModifier && key === (shortcuts.refreshKey || 'r')) {
                e.preventDefault();
                location.reload();
                return;
            }

            // Help shortcut
            if (key === (shortcuts.helpKey || '?')) {
                e.preventDefault();
                this.showHelpModal();
                return;
            }
        });

        console.log('⌨️ Keyboard shortcuts enabled');
    }

    showHelpModal() {
        const shortcuts = this.config.features?.shortcuts || {};
        const helpContent = `
            <div class="help-modal">
                <h3>🔗 Keyboard Shortcuts</h3>
                <div class="shortcuts-list">
                    <div><kbd>Ctrl+${shortcuts.searchKey || 'K'}</kbd> - Focus search</div>
                    <div><kbd>Ctrl+${shortcuts.themeToggleKey || 'T'}</kbd> - Toggle theme</div>
                    <div><kbd>Ctrl+${shortcuts.healthCheckKey || 'H'}</kbd> - Run health checks</div>
                    <div><kbd>Ctrl+Shift+${shortcuts.toggleHealthKey || 'H'}</kbd> - Toggle health checking</div>
                    <div><kbd>Ctrl+${shortcuts.refreshKey || 'R'}</kbd> - Refresh dashboard</div>
                    <div><kbd>${shortcuts.helpKey || '?'}</kbd> - Show this help</div>
                </div>
                <button onclick="this.closest('.notification').remove()" class="help-close">Close</button>
            </div>
        `;

        this.showNotification(helpContent, 'info', 10000);
    }

    setAllServicesUnknown() {
        this.services.forEach(service => {
            service.status = 'unknown';
        });
    }

    deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }

    // ... rest of your existing methods stay the same

    setupHealthMonitoring() {
        document.addEventListener('serviceHealthChange', (event) => {
            const { service, currentStatus, currentResult } = event.detail;
            
            if (this.config.debugging?.healthCheckDebugging) {
                console.log(`🏥 ${service.name} status changed to: ${currentStatus}`, currentResult);
            }
            
            // Update service in our array
            const serviceIndex = this.services.findIndex(s => s.id === service.id);
            if (serviceIndex !== -1) {
                this.services[serviceIndex].status = currentStatus;
                this.updateServiceCard(service.id, this.services[serviceIndex]);
            }

            // Show notification if enabled
            if (this.config.features?.notifications?.showHealthChanges) {
                const prevStatus = event.detail.previousStatus;
                if (prevStatus && prevStatus !== currentStatus) {
                    const message = `${service.name}: ${prevStatus} → ${currentStatus}`;
                    const type = currentStatus === 'healthy' ? 'success' : 
                                currentStatus === 'warning' ? 'warning' : 'error';
                    this.showNotification(message, type);
                }
            }
        });

        document.addEventListener('healthSummaryUpdate', (event) => {
            const { summary } = event.detail;
            this.updateHealthSummary(summary);
        });
    }

    async toggleHealthChecking() {
        const isEnabled = this.config.services?.healthCheckEnabled !== false;
        
        if (isEnabled) {
            this.config.services.healthCheckEnabled = false;
            this.healthChecker.disableHealthChecking();
            this.showNotification('Health checking disabled', 'warning');
        } else {
            this.config.services.healthCheckEnabled = true;
            this.showNotification('Enabling health checking...', 'info');
            try {
                this.configureHealthChecker();
                await this.healthChecker.initialize(this.services);
                this.setupHealthMonitoring();
                this.showNotification('Health checking enabled', 'success');
            } catch (error) {
                this.config.services.healthCheckEnabled = false;
                this.showNotification('Failed to enable health checking', 'error');
                console.error('Health checking enable error:', error);
            }
        }
        
        // Re-render dashboard to show/hide health indicators
        this.renderDashboard();
    }

    showNotification(message, type = 'info', duration = 5000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        // Support HTML content
        if (typeof message === 'string' && message.includes('<')) {
            notification.innerHTML = message;
        } else {
            notification.textContent = message;
        }
        
        // Style based on configuration
        const notificationConfig = this.config.features?.notifications || {};
        const position = notificationConfig.position || 'top-right';
        const timeout = duration || notificationConfig.timeout || 5000;
        
        // Position the notification
        notification.style.cssText = `
            position: fixed;
            ${position.includes('top') ? 'top: 20px;' : 'bottom: 20px;'}
            ${position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            z-index: 10000;
            max-width: 400px;
            background: ${type === 'success' ? '#28a745' : 
                       type === 'warning' ? '#ffc107' : 
                       type === 'error' ? '#dc3545' : '#17a2b8'};
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after timeout
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, timeout);
        
        console.log(`Notification (${type}): ${typeof message === 'string' ? message : 'HTML content'}`);
    }

    // Add placeholder methods for missing functionality that your existing code might reference
    async loadComponents() {
        // Placeholder - implement your component loading logic
        if (this.componentLoader?.initialize) {
            await this.componentLoader.initialize();
        }
    }

    organizeServicesByCategory(services) {
        // Placeholder - implement your category organization logic
        const categories = {};
        services.forEach(service => {
            const category = service.category || 'Other';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(service);
        });
        return categories;
    }

    renderDashboard() {
        // Placeholder - implement your dashboard rendering logic
        console.log('🎨 Rendering dashboard with', this.services.length, 'services');
    }

    updateTimestamp() {
        // Placeholder - implement timestamp update logic
        const timestampEl = document.getElementById('last-updated');
        if (timestampEl) {
            timestampEl.textContent = new Date().toLocaleTimeString();
        }
    }

    startAutoRefresh() {
        // Placeholder - implement auto-refresh logic
        if (this.config.enableAutoRefresh) {
            setInterval(() => {
                if (this.config.services?.healthCheckEnabled && this.healthChecker) {
                    this.healthChecker.checkAllServices(this.services);
                }
            }, this.config.autoRefreshInterval || 300000);
        }
    }

    updateServiceCard(serviceId, service) {
        // Placeholder - implement service card update logic
        const cardEl = document.querySelector(`[data-service-id="${serviceId}"]`);
        if (cardEl) {
            cardEl.className = `service-card status-${service.status}`;
        }
    }

    updateHealthSummary(summary) {
        // Placeholder - implement health summary update logic
        console.log('📊 Health summary updated:', summary);
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    window.dashboard = new DashboardManager();
    await window.dashboard.initialize();
});