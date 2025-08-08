// assets/js/modules/componentLoader.js - Dynamic Component Loading
export class ComponentLoader {
    constructor() {
        this.componentCache = new Map();
        this.templatesLoaded = false;
        this.fetchTimeout = 5000; // 5 second timeout
    }

    async loadComponent(componentName, data = {}) {
        try {
            console.log(`🔄 Loading component: ${componentName}`);
            
            // Check cache first
            const cacheKey = this.getCacheKey(componentName, data);
            if (this.componentCache.has(cacheKey)) {
                console.log(`📋 Using cached component: ${componentName}`);
                return this.componentCache.get(cacheKey);
            }

            // Try to load component HTML from file, fallback to built-in
            let componentHtml;
            try {
                componentHtml = await this.fetchComponent(componentName);
                console.log(`✅ Loaded component from file: ${componentName}`);
            } catch (error) {
                console.log(`🔄 Using built-in component: ${componentName}`);
                componentHtml = this.getBuiltInComponent(componentName, data);
            }
            
            // Process template with data
            const processedHtml = this.processTemplate(componentHtml, data);
            
            // Cache the result
            this.componentCache.set(cacheKey, processedHtml);
            
            return processedHtml;
            
        } catch (error) {
            console.error(`❌ Failed to load component '${componentName}':`, error);
            return this.getFallbackComponent(componentName, data);
        }
    }

    getCacheKey(componentName, data) {
        // Create a simpler cache key
        const dataKeys = Object.keys(data).sort();
        const dataString = dataKeys.map(key => `${key}:${data[key]}`).join('|');
        return `${componentName}-${dataString}`;
    }

    async fetchComponent(componentName) {
        const componentPaths = [
            `components/${componentName}.html`,
            `assets/components/${componentName}.html`,
            `templates/${componentName}.html`,
            `components/${componentName}/index.html`
        ];
        
        for (const path of componentPaths) {
            try {
                const response = await this.fetchWithTimeout(path);
                if (response.ok) {
                    const html = await response.text();
                    if (html.trim()) {
                        return html;
                    }
                }
            } catch (error) {
                // Continue to next path
                console.debug(`⚠️ Could not load component from ${path}:`, error.message);
            }
        }
        
        throw new Error(`Component '${componentName}' not found in any path`);
    }

    async fetchWithTimeout(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeout);
        
        try {
            const response = await fetch(url, {
                signal: controller.signal,
                method: 'GET',
                cache: 'default'
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error(`Request timeout for ${url}`);
            }
            throw error;
        }
    }

    getBuiltInComponent(componentName, data = {}) {
        // Built-in components that don't require external files
        const builtInComponents = {
            header: this.createHeaderComponent(data),
            footer: this.createFooterComponent(data),
            'service-card': this.createServiceCardComponent(data),
            'category-header': this.createCategoryHeaderComponent(data),
            'search-bar': this.createSearchBarComponent(data),
            'status-indicator': this.createStatusIndicatorComponent(data),
            'theme-selector': this.createThemeSelectorComponent(data)
        };
        
        return builtInComponents[componentName] || null;
    }

    createHeaderComponent(data) {
        return `
            <header class="dashboard-header">
                <div class="header-content">
                    <div class="header-brand">
                        <h1 class="dashboard-title">
                            <span class="brand-icon">🏠</span>
                            <span class="brand-text">7Gram Dashboard</span>
                        </h1>
                        <p class="dashboard-subtitle">Your complete home services ecosystem</p>
                    </div>
                    
                    <div class="header-controls">
                        <div class="search-container">
                            <div class="search-wrapper">
                                <input type="text" 
                                       id="search" 
                                       class="search-input" 
                                       placeholder="🔍 Search services... (Ctrl+K)" 
                                       aria-label="Search services"
                                       autocomplete="off"
                                       spellcheck="false">
                                <div id="search-suggestions" class="search-suggestions" style="display: none;"></div>
                            </div>
                        </div>
                        
                        <div class="header-actions">
                            <button id="theme-toggle" class="action-button" title="Toggle theme" aria-label="Toggle theme">
                                🌙
                            </button>
                            <button id="refresh-services" class="action-button" title="Refresh services" aria-label="Refresh services">
                                🔄
                            </button>
                        </div>
                    </div>
                </div>
                
                <div id="status-bar" class="status-bar" style="display: none;">
                    <div class="status-item">
                        <span class="status-label">Online:</span>
                        <span id="services-online" class="status-count">0</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Warning:</span>
                        <span id="services-warning" class="status-count">0</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Offline:</span>
                        <span id="services-offline" class="status-count">0</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Last updated:</span>
                        <span id="last-updated" class="status-time">Never</span>
                    </div>
                </div>
            </header>
        `;
    }

