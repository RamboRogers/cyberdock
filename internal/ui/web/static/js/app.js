// Get base path for API calls (handles both single-port and dual-port modes)
const getBasePath = () => {
    // Check if we're in the /admin/ path (single-port mode)
    const pathPrefix = window.location.pathname.startsWith('/admin/') ? '/admin' : '';
    return pathPrefix;
};

const apiPath = (path) => {
    const base = getBasePath();
    // For API calls, prepend base path if we're in single-port mode
    const normalizedPath = path.startsWith('/') ? path : '/' + path;
    return base + normalizedPath;
};

document.addEventListener('DOMContentLoaded', () => {
    // Initialize matrix background with a delay
    setTimeout(() => {
        const canvas = document.getElementById('matrixCanvas');
        if (canvas) {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            initMatrix('matrixCanvas', 0.45);
        }

        // Handle window resize for matrix
        window.addEventListener('resize', () => {
            if (canvas) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }
        });
    }, 500); // 500ms delay to ensure canvas is ready

    const registryContent = document.getElementById('registry-content');
    const tagsContent = document.getElementById('tags-content');
    const registryHost = window.REGISTRY_HOST;
    const diskUsageText = document.getElementById('diskUsageText');
    const lastUpdateText = document.getElementById('lastUpdateText');
    const purgeButton = document.getElementById('purgeButton');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // Function to format image size
    const formatSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        if (bytes < 1024) return bytes + ' Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Function to format timestamp
    const formatTimestamp = (timestamp) => {
        if (!timestamp) return 'Never';
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return 'Invalid Date';
        return date.toLocaleString();
    };

    // Enhanced statistics refresh with retry mechanism
    async function refreshStatistics(retryCount = 3, retryDelay = 2000) {
        const updateStatsUI = (stats) => {
            window.DISK_USAGE = stats.size;
            window.FREE_SPACE = stats.freeSpace;
            window.LAST_UPDATE = stats.lastCheck;
            window.TOTAL_IMAGES = stats.totalImages;
            window.TOTAL_TAGS = stats.totalTags;
            window.STORAGE_EFFICIENCY = stats.storageEfficiency;
            updateDiskUsage();
        };

        const setLoadingUI = () => {
            const elements = {
                totalImagesText: document.getElementById('totalImagesText'),
                totalTagsText: document.getElementById('totalTagsText'),
                storageEfficiencyText: document.getElementById('storageEfficiencyText'),
                usagePercentage: document.getElementById('usagePercentage'),
                diskSize: document.querySelector('.disk-size')
            };

            if (elements.totalImagesText) elements.totalImagesText.textContent = 'Loading...';
            if (elements.totalTagsText) elements.totalTagsText.textContent = 'Loading...';
            if (elements.storageEfficiencyText) elements.storageEfficiencyText.textContent = 'Loading...';
            if (elements.usagePercentage) elements.usagePercentage.textContent = '---%';
            if (elements.diskSize) {
                elements.diskSize.innerHTML = `
                    <span>USED: Calculating...</span>
                    <span>FREE: Calculating...</span>
                    <span id="syncIndicator" class="sync-indicator"></span>
                `;
            }
        };

        const setErrorUI = (error) => {
            const elements = {
                totalImagesText: document.getElementById('totalImagesText'),
                totalTagsText: document.getElementById('totalTagsText'),
                storageEfficiencyText: document.getElementById('storageEfficiencyText'),
                usagePercentage: document.getElementById('usagePercentage'),
                diskSize: document.querySelector('.disk-size')
            };

            if (elements.totalImagesText) elements.totalImagesText.textContent = 'Error';
            if (elements.totalTagsText) elements.totalTagsText.textContent = 'Error';
            if (elements.storageEfficiencyText) elements.storageEfficiencyText.textContent = 'Error';
            if (elements.usagePercentage) elements.usagePercentage.textContent = 'Error';
            if (elements.diskSize) {
                elements.diskSize.innerHTML = `
                    <span>USED: Error</span>
                    <span>FREE: Error</span>
                    <span id="syncIndicator" class="sync-indicator"></span>
                `;
            }
            console.error('Statistics error:', error);
        };

        let currentRetry = 0;
        while (currentRetry < retryCount) {
            try {
                setLoadingUI();
                const stats = await apiRequest('/api/disk-usage');

                // Validate statistics data
                if (!stats || typeof stats.size === 'undefined') {
                    throw new Error('Invalid statistics data received');
                }

                // Update UI with new stats
                updateStatsUI(stats);

                return; // Success, exit retry loop
            } catch (error) {
                console.warn(`Statistics refresh failed (attempt ${currentRetry + 1}/${retryCount}):`, error);
                currentRetry++;

                if (currentRetry === retryCount) {
                    setErrorUI(error);
                    // Add click handler for manual retry
                    document.getElementById('diskUsageText').onclick = () => refreshStatistics();
                } else {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }
    }

    // Enhanced disk usage display
    function updateDiskUsage() {
        try {
            const usedSpace = parseInt(window.DISK_USAGE) || 0;
            const freeSpace = parseInt(window.FREE_SPACE) || 0;
            const totalSpace = usedSpace + freeSpace;
            const usedText = formatSize(usedSpace);
            const freeText = formatSize(freeSpace);
            const usageBar = document.getElementById('diskUsageBar');
            const syncIndicator = document.getElementById('syncIndicator');

            // Calculate usage percentage
            const usagePercentage = totalSpace > 0 ? (usedSpace / totalSpace) * 100 : 0;

            // Update text display
            document.getElementById('usagePercentage').textContent = `${usagePercentage.toFixed(1)}%`;
            document.querySelector('.disk-size').innerHTML = `
                <span>USED: ${usedText}</span>
                <span>FREE: ${freeText}</span>
                <span id="syncIndicator" class="sync-indicator"></span>
            `;

            // Update progress bar with enhanced styling
            if (usageBar) {
                usageBar.style.width = `${usagePercentage}%`;
                if (usagePercentage < 60) {
                    usageBar.className = 'usage-bar optimal';
                } else if (usagePercentage < 80) {
                    usageBar.className = 'usage-bar good';
                } else {
                    usageBar.className = 'usage-bar suboptimal';
                }
            }

            // Update sync indicator
            if (syncIndicator) {
                const lastUpdate = new Date(window.LAST_UPDATE);
                const now = new Date();
                const timeDiff = now - lastUpdate;
                if (timeDiff < 60000) { // Less than 1 minute
                    syncIndicator.classList.add('active');
                } else {
                    syncIndicator.classList.remove('active');
                }
            }

            // Update other statistics
            const totalImagesText = document.getElementById('totalImagesText');
            if (totalImagesText) {
                totalImagesText.textContent = window.TOTAL_IMAGES || '0';
            }

            const totalTagsText = document.getElementById('totalTagsText');
            if (totalTagsText) {
                totalTagsText.textContent = window.TOTAL_TAGS || '0';
            }

            const storageEfficiencyText = document.getElementById('storageEfficiencyText');
            if (storageEfficiencyText && typeof window.STORAGE_EFFICIENCY === 'number') {
                const efficiency = (window.STORAGE_EFFICIENCY * 100).toFixed(1);
                storageEfficiencyText.textContent = `${efficiency}%`;
            }
        } catch (error) {
            console.error('Error updating disk usage display:', error);
        }
    }

    // Initialize statistics refresh
    function initializeStatistics() {
        // Initial load
        refreshStatistics();

        // Set up periodic refresh (every 15 seconds)
        const refreshInterval = setInterval(() => {
            refreshStatistics().catch(error => {
                console.error('Periodic statistics refresh failed:', error);
            });
        }, 15000); // Changed from 30s to 15s for more responsive sync indicator

        // Cleanup on page unload
        window.addEventListener('unload', () => {
            clearInterval(refreshInterval);
        });
    }

    // Loading state handler
    const setLoadingState = (isLoading) => {
        if (isLoading) {
            diskUsageText.innerHTML = '<span class="loading">Calculating...</span>';
            lastUpdateText.innerHTML = '<span class="loading">Checking...</span>';
            document.getElementById('totalImagesText').innerHTML = '<span class="loading">Counting...</span>';
            document.getElementById('totalTagsText').innerHTML = '<span class="loading">Counting...</span>';
            document.getElementById('storageEfficiencyText').innerHTML = '<span class="loading">Calculating...</span>';
        }
    };

    // Error state handler
    const setErrorState = (error) => {
        diskUsageText.innerHTML = '<span class="error">Error loading size</span>';
        lastUpdateText.innerHTML = '<span class="error">Check failed</span>';
        document.getElementById('totalImagesText').innerHTML = '<span class="error">Count failed</span>';
        document.getElementById('totalTagsText').innerHTML = '<span class="error">Count failed</span>';
        document.getElementById('storageEfficiencyText').innerHTML = '<span class="error">Calculation failed</span>';
        console.error('Statistics error:', error);
    };

    // Function to make API request with proper headers
    const apiRequest = async (url, options = {}) => {
        // Adjust URL for single-port mode if needed
        const adjustedUrl = apiPath(url);
        const response = await fetch(adjustedUrl, {
            method: options.method || 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            mode: 'cors',
            credentials: 'omit',
            ...options,
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        if (options.method === 'DELETE') return;
        return response.json();
    };

    // Function to delete an image
    const deleteImage = async (repository, reference) => {
        showConfirmDialog(`Are you sure you want to delete ${repository}:${reference}?`, async () => {
            try {
                console.log('DEBUG: Deleting image', repository, reference);
                const url = `/api/images/${encodeURIComponent(repository)}/${encodeURIComponent(reference)}`;
                console.log('DEBUG: Delete URL:', url);

                await apiRequest(url, {
                    method: 'DELETE',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                });

                console.log('DEBUG: Delete successful');
                // Refresh all data
                await Promise.all([
                    refreshStatistics(),
                    fetchRegistryData(),
                    fetchTagsData()
                ]);
                // Force refresh the current tab
                const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
                if (activeTab === 'images') {
                    await fetchRegistryData();
                } else if (activeTab === 'tags') {
                    await fetchTagsData();
                }
            } catch (error) {
                console.error('Error deleting image:', error);
                alert(`Failed to delete image: ${error.message}`);
            }
        });
    };

    // Custom confirmation dialog
    function showConfirmDialog(message, onConfirm) {
        const dialog = document.getElementById('confirmDialog');
        const messageEl = document.getElementById('confirmMessage');
        const yesBtn = document.getElementById('confirmYes');
        const noBtn = document.getElementById('confirmNo');

        messageEl.textContent = message;
        dialog.classList.add('active');

        // Remove old event listeners
        const newYesBtn = yesBtn.cloneNode(true);
        const newNoBtn = noBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);
        noBtn.parentNode.replaceChild(newNoBtn, noBtn);

        // Add new event listeners
        newYesBtn.addEventListener('click', () => {
            dialog.classList.remove('active');
            onConfirm();
        });

        newNoBtn.addEventListener('click', () => {
            dialog.classList.remove('active');
        });
    }

    // Function to purge registry
    const purgeRegistry = async () => {
        if (!confirm('Are you sure you want to purge the entire registry? This action cannot be undone.')) {
            return;
        }

        try {
            console.log('DEBUG: Sending purge request');
            const response = await apiRequest('/api/purge', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            console.log('DEBUG: Purge response:', response);

            // Refresh the UI
            await fetchRegistryData();
            await fetchTagsData();
            await updateDiskUsage();

            // Show success message
            alert('Registry purged successfully');
        } catch (error) {
            console.error('Error purging registry:', error);
            alert(`Failed to purge registry: ${error.message}`);
        }
    };

    // Function to render registry data
    const renderRegistryData = async (images) => {
        try {
            if (!images || images.length === 0) {
                registryContent.innerHTML = `
                    <div class="empty-state">
                        <p>No images found in the registry.</p>
                        <p>Push an image using: docker push ${window.REGISTRY_HOST.replace('https://', '')}/your-image:tag</p>
                    </div>
                `;
                return;
            }

            // Group images by their project/namespace
            const groupedImages = {};
            images.forEach(image => {
                const parts = (image.repository || 'Unknown').split('/');
                const project = parts.length > 1 ? parts[0] : '';
                const imageName = parts.length > 1 ? parts.slice(1).join('/') : parts[0];

                if (!groupedImages[project]) {
                    groupedImages[project] = [];
                }
                groupedImages[project].push({...image, displayName: imageName});
            });

            const html = `
                <div class="registry-list">
                    ${Object.entries(groupedImages).map(([project, projectImages]) => `
                        <div class="project-group ${!project ? 'no-project' : ''}">
                            ${project ? `<h2 class="project-name">${project}</h2>` : ''}
                            ${projectImages.map(image => {
                                const shortDigest = image.digest ? image.digest.substring(7, 19) : 'Unknown';
                                return `
                                    <div class="repository-item">
                                        <div class="repository-header">
                                            <h3 title="${image.repository}">${image.displayName}</h3>
                                            <div class="tag-info" title="${image.tag || 'latest'}">${(image.tag || 'latest').length > 10 ? (image.tag || 'latest').substring(0, 10) + '...' : (image.tag || 'latest')}</div>
                                            ${image.mediaType === 'application/vnd.oci.image.index.v1+json' ? '<span class="platform-badge">Multi-platform</span>' : ''}
                                            <button class="delete-btn" data-repository="${image.repository}" data-reference="${image.tag}">Delete</button>
                                        </div>
                                        <div class="image-info">
                                            <span class="image-size">Size: ${formatSize(image.size || 0)}</span>
                                            <span class="image-created">Created: ${formatTimestamp(image.created)}</span>
                                            <span class="image-digest" title="${image.digest || ''}">Digest: ${shortDigest}...</span>
                                        </div>
                                        <div class="layers">
                                            <h4>Layers:</h4>
                                            ${(image.layers || []).map(layer => {
                                                const shortLayerDigest = layer.digest ? layer.digest.substring(7, 19) : 'Unknown';
                                                return `
                                                    <div class="layer">
                                                        <span class="layer-digest" title="${layer.digest || ''}">${shortLayerDigest}...</span>
                                                        <span class="layer-size">${formatSize(layer.size || 0)}</span>
                                                    </div>
                                                `;
                                            }).join('')}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `).join('')}
                </div>
            `;
            registryContent.innerHTML = html;

            // Add event listeners for delete buttons
            registryContent.querySelectorAll('.delete-btn').forEach(button => {
                button.addEventListener('click', () => {
                    const repository = button.dataset.repository;
                    const reference = button.dataset.reference;
                    deleteImage(repository, reference);
                });
            });
        } catch (error) {
            console.error('Error rendering registry data:', error);
            registryContent.innerHTML = `
                <div class="error">
                    Failed to render registry data: ${error.message}
                </div>
            `;
        }
    };

    // Function to render tags data
    const renderTagsData = async (tags) => {
        try {
            if (!tags || Object.keys(tags).length === 0) {
                tagsContent.innerHTML = `
                    <div class="empty-state">
                        <p>No tags found in the registry.</p>
                        <p>Push an image using: docker push ${window.REGISTRY_HOST.replace('https://', '')}/your-image:tag</p>
                    </div>
                `;
                return;
            }

            const html = `
                <div class="tags-list">
                    ${Object.entries(tags).map(([repository, tagList]) => `
                        <div class="repository-item">
                            <div class="repository-header">
                                <h3>${repository}</h3>
                            </div>
                            <div class="tags">
                                ${(tagList || []).map(tag => `
                                    <div class="tag">
                                        <span class="tag-name">${tag}</span>
                                        <button class="delete-btn" data-repository="${repository}" data-reference="${tag}">Delete</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            tagsContent.innerHTML = html;

            // Add event listeners for delete buttons
            tagsContent.querySelectorAll('.delete-btn').forEach(button => {
                button.addEventListener('click', () => {
                    const repository = button.dataset.repository;
                    const reference = button.dataset.reference;
                    deleteImage(repository, reference);
                });
            });
        } catch (error) {
            console.error('Error rendering tags data:', error);
            tagsContent.innerHTML = `
                <div class="error">
                    Failed to render tags data: ${error.message}
                </div>
            `;
        }
    };

    // Function to fetch registry data
    const fetchRegistryData = async () => {
        try {
            const images = await apiRequest('/api/images');
            console.log('DEBUG: Received images data:', images);
            if (images && images.length > 0) {
                console.log('DEBUG: First image data:', {
                    repository: images[0].repository,
                    tag: images[0].tag,
                    size: images[0].size,
                    created: images[0].created,
                    layers: images[0].layers
                });
            }
            await renderRegistryData(images);
        } catch (error) {
            console.error('Error fetching registry data:', error);
            registryContent.innerHTML = `
                <div class="error">
                    Failed to load registry data: ${error.message}
                </div>
            `;
        }
    };

    // Function to fetch tags data
    const fetchTagsData = async () => {
        try {
            const tags = await apiRequest('/api/tags');
            await renderTagsData(tags);
        } catch (error) {
            console.error('Error fetching tags data:', error);
            tagsContent.innerHTML = `
                <div class="error">
                    Failed to load tags data: ${error.message}
                </div>
            `;
        }
    };

    // Tab switching
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tab = button.dataset.tab;

            // Update active states
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            document.getElementById(`${tab}-tab`).classList.add('active');

            // Fetch data for the active tab
            if (tab === 'images') {
                fetchRegistryData();
            } else if (tab === 'tags') {
                fetchTagsData();
            } else if (tab === 'analytics') {
                updateAnalytics();
            }
        });
    });

    // Update purge button click handler
    if (purgeButton) {
        purgeButton.addEventListener('click', () => {
            showConfirmDialog('Are you sure you want to purge all registry data? This action cannot be undone.', async () => {
                try {
                    console.log('DEBUG: Sending purge request');
                    await apiRequest('/api/purge', {
                        method: 'POST'
                    });
                    console.log('DEBUG: Purge successful');

                    // Refresh all data
                    await Promise.all([
                        refreshStatistics(),
                        fetchRegistryData(),
                        fetchTagsData()
                    ]);
                } catch (error) {
                    console.error('Error:', error);
                    alert('Failed to purge registry: ' + error.message);
                }
            });
        });
    }

    // Initial load
    refreshStatistics();
    fetchRegistryData(); // Load images data immediately
    fetchTagsData();     // Pre-fetch tags data

    // Set images tab as active by default
    document.querySelector('[data-tab="images"]').classList.add('active');
    document.getElementById('images-tab').classList.add('active');

    // Initialize statistics
    initializeStatistics();

    // Search functionality
    function initializeSearch() {
        const searchInput = document.getElementById('searchInput');
        const filterSelect = document.getElementById('filterSelect');
        let searchTimeout;
        let currentImages = [];
        let currentTags = [];

        // Debounced search function
        const performSearch = (query, filter) => {
            const searchResults = {
                images: [],
                tags: []
            };

            if (!query) {
                renderRegistryData(currentImages);
                renderTagsData(currentTags);
                return;
            }

            query = query.toLowerCase();

            // Search in images
            searchResults.images = currentImages.filter(image => {
                switch (filter) {
                    case 'name':
                        return image.repository.toLowerCase().includes(query);
                    case 'tag':
                        return image.tag.toLowerCase().includes(query);
                    case 'digest':
                        return image.digest.toLowerCase().includes(query);
                    default:
                        return image.repository.toLowerCase().includes(query) ||
                               image.tag.toLowerCase().includes(query) ||
                               image.digest.toLowerCase().includes(query);
                }
            });

            // Search in tags
            const tagResults = {};
            Object.entries(currentTags).forEach(([repo, tags]) => {
                const matchingTags = tags.filter(tag => {
                    switch (filter) {
                        case 'name':
                            return repo.toLowerCase().includes(query);
                        case 'tag':
                            return tag.toLowerCase().includes(query);
                        default:
                            return repo.toLowerCase().includes(query) ||
                                   tag.toLowerCase().includes(query);
                    }
                });
                if (matchingTags.length > 0) {
                    tagResults[repo] = matchingTags;
                }
            });
            searchResults.tags = tagResults;

            // Update UI with search results
            const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
            if (activeTab === 'images') {
                renderRegistryData(searchResults.images);
            } else if (activeTab === 'tags') {
                renderTagsData(searchResults.tags);
            }

            // Update UI to show search status
            updateSearchStatus(searchResults.images.length, Object.keys(searchResults.tags).length);
        };

        // Update search status in UI
        const updateSearchStatus = (imageCount, tagCount) => {
            const searchStatus = document.createElement('div');
            searchStatus.className = 'search-status';
            searchStatus.innerHTML = `
                <span class="status-count">Found: ${imageCount} images, ${tagCount} repositories</span>
                <span class="status-clear">Clear</span>
            `;

            const existingStatus = document.querySelector('.search-status');
            if (existingStatus) {
                existingStatus.replaceWith(searchStatus);
            } else {
                document.querySelector('.search-bar').appendChild(searchStatus);
            }

            // Add clear search handler
            searchStatus.querySelector('.status-clear').addEventListener('click', () => {
                searchInput.value = '';
                filterSelect.value = 'all';
                searchStatus.remove();
                renderRegistryData(currentImages);
                renderTagsData(currentTags);
            });
        };

        // Store current data for searching
        const updateSearchData = async () => {
            try {
                const images = await apiRequest('/api/images');
                const tags = await apiRequest('/api/tags');
                currentImages = images;
                currentTags = tags;
            } catch (error) {
                console.error('Failed to update search data:', error);
            }
        };

        // Event listeners
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                performSearch(e.target.value, filterSelect.value);
            }, 300); // 300ms debounce
        });

        filterSelect.addEventListener('change', () => {
            performSearch(searchInput.value, filterSelect.value);
        });

        // Initialize search data
        updateSearchData();

        // Update search data when content changes
        const originalFetchRegistryData = window.fetchRegistryData;
        window.fetchRegistryData = async () => {
            await originalFetchRegistryData();
            await updateSearchData();
        };

        const originalFetchTagsData = window.fetchTagsData;
        window.fetchTagsData = async () => {
            await originalFetchTagsData();
            await updateSearchData();
        };

        return {
            updateSearchData,
            performSearch
        };
    }

    // Initialize search functionality
    const search = initializeSearch();
    window.searchHandler = search; // Make search handler available globally

    // Function to calculate and update analytics
    async function updateAnalytics() {
        try {
            const images = await apiRequest('/api/images');
            if (!images || !images.length) return;

            // Calculate total layers and average layers per image
            let totalLayers = 0;
            let uniqueLayers = new Set();
            let totalSize = 0;

            images.forEach(image => {
                if (image.layers) {
                    totalLayers += image.layers.length;
                    image.layers.forEach(layer => {
                        uniqueLayers.add(layer.digest);
                        totalSize += layer.size;
                    });
                }
            });

            const avgLayers = totalLayers / images.length;
            const imageDensity = totalSize / images.length;

            // Calculate repository health score (0-100)
            const layerReuseRatio = 1 - (uniqueLayers.size / totalLayers);
            const tagRatio = window.TOTAL_TAGS / images.length;
            const storageEfficiency = parseFloat(window.STORAGE_EFFICIENCY);

            const healthScore = Math.round(
                (layerReuseRatio * 0.4 + // Layer reuse weight
                Math.min(tagRatio / 2, 1) * 0.3 + // Tag ratio weight (capped at 2:1)
                storageEfficiency * 0.3) * 100 // Storage efficiency weight
            );

            // Update UI
            document.getElementById('totalLayersValue').textContent = totalLayers;
            document.getElementById('avgLayersValue').textContent = avgLayers.toFixed(1);
            document.getElementById('imageDensityValue').textContent = formatSize(imageDensity);
            document.getElementById('repoHealthValue').textContent = `${healthScore}%`;

            // Update charts
            updateDiskUsageChart();
            updateLayerDistributionChart(images);
        } catch (error) {
            console.error('Error updating analytics:', error);
        }
    }

    // Function to update disk usage chart
    function updateDiskUsageChart() {
        const ctx = document.getElementById('diskUsageChart').getContext('2d');
        const usedSpace = parseInt(window.DISK_USAGE);
        const freeSpace = parseInt(window.FREE_SPACE);

        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Used Space', 'Free Space'],
                datasets: [{
                    data: [usedSpace, freeSpace],
                    backgroundColor: [
                        'rgba(0, 255, 0, 0.5)',
                        'rgba(100, 100, 100, 0.5)'
                    ],
                    borderColor: [
                        'rgba(0, 255, 0, 1)',
                        'rgba(100, 100, 100, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#fff'
                        }
                    }
                }
            }
        });
    }

    // Function to update layer distribution chart
    function updateLayerDistributionChart(images) {
        const ctx = document.getElementById('layerChart').getContext('2d');
        const layerSizes = {};

        // Aggregate layer sizes
        images.forEach(image => {
            if (image.layers) {
                image.layers.forEach(layer => {
                    const shortDigest = layer.digest.substring(7, 19);
                    if (layerSizes[shortDigest]) {
                        layerSizes[shortDigest].count++;
                    } else {
                        layerSizes[shortDigest] = {
                            size: layer.size,
                            count: 1
                        };
                    }
                });
            }
        });

        // Sort and take top 10 most reused layers
        const topLayers = Object.entries(layerSizes)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 10);

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: topLayers.map(([digest]) => digest),
                datasets: [{
                    label: 'Reuse Count',
                    data: topLayers.map(([, data]) => data.count),
                    backgroundColor: 'rgba(0, 255, 0, 0.5)',
                    borderColor: 'rgba(0, 255, 0, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#fff'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: '#fff'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }
    
    // Theme initialization and switching
    function initTheme() {
        const themeToggle = document.getElementById('themeToggle');
        const body = document.body;
        const themeIcon = themeToggle.querySelector('.theme-icon');
        
        // Load saved theme from localStorage
        const savedTheme = localStorage.getItem('cyberdock-theme') || 'cyber';
        body.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme, themeIcon);
        
        // Add event listener for theme toggle
        themeToggle.addEventListener('click', () => {
            const currentTheme = body.getAttribute('data-theme') || 'cyber';
            const newTheme = currentTheme === 'cyber' ? 'boomer' : 'cyber';
            
            body.setAttribute('data-theme', newTheme);
            localStorage.setItem('cyberdock-theme', newTheme);
            updateThemeIcon(newTheme, themeIcon);
            
            // Restart or stop matrix animation based on theme
            const canvas = document.getElementById('matrixCanvas');
            if (newTheme === 'boomer') {
                // Stop matrix animation for boomer theme
                if (window.matrixAnimation) {
                    cancelAnimationFrame(window.matrixAnimation);
                    window.matrixAnimation = null;
                }
            } else {
                // Restart matrix animation for cyber theme
                if (canvas && window.initMatrix) {
                    initMatrix('matrixCanvas', 0.45);
                }
            }
        });
    }
    
    function updateThemeIcon(theme, iconElement) {
        iconElement.textContent = theme === 'cyber' ? '☀️' : '🌙';
    }
    
    // Initialize theme
    initTheme();
    
    // Initialize certificate management
    initCertificateManagement();
});

