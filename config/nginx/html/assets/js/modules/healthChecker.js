// assets/js/modules/healthChecker.js - Service Health Monitoring
export class HealthChecker {
    constructor() {
        this.healthStatus = new Map();
        this.checkIntervals = new Map();
        this.defaultTimeout = 8000; // 8 seconds (reduced from 10)
        this.defaultInterval = 60000; // 1 minute
        this.maxRetries = 2; // Reduced from 3
        this.retryDelay = 1500; // 1.5 seconds
        this.healthHistory = new Map();
        this.maxHistorySize = 50; // Reduced to save memory
        this.proxyEndpoint = '/api/health-proxy'; // Nginx proxy endpoint
    }

    async initialize(services) {
        console.log(`🏥 Health checker initializing for ${services.length} services`);
        
        // Initial health check for all services
        await this.checkAllServices(services);
        
        // Start continuous monitoring
        this.startContinuousMonitoring(services);
        
        console.log('✅ Health checker initialized');
    }

    async checkAllServices(services) {
        const promises = services.map(service => this.checkServiceHealth(service));
        const results = await Promise.allSettled(promises);
        
        let healthyCount = 0;
        let warningCount = 0;
        let errorCount = 0;
        let unknownCount = 0;
        
        results.forEach((result, index) => {
            const service = services[index];
            if (result.status === 'fulfilled') {
                const status = result.value.status;
                switch (status) {
                    case 'healthy': healthyCount++; break;
                    case 'warning': warningCount++; break;
                    case 'error': errorCount++; break;
                    default: unknownCount++; break;
                }
            } else {
                errorCount++;
                console.error(`❌ Health check failed for ${service.name}:`, result.reason);
            }
        });
        
        console.log(`🏥 Health check summary: ${healthyCount} healthy, ${warningCount} warning, ${errorCount} error, ${unknownCount} unknown`);
        
        // Dispatch health summary event
        this.dispatchHealthSummaryEvent({
            healthy: healthyCount,
            warning: warningCount,
            error: errorCount,
            unknown: unknownCount,
            total: services.length
        });
    }

    async checkServiceHealth(service) {
        if (!service.healthCheck && !service.url) {
            return this.createHealthResult(service.id, service.name, {
                status: 'unknown',
                message: 'No health check configured',
                responseTime: null
            });
        }

        const startTime = performance.now();
        let result;

        try {
            // Use healthCheck if available, otherwise use service URL
            const checkTarget = service.healthCheck || service.url;
            result = await this.performHealthCheck(checkTarget, service);
            result.responseTime = Math.round(performance.now() - startTime);
        } catch (error) {
            result = {
                status: 'error',
                message: error.message,
                responseTime: Math.round(performance.now() - startTime),
                error: error.name
            };
        }

        const healthResult = this.createHealthResult(service.id, service.name, result);
        
        // Store and process results
        this.processHealthResult(service, healthResult);
        
        return healthResult;
    }

    createHealthResult(serviceId, serviceName, result) {
        return {
            serviceId: serviceId,
            serviceName: serviceName,
            ...result,
            timestamp: new Date().toISOString()
        };
    }

    processHealthResult(service, healthResult) {
        // Store health status
        this.healthStatus.set(service.id, healthResult);
        
        // Add to history
        this.addToHealthHistory(service.id, healthResult);
        
        // Update UI
        this.updateServiceHealthUI(service.id, healthResult);
        
        // Log significant status changes
        this.logStatusChange(service, healthResult);
    }

    async performHealthCheck(healthCheck, service) {
        if (typeof healthCheck === 'string') {
            return await this.intelligentUrlCheck(healthCheck);
        } else if (typeof healthCheck === 'object') {
            return await this.advancedHealthCheck(healthCheck, service);
        } else {
            throw new Error('Invalid health check configuration');
        }
    }

