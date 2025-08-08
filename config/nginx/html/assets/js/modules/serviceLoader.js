// assets/js/modules/serviceLoader.js - Dynamic Service Loading
export class ServiceLoader {
    constructor() {
        this.servicesCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        this.loadingTimeout = 10000; // 10 seconds timeout for fetch requests
    }

    async loadAllServices() {
        console.log('🔄 Starting service loading...');
        
        try {
            // First try to get cached services
            const cached = this.getCachedServices();
            if (cached) {
                console.log('✅ Using cached services');
                return cached;
            }

            // Load from multiple sources with better error handling
            const serviceResults = await this.loadFromAllSources();
            
            // Combine and process services
            let allServices = [];
            serviceResults.forEach(result => {
                if (result.status === 'fulfilled' && Array.isArray(result.value)) {
                    allServices = [...allServices, ...result.value];
                } else if (result.status === 'rejected') {
                    console.warn('⚠️ Service source failed:', result.reason?.message);
                }
            });

            console.log(`📥 Raw services loaded: ${allServices.length}`);

            // Process services
            const uniqueServices = this.deduplicateServices(allServices);
            console.log(`🔄 After deduplication: ${uniqueServices.length}`);
            
            const validatedServices = this.validateServices(uniqueServices);
            console.log(`✅ Validated services: ${validatedServices.length}`);

            // Cache the results
            this.setCachedServices(validatedServices);

            return validatedServices;

        } catch (error) {
            console.error('❌ Failed to load services:', error);
            console.log('🔄 Using fallback services...');
            return this.getFallbackServices();
        }
    }

    async loadFromAllSources() {
        // Load from multiple sources in parallel
        return await Promise.allSettled([
            this.loadConfigServices(),
            this.loadDiscoveredServices(),
            this.loadDynamicServices()
        ]);
    }

    async loadConfigServices() {
        console.log('🔄 Loading config services...');
        
        try {
            const response = await this.fetchWithTimeout('config/services.json');
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const config = await response.json();
            
            if (!config || !Array.isArray(config.services)) {
                console.warn('⚠️ Invalid services config format');
                return [];
            }

            console.log(`✅ Loaded ${config.services.length} services from config`);
            
            // Add source information
            return config.services.map(service => ({
                ...service,
                source: 'config',
                loadedAt: new Date().toISOString()
            }));

        } catch (error) {
            console.warn('⚠️ Could not load services config:', error.message);
            return [];
        }
    }

    async loadDiscoveredServices() {
        console.log('🔄 Loading discovered services...');
        
        try {
            const response = await this.fetchWithTimeout('api/discover-services');
            
            if (!response.ok) {
                throw new Error('Service discovery API not available');
            }
            
            const discovered = await response.json();
            
            if (!discovered || !Array.isArray(discovered.services)) {
                return [];
            }

            console.log(`✅ Discovered ${discovered.services.length} services`);
            
            return discovered.services.map(service => ({
                ...service,
                source: 'discovered',
                discovered: true,
                loadedAt: new Date().toISOString()
            }));

        } catch (error) {
            console.warn('⚠️ Service discovery not available:', error.message);
            return [];
        }
    }

    async loadDynamicServices() {
        console.log('🔄 Loading dynamic services...');
        
        try {
            const response = await this.fetchWithTimeout('api/dynamic-services');
            
            if (!response.ok) {
                throw new Error('Dynamic services API not available');
            }
            
            const dynamic = await response.json();
            
            if (!dynamic || !Array.isArray(dynamic.services)) {
                return [];
            }

            console.log(`✅ Loaded ${dynamic.services.length} dynamic services`);
            
            return dynamic.services.map(service => ({
                ...service,
                source: 'dynamic',
                loadedAt: new Date().toISOString()
            }));

        } catch (error) {
            console.warn('⚠️ Dynamic services not available:', error.message);
            return [];
        }
    }

    // Fixed fetch with timeout
    async fetchWithTimeout(url, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.loadingTimeout);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
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