    createFooterComponent(data) {
        const currentYear = new Date().getFullYear();
        const lastUpdated = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        return `
            <footer class="dashboard-footer">
                <div class="footer-content">
                    <div class="footer-section">
                        <div class="footer-brand">
                            <span class="brand-icon">🏠</span>
                            <span class="brand-text">7Gram Network</span>
                        </div>
                        <p class="footer-description">Your personal home services dashboard</p>
                    </div>
                    
                    <div class="footer-section">
                        <div class="footer-stats">
                            <div class="stat-item">
                                <span class="stat-label">Services:</span>
                                <span id="footer-service-count" class="stat-value">${data.serviceCount || '0'}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Categories:</span>
                                <span id="footer-category-count" class="stat-value">${data.categoryCount || '0'}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Uptime:</span>
                                <span id="footer-uptime" class="stat-value">${data.uptime || '99.9%'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="footer-section">
                        <div class="footer-info">
                            <p class="copyright">&copy; ${currentYear} 7Gram Network</p>
                            <p class="last-updated">Last updated: <span id="footer-last-updated">${lastUpdated}</span></p>
                        </div>
                    </div>
                </div>
            </footer>
        `;
    }

    createServiceCardComponent(data) {
        const {
            id = 'unknown',
            name = 'Unknown Service',
            description = 'No description available',
            url = '#',
            icon = '🔗',
            status = 'unknown',
            category = 'Other',
            buttonText = `Open ${name}`,
            newWindow = true
        } = data;

        const statusClass = `status-${status}`;
        const statusIcon = this.getStatusIcon(status);
        
        return `
            <div class="service-card" data-service="${id}" data-category="${category}">
                <div class="card-header">
                    <div class="service-icon">${icon}</div>
                    <div class="service-status ${statusClass}" title="Status: ${status}">
                        ${statusIcon}
                    </div>
                </div>
                
                <div class="card-content">
                    <h3 class="service-title">${this.escapeHtml(name)}</h3>
                    <p class="service-description">${this.escapeHtml(description)}</p>
                </div>
                
                <div class="card-actions">
                    <a href="${url}" 
                       class="service-link primary-button" 
                       ${newWindow ? 'target="_blank" rel="noopener noreferrer"' : ''}
                       data-service-id="${id}">
                        ${buttonText}
                    </a>
                </div>
            </div>
        `;
    }

    createCategoryHeaderComponent(data) {
        const {
            name = 'Services',
            icon = '📦',
            color = 'default',
            serviceCount = 0,
            description = ''
        } = data;
        
        return `
            <div class="category-header" data-category="${this.slugify(name)}">
                <div class="category-info">
                    <h2 class="category-title">
                        <span class="category-icon">${icon}</span>
                        <span class="category-name">${this.escapeHtml(name)}</span>
                        <span class="category-count">(${serviceCount})</span>
                    </h2>
                    ${description ? `<p class="category-description">${this.escapeHtml(description)}</p>` : ''}
                </div>
                
                <div class="category-actions">
                    <button class="category-toggle" aria-label="Toggle category visibility">
                        <span class="toggle-icon">−</span>
                    </button>
                </div>
            </div>
        `;
    }

    createSearchBarComponent(data) {
        return `
            <div class="search-bar-component">
                <div class="search-wrapper">
                    <input type="text" 
                           id="search" 
                           class="search-input" 
                           placeholder="🔍 Search services... (Ctrl+K)" 
                           aria-label="Search services"
                           autocomplete="off"
                           spellcheck="false">
                    <button class="search-clear" id="search-clear" style="display: none;" aria-label="Clear search">
                        ✕
                    </button>
                </div>
                <div id="search-suggestions" class="search-suggestions" style="display: none;"></div>
            </div>
        `;
    }