// Certificate Management Functions
function initCertificateManagement() {
    const certTab = document.querySelector('[data-tab="certificates"]');
    const certForm = document.getElementById('cert-upload-form');
    const generateBtn = document.getElementById('generate-cert-btn');
    const refreshBtn = document.getElementById('refresh-cert-btn');
    
    // Load certificate info when tab is clicked
    if (certTab) {
        certTab.addEventListener('click', loadCertificateInfo);
    }
    
    // Handle certificate upload
    if (certForm) {
        certForm.addEventListener('submit', handleCertificateUpload);
    }
    
    // Handle generate new certificate
    if (generateBtn) {
        generateBtn.addEventListener('click', generateNewCertificate);
    }
    
    // Handle refresh certificate info
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadCertificateInfo);
    }
}

async function loadCertificateInfo() {
    const statusPanel = document.getElementById('cert-status');
    if (!statusPanel) return;
    
    statusPanel.innerHTML = '<div class="loading">Loading certificate information...</div>';
    
    try {
        const response = await fetch(apiPath('/api/certificate/info'));
        const data = await response.json();
        
        if (response.ok) {
            displayCertificateInfo(data);
        } else {
            statusPanel.innerHTML = `<div class="error">Error loading certificate info: ${data.error || 'Unknown error'}</div>`;
        }
    } catch (error) {
        statusPanel.innerHTML = `<div class="error">Failed to load certificate info: ${error.message}</div>`;
    }
}

