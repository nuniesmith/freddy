// assets/js/modules/searchManager.js - Advanced Search Functionality
export class SearchManager {
    constructor() {
        this.services = [];
        this.categories = [];
        this.searchIndex = new Map();
        this.recentSearches = []; // In-memory storage instead of localStorage
        this.searchSuggestions = [];
        this.debounceTimer = null;
        this.minSearchLength = 1;
        this.searchAnalytics = []; // In-memory storage for analytics
    }

    initialize(services, categories) {
        this.services = services;
        this.categories = categories;
        this.buildSearchIndex();
        this.setupSearchInput();
        this.setupKeyboardShortcuts();
        console.log(`🔍 Search initialized with ${services.length} services`);
    }

    buildSearchIndex() {
        this.searchIndex.clear();
        
        this.services.forEach(service => {
            const searchTerms = [
                service.name.toLowerCase(),
                service.description.toLowerCase(),
                service.category.toLowerCase(),
                ...(service.tags || []).map(tag => tag.toLowerCase()),
                service.type?.toLowerCase() || '',
                service.id.toLowerCase()
            ].filter(term => term.length > 0);

            this.searchIndex.set(service.id, {
                service: service,
                searchTerms: searchTerms.join(' ')
            });
        });
    }

    setupSearchInput() {
        // Try multiple possible search input IDs to be robust
        const possibleIds = ['search', 'global-search', 'search-input'];
        let searchInput = null;
        
        for (const id of possibleIds) {
            searchInput = document.getElementById(id);
            if (searchInput) {
                console.log(`✅ Found search input with ID: ${id}`);
                break;
            }
        }
        
        if (!searchInput) {
            console.warn('⚠️ Search input not found');
            return;
        }

        const searchSuggestions = document.getElementById('search-suggestions');

        // Input event with debouncing
        searchInput.addEventListener('input', (e) => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.performSearch(e.target.value);
            }, 150);
        });

        // Focus events for suggestions
        searchInput.addEventListener('focus', () => {
            this.showSearchSuggestions();
        });

        searchInput.addEventListener('blur', (e) => {
            // Delay hiding suggestions to allow clicking
            setTimeout(() => {
                this.hideSearchSuggestions();
            }, 200);
        });

        // Arrow key navigation
        searchInput.addEventListener('keydown', (e) => {
            this.handleSearchNavigation(e);
        });

        // Store reference for later use
        this.searchInputElement = searchInput;
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+K or Cmd+K to focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.focusSearch();
            }

            // Escape to clear search
            if (e.key === 'Escape') {
                this.clearAndBlurSearch();
            }
        });
    }

    focusSearch() {
        const searchInput = this.getSearchInput();
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }

    clearAndBlurSearch() {
        const searchInput = this.getSearchInput();
        if (searchInput && document.activeElement === searchInput) {
            searchInput.value = '';
            this.performSearch('');
            searchInput.blur();
        }
    }

    getSearchInput() {
        // Return cached reference if available
        if (this.searchInputElement && this.searchInputElement.isConnected) {
            return this.searchInputElement;
        }

        // Try to find it again
        const possibleIds = ['search', 'global-search', 'search-input'];
        for (const id of possibleIds) {
            const element = document.getElementById(id);
            if (element) {
                this.searchInputElement = element;
                return element;
            }
        }
        return null;
    }

    performSearch(query) {
        const trimmedQuery = query.trim();
        
        if (trimmedQuery.length === 0) {
            this.showAllServices();
            this.updateSearchSuggestions([]);
            return;
        }

        if (trimmedQuery.length < this.minSearchLength) {
            return;
        }

        // Add to recent searches
        this.addToRecentSearches(trimmedQuery);

        // Perform the search
        const results = this.searchServices(trimmedQuery);
        
        // Update UI
        this.displaySearchResults(results, trimmedQuery);
        this.generateSearchSuggestions(trimmedQuery);
        
        // Analytics
        this.trackSearch(trimmedQuery, results.length);
    }

    searchServices(query) {
        const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0);
        const results = [];

        for (const [serviceId, indexData] of this.searchIndex) {
            let score = 0;
            let matches = 0;

            searchTerms.forEach(term => {
                if (indexData.searchTerms.includes(term)) {
                    matches++;
                    
                    // Boost score for exact name matches
                    if (indexData.service.name.toLowerCase().includes(term)) {
                        score += 10;
                    }
                    
                    // Boost score for category matches
                    if (indexData.service.category.toLowerCase().includes(term)) {
                        score += 5;
                    }
                    
                    // Regular term match
                    score += 1;
                }
            });

            // Only include if all search terms found some match
            if (matches === searchTerms.length && score > 0) {
                results.push({
                    service: indexData.service,
                    score: score,
                    matches: matches
                });
            }
        }

        // Sort by score (descending) then by name
        results.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return a.service.name.localeCompare(b.service.name);
        });

        return results.map(result => result.service);
    }

    displaySearchResults(results, query) {
        const categories = document.querySelectorAll('.category');
        const cards = document.querySelectorAll('.card, .service-card');
        const noResults = document.getElementById('no-results');

        if (results.length === 0) {
            // Hide all
            categories.forEach(cat => cat.style.display = 'none');
            cards.forEach(card => card.style.display = 'none');
            if (noResults) {
                noResults.style.display = 'block';
                this.updateNoResultsMessage(query);
            }
            return;
        }

        // Hide no results
        if (noResults) {
            noResults.style.display = 'none';
        }

        // Hide all categories first
        categories.forEach(cat => cat.style.display = 'none');
        cards.forEach(card => card.style.display = 'none');

        // Show matching services and their categories
        const visibleCategories = new Set();
        
        results.forEach(service => {
            // Try multiple possible selectors for service cards
            const possibleSelectors = [
                `[data-service="${service.id}"]`,
                `[data-service-id="${service.id}"]`,
                `#service-${service.id}`,
                `.service-${service.id}`
            ];
            
            let card = null;
            for (const selector of possibleSelectors) {
                card = document.querySelector(selector);
                if (card) break;
            }

            if (card) {
                card.style.display = 'flex';
                
                // Highlight search terms
                this.highlightSearchTerms(card, query);
                
                // Show parent category
                const category = card.closest('.category');
                if (category) {
                    category.style.display = 'block';
                    visibleCategories.add(category);
                }
            }
        });

        // Update category headers with result counts
        visibleCategories.forEach(category => {
            const visibleCards = category.querySelectorAll('.card[style*="flex"], .service-card[style*="flex"]').length;
            const categoryTitle = category.querySelector('.category-title, .category-header h2, h2');
            if (categoryTitle) {
                const originalText = categoryTitle.textContent.replace(/ \(\d+\)$/, '');
                categoryTitle.textContent = `${originalText} (${visibleCards})`;
            }
        });
    }

    highlightSearchTerms(card, query) {
        const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0);
        const elementsToHighlight = [
            card.querySelector('.card-title, .service-title, h3'),
            card.querySelector('.card-description, .service-description, p')
        ].filter(el => el);

        elementsToHighlight.forEach(element => {
            if (!element.dataset.originalText) {
                element.dataset.originalText = element.textContent;
            }
            
            let highlightedText = element.dataset.originalText;
            
            searchTerms.forEach(term => {
                const regex = new RegExp(`(${this.escapeRegex(term)})`, 'gi');
                highlightedText = highlightedText.replace(regex, '<mark style="background: rgba(255,255,0,0.3); padding: 1px 2px; border-radius: 2px;">$1</mark>');
            });
            
            element.innerHTML = highlightedText;
        });
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    showAllServices() {
        const categories = document.querySelectorAll('.category');
        const cards = document.querySelectorAll('.card, .service-card');
        const noResults = document.getElementById('no-results');

        // Show everything
        categories.forEach(cat => cat.style.display = 'block');
        cards.forEach(card => {
            card.style.display = 'flex';
            // Remove highlighting
            this.removeHighlighting(card);
        });

        // Hide no results
        if (noResults) {
            noResults.style.display = 'none';
        }

        // Reset category titles
        categories.forEach(category => {
            const categoryTitle = category.querySelector('.category-title, .category-header h2, h2');
            if (categoryTitle) {
                categoryTitle.textContent = categoryTitle.textContent.replace(/ \(\d+\)$/, '');
            }
        });
    }

    removeHighlighting(card) {
        const elementsToUnhighlight = [
            card.querySelector('.card-title, .service-title, h3'),
            card.querySelector('.card-description, .service-description, p')
        ].filter(el => el);

        elementsToUnhighlight.forEach(element => {
            if (element.dataset.originalText) {
                element.textContent = element.dataset.originalText;
            }
        });
    }

    generateSearchSuggestions(query) {
        const suggestions = [];
        
        // Recent searches
        this.recentSearches.forEach(recent => {
            if (recent.includes(query.toLowerCase()) && recent !== query.toLowerCase()) {
                suggestions.push({
                    type: 'recent',
                    text: recent,
                    icon: '🕐'
                });
            }
        });

        // Service name suggestions
        this.services.forEach(service => {
            if (service.name.toLowerCase().includes(query.toLowerCase()) && 
                !suggestions.find(s => s.text.toLowerCase() === service.name.toLowerCase())) {
                suggestions.push({
                    type: 'service',
                    text: service.name,
                    icon: service.icon || '🔗',
                    service: service
                });
            }
        });

        // Category suggestions
        this.categories.forEach(category => {
            if (category.name.toLowerCase().includes(query.toLowerCase()) &&
                !suggestions.find(s => s.text.toLowerCase() === category.name.toLowerCase())) {
                suggestions.push({
                    type: 'category',
                    text: category.name,
                    icon: category.icon || '📁'
                });
            }
        });

        this.updateSearchSuggestions(suggestions.slice(0, 8));
    }

    updateSearchSuggestions(suggestions) {
        const suggestionsElement = document.getElementById('search-suggestions');
        if (!suggestionsElement) return;

        if (suggestions.length === 0) {
            suggestionsElement.style.display = 'none';
            return;
        }

        const suggestionsHtml = suggestions.map(suggestion => `
            <div class="search-suggestion" data-type="${suggestion.type}" data-text="${this.escapeHtml(suggestion.text)}">
                <span class="suggestion-icon">${suggestion.icon}</span>
                <span class="suggestion-text">${this.escapeHtml(suggestion.text)}</span>
                <span class="suggestion-type">${suggestion.type}</span>
            </div>
        `).join('');

        suggestionsElement.innerHTML = suggestionsHtml;
        suggestionsElement.style.display = 'block';

        // Add click handlers
        suggestionsElement.querySelectorAll('.search-suggestion').forEach(suggestion => {
            suggestion.addEventListener('click', () => {
                const text = suggestion.dataset.text;
                const searchInput = this.getSearchInput();
                if (searchInput) {
                    searchInput.value = text;
                    this.performSearch(text);
                    this.hideSearchSuggestions();
                }
            });
        });
    }

    showSearchSuggestions() {
        const searchInput = this.getSearchInput();
        const suggestionsElement = document.getElementById('search-suggestions');
        
        if (searchInput && suggestionsElement && searchInput.value.trim()) {
            this.generateSearchSuggestions(searchInput.value);
        }
    }

    hideSearchSuggestions() {
        const suggestionsElement = document.getElementById('search-suggestions');
        if (suggestionsElement) {
            suggestionsElement.style.display = 'none';
        }
    }

    handleSearchNavigation(e) {
        const suggestionsElement = document.getElementById('search-suggestions');
        if (!suggestionsElement || suggestionsElement.style.display === 'none') return;

        const suggestions = suggestionsElement.querySelectorAll('.search-suggestion');
        const currentActive = suggestionsElement.querySelector('.search-suggestion.active');
        let activeIndex = currentActive ? Array.from(suggestions).indexOf(currentActive) : -1;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                activeIndex = Math.min(activeIndex + 1, suggestions.length - 1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                activeIndex = Math.max(activeIndex - 1, -1);
                break;
            case 'Enter':
                if (currentActive) {
                    e.preventDefault();
                    currentActive.click();
                }
                return;
            case 'Escape':
                this.hideSearchSuggestions();
                return;
            default:
                return;
        }

        // Update active suggestion
        suggestions.forEach((suggestion, index) => {
            suggestion.classList.toggle('active', index === activeIndex);
        });
    }

    updateNoResultsMessage(query) {
        const noResults = document.getElementById('no-results');
        if (noResults) {
            noResults.innerHTML = `
                <div class="no-results-content">
                    <div class="no-results-icon">🔍</div>
                    <h3>No services found</h3>
                    <p>No services match "<strong>${this.escapeHtml(query)}</strong>".</p>
                    <div class="no-results-suggestions">
                        <p>Try:</p>
                        <ul>
                            <li>Checking your spelling</li>
                            <li>Using different keywords</li>
                            <li>Browsing by category</li>
                            <li>Clearing your search filters</li>
                        </ul>
                    </div>
                    <button onclick="document.getElementById('search').value = ''; window.searchManager.performSearch(''); document.getElementById('global-search').value = '';" 
                            class="clear-search-button"
                            style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 0.75rem 1.5rem; border-radius: 25px; cursor: pointer; font-size: 1rem; margin-top: 1rem;">
                        Clear Search
                    </button>
                </div>
            `;
        }
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Recent searches management (in-memory)
    addToRecentSearches(query) {
        const lowerQuery = query.toLowerCase();
        
        // Remove if already exists
        this.recentSearches = this.recentSearches.filter(search => search !== lowerQuery);
        
        // Add to beginning
        this.recentSearches.unshift(lowerQuery);
        
        // Keep only last 10
        this.recentSearches = this.recentSearches.slice(0, 10);
    }

    clearRecentSearches() {
        this.recentSearches = [];
    }

    getRecentSearches() {
        return [...this.recentSearches];
    }

    // Analytics (in-memory)
    trackSearch(query, resultCount) {
        const searchEvent = {
            query: query,
            resultCount: resultCount,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent
        };

        // Log for debugging
        console.log(`🔍 Search: "${query}" → ${resultCount} results`);

        // Store search analytics in memory
        this.searchAnalytics.push(searchEvent);
        
        // Keep only last 100 searches
        if (this.searchAnalytics.length > 100) {
            this.searchAnalytics = this.searchAnalytics.slice(-100);
        }
    }

    getSearchAnalytics() {
        return [...this.searchAnalytics];
    }

    // Public API methods
    clearSearch() {
        const searchInput = this.getSearchInput();
        if (searchInput) {
            searchInput.value = '';
            this.performSearch('');
        }
    }

    search(query) {
        const searchInput = this.getSearchInput();
        if (searchInput) {
            searchInput.value = query;
            this.performSearch(query);
        }
    }

    getSearchStats() {
        return {
            totalSearches: this.searchAnalytics.length,
            recentSearchCount: this.recentSearches.length,
            indexedServices: this.searchIndex.size,
            lastSearch: this.searchAnalytics[this.searchAnalytics.length - 1]
        };
    }
}

// Export default for easier importing
export default SearchManager;