    createStatusIndicatorComponent(data) {
        const { status = 'unknown', label = '', showLabel = true } = data;
        const statusIcon = this.getStatusIcon(status);
        
        return `
            <div class="status-indicator status-${status}" title="Status: ${status}">
                <span class="status-icon">${statusIcon}</span>
                ${showLabel && label ? `<span class="status-label">${this.escapeHtml(label)}</span>` : ''}
            </div>
        `;
    }

    createThemeSelectorComponent(data) {
        const themes = data.themes || [
            { id: 'light', name: 'Light', icon: '☀️' },
            { id: 'dark', name: 'Dark', icon: '🌙' },
            { id: 'auto', name: 'Auto', icon: '🔄' }
        ];
        
        const themeOptions = themes.map(theme => 
            `<option value="${theme.id}">${theme.icon} ${theme.name}</option>`
        ).join('');
        
        return `
            <div class="theme-selector-component">
                <label for="theme-select" class="theme-label">Theme:</label>
                <select id="theme-select" class="theme-select" aria-label="Select theme">
                    ${themeOptions}
                </select>
            </div>
        `;
    }

    getStatusIcon(status) {
        const statusIcons = {
            'healthy': '🟢',
            'online': '🟢',
            'warning': '🟡',
            'degraded': '🟡',
            'error': '🔴',
            'offline': '🔴',
            'unknown': '⚪',
            'loading': '🔄'
        };
        
        return statusIcons[status] || statusIcons.unknown;
    }

    processTemplate(html, data) {
        if (!html || typeof html !== 'string') {
            return '';
        }
        
        let processed = html;
        
        try {
            // Simple variable replacement: {{variable}}
            processed = processed.replace(/\{\{(\w+)\}\}/g, (match, key) => {
                return data[key] !== undefined ? this.escapeHtml(String(data[key])) : '';
            });
            
            // Current timestamp: {{timestamp}}
            processed = processed.replace(/\{\{timestamp\}\}/g, () => {
                return new Date().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            });
            
            // Current year: {{year}}
            processed = processed.replace(/\{\{year\}\}/g, () => {
                return new Date().getFullYear().toString();
            });
            
        } catch (error) {
            console.warn('⚠️ Template processing error:', error);
            return html; // Return original if processing fails
        }
        
        return processed;
    }

    getFallbackComponent(componentName, data) {
        console.warn(`⚠️ Using fallback for component: ${componentName}`);
        
        // Simple fallback components
        const fallbacks = {
            header: `
                <div class="header-fallback">
                    <h1>🏠 7Gram Dashboard</h1>
                    <div class="search-container">
                        <input type="text" id="search" placeholder="🔍 Search..." aria-label="Search services">
                    </div>
                </div>
            `,
            footer: `
                <div class="footer-fallback">
                    <p>&copy; ${new Date().getFullYear()} 7Gram Network</p>
                </div>
            `,
            'service-card': `
                <div class="service-card-fallback">
                    <h3>${data.name || 'Service'}</h3>
                    <p>${data.description || 'No description'}</p>
                    <a href="${data.url || '#'}" target="_blank">Open</a>
                </div>
            `
        };
        
        return fallbacks[componentName] || `<div class="component-fallback">Component '${componentName}' unavailable</div>`;
    }