function displayCertificateInfo(certInfo) {
    const statusPanel = document.getElementById('cert-status');
    if (!statusPanel) return;
    
    const html = `
        <div class="cert-details">
            <div class="cert-field">
                <span class="field-label">Subject:</span>
                <span class="field-value">${certInfo.subject || 'N/A'}</span>
            </div>
            <div class="cert-field">
                <span class="field-label">Issuer:</span>
                <span class="field-value">${certInfo.issuer || 'N/A'}</span>
            </div>
            <div class="cert-field">
                <span class="field-label">Valid From:</span>
                <span class="field-value">${certInfo.validFrom ? new Date(certInfo.validFrom).toLocaleString() : 'N/A'}</span>
            </div>
            <div class="cert-field">
                <span class="field-label">Valid Until:</span>
                <span class="field-value">${certInfo.validUntil ? new Date(certInfo.validUntil).toLocaleString() : 'N/A'}</span>
            </div>
            <div class="cert-field">
                <span class="field-label">DNS Names:</span>
                <span class="field-value">${certInfo.dnsNames ? certInfo.dnsNames.join(', ') : 'N/A'}</span>
            </div>
            <div class="cert-field">
                <span class="field-label">Type:</span>
                <span class="field-value">${certInfo.isCustom ? 'Custom Certificate' : 'Self-Signed Certificate'}</span>
            </div>
        </div>
    `;
    
    statusPanel.innerHTML = html;
}