    deduplicateServices(services) {
        console.log('🔄 Removing duplicate services...');
        
        const seen = new Map();
        const unique = [];
        
        for (const service of services) {
            // Create a unique key
            const key = service.id || service.name || service.url;
            
            if (!key) {
                console.warn('⚠️ Service missing identifier:', service);
                continue;
            }
            
            if (seen.has(key)) {
                const existing = seen.get(key);
                console.log(`🔄 Duplicate service found: ${key} (keeping ${existing.source || 'unknown'} over ${service.source || 'unknown'})`);
                continue;
            }
            
            seen.set(key, service);
            unique.push(service);
        }
        
        return unique;
    }

    validateServices(services) {
        console.log('🔄 Validating services...');
        
        const validatedServices = [];
        let validationErrors = 0;
        
        for (const service of services) {
            try {
                const validated = this.validateService(service);
                if (validated) {
                    validatedServices.push(validated);
                }
            } catch (error) {
                validationErrors++;
                console.warn(`⚠️ Service validation failed for ${service.name || 'unknown'}:`, error.message);
                console.debug('❌ Invalid service data:', service);
            }
        }

        if (validationErrors > 0) {
            console.warn(`⚠️ ${validationErrors} services failed validation`);
        }

        return validatedServices;
    }

    validateService(service) {
        // More robust validation with better error messages
        if (!service) {
            throw new Error('Service is null or undefined');
        }

        if (typeof service !== 'object') {
            throw new Error('Service must be an object');
        }

        // Check required fields with specific error messages
        if (!service.name || typeof service.name !== 'string' || service.name.trim() === '') {
            throw new Error('Service missing required field: name (must be a non-empty string)');
        }

        if (!service.url || typeof service.url !== 'string' || service.url.trim() === '') {
            throw new Error('Service missing required field: url (must be a non-empty string)');
        }

        // Validate URL format
        try {
            new URL(service.url);
        } catch (error) {
            throw new Error(`Invalid URL format: ${service.url}`);
        }

        // Generate ID if missing
        if (!service.id) {
            service.id = this.generateServiceId(service.name);
        }

        // Create validated service with all required fields
        const validated = {
            // Required fields
            id: service.id,
            name: service.name.trim(),
            url: service.url.trim(),
            
            // Optional fields with defaults
            description: service.description || 'No description available',
            category: service.category || 'Other Services',
            categoryIcon: service.categoryIcon || '📦',
            categoryColor: service.categoryColor || 'system',
            icon: service.icon || '🔗',
            type: service.type || 'Service',
            buttonText: service.buttonText || `Open ${service.name}`,
            
            // Status and health
            status: 'unknown',
            healthCheck: service.healthCheck,
            healthCheckInterval: service.healthCheckInterval || 120000,
            healthCheckTimeout: service.healthCheckTimeout || 5000,
            
            // Metadata
            version: service.version,
            tags: Array.isArray(service.tags) ? service.tags : [],
            priority: typeof service.priority === 'number' ? service.priority : 0,
            
            // Display options
            showInDashboard: service.showInDashboard !== false, // Default to true
            newWindow: service.newWindow !== false, // Default to true
            critical: service.critical === true, // Default to false
            
            // Source tracking
            source: service.source || 'unknown',
            discovered: service.discovered === true,
            loadedAt: service.loadedAt || new Date().toISOString(),
            lastValidated: new Date().toISOString()
        };

        console.log(`✅ Validated service: ${validated.name} (${validated.id})`);
        return validated;
    }

    generateServiceId(name) {
        if (!name || typeof name !== 'string') {
            return 'unknown-' + Date.now();
        }
        
        return name.toLowerCase()
                  .trim()
                  .replace(/[^a-z0-9]/g, '-')
                  .replace(/-+/g, '-')
                  .replace(/^-|-$/g, '')
                  || 'service-' + Date.now();
    }

