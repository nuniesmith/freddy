// assets/js/modules/serviceLoader.js - Dynamic Service Loading
export class ServiceLoader {
    constructor() {
        this.servicesCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    async loadAllServices() {
        try {
            // Load from multiple sources
            const [
                configServices,
                discoveredServices,
                dynamicServices
            ] = await Promise.allSettled([
                this.loadConfigServices(),
                this.discoverServices(),
                this.loadDynamicServices()
            ]);

            // Combine all services
            let allServices = [];
            
            if (configServices.status === 'fulfilled') {
                allServices = [...allServices, ...configServices.value];
            }
            
            if (discoveredServices.status === 'fulfilled') {
                allServices = [...allServices, ...discoveredServices.value];
            }
            
            if (dynamicServices.status === 'fulfilled') {
                allServices = [...allServices, ...dynamicServices.value];
            }

            // Remove duplicates and validate
            const uniqueServices = this.deduplicateServices(allServices);
            const validatedServices = await this.validateServices(uniqueServices);

            console.log(`📦 Loaded ${validatedServices.length} services from ${allServices.length} total`);
            return validatedServices;

        } catch (error) {
            console.error('❌ Failed to load services:', error);
            return this.getFallbackServices();
        }
    }

    async loadConfigServices() {
        try {
            const response = await fetch('config/services.json');
            if (!response.ok) throw new Error('Services config not found');
            
            const config = await response.json();
            return config.services || [];
        } catch (error) {
            console.warn('⚠️ Could not load services config:', error.message);
            return [];
        }
    }

    async discoverServices() {
        // Discover services from directory structure
        try {
            const response = await fetch('api/discover-services');
            if (!response.ok) throw new Error('Service discovery API not available');
            
            const discovered = await response.json();
            return discovered.services || [];
        } catch (error) {
            console.warn('⚠️ Service discovery not available:', error.message);
            // Fallback to checking known service directories
            return await this.discoverFromKnownPaths();
        }
    }

    async discoverFromKnownPaths() {
        const knownServices = [
            { path: 'services/media/', category: 'Media Services' },
            { path: 'services/ai/', category: 'AI Services' },
            { path: 'services/admin/', category: 'Media Management' },
            { path: 'services/system/', category: 'System Services' }
        ];

        const discovered = [];
        
        for (const serviceDir of knownServices) {
            try {
                const services = await this.loadServicesFromDirectory(serviceDir.path, serviceDir.category);
                discovered.push(...services);
            } catch (error) {
                console.warn(`⚠️ Could not load services from ${serviceDir.path}`);
            }
        }

        return discovered;
    }

    async loadServicesFromDirectory(path, defaultCategory) {
        try {
            // Try to load an index.json from the directory
            const response = await fetch(`${path}index.json`);
            if (!response.ok) return [];

            const dirConfig = await response.json();
            
            return (dirConfig.services || []).map(service => ({
                ...service,
                category: service.category || defaultCategory,
                id: service.id || this.generateServiceId(service.name),
                discovered: true,
                discoveredFrom: path
            }));
        } catch (error) {
            return [];
        }
    }

    async loadDynamicServices() {
        // Load services that might be added at runtime
        try {
            const response = await fetch('api/dynamic-services');
            if (!response.ok) return [];
            
            const dynamic = await response.json();
            return dynamic.services || [];
        } catch (error) {
            return [];
        }
    }

    deduplicateServices(services) {
        const seen = new Set();
        return services.filter(service => {
            const key = service.id || service.name || service.url;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    async validateServices(services) {
        const validatedServices = [];
        
        for (const service of services) {
            try {
                const validated = await this.validateService(service);
                if (validated) {
                    validatedServices.push(validated);
                }
            } catch (error) {
                console.warn(`⚠️ Service validation failed for ${service.name}:`, error.message);
            }
        }

        return validatedServices;
    }

    async validateService(service) {
        // Ensure required fields
        if (!service.name || !service.url) {
            throw new Error('Service missing required fields (name, url)');
        }

        // Generate ID if missing
        if (!service.id) {
            service.id = this.generateServiceId(service.name);
        }

        // Set defaults
        const validated = {
            id: service.id,
            name: service.name,
            description: service.description || 'No description available',
            url: service.url,
            category: service.category || 'Other',
            categoryIcon: service.categoryIcon || '📦',
            categoryColor: service.categoryColor || 'system',
            icon: service.icon || '🔗',
            type: service.type || 'Service',
            version: service.version,
            buttonText: service.buttonText || `Open ${service.name}`,
            status: 'unknown',
            tags: service.tags || [],
            priority: service.priority || 0,
            healthCheck: service.healthCheck,
            discovered: service.discovered || false,
            lastUpdated: new Date().toISOString()
        };

        // Perform health check if configured
        if (service.healthCheck) {
            try {
                validated.status = await this.checkServiceHealth(service.healthCheck);
            } catch (error) {
                validated.status = 'error';
                console.warn(`❌ Health check failed for ${service.name}`);
            }
        } else {
            validated.status = 'healthy'; // Assume healthy if no health check
        }

        return validated;
    }

    async checkServiceHealth(healthCheck) {
        if (typeof healthCheck === 'string') {
            // Simple URL ping
            try {
                const response = await fetch(healthCheck, { 
                    method: 'HEAD',
                    timeout: 5000 
                });
                return response.ok ? 'healthy' : 'error';
            } catch {
                return 'error';
            }
        } else if (typeof healthCheck === 'object') {
            // Advanced health check configuration
            try {
                const response = await fetch(healthCheck.url, {
                    method: healthCheck.method || 'GET',
                    timeout: healthCheck.timeout || 5000
                });
                
                if (healthCheck.expectedStatus) {
                    return response.status === healthCheck.expectedStatus ? 'healthy' : 'warning';
                }
                
                return response.ok ? 'healthy' : 'error';
            } catch {
                return 'error';
            }
        }
        
        return 'unknown';
    }

    generateServiceId(name) {
        return name.toLowerCase()
                  .replace(/[^a-z0-9]/g, '-')
                  .replace(/-+/g, '-')
                  .replace(/^-|-$/g, '');
    }

    getFallbackServices() {
        // Return hardcoded services as fallback
        return [
            {
                id: 'emby',
                name: 'Emby',
                description: 'Premium media server for movies, TV shows, and music',
                url: 'https://emby.7gram.xyz',
                category: 'Media Services',
                categoryIcon: '🎬',
                categoryColor: 'media',
                icon: '🎬',
                status: 'healthy'
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
                status: 'healthy'
            },
            // Add more fallback services as needed
        ];
    }

    // Cache management
    setCachedServices(services) {
        this.servicesCache.set('services', {
            data: services,
            timestamp: Date.now()
        });
    }

    getCachedServices() {
        const cached = this.servicesCache.get('services');
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    clearCache() {
        this.servicesCache.clear();
    }
}