    // ✅ NEW: Intelligent URL checking with multiple fallback strategies
    async intelligentUrlCheck(url) {
        // Strategy 1: Try same-origin direct check
        if (this.isSameOrigin(url)) {
            console.log(`🔍 Same-origin health check: ${url}`);
            return await this.directHealthCheck(url);
        }
        
        // Strategy 2: Try proxy health check
        try {
            console.log(`🔍 Proxy health check: ${url}`);
            return await this.proxyHealthCheck(url);
        } catch (proxyError) {
            console.warn(`⚠️ Proxy health check failed for ${url}:`, proxyError.message);
        }
        
        // Strategy 3: Image-based connectivity test (CORS-free)
        console.log(`🔍 Image connectivity test: ${url}`);
        return await this.imageConnectivityTest(url);
    }

    // ✅ NEW: Direct health check for same-origin services
    async directHealthCheck(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeout);

        try {
            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
                cache: 'no-cache'
            });

            clearTimeout(timeoutId);
            
            if (response.ok) {
                return {
                    status: 'healthy',
                    message: 'Service responding normally',
                    httpStatus: response.status,
                    method: 'direct'
                };
            } else {
                return {
                    status: 'warning',
                    message: `HTTP ${response.status}: ${response.statusText}`,
                    httpStatus: response.status,
                    method: 'direct'
                };
            }
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                return {
                    status: 'error',
                    message: 'Health check timeout',
                    error: 'timeout',
                    method: 'direct'
                };
            } else {
                return {
                    status: 'error',
                    message: error.message,
                    error: error.name,
                    method: 'direct'
                };
            }
        }
    }

    // ✅ NEW: Proxy-based health check for external services
    async proxyHealthCheck(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeout);

        try {
            const proxyUrl = `${this.proxyEndpoint}?url=${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl, {
                signal: controller.signal,
                cache: 'no-cache'
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                try {
                    const result = await response.json();
                    return {
                        status: result.accessible ? 'healthy' : 'error',
                        message: result.message || 'Proxy health check completed',
                        httpStatus: result.status || 'unknown',
                        method: 'proxy',
                        proxyResponse: true
                    };
                } catch (jsonError) {
                    // Proxy returned non-JSON response, but request was successful
                    return {
                        status: 'healthy',
                        message: 'Service accessible via proxy',
                        method: 'proxy',
                        proxyResponse: true
                    };
                }
            } else {
                throw new Error(`Proxy returned HTTP ${response.status}`);
            }
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error('Proxy health check timeout');
            } else {
                throw new Error(`Proxy health check failed: ${error.message}`);
            }
        }
    }

    // ✅ NEW: Image-based connectivity test (CORS-free fallback)
    async imageConnectivityTest(url) {
        return new Promise((resolve) => {
            const img = new Image();
            const startTime = performance.now();
            let resolved = false;
            
            const cleanup = () => {
                if (resolved) return;
                resolved = true;
                img.onload = null;
                img.onerror = null;
                img.onabort = null;
            };
            
            img.onload = () => {
                cleanup();
                resolve({
                    status: 'healthy',
                    message: 'Service appears accessible (favicon test)',
                    responseTime: Math.round(performance.now() - startTime),
                    method: 'image_test'
                });
            };
            
            img.onerror = () => {
                cleanup();
                // Error loading favicon doesn't necessarily mean service is down
                // It could just be missing favicon or different path
                resolve({
                    status: 'warning',
                    message: 'Service may be accessible (CORS/favicon blocked)',
                    responseTime: Math.round(performance.now() - startTime),
                    method: 'image_test'
                });
            };
            
            img.onabort = () => {
                cleanup();
                resolve({
                    status: 'error',
                    message: 'Connectivity test aborted',
                    error: 'aborted',
                    method: 'image_test'
                });
            };
            
            // Timeout handling
            setTimeout(() => {
                cleanup();
                resolve({
                    status: 'error',
                    message: 'Service not accessible (timeout)',
                    error: 'timeout',
                    method: 'image_test'
                });
            }, this.defaultTimeout);
            
            // Try to load favicon from the service
            try {
                const testUrl = new URL(url);
                const faviconUrl = `${testUrl.origin}/favicon.ico?_health=${Date.now()}`;
                img.src = faviconUrl;
            } catch (urlError) {
                cleanup();
                resolve({
                    status: 'error',
                    message: 'Invalid URL for connectivity test',
                    error: 'invalid_url',
                    method: 'image_test'
                });
            }
        });
    }

    // ✅ IMPROVED: Advanced health check with better error handling
    async advancedHealthCheck(config, service) {
        const {
            url,
            method = 'GET',
            timeout = this.defaultTimeout,
            expectedStatus = [200, 201, 202, 204],
            headers = {},
            body = null,
            followRedirects = true,
            retries = this.maxRetries
        } = config;

        // Use intelligent checking for external URLs
        if (!this.isSameOrigin(url)) {
            console.log(`🔍 Advanced health check via intelligent method: ${url}`);
            return await this.intelligentUrlCheck(url);
        }

        // Continue with direct advanced check for same-origin
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const requestOptions = {
            method: method.toUpperCase(),
            headers: {
                'User-Agent': '7gram-health-checker/2.0',
                ...headers
            },
            signal: controller.signal,
            redirect: followRedirects ? 'follow' : 'manual',
            cache: 'no-cache'
        };

        if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
            requestOptions.body = JSON.stringify(body);
            requestOptions.headers['Content-Type'] = 'application/json';
        }

        let lastError;
        
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await fetch(url, requestOptions);
                clearTimeout(timeoutId);

                const statusArray = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
                
                if (statusArray.includes(response.status)) {
                    return {
                        status: 'healthy',
                        message: `Service healthy (HTTP ${response.status})`,
                        httpStatus: response.status,
                        attempt: attempt,
                        method: 'advanced'
                    };
                } else if (response.status >= 200 && response.status < 300) {
                    return {
                        status: 'warning',
                        message: `Unexpected success status: HTTP ${response.status}`,
                        httpStatus: response.status,
                        attempt: attempt,
                        method: 'advanced'
                    };
                } else if (response.status >= 500) {
                    throw new Error(`Server error: HTTP ${response.status}`);
                } else {
                    return {
                        status: 'warning',
                        message: `HTTP ${response.status}: ${response.statusText}`,
                        httpStatus: response.status,
                        attempt: attempt,
                        method: 'advanced'
                    };
                }
            } catch (error) {
                lastError = error;
                
                if (error.name === 'AbortError') {
                    clearTimeout(timeoutId);
                    return {
                        status: 'error',
                        message: 'Advanced health check timeout',
                        error: 'timeout',
                        attempt: attempt,
                        method: 'advanced'
                    };
                }
                
                if (attempt < retries) {
                    await this.delay(this.retryDelay * attempt);
                }
            }
        }

        clearTimeout(timeoutId);
        return {
            status: 'error',
            message: lastError?.message || 'Advanced health check failed after retries',
            error: lastError?.name || 'unknown',
            attempts: retries,
            method: 'advanced'
        };
    }

    // ✅ NEW: Check if URL is same-origin
    isSameOrigin(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.origin === window.location.origin;
        } catch {
            return false;
        }
    }

    startContinuousMonitoring(services) {
        services.forEach(service => {
            // Only monitor services that have health checks or URLs
            if (service.healthCheck || service.url) {
                const interval = service.healthCheckInterval || this.defaultInterval;
                
                const intervalId = setInterval(async () => {
                    await this.checkServiceHealth(service);
                }, interval);
                
                this.checkIntervals.set(service.id, intervalId);
            }
        });
        
        console.log(`🔄 Started continuous monitoring for ${this.checkIntervals.size} services`);
    }

    stopContinuousMonitoring() {
        this.checkIntervals.forEach((intervalId, serviceId) => {
            clearInterval(intervalId);
        });
        this.checkIntervals.clear();
        console.log('⏹️ Stopped continuous health monitoring');
    }

    updateServiceHealthUI(serviceId, healthResult) {
        // Update service card status
        const serviceCard = document.querySelector(`[data-service="${serviceId}"]`);
        if (serviceCard) {
            const statusElement = serviceCard.querySelector('.service-status');
            if (statusElement) {
                // Remove old status classes
                statusElement.classList.remove('status-healthy', 'status-warning', 'status-error', 'status-unknown');
                
                // Add new status class
                statusElement.classList.add(`status-${healthResult.status}`);
                
                // Update status icon
                const statusIcons = {
                    healthy: '🟢',
                    warning: '🟡',
                    error: '🔴',
                    unknown: '⚪'
                };
                
                statusElement.textContent = statusIcons[healthResult.status] || '⚪';
                
                // Enhanced tooltip with method info
                const methodInfo = healthResult.method ? ` (${healthResult.method})` : '';
                statusElement.title = `${healthResult.status.toUpperCase()}: ${healthResult.message}${methodInfo}`;
            }

            // Update health indicator if it exists
            const healthIndicator = serviceCard.querySelector('.health-indicator');
            if (healthIndicator) {
                const healthDot = healthIndicator.querySelector('.health-dot');
                const healthText = healthIndicator.querySelector('.health-text');
                const responseTimeElement = healthIndicator.querySelector('.response-time');

                if (healthDot) {
                    healthDot.className = `health-dot ${healthResult.status}`;
                }

                if (healthText) {
                    healthText.textContent = healthResult.message;
                }

                if (responseTimeElement && healthResult.responseTime !== null) {
                    responseTimeElement.textContent = `${healthResult.responseTime}ms`;
                }
            }
        }
    }

    addToHealthHistory(serviceId, healthResult) {
        if (!this.healthHistory.has(serviceId)) {
            this.healthHistory.set(serviceId, []);
        }

        const history = this.healthHistory.get(serviceId);
        history.push(healthResult);

        // Keep only the last N entries
        if (history.length > this.maxHistorySize) {
            history.splice(0, history.length - this.maxHistorySize);
        }
    }

    logStatusChange(service, currentResult) {
        const previousResult = this.healthStatus.get(service.id);
        
        if (!previousResult || previousResult.status !== currentResult.status) {
            const statusEmojis = {
                healthy: '✅',
                warning: '⚠️',
                error: '❌',
                unknown: '❓'
            };
            
            const emoji = statusEmojis[currentResult.status] || '❓';
            const methodInfo = currentResult.method ? ` [${currentResult.method}]` : '';
            console.log(`${emoji} ${service.name}: ${currentResult.status.toUpperCase()} - ${currentResult.message}${methodInfo}`);
            
            // Dispatch status change event
            this.dispatchStatusChangeEvent(service, previousResult, currentResult);
        }
    }

    dispatchStatusChangeEvent(service, previousResult, currentResult) {
        const event = new CustomEvent('serviceHealthChange', {
            detail: {
                service: service,
                previousStatus: previousResult?.status || 'unknown',
                currentStatus: currentResult.status,
                previousResult: previousResult,
                currentResult: currentResult
            }
        });
        
        document.dispatchEvent(event);
    }

    dispatchHealthSummaryEvent(summary) {
        const event = new CustomEvent('healthSummaryUpdate', {
            detail: {
                summary: summary,
                timestamp: new Date().toISOString()
            }
        });
        
        document.dispatchEvent(event);
    }

    // Public API methods
    getServiceHealth(serviceId) {
        return this.healthStatus.get(serviceId) || null;
    }

    getServiceHealthHistory(serviceId) {
        return this.healthHistory.get(serviceId) || [];
    }

    getAllHealthStatus() {
        return Object.fromEntries(this.healthStatus);
    }

    getHealthSummary() {
        const statuses = Array.from(this.healthStatus.values());
        const summary = {
            healthy: 0,
            warning: 0,
            error: 0,
            unknown: 0,
            total: statuses.length
        };

        statuses.forEach(status => {
            summary[status.status] = (summary[status.status] || 0) + 1;
        });

        return summary;
    }

    async forceHealthCheck(serviceId, service) {
        console.log(`🔄 Force health check for ${service.name}`);
        return await this.checkServiceHealth(service);
    }

    // ✅ NEW: Test proxy availability
    async testProxyAvailability() {
        try {
            const response = await fetch(`${this.proxyEndpoint}?test=true`);
            return response.ok;
        } catch (error) {
            console.warn('⚠️ Health check proxy not available:', error.message);
            return false;
        }
    }

    // ✅ NEW: Get health check statistics
    getHealthCheckStats() {
        const stats = {
            totalServices: this.healthStatus.size,
            monitoredServices: this.checkIntervals.size,
            methods: { direct: 0, proxy: 0, image_test: 0, advanced: 0 },
            summary: this.getHealthSummary()
        };

        // Count methods used
        this.healthStatus.forEach(result => {
            if (result.method && stats.methods.hasOwnProperty(result.method)) {
                stats.methods[result.method]++;
            }
        });

        return stats;
    }

    // Utility methods
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    isServiceHealthy(serviceId) {
        const health = this.healthStatus.get(serviceId);
        return health?.status === 'healthy';
    }

    getServiceUptime(serviceId) {
        const history = this.healthHistory.get(serviceId) || [];
        if (history.length === 0) return null;

        const healthyChecks = history.filter(h => h.status === 'healthy').length;
        const uptime = (healthyChecks / history.length) * 100;
        
        return {
            percentage: Math.round(uptime * 100) / 100,
            healthyChecks: healthyChecks,
            totalChecks: history.length,
            timespan: this.getHistoryTimespan(history)
        };
    }

    // ✅ NEW: Get actual timespan of history
    getHistoryTimespan(history) {
        if (history.length < 2) return 'insufficient data';
        
        const oldest = new Date(history[0].timestamp);
        const newest = new Date(history[history.length - 1].timestamp);
        const diffMs = newest - oldest;
        const hours = Math.round(diffMs / (1000 * 60 * 60));
        
        if (hours < 1) return 'less than 1 hour';
        if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''}`;
        
        const days = Math.round(hours / 24);
        return `${days} day${days !== 1 ? 's' : ''}`;
    }

    getAverageResponseTime(serviceId) {
        const history = this.healthHistory.get(serviceId) || [];
        const responseTimes = history
            .filter(h => h.responseTime !== null && h.responseTime > 0)
            .map(h => h.responseTime);

        if (responseTimes.length === 0) return null;

        const average = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
        return Math.round(average);
    }

    // Configuration methods
    updateHealthCheckInterval(serviceId, interval) {
        if (this.checkIntervals.has(serviceId)) {
            clearInterval(this.checkIntervals.get(serviceId));
            
            // Find the service object
            // Note: This would need to be passed or stored for full functionality
            const intervalId = setInterval(async () => {
                // This is a simplified version - in practice you'd need the full service object
                console.log(`🔄 Periodic health check for service ${serviceId}`);
            }, interval);
            
            this.checkIntervals.set(serviceId, intervalId);
        }
    }

    setGlobalDefaults(options) {
        if (options.timeout) this.defaultTimeout = options.timeout;
        if (options.interval) this.defaultInterval = options.interval;
        if (options.maxRetries) this.maxRetries = options.maxRetries;
        if (options.retryDelay) this.retryDelay = options.retryDelay;
        if (options.maxHistorySize) this.maxHistorySize = options.maxHistorySize;
        if (options.proxyEndpoint) this.proxyEndpoint = options.proxyEndpoint;
    }

    // Cleanup
    destroy() {
        this.stopContinuousMonitoring();
        this.healthStatus.clear();
        this.healthHistory.clear();
        console.log('🧼 Health checker destroyed');
    }
}