    getFallbackServices() {
        console.log('🔄 Loading fallback services...');
        
        // Return hardcoded services as fallback based on your config
        const fallbackServices = [
            {
                id: 'emby',
                name: 'Emby',
                description: 'Premium media server for movies, TV shows, and music',
                url: 'https://emby.7gram.xyz',
                category: 'Media Services',
                categoryIcon: '🎬',
                categoryColor: 'media',
                icon: '🎬',
                type: 'Media Server',
                status: 'healthy',
                source: 'fallback'
            },
            {
                id: 'jellyfin',
                name: 'Jellyfin',
                description: 'Free and open-source media server alternative',
                url: 'https://jellyfin.7gram.xyz',
                category: 'Media Services',
                categoryIcon: '🎬',
                categoryColor: 'media',
                icon: '📺',
                type: 'Media Server',
                status: 'healthy',
                source: 'fallback'
            },
            {
                id: 'plex',
                name: 'Plex',
                description: 'Popular streaming media server with extensive features',
                url: 'https://plex.7gram.xyz/web',
                category: 'Media Services',
                categoryIcon: '🎬',
                categoryColor: 'media',
                icon: '🍿',
                type: 'Media Server',
                status: 'healthy',
                source: 'fallback'
            },
            {
                id: 'openwebui',
                name: 'Open WebUI',
                description: 'ChatGPT-like AI interface with multiple model support',
                url: 'https://ai.7gram.xyz',
                category: 'AI Services',
                categoryIcon: '🤖',
                categoryColor: 'ai',
                icon: '🚀',
                type: 'AI Interface',
                status: 'healthy',
                source: 'fallback'
            },
            {
                id: 'home-assistant',
                name: 'Home Assistant',
                description: 'Complete home automation platform',
                url: 'https://home.7gram.xyz',
                category: 'System Services',
                categoryIcon: '🛠️',
                categoryColor: 'system',
                icon: '🏠',
                type: 'Home Automation',
                status: 'healthy',
                source: 'fallback'
            }
        ];

        // Validate fallback services too
        const validated = this.validateServices(fallbackServices);
        console.log(`✅ Fallback services loaded: ${validated.length}`);
        
        return validated;
    }

    // Health checking with proper timeout
    async checkServiceHealth(service) {
        if (!service.healthCheck) {
            return 'unknown';
        }

        const healthCheckUrl = typeof service.healthCheck === 'string' 
            ? service.healthCheck 
            : service.healthCheck.url;

        if (!healthCheckUrl) {
            return 'unknown';
        }

        try {
            const response = await this.fetchWithTimeout(healthCheckUrl, {
                method: 'HEAD',
                mode: 'no-cors' // Handle CORS issues
            });
            
            return response.ok ? 'healthy' : 'error';
        } catch (error) {
            console.warn(`❌ Health check failed for ${service.name}:`, error.message);
            return 'error';
        }
    }

    // Batch health check for all services
    async updateServiceHealth(services) {
        console.log('🔄 Updating service health...');
        
        const healthPromises = services.map(async (service) => {
            const health = await this.checkServiceHealth(service);
            return { ...service, status: health, lastHealthCheck: new Date().toISOString() };
        });

        try {
            const updatedServices = await Promise.all(healthPromises);
            console.log('✅ Service health updated');
            return updatedServices;
        } catch (error) {
            console.warn('⚠️ Some health checks failed:', error);
            return services; // Return original services if health check fails
        }
    }

    // Cache management
    setCachedServices(services) {
        this.servicesCache.set('services', {
            data: services,
            timestamp: Date.now()
        });
        console.log(`💾 Cached ${services.length} services`);
    }

    getCachedServices() {
        const cached = this.servicesCache.get('services');
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            console.log('📋 Using cached services');
            return cached.data;
        }
        return null;
    }

    clearCache() {
        this.servicesCache.clear();
        console.log('🗑️ Service cache cleared');
    }

    // Public API methods
    async reloadServices() {
        this.clearCache();
        return await this.loadAllServices();
    }

    getServiceById(id) {
        const cached = this.getCachedServices();
        return cached ? cached.find(service => service.id === id) : null;
    }

    getServicesByCategory(category) {
        const cached = this.getCachedServices();
        return cached ? cached.filter(service => service.category === category) : [];
    }

    getServiceStats() {
        const cached = this.getCachedServices();
        if (!cached) return null;

        const categories = new Set(cached.map(s => s.category));
        const statuses = cached.reduce((acc, s) => {
            acc[s.status] = (acc[s.status] || 0) + 1;
            return acc;
        }, {});

        return {
            totalServices: cached.length,
            categoriesCount: categories.size,
            categories: Array.from(categories),
            statusCounts: statuses,
            lastLoaded: this.servicesCache.get('services')?.timestamp
        };
    }
}

// Export default for easier importing
export default ServiceLoader;