async function handleCertificateUpload(event) {
    event.preventDefault();
    
    const certFile = document.getElementById('cert-file').files[0];
    const keyFile = document.getElementById('key-file').files[0];
    const uploadStatus = document.getElementById('upload-status');
    
    if (!certFile || !keyFile) {
        showUploadStatus('Please select both certificate and key files', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('cert', certFile);
    formData.append('key', keyFile);
    
    uploadStatus.innerHTML = 'Uploading certificate...';
    uploadStatus.className = 'upload-status';
    uploadStatus.style.display = 'block';
    
    try {
        const response = await fetch(apiPath('/api/certificate/upload'), {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showUploadStatus('Certificate uploaded successfully! Server will restart to apply changes.', 'success');
            // Clear form
            document.getElementById('cert-upload-form').reset();
            // Reload certificate info after a delay
            setTimeout(loadCertificateInfo, 3000);
        } else {
            showUploadStatus(`Upload failed: ${data.error || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        showUploadStatus(`Upload failed: ${error.message}`, 'error');
    }
}

async function generateNewCertificate() {
    if (!confirm('This will generate a new self-signed certificate. Continue?')) {
        return;
    }
    
    const uploadStatus = document.getElementById('upload-status');
    uploadStatus.innerHTML = 'Generating new certificate...';
    uploadStatus.className = 'upload-status';
    uploadStatus.style.display = 'block';
    
    try {
        const response = await fetch(apiPath('/api/certificate/generate'), {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showUploadStatus('New certificate generated successfully!', 'success');
            // Reload certificate info
            setTimeout(loadCertificateInfo, 1000);
        } else {
            showUploadStatus(`Generation failed: ${data.error || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        showUploadStatus(`Generation failed: ${error.message}`, 'error');
    }
}

function showUploadStatus(message, type) {
    const uploadStatus = document.getElementById('upload-status');
    uploadStatus.innerHTML = message;
    uploadStatus.className = `upload-status ${type}`;
    uploadStatus.style.display = 'block';
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            uploadStatus.style.display = 'none';
        }, 5000);
    }
}

// Add search-related styles to the existing CSS
const searchStyles = document.createElement('style');
searchStyles.textContent = `
    .search-status {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 0.5rem;
        padding: 0.5rem;
        background: rgba(0, 255, 0, 0.05);
        border: 1px solid var(--neon-green);
        border-radius: 3px;
    }

    .status-count {
        color: var(--neon-green);
        font-size: 0.9rem;
    }

    .status-clear {
        color: var(--text-color);
        cursor: pointer;
        font-size: 0.9rem;
        opacity: 0.8;
        transition: all 0.3s ease;
    }

    .status-clear:hover {
        color: var(--neon-green);
        opacity: 1;
    }

    .search-input {
        background-color: rgba(0, 255, 0, 0.05);
        border: 1px solid var(--neon-green);
        color: var(--text-color);
        padding: 0.5rem 1rem;
        font-family: inherit;
        font-size: 1rem;
        width: 100%;
        transition: all 0.3s ease;
    }

    .search-input:focus {
        outline: none;
        box-shadow: 0 0 15px var(--neon-green);
        background-color: rgba(0, 255, 0, 0.1);
    }

    .filter-select {
        background-color: rgba(0, 255, 0, 0.05);
        border: 1px solid var(--neon-green);
        color: var(--text-color);
        padding: 0.5rem;
        font-family: inherit;
        cursor: pointer;
        min-width: 120px;
    }

    .filter-select:focus {
        outline: none;
        box-shadow: 0 0 15px var(--neon-green);
    }

    .no-results {
        text-align: center;
        padding: 2rem;
        color: var(--text-color);
        border: 1px solid var(--neon-green);
        background: rgba(0, 255, 0, 0.05);
        margin: 1rem 0;
        animation: glowPulse 2s infinite;
    }
`;
document.head.appendChild(searchStyles);