    // Utility methods
    escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
            return '';
        }
        
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    slugify(text) {
        return text.toLowerCase()
                  .trim()
                  .replace(/[^a-z0-9]/g, '-')
                  .replace(/-+/g, '-')
                  .replace(/^-|-$/g, '');
    }

    // Enhanced component injection with better error handling
    async injectComponent(elementId, componentName, data = {}) {
        const element = document.getElementById(elementId);
        if (!element) {
            console.error(`❌ Element with ID '${elementId}' not found`);
            return false;
        }
        
        try {
            console.log(`🔄 Injecting component '${componentName}' into '${elementId}'`);
            
            const html = await this.loadComponent(componentName, data);
            element.innerHTML = html;
            
            // Initialize component functionality
            await this.initializeComponent(elementId, componentName, data);
            
            console.log(`✅ Component '${componentName}' injected successfully`);
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to inject component '${componentName}':`, error);
            
            // Insert error placeholder
            element.innerHTML = `
                <div class="component-error">
                    <p>⚠️ Failed to load ${componentName}</p>
                    <button onclick="location.reload()">Retry</button>
                </div>
            `;
            return false;
        }
    }

    // Initialize component-specific functionality
    async initializeComponent(elementId, componentName, data = {}) {
        try {
            switch (componentName) {
                case 'header':
                    await this.initializeHeader(elementId);
                    break;
                case 'search-bar':
                    await this.initializeSearchBar(elementId);
                    break;
                case 'service-card':
                    await this.initializeServiceCard(elementId, data);
                    break;
                case 'category-header':
                    await this.initializeCategoryHeader(elementId);
                    break;
                case 'theme-selector':
                    await this.initializeThemeSelector(elementId);
                    break;
            }
        } catch (error) {
            console.warn(`⚠️ Component initialization failed for ${componentName}:`, error);
        }
    }

    async initializeHeader(elementId) {
        // Initialize search functionality
        const searchInput = document.getElementById('search');
        if (searchInput) {
            console.log('✅ Search input found and initialized');
            
            // Add focus/blur handlers
            searchInput.addEventListener('focus', () => {
                searchInput.parentElement?.classList.add('search-focused');
            });
            
            searchInput.addEventListener('blur', () => {
                searchInput.parentElement?.classList.remove('search-focused');
            });
        }
        
        // Initialize action buttons
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                console.log('🎨 Theme toggle clicked');
                // Theme toggle will be handled by themeManager
            });
        }
        
        const refreshButton = document.getElementById('refresh-services');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                console.log('🔄 Refresh services clicked');
                // Service refresh will be handled by serviceLoader
            });
        }
    }

    async initializeSearchBar(elementId) {
        const searchInput = document.getElementById('search');
        const clearButton = document.getElementById('search-clear');
        
        if (searchInput && clearButton) {
            searchInput.addEventListener('input', (e) => {
                clearButton.style.display = e.target.value ? 'block' : 'none';
            });
            
            clearButton.addEventListener('click', () => {
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input'));
                searchInput.focus();
            });
        }
    }

    async initializeServiceCard(elementId, data) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const serviceLink = element.querySelector('.service-link');
        if (serviceLink) {
            serviceLink.addEventListener('click', (e) => {
                // Add click feedback
                serviceLink.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    serviceLink.style.transform = '';
                }, 150);
                
                console.log(`🔗 Opening service: ${data.name || 'unknown'}`);
            });
        }
    }

    async initializeCategoryHeader(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const toggleButton = element.querySelector('.category-toggle');
        if (toggleButton) {
            toggleButton.addEventListener('click', () => {
                const category = element.closest('.category');
                if (category) {
                    category.classList.toggle('collapsed');
                    const icon = toggleButton.querySelector('.toggle-icon');
                    if (icon) {
                        icon.textContent = category.classList.contains('collapsed') ? '+' : '−';
                    }
                }
            });
        }
    }

    async initializeThemeSelector(elementId) {
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) {
            themeSelect.addEventListener('change', (e) => {
                console.log(`🎨 Theme changed to: ${e.target.value}`);
                // Theme change will be handled by themeManager
            });
        }
    }

    // Batch operations
    async loadMultipleComponents(components) {
        console.log(`🔄 Loading ${components.length} components...`);
        
        const results = await Promise.allSettled(
            components.map(async (component) => {
                if (typeof component === 'string') {
                    return {
                        name: component,
                        html: await this.loadComponent(component)
                    };
                } else {
                    return {
                        name: component.name,
                        html: await this.loadComponent(component.name, component.data || {})
                    };
                }
            })
        );
        
        const successful = results.filter(r => r.status === 'fulfilled').length;
        console.log(`✅ Loaded ${successful}/${components.length} components`);
        
        return results;
    }

    // Cache management
    clearCache() {
        this.componentCache.clear();
        console.log('🧹 Component cache cleared');
    }

    getCacheStats() {
        return {
            size: this.componentCache.size,
            keys: Array.from(this.componentCache.keys()),
            memory: JSON.stringify(Array.from(this.componentCache.entries())).length
        };
    }
}

// Export default for easier importing
export default ComponentLoader;