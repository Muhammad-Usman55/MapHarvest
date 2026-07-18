/* ============================================
   MapHarvest — Google Maps Data Extractor
   Application Logic v2.0
   Developed by Muhammad Usman Shahid
   ============================================ */

(function () {
    'use strict';

    // ═══════════════════════════════════════════
    // DATA STORE (INDEXEDDB & IN-MEMORY CACHE)
    // ═══════════════════════════════════════════
    const SEARCH_HISTORY_KEY = 'mapharvest_searches';

    const dbManager = {
        dbName: 'MapHarvestDB',
        storeName: 'places',
        db: null,

        init() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, 1);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    this.db = request.result;
                    resolve(this.db);
                };
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        db.createObjectStore(this.storeName, { keyPath: 'id' });
                    }
                };
            });
        },

        getAll() {
            return new Promise((resolve, reject) => {
                if (!this.db) { resolve([]); return; }
                const transaction = this.db.transaction(this.storeName, 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        },

        save(place) {
            return new Promise((resolve, reject) => {
                if (!this.db) { reject(new Error('Database not initialized')); return; }
                const transaction = this.db.transaction(this.storeName, 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.put(place);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        delete(id) {
            return new Promise((resolve, reject) => {
                if (!this.db) { reject(new Error('Database not initialized')); return; }
                const transaction = this.db.transaction(this.storeName, 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        clear() {
            return new Promise((resolve, reject) => {
                if (!this.db) { reject(new Error('Database not initialized')); return; }
                const transaction = this.db.transaction(this.storeName, 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
    };

    function loadData() {
        return placesData;
    }

    function saveData(data) {
        updateStorageCount();
        updateDashboard();
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    }

    let placesData = [];
    let currentSort = { field: null, direction: 'asc' };
    let extractedPreview = [];
    let scraperSource = null;
    let scrapedSessionData = []; // items collected in current automated session

    // ═══════════════════════════════════════════
    // DOM REFERENCES
    // ═══════════════════════════════════════════
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const navItems = $$('.nav-item');
    const tabContents = $$('.tab-content');

    // Dashboard
    const totalPlaces = $('#totalPlaces');
    const avgRating = $('#avgRating');
    const withPhone = $('#withPhone');
    const withWebsite = $('#withWebsite');
    const recentList = $('#recentList');
    const storageCount = $('#storageCount');

    // Hero Search & Automation Controls
    const heroSearchInput = $('#heroSearchInput');
    const btnStartScrape = $('#btnStartScrape');
    const btnStopScrape = $('#btnStopScrape');
    const automationView = $('#automationView');
    
    // Live Terminal
    const terminalLogs = $('#terminalLogs');
    const btnClearTerminal = $('#btnClearTerminal');

    // Live Stats & Session List
    const scrapeStatusPill = $('#scrapeStatusPill');
    const progressPercentage = $('#progressPercentage');
    const progressCounts = $('#progressCounts');
    const progressBarInner = $('#progressBarInner');
    const currentTaskLabel = $('#currentTaskLabel');
    const sessionCount = $('#sessionCount');
    const sessionList = $('#sessionList');

    // Extract Tab
    const extractTextarea = $('#extractTextarea');
    const charCount = $('#charCount');
    const btnExtract = $('#btnExtract');
    const btnSampleData = $('#btnSampleData');
    const btnClearText = $('#btnClearText');
    const extractPreview = $('#extractPreview');
    const previewCards = $('#previewCards');
    const extractedCount = $('#extractedCount');
    const btnSaveExtracted = $('#btnSaveExtracted');

    // Manual Form
    const manualForm = $('#manualForm');

    // Data Table
    const tableBody = $('#tableBody');
    const tableEmpty = $('#tableEmpty');
    const tableFooter = $('#tableFooter');
    const tableWrapper = $('#tableWrapper');
    const searchInput = $('#searchInput');
    const selectAll = $('#selectAll');
    const bulkActions = $('#bulkActions');
    const btnDeleteSelected = $('#btnDeleteSelected');
    const showingCount = $('#showingCount');
    const totalCount = $('#totalCount');

    // Export
    const exportPreview = $('#exportPreview');

    // Modal
    const editModal = $('#editModal');
    const editForm = $('#editForm');
    const modalClose = $('#modalClose');
    const btnCancelEdit = $('#btnCancelEdit');

    // Other
    const menuToggle = $('#menuToggle');
    const sidebar = $('#sidebar');
    const btnClearAll = $('#btnClearAll');
    const viewAllLink = $('#viewAllLink');
    const toastContainer = $('#toastContainer');

    // ═══════════════════════════════════════════
    // NAVIGATION
    // ═══════════════════════════════════════════
    function switchTab(tabId) {
        navItems.forEach(item => item.classList.remove('active'));
        tabContents.forEach(tab => tab.classList.remove('active'));
        const activeNav = $(`[data-tab="${tabId}"]`);
        const activeTab = $(`#tab-${tabId}`);
        if (activeNav) activeNav.classList.add('active');
        if (activeTab) activeTab.classList.add('active');
        sidebar.classList.remove('open');
        if (tabId === 'data') renderTable();
        if (tabId === 'export') updateExportPreview();
        if (tabId === 'admin') loadAdminPanel();
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => { e.preventDefault(); switchTab(item.dataset.tab); });
    });
    viewAllLink.addEventListener('click', (e) => { e.preventDefault(); switchTab('data'); });
    menuToggle.addEventListener('click', () => { sidebar.classList.toggle('open'); });
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && sidebar.classList.contains('open') && !sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
            sidebar.classList.remove('open');
        }
    });

    // ═══════════════════════════════════════════
    // TOAST NOTIFICATIONS
    // ═══════════════════════════════════════════
    function showToast(message, type = 'info') {
        const icons = {
            success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
            error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
            warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
        };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <span>${message}</span>
            <div class="toast-progress"></div>
        `;
        toastContainer.appendChild(toast);

        let dismissTimeout;
        let start = Date.now();
        let remaining = 3500;

        function startTimer() {
            dismissTimeout = setTimeout(() => {
                toast.classList.add('toast-exit');
                setTimeout(() => toast.remove(), 300);
            }, remaining);
        }

        function pauseTimer() {
            clearTimeout(dismissTimeout);
            remaining -= Date.now() - start;
            const progress = toast.querySelector('.toast-progress');
            if (progress) {
                progress.style.animationPlayState = 'paused';
            }
        }

        function resumeTimer() {
            start = Date.now();
            startTimer();
            const progress = toast.querySelector('.toast-progress');
            if (progress) {
                progress.style.animationPlayState = 'running';
            }
        }

        toast.addEventListener('mouseenter', pauseTimer);
        toast.addEventListener('mouseleave', resumeTimer);

        startTimer();
    }

    // ═══════════════════════════════════════════
    // AUTOMATED SCRAPER INTEGRATION (SSE)
    // ═══════════════════════════════════════════
    let currentQuery = '';

    function addLog(text, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logLine = document.createElement('div');
        logLine.className = `log-line ${type}`;
        logLine.textContent = `[${timestamp}] [${type.toUpperCase()}] ${text}`;
        terminalLogs.appendChild(logLine);
        terminalLogs.scrollTop = terminalLogs.scrollHeight;
    }

    function clearLogs() {
        terminalLogs.innerHTML = '<div class="log-line system">[SYSTEM] Scraper ready. Enter query to begin.</div>';
    }

    function startScraping(query) {
        if (!query || !query.trim()) {
            showToast('Please enter a search term', 'warning');
            return;
        }

        query = query.trim();
        currentQuery = query;
        scrapedSessionData = [];

        // Update UI
        automationView.style.display = 'grid';
        btnStartScrape.style.display = 'none';
        btnStopScrape.style.display = 'inline-flex';
        
        scrapeStatusPill.className = 'status-pill status-running';
        scrapeStatusPill.textContent = 'Running';
        
        progressPercentage.textContent = 'Scraping...';
        progressBarInner.style.width = '100%';
        progressCounts.textContent = `0 places`;
        currentTaskLabel.textContent = 'Connecting to scraper server...';

        clearLogs();
        addLog(`Initiated automatic scrape for "${query}" (all available listings)`, 'system');
        updateSessionList();

        // Close any open event sources
        if (scraperSource) {
            scraperSource.close();
        }

        // Connect to local Node backend SSE endpoint
        const token = localStorage.getItem('mapharvest_token') || '';
        const sseUrl = `/api/scrape?query=${encodeURIComponent(query)}&token=${encodeURIComponent(token)}`;
        scraperSource = new EventSource(sseUrl);

        scraperSource.onmessage = function (event) {
            try {
                const packet = JSON.parse(event.data);
                const { status, message, data } = packet;

                switch (status) {
                    case 'info':
                        addLog(message, 'info');
                        currentTaskLabel.textContent = message;
                        break;
                    case 'warning':
                        addLog(message, 'warning');
                        showToast(message, 'warning');
                        break;
                    case 'error':
                        addLog(message, 'error');
                        showToast(message, 'error');
                        stopScrapingSession('error');
                        break;
                    case 'place':
                        addLog(message, 'success');
                        scrapedSessionData.push(data);
                        updateSessionList();

                        // Write to IndexedDB directly
                        placesData = loadData();
                        const exists = placesData.some(p => p.name.toLowerCase() === data.name.toLowerCase());
                        if (!exists) {
                            placesData.push(data);
                            dbManager.save(data);
                            saveData(placesData);
                            syncToServer(data);
                        }

                        // Update progress bar
                        progressPercentage.textContent = 'Scraping...';
                        progressBarInner.style.width = '100%';
                        progressCounts.textContent = `${scrapedSessionData.length} places`;
                        break;
                    case 'success':
                        addLog(message, 'success');
                        progressPercentage.textContent = '100%';
                        progressBarInner.style.width = '100%';
                        showToast(`Successfully scraped ${scrapedSessionData.length} places!`, 'success');
                        stopScrapingSession('complete');
                        break;
                }
            } catch (err) {
                addLog(`Error parsing scraper log event: ${err.message}`, 'error');
            }
        };

        scraperSource.onerror = function () {
            addLog('Lost connection to backend scraper service. Please ensure server.js is running.', 'error');
            showToast('Scraper server connection lost.', 'error');
            stopScrapingSession('error');
        };
    }

    function stopScrapingSession(finalStatus = 'idle') {
        if (scraperSource) {
            scraperSource.close();
            scraperSource = null;
        }

        btnStartScrape.style.display = 'inline-flex';
        btnStopScrape.style.display = 'none';

        scrapeStatusPill.className = `status-pill status-${finalStatus}`;
        scrapeStatusPill.textContent = finalStatus.charAt(0).toUpperCase() + finalStatus.slice(1);

        if (finalStatus === 'idle') {
            addLog('Scraping session stopped by user.', 'warning');
            currentTaskLabel.textContent = 'Cancelled';
            showToast('Scraping stopped.', 'warning');
        } else if (finalStatus === 'complete') {
            currentTaskLabel.textContent = 'Scrape finished.';
        } else {
            currentTaskLabel.textContent = 'Error occurred.';
        }
    }

    function updateSessionList() {
        sessionCount.textContent = `${scrapedSessionData.length} extracted`;

        if (scrapedSessionData.length === 0) {
            sessionList.innerHTML = `
                <div class="live-list-empty">
                    <p>Newly scraped places will appear here in real-time.</p>
                </div>`;
            return;
        }

        sessionList.innerHTML = scrapedSessionData.map(place => `
            <div class="live-item">
                <div class="live-item-info">
                    <span class="live-item-name">${escapeHtml(place.name)}</span>
                    <span class="live-item-category">${escapeHtml(place.category || 'No Category')}</span>
                </div>
                <span class="live-item-badge">Scraped</span>
            </div>
        `).join('');
    }

    // Event Listeners
    btnStartScrape.addEventListener('click', () => {
        const query = heroSearchInput.value;
        startScraping(query);
    });

    btnStopScrape.addEventListener('click', () => {
        stopScrapingSession('idle');
    });

    heroSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = heroSearchInput.value;
            startScraping(query);
        }
    });

    // Suggestions click
    $$('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const query = chip.dataset.query;
            heroSearchInput.value = query;
            startScraping(query);
        });
    });

    btnClearTerminal.addEventListener('click', clearLogs);

    function saveSearchHistory(query) {
        try {
            let history = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY)) || [];
            history = history.filter(h => h.toLowerCase() !== query.toLowerCase());
            history.unshift(query);
            if (history.length > 10) history = history.slice(0, 10);
            localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
        } catch (e) { /* ignore */ }
    }

    // ═══════════════════════════════════════════
    // DASHBOARD
    // ═══════════════════════════════════════════
    function updateStorageCount() {
        placesData = loadData();
        storageCount.textContent = `${placesData.length} records`;
    }

    function updateDashboard() {
        placesData = loadData();
        animateValue(totalPlaces, placesData.length);

        const rated = placesData.filter(p => p.rating > 0);
        const avg = rated.length > 0
            ? (rated.reduce((sum, p) => sum + parseFloat(p.rating), 0) / rated.length).toFixed(1) : '0.0';
        avgRating.textContent = avg;

        const phoneCount = placesData.filter(p => p.phone && p.phone.trim()).length;
        animateValue(withPhone, phoneCount);

        const websiteCount = placesData.filter(p => p.website && p.website.trim()).length;
        animateValue(withWebsite, websiteCount);

        const emailCount = placesData.filter(p => p.email && p.email.trim()).length;
        const withEmailEl = $('#withEmail');
        if (withEmailEl) animateValue(withEmailEl, emailCount);

        renderRecentEntries();
    }

    function animateValue(el, target) {
        const current = parseInt(el.textContent) || 0;
        if (current === target) return;
        const duration = 400;
        const start = performance.now();
        function update(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(current + (target - current) * eased);
            if (progress < 1) requestAnimationFrame(update);
        }
        requestAnimationFrame(update);
    }

    function renderRecentEntries() {
        if (placesData.length === 0) {
            recentList.innerHTML = `
                <div class="empty-state small">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="36" height="36"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <p>No data extracted yet</p>
                    <span>Search above to start collecting data</span>
                </div>`;
            return;
        }

        const recent = [...placesData].reverse().slice(0, 5);
        recentList.innerHTML = recent.map(place => `
            <div class="recent-item">
                <div class="recent-item-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
                <div class="recent-item-info">
                    <div class="recent-item-name">${escapeHtml(place.name)}</div>
                    <div class="recent-item-meta">
                        ${place.rating ? `<span class="recent-item-rating">★ ${place.rating}</span>` : ''}
                        ${place.category ? `<span>${escapeHtml(place.category)}</span>` : ''}
                        ${place.address ? `<span>${escapeHtml(truncate(place.address, 30))}</span>` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    }

    // ═══════════════════════════════════════════
    // TEXT PARSER (Core Extraction Logic)
    // ═══════════════════════════════════════════
    function isBareDomain(str) {
        return /^[a-z0-9][\w\-]*\.[a-z]{2,}(\.[a-z]{2,})?(\/\S*)?$/i.test(str.trim()) &&
               !/\s/.test(str.trim()) && str.trim().length < 60;
    }

    function parseGoogleMapsText(text) {
        const results = [];
        if (!text || !text.trim()) return results;

        const blocks = splitIntoBlocks(text);
        for (const block of blocks) {
            const place = extractPlaceFromBlock(block);
            if (place && place.name) results.push(place);
        }

        const seen = new Set();
        return results.filter(place => {
            const key = place.name.toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function splitIntoBlocks(text) {
        // First: split by blank lines
        const doubleNewlineBlocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(b => b.length > 0);
        if (doubleNewlineBlocks.length > 1) return doubleNewlineBlocks;

        // Second: detect listing boundaries
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const blocks = [];
        let currentBlock = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (currentBlock.length >= 3 && isPotentialNewListing(line, currentBlock)) {
                blocks.push(currentBlock.join('\n'));
                currentBlock = [];
            }
            currentBlock.push(line);
        }
        if (currentBlock.length > 0) blocks.push(currentBlock.join('\n'));
        if (blocks.length > 1) return blocks;

        // Third: rating-based splitting
        const ratingRegex = /(\d\.\d)\s*\([\d,]+\s*(?:review|rating|avis|Bewertung)/gi;
        const parts = text.split(ratingRegex);
        if (parts.length > 2) {
            const ratingBlocks = [];
            for (let i = 0; i < parts.length - 1; i += 2) {
                ratingBlocks.push(parts[i] + (parts[i + 1] || ''));
            }
            return ratingBlocks;
        }

        return [text];
    }

    function isPotentialNewListing(currentLine, block) {
        const blockText = block.join('\n');
        const hasAddress = /\d+\s+\w+\s+(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place)/i.test(blockText);
        const hasPhone = /[\+]?\d[\d\-\(\)\s]{7,}/.test(blockText);
        const isShortLine = currentLine.length < 60 && currentLine.length > 2;
        const noNumbers = !/^\d/.test(currentLine) && !/\(\d/.test(currentLine);
        const notDomain = !isBareDomain(currentLine);
        const notUrl = !/^https?:\/\//i.test(currentLine);
        return (hasAddress || hasPhone) && isShortLine && noNumbers && notDomain && notUrl;
    }

    function extractPlaceFromBlock(block) {
        const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) return null;

        const place = {
            id: generateId(),
            name: '', category: '', rating: '', reviews: '',
            phone: '', address: '', website: '', hours: '',
            priceLevel: '', latitude: '', longitude: '', email: '', mapsUrl: '', notes: '',
            createdAt: new Date().toISOString()
        };

        const fullText = block;

        // Name
        for (const line of lines) {
            if (line.length > 2 && line.length < 80 &&
                !/^\d\.\d/.test(line) && !/^http/i.test(line) && !isBareDomain(line) &&
                !/^\+?\d[\d\-\s\(\)]{6,}$/.test(line) &&
                !/^(open|closed|hours|directions|website|phone|address|send|share|save|review|photo|menu)/i.test(line) &&
                !/^★|^⭐/.test(line) && !/^\$/.test(line)) {
                place.name = line;
                break;
            }
        }
        if (!place.name) return null;

        // Rating
        const ratingMatch = fullText.match(/(\d\.\d)\s*(?:stars?)?[\s]*(?:\([\d,\.]+\s*(?:reviews?|ratings?|avis)?\))?/i) ||
                           fullText.match(/(\d\.\d)\s*\(/) || fullText.match(/Rating:\s*(\d\.\d)/i);
        if (ratingMatch) place.rating = parseFloat(ratingMatch[1]);

        // Reviews
        const reviewsMatch = fullText.match(/\((\d[\d,\.]*)\s*(?:reviews?|ratings?|avis|Bewertung)?\)/i) ||
                            fullText.match(/(\d[\d,\.]*)\s+(?:reviews?|ratings?)/i);
        if (reviewsMatch) place.reviews = parseInt(reviewsMatch[1].replace(/[,\.]/g, ''));

        // Phone
        const phoneMatch = fullText.match(/(?:phone|tel|call|☎|📞)[:\s]*([+\d][\d\-\s\(\)]{7,})/i) ||
                          fullText.match(/(\+\d[\d\-\s\(\)]{8,})/);
        if (phoneMatch) { place.phone = phoneMatch[1].trim(); }
        else {
            for (const line of lines) {
                const phoneLine = line.match(/^([+\d\(][\d\-\s\(\)\.]{8,})$/);
                if (phoneLine && line !== place.name) { place.phone = phoneLine[1].trim(); break; }
            }
        }

        // Address
        const addressMatch = fullText.match(/(?:address|location|located|📍)[:\s]+(.+)/i);
        if (addressMatch) { place.address = addressMatch[1].trim(); }
        else {
            for (const line of lines) {
                if (line !== place.name && /\d+\s+\w+\s+(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|hwy|highway|pkwy|parkway)/i.test(line)) {
                    place.address = line; break;
                }
                if (line !== place.name && /[A-Z][a-z]+,\s*[A-Z]{2}\s+\d{5}/.test(line)) {
                    place.address = line; break;
                }
            }
        }

        // Website (bare domains first, then URLs)
        for (const line of lines) {
            if (line !== place.name && isBareDomain(line)) {
                place.website = 'https://' + line.trim(); break;
            }
        }
        if (!place.website) {
            const websiteMatch = fullText.match(/(?:website|web|site)[:\s]*(https?:\/\/[^\s]+)/i) ||
                                fullText.match(/(https?:\/\/(?!maps\.google|goo\.gl|www\.google)[^\s]+)/i);
            if (websiteMatch) {
                let url = websiteMatch[1].trim();
                if (!url.startsWith('http')) url = 'https://' + url;
                place.website = url;
            }
        }

        // Category
        const categoryLineMatch = fullText.match(/^(.+?)\s*[·•]\s*\${1,4}\s*$/m);
        if (categoryLineMatch) place.category = categoryLineMatch[1].trim();
        if (!place.category) {
            const catMatch = fullText.match(/(?:category|type)[:\s]+(.+)/i);
            if (catMatch) place.category = catMatch[1].trim().replace(/[·•|].*$/, '').trim();
        }
        if (!place.category) {
            for (const line of lines) {
                if (line !== place.name && line.length < 40 && line.length > 2 && !isBareDomain(line) &&
                    !/\d{3}/.test(line) && !/^http/i.test(line) && !/^\$/.test(line) && !/^\d\.\d/.test(line) &&
                    !/^(open|closed|hour|direction)/i.test(line)) {
                    if (/restaurant|cafe|shop|store|hotel|bar|service|repair|clinic|salon|gym|studio|center|agency|office|company|dental|hospital|pharmacy|bakery|market/i.test(line)) {
                        place.category = line.split('·')[0].split('|')[0].trim(); break;
                    }
                }
            }
        }

        // Hours
        const hoursMatch = fullText.match(/(Open\s+(?:24 hours|\d{1,2}(?::\d{2})?\s*(?:AM|PM)\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM)))/i) ||
                          fullText.match(/(?:hours?|open|closed)[:\s]+(.+)/i);
        if (hoursMatch) place.hours = hoursMatch[1].trim();

        // Price Level
        const priceMatch = fullText.match(/[·•]\s*(\${1,4})\s*$/m) || fullText.match(/(\${1,4})\s*[·•\-–]/);
        if (priceMatch) place.priceLevel = priceMatch[1];

        // Maps URL
        const mapsUrlMatch = fullText.match(/(https?:\/\/(?:maps\.google|goo\.gl|www\.google\.com\/maps)[^\s]+)/i);
        if (mapsUrlMatch) place.mapsUrl = mapsUrlMatch[1];

        return place;
    }

    // ═══════════════════════════════════════════
    // EXTRACT TAB
    // ═══════════════════════════════════════════
    extractTextarea.addEventListener('input', () => { charCount.textContent = extractTextarea.value.length; });

    btnExtract.addEventListener('click', () => {
        const text = extractTextarea.value.trim();
        if (!text) { showToast('Please paste some text from Google Maps first', 'warning'); return; }
        extractedPreview = parseGoogleMapsText(text);
        if (extractedPreview.length === 0) { showToast('Could not extract any business data. Try copying more text.', 'warning'); return; }
        renderPreviewCards();
        extractPreview.style.display = 'block';
        showToast(`Found ${extractedPreview.length} place(s)!`, 'success');
    });

    btnSampleData.addEventListener('click', () => {
        extractTextarea.value = getSampleData();
        charCount.textContent = extractTextarea.value.length;
        showToast('Sample data loaded! Click "Extract Data" to parse it.', 'info');
    });

    btnClearText.addEventListener('click', () => {
        extractTextarea.value = '';
        charCount.textContent = '0';
        extractPreview.style.display = 'none';
        extractedPreview = [];
    });

    btnSaveExtracted.addEventListener('click', () => {
        if (extractedPreview.length === 0) return;
        placesData = loadData();
        
        // Save to IndexedDB and sync to server
        extractedPreview.forEach(place => {
            placesData.push(place);
            dbManager.save(place);
            syncToServer(place);
        });

        saveData(placesData);
        showToast(`Saved ${extractedPreview.length} place(s) successfully!`, 'success');
        extractedPreview = [];
        extractPreview.style.display = 'none';
        extractTextarea.value = '';
        charCount.textContent = '0';
    });

    function renderPreviewCards() {
        extractedCount.textContent = `${extractedPreview.length} found`;
        previewCards.innerHTML = extractedPreview.map((place, idx) => `
            <div class="preview-card" data-index="${idx}">
                <div class="preview-card-header">
                    <span class="preview-card-name">${escapeHtml(place.name)}</span>
                    <div style="display:flex;align-items:center;">
                        ${place.rating ? `<span class="preview-card-rating"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>${place.rating}</span>` : ''}
                        <button class="preview-card-remove" onclick="removePreviewCard(${idx})" title="Remove">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                </div>
                <div class="preview-card-details">
                    ${place.category ? `<div class="preview-card-detail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/></svg><span>${escapeHtml(place.category)}</span></div>` : ''}
                    ${place.address ? `<div class="preview-card-detail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span>${escapeHtml(place.address)}</span></div>` : ''}
                    ${place.phone ? `<div class="preview-card-detail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3"/></svg><span>${escapeHtml(place.phone)}</span></div>` : ''}
                    ${place.website ? `<div class="preview-card-detail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg><span>${escapeHtml(truncate(place.website, 40))}</span></div>` : ''}
                    ${place.reviews ? `<div class="preview-card-detail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>${place.reviews.toLocaleString()} reviews</span></div>` : ''}
                </div>
            </div>
        `).join('');
    }

    window.removePreviewCard = function (idx) {
        extractedPreview.splice(idx, 1);
        renderPreviewCards();
        if (extractedPreview.length === 0) extractPreview.style.display = 'none';
    };

    // ═══════════════════════════════════════════
    // MANUAL ENTRY
    // ═══════════════════════════════════════════
    manualForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const place = {
            id: generateId(),
            name: $('#fieldName').value.trim(),
            category: $('#fieldCategory').value.trim(),
            rating: parseFloat($('#fieldRating').value) || '',
            reviews: parseInt($('#fieldReviews').value) || '',
            phone: $('#fieldPhone').value.trim(),
            address: $('#fieldAddress').value.trim(),
            website: $('#fieldWebsite').value.trim(),
            hours: $('#fieldHours').value.trim(),
            priceLevel: $('#fieldPriceLevel').value,
            latitude: '',
            longitude: '',
            email: $('#fieldEmail').value.trim(),
            mapsUrl: $('#fieldMapsUrl').value.trim(),
            notes: $('#fieldNotes').value.trim(),
            createdAt: new Date().toISOString()
        };
        if (!place.name) { showToast('Business name is required', 'error'); return; }
        placesData = loadData();
        placesData.push(place);
        dbManager.save(place);
        saveData(placesData);
        syncToServer(place);
        manualForm.reset();
        showToast(`"${place.name}" added successfully!`, 'success');
    });

    // ═══════════════════════════════════════════
    // DATA TABLE
    // ═══════════════════════════════════════════
    function renderTable(searchTerm = '') {
        placesData = loadData();
        let filtered = placesData;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = placesData.filter(p =>
                (p.name && p.name.toLowerCase().includes(term)) ||
                (p.category && p.category.toLowerCase().includes(term)) ||
                (p.address && p.address.toLowerCase().includes(term)) ||
                (p.phone && p.phone.includes(term))
            );
        }

        if (currentSort.field) {
            filtered.sort((a, b) => {
                let valA = a[currentSort.field] || '', valB = b[currentSort.field] || '';
                if (currentSort.field === 'rating' || currentSort.field === 'reviews') {
                    valA = parseFloat(valA) || 0; valB = parseFloat(valB) || 0;
                } else { valA = valA.toString().toLowerCase(); valB = valB.toString().toLowerCase(); }
                if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
                if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        if (filtered.length === 0) {
            tableWrapper.style.display = 'none'; tableEmpty.style.display = 'block'; tableFooter.style.display = 'none';
            return;
        }

        tableWrapper.style.display = 'block'; tableEmpty.style.display = 'none'; tableFooter.style.display = 'flex';
        showingCount.textContent = filtered.length;
        totalCount.textContent = placesData.length;

        tableBody.innerHTML = filtered.map(place => `
            <tr data-id="${place.id}">
                <td><input type="checkbox" class="custom-checkbox row-check" value="${place.id}"></td>
                <td class="td-name" data-label="Name">${escapeHtml(place.name)}</td>
                <td data-label="Category">${escapeHtml(place.category || '—')}</td>
                <td data-label="Rating">${place.rating ? `<div class="td-rating"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>${place.rating}</div>` : '—'}</td>
                <td data-label="Reviews">${place.reviews ? place.reviews.toLocaleString() : '—'}</td>
                <td data-label="Phone">${escapeHtml(place.phone || '—')}</td>
                <td data-label="Address" title="${escapeHtml(place.address || '')}">${escapeHtml(truncate(place.address || '—', 28))}</td>
                <td class="td-website" data-label="Website">${place.website ? `<a href="${escapeHtml(place.website)}" target="_blank" rel="noopener">${escapeHtml(truncate(getDomain(place.website), 22))}</a>` : '—'}</td>
                <td data-label="Actions"><div class="td-actions">
                    <button class="action-btn edit" onclick="editPlace('${place.id}')" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                    <button class="action-btn delete" onclick="deletePlace('${place.id}')" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                </div></td>
            </tr>
        `).join('');

        attachCheckboxListeners();
    }

    searchInput.addEventListener('input', (e) => { renderTable(e.target.value); });

    $$('.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            $$('.sortable').forEach(t => t.classList.remove('asc', 'desc'));
            if (currentSort.field === field) { currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc'; }
            else { currentSort.field = field; currentSort.direction = 'asc'; }
            th.classList.add(currentSort.direction);
            renderTable(searchInput.value);
        });
    });

    selectAll.addEventListener('change', () => { $$('.row-check').forEach(cb => { cb.checked = selectAll.checked; }); updateBulkActions(); });
    function attachCheckboxListeners() { $$('.row-check').forEach(cb => { cb.addEventListener('change', updateBulkActions); }); }
    function updateBulkActions() {
        const checked = $$('.row-check:checked');
        bulkActions.style.display = checked.length > 0 ? 'block' : 'none';
        const btnSelected = $('#btnLoadWaQueueSelected');
        if (btnSelected) {
            btnSelected.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                Import Selected Contacts (${checked.length})
            `;
        }
    }

    btnDeleteSelected.addEventListener('click', () => {
        const checkedIds = [...$$('.row-check:checked')].map(cb => cb.value);
        if (checkedIds.length === 0) return;
        if (confirm(`Delete ${checkedIds.length} selected entries?`)) {
            placesData = loadData();
            placesData = placesData.filter(p => !checkedIds.includes(p.id));
            Promise.all(checkedIds.map(id => dbManager.delete(id))).then(() => {
                saveData(placesData);
                bulkDeleteFromServer(checkedIds);
                selectAll.checked = false;
                renderTable(searchInput.value);
                showToast(`Deleted ${checkedIds.length} entries`, 'success');
            }).catch(err => {
                showToast('Failed to delete some entries: ' + err.message, 'error');
            });
        }
    });

    window.editPlace = function (id) {
        placesData = loadData();
        const place = placesData.find(p => p.id === id);
        if (!place) return;
        $('#editId').value = place.id;
        $('#editName').value = place.name || '';
        $('#editCategory').value = place.category || '';
        $('#editRating').value = place.rating || '';
        $('#editReviews').value = place.reviews || '';
        $('#editPhone').value = place.phone || '';
        $('#editAddress').value = place.address || '';
        $('#editWebsite').value = place.website || '';
        $('#editEmail').value = place.email || '';
        $('#editHours').value = place.hours || '';
        $('#editPriceLevel').value = place.priceLevel || '';
        $('#editNotes').value = place.notes || '';
        $('#editMapsUrl').value = place.mapsUrl || '';
        editModal.classList.add('active');
    };

    window.deletePlace = function (id) {
        if (confirm('Delete this entry?')) {
            placesData = loadData();
            placesData = placesData.filter(p => p.id !== id);
            dbManager.delete(id);
            saveData(placesData);
            deleteFromServer(id);
            renderTable(searchInput.value);
            showToast('Entry deleted', 'success');
        }
    };

    editForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = $('#editId').value;
        placesData = loadData();
        const idx = placesData.findIndex(p => p.id === id);
        if (idx === -1) return;
        const updatedPlace = {
            ...placesData[idx],
            name: $('#editName').value.trim(), category: $('#editCategory').value.trim(),
            rating: parseFloat($('#editRating').value) || '', reviews: parseInt($('#editReviews').value) || '',
            phone: $('#editPhone').value.trim(), address: $('#editAddress').value.trim(),
            website: $('#editWebsite').value.trim(), email: $('#editEmail').value.trim(), hours: $('#editHours').value.trim(),
            priceLevel: $('#editPriceLevel').value, notes: $('#editNotes').value.trim(),
            mapsUrl: $('#editMapsUrl').value.trim()
        };
        placesData[idx] = updatedPlace;
        dbManager.save(updatedPlace);
        saveData(placesData);
        syncToServer(updatedPlace);
        editModal.classList.remove('active');
        renderTable(searchInput.value);
        showToast('Entry updated successfully!', 'success');
    });

    modalClose.addEventListener('click', () => editModal.classList.remove('active'));
    btnCancelEdit.addEventListener('click', () => editModal.classList.remove('active'));
    editModal.addEventListener('click', (e) => { if (e.target === editModal) editModal.classList.remove('active'); });

    // ═══════════════════════════════════════════
    // EXPORT
    // ═══════════════════════════════════════════
    function updateExportPreview() {
        placesData = loadData();
        if (placesData.length === 0) { exportPreview.textContent = 'No data to preview. Extract or add data first.'; return; }
        const preview = placesData.slice(0, 5).map(p =>
            `Name: ${p.name}\nCategory: ${p.category || 'N/A'}\nRating: ${p.rating || 'N/A'}\nPhone: ${p.phone || 'N/A'}\nAddress: ${p.address || 'N/A'}\nWebsite: ${p.website || 'N/A'}`
        ).join('\n\n─────────────────────\n\n');
        exportPreview.textContent = preview + (placesData.length > 5 ? `\n\n... and ${placesData.length - 5} more entries` : '');
    }

    $('#exportCSV').addEventListener('click', () => exportData('csv'));
    $('#exportExcel').addEventListener('click', () => exportData('excel'));
    $('#exportJSON').addEventListener('click', () => exportData('json'));
    $('#exportTXT').addEventListener('click', () => exportData('txt'));
    $('#exportClipboard').addEventListener('click', () => exportData('clipboard'));

    function exportData(format) {
        placesData = loadData();
        if (placesData.length === 0) { showToast('No data to export', 'warning'); return; }
        
        // Define file name matching search keyword/query
        const activeQuery = currentQuery || searchInput.value.trim() || heroSearchInput.value.trim() || 'mapharvest_export';
        const safeQuery = activeQuery.trim().replace(/[\\/:*?"<>|]/g, '_').toLowerCase();
        
        if (format === 'excel') {
            try {
                const mappedData = placesData.map(p => ({
                    'Business Name': p.name,
                    'Category': p.category || '',
                    'Rating': p.rating || '',
                    'Reviews': p.reviews || '',
                    'Phone': p.phone || '',
                    'Address': p.address || '',
                    'Website': p.website || '',
                    'Hours': p.hours || '',
                    'Price Level': p.priceLevel || '',
                    'Latitude': p.latitude || '',
                    'Longitude': p.longitude || '',
                    'Email': p.email || '',
                    'Maps URL': p.mapsUrl || '',
                    'Notes': p.notes || ''
                }));
                const worksheet = XLSX.utils.json_to_sheet(mappedData);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "MapHarvest Data");
                XLSX.writeFile(workbook, `${safeQuery}.xlsx`);
                showToast(`Exported ${placesData.length} entries as EXCEL`, 'success');
            } catch (err) {
                showToast('Excel export failed: ' + err.message, 'error');
            }
            return;
        }

        let content, filename, mimeType;
        switch (format) {
            case 'csv':
                content = generateCSV(); filename = `${safeQuery}.csv`; mimeType = 'text/csv'; break;
            case 'json':
                content = JSON.stringify(placesData, null, 2); filename = `${safeQuery}.json`; mimeType = 'application/json'; break;
            case 'txt':
                content = generateTXT(); filename = `${safeQuery}.txt`; mimeType = 'text/plain'; break;
            case 'clipboard':
                navigator.clipboard.writeText(generateClipboardTable()).then(() => showToast('Copied to clipboard!', 'success')).catch(() => showToast('Copy failed', 'error'));
                return;
        }
        downloadFile(content, filename, mimeType);
        showToast(`Exported ${placesData.length} entries as ${format.toUpperCase()}`, 'success');
    }

    function generateCSV() {
        const headers = ['Name','Category','Rating','Reviews','Phone','Address','Website','Hours','Price Level','Latitude','Longitude','Email','Maps URL','Notes'];
        const rows = placesData.map(p => [
            csvEscape(p.name),
            csvEscape(p.category),
            p.rating || '',
            p.reviews || '',
            csvEscape(p.phone),
            csvEscape(p.address),
            csvEscape(p.website),
            csvEscape(p.hours),
            csvEscape(p.priceLevel),
            p.latitude || '',
            p.longitude || '',
            csvEscape(p.email),
            csvEscape(p.mapsUrl),
            csvEscape(p.notes)
        ]);
        return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    function generateTXT() {
        return placesData.map((p, i) => [
            `═══ Entry ${i + 1} ═══`, `Name:        ${p.name}`, `Category:    ${p.category || 'N/A'}`,
            `Rating:      ${p.rating || 'N/A'}`, `Reviews:     ${p.reviews ? p.reviews.toLocaleString() : 'N/A'}`,
            `Phone:       ${p.phone || 'N/A'}`, `Address:     ${p.address || 'N/A'}`, `Website:     ${p.website || 'N/A'}`,
            `Hours:       ${p.hours || 'N/A'}`, `Price Level: ${p.priceLevel || 'N/A'}`, `Maps URL:    ${p.mapsUrl || 'N/A'}`
        ].join('\n')).join('\n\n');
    }

    function generateClipboardTable() {
        const headers = 'Name\tCategory\tRating\tReviews\tPhone\tAddress\tWebsite';
        const rows = placesData.map(p => `${p.name}\t${p.category||''}\t${p.rating||''}\t${p.reviews||''}\t${p.phone||''}\t${p.address||''}\t${p.website||''}`);
        return [headers, ...rows].join('\n');
    }

    function downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }



    // ═══════════════════════════════════════════
    // OTHER
    // ═══════════════════════════════════════════
    btnClearAll.addEventListener('click', () => {
        if (placesData.length === 0) { showToast('No data to clear', 'info'); return; }
        if (confirm(`Delete all ${placesData.length} records? This cannot be undone.`)) {
            dbManager.clear().then(() => {
                placesData = [];
                saveData(placesData);
                clearServerDatabase();
                renderTable();
                showToast('All data cleared', 'success');
            }).catch(err => {
                showToast('Failed to clear database: ' + err.message, 'error');
            });
        }
    });

    // ═══════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════
    function escapeHtml(str) { if (!str) return ''; const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }
    function csvEscape(str) { if (!str) return ''; str = str.toString(); if (str.includes(',') || str.includes('"') || str.includes('\n')) return `"${str.replace(/"/g, '""')}"`; return str; }
    function truncate(str, max) { if (!str) return ''; return str.length > max ? str.substring(0, max) + '...' : str; }
    function getDomain(url) { try { return new URL(url).hostname.replace('www.', ''); } catch { return url; } }
    function getDateStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

    // ═══════════════════════════════════════════
    // SAMPLE DATA
    // ═══════════════════════════════════════════
    function getSampleData() {
        return `The Coffee House
4.5(2,847 reviews)
Coffee Shop · $$
123 Main Street, San Francisco, CA 94105
+1 (415) 555-0123
Open 6 AM–9 PM
thecoffeehouse.com

Bella Italia Restaurant
4.3(1,562 reviews)
Italian Restaurant · $$$
456 Oak Avenue, San Francisco, CA 94102
+1 (415) 555-0456
Open 11 AM–10 PM
bellaitaliasf.com

Golden Dragon Chinese Kitchen
4.1(987 reviews)
Chinese Restaurant · $$
789 Grant Avenue, San Francisco, CA 94108
+1 (415) 555-0789
Open 11:30 AM–9:30 PM
goldendragonkitchen.com

Sunrise Yoga Studio
4.8(432 reviews)
Yoga Studio · $$
321 Marina Blvd, San Francisco, CA 94123
+1 (415) 555-0321
Open 6 AM–8 PM
sunriseyogasf.com

TechFix Pro
4.6(756 reviews)
Electronics Repair · $$
555 Market Street, San Francisco, CA 94105
+1 (415) 555-0555
Open 9 AM–7 PM
techfixpro.com`;
    }

    // ═══════════════════════════════════════════
    // KEYBOARD SHORTCUTS
    // ═══════════════════════════════════════════
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && editModal.classList.contains('active')) editModal.classList.remove('active');
    });

    // ═══════════════════════════════════════════
    // THEME SWITCHER
    // ═══════════════════════════════════════════
    const THEME_KEY = 'mapharvest_theme';
    const themeToggle = $('#themeToggle');
    const sunIcon = $('#themeToggle .sun-icon');
    const moonIcon = $('#themeToggle .moon-icon');

    function initTheme() {
        const storedTheme = localStorage.getItem(THEME_KEY) || 'light';
        setTheme(storedTheme);
    }

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(THEME_KEY, theme);
        
        if (theme === 'light') {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        } else {
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        }
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
            setTheme(nextTheme);
            showToast(`Switched to ${nextTheme === 'dark' ? 'Dark' : 'Light'} theme`, 'info');
        });
    }

    // ═══════════════════════════════════════════
    // AUTHENTICATION
    // ═══════════════════════════════════════════
    const TOKEN_KEY = 'mapharvest_token';
    const USERNAME_KEY = 'mapharvest_username';
    const ADMIN_KEY = 'mapharvest_is_admin';

    const authOverlay = $('#authOverlay');
    const tabBtnLogin = $('#tabBtnLogin');
    const tabBtnSignup = $('#tabBtnSignup');
    const loginForm = $('#loginForm');
    const signupForm = $('#signupForm');
    const recoverForm = $('#recoverForm');
    const btnForgotPass = $('#btnForgotPass');
    const btnBackToLogin = $('#btnBackToLogin');
    const btnGetQuestion = $('#btnGetQuestion');
    const recoveryQuestionContainer = $('#recoveryQuestionContainer');
    const lblRecoverQuestion = $('#lblRecoverQuestion');
    const userProfileSection = $('#userProfileSection');
    const userDisplay = $('#userDisplay');
    const userAvatar = $('#userAvatar');
    const btnLogout = $('#btnLogout');

    function checkAuth() {
        const token = localStorage.getItem(TOKEN_KEY);
        const username = localStorage.getItem(USERNAME_KEY);
        if (token && username) {
            // Verify token with server
            fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            .then(res => {
                if (res.status === 200) {
                    return res.json();
                }
                logout(true);
                throw new Error('Session invalid');
            })
            .then(data => {
                localStorage.setItem(ADMIN_KEY, data.isAdmin ? 'true' : 'false');
                showApp(username);
            })
            .catch(() => {
                // Trust token locally for offline resilience
                showApp(username);
            });
        } else {
            showAuth();
        }
    }

    function showApp(username) {
        if (authOverlay) authOverlay.classList.add('hidden');
        if (userProfileSection) {
            userProfileSection.style.display = 'flex';
            userDisplay.textContent = username;
            userAvatar.textContent = username.charAt(0).toUpperCase();
        }

        const isAdmin = localStorage.getItem(ADMIN_KEY) === 'true';
        const navAdmin = $('#nav-admin');
        if (navAdmin) {
            navAdmin.style.display = isAdmin ? 'flex' : 'none';
        }

        syncFromServer(username);
    }

    function showAuth() {
        if (authOverlay) authOverlay.classList.remove('hidden');
        if (userProfileSection) {
            userProfileSection.style.display = 'none';
        }
    }

    function syncFromServer(username) {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return;
        fetch('/api/places', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => {
            if (res.status === 401) {
                logout(true);
                throw new Error('Session expired');
            }
            return res.json();
        })
        .then(serverPlaces => {
            placesData = serverPlaces;
            dbManager.clear().then(() => {
                const savePromises = serverPlaces.map(p => dbManager.save(p));
                return Promise.all(savePromises);
            }).then(() => {
                updateStorageCount();
                updateDashboard();
                renderTable();
            });
        })
        .catch(err => {
            console.error('Failed to sync from server:', err);
        });
    }

    function syncToServer(place) {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return;
        fetch('/api/places', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(place)
        }).catch(err => console.error('Failed to sync place to server:', err));
    }

    function deleteFromServer(id) {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return;
        fetch(`/api/places/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(err => console.error('Failed to delete place from server:', err));
    }

    function bulkDeleteFromServer(ids) {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return;
        fetch('/api/places/bulk-delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ ids })
        }).catch(err => console.error('Failed to bulk delete places from server:', err));
    }

    function clearServerDatabase() {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return;
        fetch('/api/places/clear', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(err => console.error('Failed to clear database on server:', err));
    }

    function logout(silent = false) {
        const token = localStorage.getItem(TOKEN_KEY);
        if (token) {
            fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            }).catch(() => {});
        }
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USERNAME_KEY);
        localStorage.removeItem(ADMIN_KEY);
        placesData = [];
        dbManager.clear().then(() => {
            updateStorageCount();
            updateDashboard();
            renderTable();
        });
        
        // Reset and clear all login, signup, and recovery form text values
        if (loginForm) loginForm.reset();
        if (signupForm) signupForm.reset();
        if (recoverForm) recoverForm.reset();

        showAuth();
        if (!silent) showToast('Logged out successfully', 'info');
    }

    // Tabs switching & recovery navigation
    const authTabs = $('.auth-tabs');
    
    if (tabBtnLogin && tabBtnSignup) {
        tabBtnLogin.addEventListener('click', () => {
            tabBtnLogin.classList.add('active');
            tabBtnSignup.classList.remove('active');
            loginForm.classList.add('active');
            signupForm.classList.remove('active');
            recoverForm.classList.remove('active');
            authTabs.style.display = 'flex';
        });
        tabBtnSignup.addEventListener('click', () => {
            tabBtnSignup.classList.add('active');
            tabBtnLogin.classList.remove('active');
            signupForm.classList.add('active');
            loginForm.classList.remove('active');
            recoverForm.classList.remove('active');
            authTabs.style.display = 'flex';
        });
    }

    if (btnForgotPass) {
        btnForgotPass.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.classList.remove('active');
            signupForm.classList.remove('active');
            recoverForm.classList.add('active');
            authTabs.style.display = 'none';
            recoveryQuestionContainer.style.display = 'none';
            $('#recoverGmail').value = $('#loginGmail').value; // prefill if typed
        });
    }

    if (btnBackToLogin) {
        btnBackToLogin.addEventListener('click', () => {
            recoverForm.classList.remove('active');
            tabBtnLogin.click();
        });
    }

    function shakeAuthCard() {
        const card = $('.auth-card');
        if (card) {
            card.classList.remove('shake');
            void card.offsetWidth; // force browser layout recalculation (reflow)
            card.classList.add('shake');
            setTimeout(() => card.classList.remove('shake'), 500);
        }
    }

    // Forms handling
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const gmail = $('#loginGmail').value.trim();
            const password = $('#loginPassword').value;

            if (!gmail || !password) {
                showToast('Please enter both Gmail and password', 'error');
                shakeAuthCard();
                return;
            }

            fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gmail, password })
            })
            .then(res => res.json().then(data => ({ status: res.status, data })))
            .then(res => {
                if (res.status === 200) {
                    localStorage.setItem(TOKEN_KEY, res.data.token);
                    localStorage.setItem(USERNAME_KEY, res.data.username);
                    localStorage.setItem(ADMIN_KEY, res.data.isAdmin ? 'true' : 'false');
                    showApp(res.data.username);
                    showToast(`Welcome back!`, 'success');
                    $('#loginGmail').value = '';
                    $('#loginPassword').value = '';
                } else {
                    showToast(res.data.error || 'Login failed', 'error');
                    shakeAuthCard();
                }
            })
            .catch(err => {
                showToast('Server connection failed: ' + err.message, 'error');
                shakeAuthCard();
            });
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = $('#signupUsername').value.trim();
            const gmail = $('#signupGmail').value.trim();
            const password = $('#signupPassword').value;
            const securityQuestion = $('#signupQuestion').value;
            const securityAnswer = $('#signupAnswer').value.trim();

            if (username.length < 2) {
                showToast('User name must be at least 2 characters', 'error');
                shakeAuthCard();
                return;
            }
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!gmail || !emailRegex.test(gmail)) {
                showToast('Please enter a valid email address', 'error');
                shakeAuthCard();
                return;
            }
            if (password.length < 6) {
                showToast('Password must be at least 6 characters', 'error');
                shakeAuthCard();
                return;
            }
            if (!securityQuestion) {
                showToast('Please select a security question', 'error');
                shakeAuthCard();
                return;
            }
            if (!securityAnswer) {
                showToast('Please provide a security answer', 'error');
                shakeAuthCard();
                return;
            }

            fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gmail, password, username, securityQuestion, securityAnswer })
            })
            .then(res => res.json().then(data => ({ status: res.status, data })))
            .then(res => {
                if (res.status === 200) {
                    showToast(res.data.message || 'Account created! Please login.', 'success');
                    tabBtnLogin.click(); // switch to login form
                    $('#loginGmail').value = gmail; // pre-fill Gmail
                    $('#signupUsername').value = '';
                    $('#signupGmail').value = '';
                    $('#signupPassword').value = '';
                    $('#signupQuestion').value = '';
                    $('#signupAnswer').value = '';
                } else {
                    showToast(res.data.error || 'Signup failed', 'error');
                    shakeAuthCard();
                }
            })
            .catch(err => {
                showToast('Server connection failed: ' + err.message, 'error');
                shakeAuthCard();
            });
        });
    }

    // Password Recovery form handling
    if (btnGetQuestion) {
        btnGetQuestion.addEventListener('click', () => {
            const gmail = $('#recoverGmail').value.trim();
            if (!gmail) {
                showToast('Please enter your Gmail address first', 'warning');
                shakeAuthCard();
                return;
            }

            fetch('/api/auth/recover-question', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gmail })
            })
            .then(res => res.json().then(data => ({ status: res.status, data })))
            .then(res => {
                if (res.status === 200) {
                    lblRecoverQuestion.textContent = res.data.securityQuestion;
                    recoveryQuestionContainer.style.display = 'block';
                    $('#recoverAnswer').value = '';
                    $('#recoverNewPassword').value = '';
                    showToast('Security question loaded', 'success');
                } else {
                    showToast(res.data.error || 'Could not load recovery question', 'error');
                    shakeAuthCard();
                }
            })
            .catch(err => {
                showToast('Server connection failed: ' + err.message, 'error');
                shakeAuthCard();
            });
        });
    }

    if (recoverForm) {
        recoverForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const gmail = $('#recoverGmail').value.trim();
            const securityAnswer = $('#recoverAnswer').value.trim();
            const newPassword = $('#recoverNewPassword').value;

            if (newPassword.length < 6) {
                showToast('New password must be at least 6 characters', 'error');
                shakeAuthCard();
                return;
            }

            fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gmail, securityAnswer, newPassword })
            })
            .then(res => res.json().then(data => ({ status: res.status, data })))
            .then(res => {
                if (res.status === 200) {
                    showToast(res.data.message || 'Password reset successful!', 'success');
                    btnBackToLogin.click();
                    $('#loginGmail').value = gmail;
                } else {
                    showToast(res.data.error || 'Password reset failed', 'error');
                    shakeAuthCard();
                }
            })
            .catch(err => {
                showToast('Server connection failed: ' + err.message, 'error');
                shakeAuthCard();
            });
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', () => logout());
    }

    function loadAdminPanel() {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return;

        // Fetch Stats
        fetch('/api/admin/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(stats => {
            $('#adminStatUsers').textContent = stats.totalUsers || 0;
            $('#adminStatActivities').textContent = stats.totalActivities || 0;
            $('#adminStatSystem').textContent = stats.systemStatus || 'Online';
        })
        .catch(err => console.error('Failed to load admin stats:', err));

        // Fetch Users
        fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => {
            if (res.status === 403) throw new Error('Forbidden');
            return res.json();
        })
        .then(usersList => {
            const body = $('#adminUsersBody');
            if (usersList.length === 0) {
                body.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-tertiary);">No users registered</td></tr>`;
                return;
            }
            body.innerHTML = usersList.map(u => `
                <tr>
                    <td style="font-weight: 600; color: var(--text-primary);" data-label="User Name">${escapeHtml(u.username)}</td>
                    <td data-label="Gmail">${escapeHtml(u.gmail)}</td>
                    <td data-label="Created">${new Date(u.createdAt).toLocaleString()}</td>
                    <td data-label="Privilege"><span style="padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; background: ${u.isAdmin ? 'var(--accent-rose)' : 'var(--accent-blue-light)'}; color: white;">${u.isAdmin ? 'Admin' : 'User'}</span></td>
                </tr>
            `).join('');
        })
        .catch(err => {
            console.error('Failed to load users list:', err);
            $('#adminUsersBody').innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--accent-rose);">Access denied or failed to load.</td></tr>`;
        });

        // Fetch Activities
        fetch('/api/admin/activities', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => {
            if (res.status === 403) throw new Error('Forbidden');
            return res.json();
        })
        .then(logs => {
            const body = $('#adminActivitiesBody');
            if (logs.length === 0) {
                body.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-tertiary);">No activities recorded</td></tr>`;
                return;
            }
            body.innerHTML = logs.map(log => `
                <tr>
                    <td style="font-weight: 600;" data-label="Gmail">${escapeHtml(log.gmail)}</td>
                    <td data-label="Action"><span style="font-family: monospace; font-size: 0.8rem; font-weight: 700; color: var(--accent-blue-light);">${escapeHtml(log.action.toUpperCase())}</span></td>
                    <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(log.details)}" data-label="Details">${escapeHtml(log.details)}</td>
                    <td data-label="Device">${escapeHtml(log.device)}</td>
                    <td data-label="IP"><span style="font-family: monospace; font-size: 0.8rem;">${escapeHtml(log.ip)}</span></td>
                    <td data-label="Time" style="font-size: 0.8rem;">${new Date(log.timestamp).toLocaleString()}</td>
                </tr>
            `).join('');
        })
        .catch(err => {
            console.error('Failed to load activities log:', err);
            $('#adminActivitiesBody').innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--accent-rose);">Access denied or failed to load.</td></tr>`;
        });
    }

    // ═══════════════════════════════════════════
    // WHATSAPP CAMPAIGN MANAGER LOGIC
    // ═══════════════════════════════════════════
    let waQueue = [];
    let waCurrentIndex = -1;

    function formatPhoneForWhatsapp(phone) {
        if (!phone) return '';
        let cleaned = phone.replace(/\D/g, '');
        // Pakistan phone numbers standard 03... -> 923...
        if (cleaned.startsWith('0') && cleaned.length === 11) {
            cleaned = '92' + cleaned.substring(1);
        }
        return cleaned;
    }

    function updateWaAutopilotPanel() {
        const panel = $('#waHelperPanel');
        const nextName = $('#lblWaNextName');
        const nextPhone = $('#lblWaNextPhone');
        if (!panel) return;

        const nextIndex = waQueue.findIndex(item => item.status === 'pending');
        if (nextIndex === -1) {
            panel.style.display = 'none';
            waCurrentIndex = -1;
            return;
        }

        waCurrentIndex = nextIndex;
        const item = waQueue[nextIndex];
        nextName.textContent = item.name;
        nextPhone.textContent = item.phone;
        panel.style.display = 'block';
    }

    function renderWaQueue() {
        const queueBody = $('#waQueueBody');
        const countLabel = $('#lblWaQueueCount');
        if (!queueBody) return;

        countLabel.textContent = waQueue.length;

        if (waQueue.length === 0) {
            queueBody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: var(--text-tertiary); padding: 24px;">Import contacts with phone numbers to build queue</td>
                </tr>
            `;
            const panel = $('#waHelperPanel');
            if (panel) panel.style.display = 'none';
            return;
        }

        queueBody.innerHTML = waQueue.map((item, index) => {
            let statusBadge = '';
            if (item.status === 'pending') {
                statusBadge = '<span class="status-pill status-idle" style="background: rgba(148,163,184,0.1); color: var(--text-secondary); font-size: 0.72rem;">Pending</span>';
            } else if (item.status === 'sent') {
                statusBadge = '<span class="status-pill status-complete" style="background: rgba(16,185,129,0.1); color: var(--accent-emerald); font-size: 0.72rem;">Sent</span>';
            } else if (item.status === 'skipped') {
                statusBadge = '<span class="status-pill status-error" style="background: rgba(244,63,94,0.1); color: var(--accent-rose); font-size: 0.72rem;">Skipped</span>';
            }

            return `
                <tr>
                    <td class="td-name" data-label="Business" style="white-space: nowrap; max-width: 140px; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.name)}</td>
                    <td data-label="Phone" style="font-family: monospace;">${escapeHtml(item.phone)}</td>
                    <td data-label="Status">${statusBadge}</td>
                    <td data-label="Action">
                        <button type="button" class="action-btn" onclick="sendWaIndividual(${index})" title="Open WhatsApp Chat" style="color: var(--accent-emerald); background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.15); display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; cursor: pointer;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        updateWaAutopilotPanel();
    }

    window.sendWaIndividual = function(index) {
        if (index < 0 || index >= waQueue.length) return;
        const item = waQueue[index];
        const template = $('#waTemplate').value || '';
        
        let message = template
            .replace(/{Name}/g, item.name || '')
            .replace(/{Category}/g, item.category || '')
            .replace(/{Phone}/g, item.phone || '')
            .replace(/{Address}/g, item.address || '');

        const cleanedPhone = formatPhoneForWhatsapp(item.phone);
        const method = $('#waSendMethod').value;
        
        let url = '';
        if (method === 'web') {
            url = `https://web.whatsapp.com/send?phone=${encodeURIComponent(cleanedPhone)}&text=${encodeURIComponent(message)}`;
        } else {
            url = `https://wa.me/${encodeURIComponent(cleanedPhone)}?text=${encodeURIComponent(message)}`;
        }

        waQueue[index].status = 'sent';
        renderWaQueue();

        window.open(url, '_blank', 'noopener');
    };

    // UI Buttons
    const btnLoadWaQueue = $('#btnLoadWaQueue');
    const btnLoadWaQueueSelected = $('#btnLoadWaQueueSelected');
    const btnClearWaQueue = $('#btnClearWaQueue');
    const btnWaSendNext = $('#btnWaSendNext');
    const btnWaSkipNext = $('#btnWaSkipNext');

    if (btnLoadWaQueue) {
        btnLoadWaQueue.addEventListener('click', () => {
            placesData = loadData();
            const valid = placesData.filter(p => p.phone && p.phone.trim() !== '');
            if (valid.length === 0) {
                showToast('No database entries contain phone numbers!', 'warning');
                return;
            }
            waQueue = valid.map(p => ({
                id: p.id,
                name: p.name,
                phone: p.phone,
                category: p.category || '',
                address: p.address || '',
                status: 'pending'
            }));
            renderWaQueue();
            showToast(`Loaded ${waQueue.length} contacts to WhatsApp queue!`, 'success');
        });
    }

    if (btnLoadWaQueueSelected) {
        btnLoadWaQueueSelected.addEventListener('click', () => {
            const checkedCbs = $$('.row-check:checked');
            if (checkedCbs.length === 0) {
                showToast('Please select one or more entries in the Data Table first!', 'warning');
                return;
            }
            placesData = loadData();
            const selectedIds = [...checkedCbs].map(cb => cb.value);
            const valid = placesData.filter(p => selectedIds.includes(p.id) && p.phone && p.phone.trim() !== '');
            if (valid.length === 0) {
                showToast('None of the selected entries contain phone numbers!', 'warning');
                return;
            }
            waQueue = valid.map(p => ({
                id: p.id,
                name: p.name,
                phone: p.phone,
                category: p.category || '',
                address: p.address || '',
                status: 'pending'
            }));
            renderWaQueue();
            showToast(`Loaded ${waQueue.length} selected contacts to WhatsApp queue!`, 'success');
        });
    }

    if (btnClearWaQueue) {
        btnClearWaQueue.addEventListener('click', () => {
            if (waQueue.length > 0 && confirm('Wipe current WhatsApp marketing queue?')) {
                waQueue = [];
                renderWaQueue();
                showToast('WhatsApp queue wiped', 'info');
            }
        });
    }

    if (btnWaSendNext) {
        btnWaSendNext.addEventListener('click', () => {
            if (waCurrentIndex > -1 && waCurrentIndex < waQueue.length) {
                sendWaIndividual(waCurrentIndex);
            }
        });
    }

    if (btnWaSkipNext) {
        btnWaSkipNext.addEventListener('click', () => {
            if (waCurrentIndex > -1 && waCurrentIndex < waQueue.length) {
                waQueue[waCurrentIndex].status = 'skipped';
                renderWaQueue();
                showToast('Skipped contact', 'info');
            }
        });
    }

    // ═══════════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════════
    function init() {
        initTheme();
        checkAuth();
        dbManager.init()
            .then(() => dbManager.getAll())
            .then(data => {
                placesData = data;
                updateStorageCount();
                updateDashboard();
                renderTable();
            })
            .catch(err => {
                showToast('Failed to initialize IndexedDB: ' + err.message, 'error');
                updateStorageCount();
                updateDashboard();
                renderTable();
            });

        // Focus search on load
        setTimeout(() => heroSearchInput.focus(), 300);
    }

    init();

})();
