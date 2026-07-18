const express = require('express');
const cors = require('cors');
const path = require('path');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname)); // Serve HTML, CSS, JS from the root folder

const fs = require('fs');
const crypto = require('crypto');

const USERS_FILE = path.join(__dirname, 'users.json');
let users = {};
let activeTokens = new Map(); // token -> username

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}
const ACTIVITIES_FILE = path.join(DATA_DIR, 'activities.json');

function logActivity(gmail, action, details, req) {
    try {
        let logs = [];
        if (fs.existsSync(ACTIVITIES_FILE)) {
            try {
                logs = JSON.parse(fs.readFileSync(ACTIVITIES_FILE, 'utf8'));
            } catch (e) {
                logs = [];
            }
        }
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
        const userAgent = req.headers['user-agent'] || 'Unknown';
        
        let device = 'Desktop';
        if (/mobile/i.test(userAgent)) device = 'Mobile';
        else if (/tablet/i.test(userAgent)) device = 'Tablet';
        
        let browser = 'Unknown';
        if (/chrome|crios/i.test(userAgent)) browser = 'Chrome';
        else if (/firefox|fxios/i.test(userAgent)) browser = 'Firefox';
        else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = 'Safari';
        else if (/opr/i.test(userAgent)) browser = 'Opera';
        else if (/edg/i.test(userAgent)) browser = 'Edge';

        logs.push({
            gmail,
            action,
            details,
            ip,
            device: `${device} (${browser})`,
            userAgent,
            timestamp: new Date().toISOString()
        });
        
        if (logs.length > 1000) {
            logs = logs.slice(logs.length - 1000);
        }
        
        fs.writeFileSync(ACTIVITIES_FILE, JSON.stringify(logs, null, 2), 'utf8');
    } catch (e) {
        console.error('Error logging activity:', e);
    }
}

// Load users from file
function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        } else {
            users = {};
            saveUsers();
        }

        // Pre-seed admin user "usman" if not exists
        const adminGmail = 'usman@gmail.com';
        const normAdmin = adminGmail.toLowerCase();
        if (!users[normAdmin]) {
            const adminSalt = crypto.randomBytes(16).toString('hex');
            const adminHash = hashPassword('@oZhQ95X', adminSalt);
            
            const question = 'Admin Account';
            const answerSalt = crypto.randomBytes(16).toString('hex');
            const answerHash = hashPassword('admin', answerSalt);

            users[normAdmin] = {
                gmail: adminGmail,
                username: 'Usman (Admin)',
                salt: adminSalt,
                hash: adminHash,
                securityQuestion: question,
                answerSalt,
                answerHash,
                isAdmin: true,
                createdAt: new Date().toISOString()
            };
            saveUsers();
        }
    } catch (e) {
        console.error('Error loading users:', e);
        users = {};
    }
}

function saveUsers() {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving users:', e);
    }
}

loadUsers();

// Helper to hash password securely without external packages
function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

// Middleware to verify session token
function authenticate(req, res, next) {
    let token = req.headers['authorization'];
    if (token && token.startsWith('Bearer ')) {
        token = token.slice(7).trim();
    } else {
        // Fallback for EventSource query param
        token = req.query.token;
    }

    if (!token || !activeTokens.has(token)) {
        res.status(401).json({ error: 'Unauthorized. Please login.' });
        return;
    }

    req.username = activeTokens.get(token);
    next();
}

// Helper function to format SSE messages
function sendEvent(res, status, message, data = null) {
    res.write(`data: ${JSON.stringify({ status, message, data })}\n\n`);
}

// Auth API Endpoints
app.post('/api/auth/signup', (req, res) => {
    const { gmail, password, username, securityQuestion, securityAnswer } = req.body;
    
    // Validate Gmail email pattern
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!gmail || !emailRegex.test(gmail) || !password || password.length < 6) {
        return res.status(400).json({ error: 'A valid Gmail/Email address and password (min 6 characters) are required.' });
    }

    if (!username || username.trim().length < 2) {
        return res.status(400).json({ error: 'User name (min 2 characters) is required.' });
    }

    if (!securityQuestion || !securityAnswer || securityAnswer.trim().length === 0) {
        return res.status(400).json({ error: 'Security question and answer are required for password recovery.' });
    }

    const normGmail = gmail.trim().toLowerCase();
    if (users[normGmail]) {
        return res.status(400).json({ error: 'This Gmail address is already registered.' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);

    // Hash the security answer for security (case-insensitive verification)
    const answerSalt = crypto.randomBytes(16).toString('hex');
    const answerHash = hashPassword(securityAnswer.trim().toLowerCase(), answerSalt);

    users[normGmail] = {
        gmail: gmail.trim(),
        username: username.trim(),
        salt,
        hash,
        securityQuestion,
        answerSalt,
        answerHash,
        createdAt: new Date().toISOString()
    };
    saveUsers();

    logActivity(gmail, 'signup', `Registered user "${username}"`, req);

    res.json({ message: 'User registered successfully! Please login.' });
});

app.post('/api/auth/login', (req, res) => {
    const { gmail, password } = req.body;
    if (!gmail || !password) {
        return res.status(400).json({ error: 'Gmail address and password are required.' });
    }

    // Support inputting 'usman' directly for easy admin login
    let checkGmail = gmail.trim();
    if (checkGmail.toLowerCase() === 'usman') {
        checkGmail = 'usman@gmail.com';
    }
    const normGmail = checkGmail.toLowerCase();
    const user = users[normGmail];
    if (!user) {
        return res.status(401).json({ error: 'Invalid Gmail address or password.' });
    }

    const checkHash = hashPassword(password, user.salt);
    if (checkHash !== user.hash) {
        return res.status(401).json({ error: 'Invalid Gmail address or password.' });
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    activeTokens.set(token, user.gmail); // Use email as the identifier

    logActivity(user.gmail, 'login', `User logged in (Browser: ${req.headers['user-agent'] ? req.headers['user-agent'].substring(0, 30) : 'Unknown'})`, req);

    res.json({ token, username: user.username, isAdmin: !!user.isAdmin });
});

// Recover security question endpoint
app.post('/api/auth/recover-question', (req, res) => {
    const { gmail } = req.body;
    if (!gmail) {
        return res.status(400).json({ error: 'Gmail address is required.' });
    }
    const normGmail = gmail.trim().toLowerCase();
    const user = users[normGmail];
    if (!user) {
        return res.status(404).json({ error: 'No account registered with this Gmail.' });
    }
    
    logActivity(user.gmail, 'recover-request', 'Requested security question', req);
    
    res.json({ securityQuestion: user.securityQuestion });
});

// Reset password using security answer verification
app.post('/api/auth/reset-password', (req, res) => {
    const { gmail, securityAnswer, newPassword } = req.body;
    if (!gmail || !securityAnswer || !newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Gmail, answer, and a new password (min 6 characters) are required.' });
    }

    const normGmail = gmail.trim().toLowerCase();
    const user = users[normGmail];
    if (!user) {
        return res.status(404).json({ error: 'Account not found.' });
    }

    const checkAnswerHash = hashPassword(securityAnswer.trim().toLowerCase(), user.answerSalt);
    if (checkAnswerHash !== user.answerHash) {
        logActivity(user.gmail, 'reset-fail', 'Failed answer matching on password reset', req);
        return res.status(401).json({ error: 'Incorrect security answer.' });
    }

    // Reset password hash
    const newSalt = crypto.randomBytes(16).toString('hex');
    const newHash = hashPassword(newPassword, newSalt);

    user.salt = newSalt;
    user.hash = newHash;
    saveUsers();

    logActivity(user.gmail, 'password-reset', 'Successfully reset account password', req);

    res.json({ message: 'Password has been reset successfully! Please login.' });
});

app.get('/api/auth/me', authenticate, (req, res) => {
    const normGmail = req.username ? req.username.toLowerCase() : '';
    const user = users[normGmail];
    if (user) {
        res.json({ username: user.username });
    } else {
        res.json({ username: req.username });
    }
});

app.post('/api/auth/logout', authenticate, (req, res) => {
    const authHeader = req.headers['authorization'];
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
    } else {
        token = req.query.token;
    }
    if (token) {
        activeTokens.delete(token);
    }
    res.json({ message: 'Logged out successfully.' });
});

// Middleware to verify Administrator rights
function requireAdmin(req, res, next) {
    authenticate(req, res, () => {
        const normGmail = req.username ? req.username.toLowerCase() : '';
        const user = users[normGmail];
        if (!user || !user.isAdmin) {
            return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
        }
        next();
    });
}

// Admin Panel API Endpoints
app.get('/api/admin/stats', requireAdmin, (req, res) => {
    let activitiesCount = 0;
    try {
        if (fs.existsSync(ACTIVITIES_FILE)) {
            const logs = JSON.parse(fs.readFileSync(ACTIVITIES_FILE, 'utf8'));
            activitiesCount = logs.length;
        }
    } catch (e) {}

    res.json({
        totalUsers: Object.keys(users).length,
        totalActivities: activitiesCount,
        systemStatus: 'Online'
    });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
    // Format users for the admin display (filtering out secure fields)
    const usersList = Object.keys(users).map(email => {
        const u = users[email];
        return {
            username: u.username,
            gmail: u.gmail,
            createdAt: u.createdAt || 'Unknown',
            isAdmin: !!u.isAdmin
        };
    });
    res.json(usersList);
});

app.get('/api/admin/activities', requireAdmin, (req, res) => {
    let logs = [];
    try {
        if (fs.existsSync(ACTIVITIES_FILE)) {
            logs = JSON.parse(fs.readFileSync(ACTIVITIES_FILE, 'utf8'));
        }
    } catch (e) {}
    // Return logs sorted by most recent first
    res.json(logs.reverse());
});

// Scrape endpoint (Streams progress updates using Server-Sent Events - Protected by authenticate)
app.get('/api/scrape', authenticate, async (req, res) => {
    const query = req.query.query;
    let limit = parseInt(req.query.limit);
    const scrapeAll = isNaN(limit) || limit <= 0;
    if (scrapeAll) {
        limit = 50000; // Scrape all results if limit is 0 or unset (unlimited)
    }

    if (!query) {
        res.status(400).json({ error: 'Query parameter is required' });
        return;
    }

    logActivity(req.username, 'scrape', `Launched scraper for query "${query}" (Limit: ${scrapeAll ? 'Unlimited' : limit})`, req);

    // Set headers for Server-Sent Events (SSE)
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Prevent buffering in nginx proxies if any
    });

    if (scrapeAll) {
        sendEvent(res, 'info', `Starting scraper for "${query}" (all available results)...`);
    } else {
        sendEvent(res, 'info', `Starting scraper for "${query}" (limit: ${limit})...`);
    }

    let browser = null;
    let page = null;
    try {
        sendEvent(res, 'info', 'Launching browser...');
        
        const launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-sync',
                '--mute-audio',
                '--window-size=1280,800'
            ]
        };

        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        }

        try {
            browser = await puppeteer.launch(launchOptions);
        } catch (e) {
            sendEvent(res, 'info', 'Default launch failed. Attempting system browser fallback...');
            
            // Standard paths on Windows and Linux for Chrome/Chromium/Edge
            const browserPaths = [
                '/usr/bin/chromium',
                '/usr/bin/chromium-browser',
                '/usr/bin/google-chrome',
                '/usr/bin/google-chrome-stable',
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
                // User-level installations fallback
                path.join(process.env.USERPROFILE || 'C:\\Users\\default', 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
            ];

            let launched = false;
            for (const bPath of browserPaths) {
                try {
                    launchOptions.executablePath = bPath;
                    browser = await puppeteer.launch(launchOptions);
                    launched = true;
                    sendEvent(res, 'info', `Successfully launched system browser: ${bPath}`);
                    break;
                } catch (err) {
                    // Try next path
                }
            }

            if (!launched) {
                throw new Error('Could not find system Chrome, Chromium, or Microsoft Edge. Please install Google Chrome or specify its path.');
            }
        }

        const pages = await browser.pages();
        page = pages.length > 0 ? pages[0] : await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // Optimize page by blocking images, fonts, media, and trackers
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            const url = req.url();
            if (['image', 'font', 'media'].includes(type) || 
                url.includes('google-analytics') || 
                url.includes('analytics.js') || 
                url.includes('doubleclick') || 
                url.includes('googleadservices')) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Go directly to Google Maps search URL
        const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
        sendEvent(res, 'info', `Searching Google Maps for: ${query}`);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });

        sendEvent(res, 'info', 'Waiting for search results to load...');

        // Wait a few seconds to let results render
        await new Promise(r => setTimeout(r, 4000));

        // Get the results list container
        // Google Maps uses a scrollable div for listings (often div[role="feed"])
        let feedSelector = 'div[role="feed"]';
        let feedExists = false;

        try {
            await page.waitForSelector(feedSelector, { timeout: 8000 });
            feedExists = true;
        } catch (e) {
            // Check if we were redirected directly to a single business page (Google does this if search matches exactly 1 business)
            const singleName = await page.evaluate(() => {
                const h1 = document.querySelector('h1');
                return h1 ? h1.textContent.trim() : null;
            });

            if (singleName) {
                sendEvent(res, 'info', `Redirected directly to single business page: ${singleName}`);
                const singlePlace = await extractDetails(page, page.url());
                if (singlePlace) {
                    // Auto-save directly to server-side database for this user
                    try {
                        const list = loadUserPlaces(req.username);
                        const exists = list.some(p => p.name.toLowerCase() === singlePlace.name.toLowerCase());
                        if (!exists) {
                            list.push(singlePlace);
                            saveUserPlaces(req.username, list);
                            logActivity(req.username, 'place-save', `Scraper auto-saved business "${singlePlace.name}"`, req);
                        }
                    } catch (e) {
                        console.error('Error auto-saving place on server:', e);
                    }

                    sendEvent(res, 'place', 'Extracted 1 business from direct match', singlePlace);
                    sendEvent(res, 'success', 'Scraping completed successfully.', [singlePlace]);
                } else {
                    sendEvent(res, 'error', 'Failed to extract business details from direct match.');
                }
                await browser.close();
                res.end();
                return;
            }

            // Fallback feed selectors
            const fallbacks = ['div.m67r60-aW71nd-wzbNHA', 'div[aria-label^="Results for"]'];
            for (const selector of fallbacks) {
                try {
                    await page.waitForSelector(selector, { timeout: 3000 });
                    feedSelector = selector;
                    feedExists = true;
                    break;
                } catch (err) {}
            }
        }

        if (!feedExists) {
            // Check if there is an empty state indicating no results
            const noResults = await page.evaluate(() => {
                return document.body.innerText.includes('Google Maps can\'t find') || 
                       document.body.innerText.includes('No results found');
            });

            if (noResults) {
                sendEvent(res, 'warning', 'Google Maps returned no results for this query.');
                sendEvent(res, 'success', 'No listings found.', []);
            } else {
                sendEvent(res, 'error', 'Could not locate the search results container. The layout might have changed.');
            }
            await browser.close();
            res.end();
            return;
        }

        sendEvent(res, 'info', 'Loading listings by scrolling results panel...');

        let placeUrls = new Set();
        let scrollAttempts = 0;
        let noNewItemsCount = 0; // count consecutive scrolls with no new items

        // Scroll the results list to gather listing URLs
        while (placeUrls.size < limit && scrollAttempts < 5000) {
            // Gather all listing URLs in the feed
            const urls = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
                return links.map(a => a.href);
            });

            const initialSize = placeUrls.size;
            urls.forEach(url => {
                if (placeUrls.size < limit) {
                    placeUrls.add(url);
                }
            });

            sendEvent(res, 'info', `Found ${placeUrls.size} listings so far...`);

            if (placeUrls.size >= limit) break;

            // Scroll feed container down
            const scrolled = await page.evaluate((selector) => {
                const el = document.querySelector(selector);
                if (el) {
                    el.scrollTo(0, el.scrollHeight);
                    return { height: el.scrollHeight, scrolled: true };
                }
                return { height: 0, scrolled: false };
            }, feedSelector);

            if (!scrolled.scrolled) {
                break;
            }

            // Wait for new items to load
            await new Promise(r => setTimeout(r, 5000));

            // Check if we hit the bottom
            const atBottom = await page.evaluate(() => {
                return document.body.innerText.includes("You've reached the end of the list") ||
                       document.body.innerText.includes("reached the end of the list");
            });

            if (atBottom) {
                sendEvent(res, 'info', 'Reached the end of Google Maps results.');
                break;
            }

            // Check if listings count has increased
            if (placeUrls.size === initialSize) {
                noNewItemsCount++;
                // If we haven't seen new items for 5 consecutive scroll attempts, we've likely hit the bottom
                if (noNewItemsCount >= 5) {
                    sendEvent(res, 'info', 'No new listings found after multiple attempts. Reached bottom.');
                    break;
                }
                // Wait extra time on no new items to allow slow connections to load
                await new Promise(r => setTimeout(r, 2000));
            } else {
                noNewItemsCount = 0; // reset retry counter
            }

            scrollAttempts++;
        }

        const targetUrls = Array.from(placeUrls);
        sendEvent(res, 'info', `Total listings to scrape: ${targetUrls.length}`);

        // Scraping details of each listing by navigating to its URL
        for (let i = 0; i < targetUrls.length; i++) {
            const url = targetUrls[i];
            sendEvent(res, 'info', `Scraping details for place ${i + 1} of ${targetUrls.length}...`);

            try {
                // Navigate to the listing detail URL
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                try {
                    await page.waitForSelector('h1', { timeout: 4000 });
                } catch (e) {}
                await new Promise(r => setTimeout(r, 500)); // wait for details to settle

                const placeDetails = await extractDetails(page, url);
                if (placeDetails && placeDetails.name) {
                    // Auto-save directly to server-side database for this user
                    try {
                        const list = loadUserPlaces(req.username);
                        const exists = list.some(p => p.name.toLowerCase() === placeDetails.name.toLowerCase());
                        if (!exists) {
                            list.push(placeDetails);
                            saveUserPlaces(req.username, list);
                            logActivity(req.username, 'place-save', `Scraper auto-saved business "${placeDetails.name}"`, req);
                        }
                    } catch (e) {
                        console.error('Error auto-saving place on server:', e);
                    }

                    sendEvent(res, 'place', `Scraped: ${placeDetails.name}`, placeDetails);
                } else {
                    sendEvent(res, 'warning', `Could not extract details for listing at index ${i + 1}`);
                }
            } catch (err) {
                sendEvent(res, 'warning', `Error loading listing ${i + 1}: ${err.message}`);
            }

            // Small delay to be polite
            await new Promise(r => setTimeout(r, 500));
        }

        sendEvent(res, 'success', 'Scraping completed successfully.');
    } catch (error) {
        sendEvent(res, 'error', `Fatal error during scraping: ${error.message}`);
    } finally {
        if (page) {
            try { await page.close(); } catch (e) {}
        }
        if (browser) {
            try { await browser.close(); } catch (e) {}
        }
        res.end();
    }
});

// Extraction logic run inside Puppeteer page context
async function extractDetails(page, url) {
    return await page.evaluate((placeUrl) => {
        const getElementText = (selector) => {
            const el = document.querySelector(selector);
            return el ? el.textContent.trim() : '';
        };

        const getAttribute = (selector, attr) => {
            const el = document.querySelector(selector);
            return el ? el.getAttribute(attr) : '';
        };

        // Extract Business Name (H1)
        const name = getElementText('h1');
        if (!name) return null;

        // Rating
        let rating = '';
        const ratingEl = document.querySelector('div.F7nice span[aria-hidden="true"]');
        if (ratingEl) {
            rating = parseFloat(ratingEl.textContent.replace(',', '.')) || '';
        } else {
            const starMatch = document.body.innerText.match(/(\d\.\d)\s*star/i);
            if (starMatch) rating = parseFloat(starMatch[1]) || '';
        }

        // Total Reviews
        let reviews = '';
        const reviewsEl = document.querySelector('div.F7nice span[aria-label*="reviews"]');
        if (reviewsEl) {
            const match = reviewsEl.getAttribute('aria-label').match(/([\d.,]+)/);
            if (match) reviews = parseInt(match[1].replace(/[.,\s]/g, '')) || '';
        } else {
            const reviewText = getElementText('div.F7nice');
            const match = reviewText.match(/\(([\d.,]+)\)/);
            if (match) reviews = parseInt(match[1].replace(/[.,\s]/g, '')) || '';
        }

        // Category
        let category = '';
        const catBtn = document.querySelector('button[jsaction*="category"]');
        if (catBtn) {
            category = catBtn.textContent.trim();
        } else {
            // Fallback: look for category field under name
            const detailsRow = document.querySelector('div[class*="fontBodyMedium"]');
            if (detailsRow) {
                // Find buttons/spans that contain category
                const btn = detailsRow.querySelector('button');
                if (btn && btn.textContent && !btn.textContent.includes('·') && !btn.textContent.includes('$')) {
                    category = btn.textContent.trim();
                }
            }
        }

        // Address (Stable selector via data-item-id, with rich fallbacks)
        let address = '';
        const addrBtn = document.querySelector('button[data-item-id="address"]');
        if (addrBtn) {
            address = addrBtn.getAttribute('aria-label')?.replace(/^Address:\s*/, '').trim() || addrBtn.textContent.trim();
        } else {
            // Fallback: look for button containing address pins or translations of address
            const addrFallback = document.querySelector('button[aria-label*="Address:"], button[aria-label*="Adresse:"], button[aria-label*="Dirección:"], button[aria-label*="Indirizzo:"], button[aria-label*="Adres:"]');
            if (addrFallback) {
                address = addrFallback.getAttribute('aria-label').replace(/^(Address|Adresse|Dirección|Indirizzo|Adres):\s*/i, '').trim();
            } else {
                // Look for elements with pin icons or containing typical street patterns
                const buttons = Array.from(document.querySelectorAll('button'));
                for (const btn of buttons) {
                    const aria = btn.getAttribute('aria-label') || '';
                    if (/\b(st|street|ave|avenue|rd|road|blvd|boulevard|drive|way|court|pl|place|square|highway)\b/i.test(aria)) {
                        address = aria.trim();
                        break;
                    }
                }
            }
        }

        // Phone (Stable selector via data-item-id, with rich fallbacks)
        let phone = '';
        const phoneBtn = document.querySelector('button[data-item-id^="phone:tel:"]');
        if (phoneBtn) {
            phone = phoneBtn.getAttribute('data-item-id').replace('phone:tel:', '').trim();
        } else {
            const phoneFallback = document.querySelector('button[aria-label*="Phone:"], button[aria-label*="Téléphone:"], button[aria-label*="Teléfono:"], button[aria-label*="Telefono:"], button[aria-label*="Telefon:"]');
            if (phoneFallback) {
                phone = phoneFallback.getAttribute('aria-label').replace(/^(Phone|Téléphone|Teléfono|Telefono|Telefon):\s*/i, '').trim();
            } else {
                // Search for any tel link or button text with numbers
                const telLink = document.querySelector('a[href^="tel:"]');
                if (telLink) {
                    phone = telLink.getAttribute('href').replace('tel:', '').trim();
                } else {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    for (const btn of buttons) {
                        const txt = btn.textContent.trim();
                        if (/^\+?[\d\-\s\(\)]{8,18}$/.test(txt)) {
                            phone = txt;
                            break;
                        }
                    }
                }
            }
        }

        // Website (Stable selector via data-item-id, with rich fallbacks)
        let website = '';
        const webBtn = document.querySelector('a[data-item-id="authority"]');
        if (webBtn) {
            website = webBtn.getAttribute('href') || '';
        } else {
            // Find any link with authority icon or label
            const webFallback = document.querySelector('a[aria-label*="Website:"], a[aria-label*="Site web:"], a[aria-label*="Sitio web:"], a[aria-label*="Sito web:"], a[aria-label*="Website openen"]');
            if (webFallback) {
                website = webFallback.getAttribute('href') || '';
            } else {
                // Check all anchor links that are not google-owned
                const anchors = Array.from(document.querySelectorAll('a[href]'));
                for (const a of anchors) {
                    const href = a.getAttribute('href') || '';
                    if (href.startsWith('http') && 
                        !href.includes('google.com') && 
                        !href.includes('gstatic.com') && 
                        !href.includes('youtube.com') &&
                        !href.includes('facebook.com/tr') &&
                        !a.getAttribute('aria-label')?.includes('Share')) {
                        website = href;
                        break;
                    }
                }
            }
        }

        // Hours (Stable selector, with fallbacks)
        let hours = '';
        const hoursBtn = document.querySelector('div[data-item-id="oh"]');
        if (hoursBtn) {
            hours = hoursBtn.getAttribute('aria-label')?.replace(/^Hours:\s*/, '').trim() || hoursBtn.textContent.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
        } else {
            const hoursFallback = document.querySelector('div[aria-label*="Hours:"], div[aria-label*="Horaires:"], div[aria-label*="Horarios:"], div[aria-label*="Orari:"], div[aria-label*="Openingstijden:"]');
            if (hoursFallback) {
                hours = hoursFallback.getAttribute('aria-label').replace(/^(Hours|Horaires|Horarios|Orari|Openingstijden):\s*/i, '').trim();
            } else {
                const hoursTable = document.querySelector('table[class*="hours"]');
                if (hoursTable) {
                    hours = hoursTable.textContent.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
                }
            }
        }

        // Price Level
        let priceLevel = '';
        const detailsRow = document.querySelector('div[class*="fontBodyMedium"]');
        if (detailsRow) {
            const priceMatch = detailsRow.textContent.match(/(\${1,4})/);
            if (priceMatch) priceLevel = priceMatch[1];
        }

        // Coordinates
        let latitude = '';
        let longitude = '';
        const coordsMatch = placeUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (coordsMatch) {
            latitude = coordsMatch[1];
            longitude = coordsMatch[2];
        } else {
            const dataMatch = placeUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
            if (dataMatch) {
                latitude = dataMatch[1];
                longitude = dataMatch[2];
            }
        }

        return {
            id: 'auto_' + Math.random().toString(36).substr(2, 9),
            name,
            category,
            rating,
            reviews,
            phone,
            address,
            website,
            hours,
            priceLevel,
            latitude,
            longitude,
            email: '',
            mapsUrl: placeUrl,
            notes: 'Scraped automatically',
            createdAt: new Date().toISOString()
        };
    }, url);
}

// Download endpoint to bypass browser popup/download blocker for automated streams (Protected by authenticate)
app.post('/api/download', authenticate, (req, res) => {
    const query = req.body.query;
    let dataList = [];
    try {
        dataList = JSON.parse(req.body.data);
    } catch (e) {
        res.status(400).send('Invalid data list format');
        return;
    }

    logActivity(req.username, 'download', `Downloaded CSV report for query "${query}" (${dataList.length} rows)`, req);

    const headers = ['Name','Category','Rating','Reviews','Phone','Address','Website','Hours','Price Level','Latitude','Longitude','Email','Maps URL','Notes'];
    const rows = dataList.map(p => {
        const csvEscape = (str) => {
            if (!str) return '';
            str = str.toString();
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        return [
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
        ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const safeQuery = query ? query.trim().replace(/[\\/:*?"<>|]/g, '_') : 'mapharvest_results';
    const filename = `${safeQuery}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
});

// Get user places file path
function getUserPlacesPath(username) {
    const safeName = username.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    return path.join(DATA_DIR, `${safeName}_places.json`);
}

// Load user places
function loadUserPlaces(username) {
    const filePath = getUserPlacesPath(username);
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (e) {
        console.error(`Error loading places for ${username}:`, e);
    }
    return [];
}

// Save user places
function saveUserPlaces(username, placesList) {
    const filePath = getUserPlacesPath(username);
    try {
        fs.writeFileSync(filePath, JSON.stringify(placesList, null, 2), 'utf8');
    } catch (e) {
        console.error(`Error saving places for ${username}:`, e);
    }
}

// User-Specific Database Endpoints
app.get('/api/places', authenticate, (req, res) => {
    const list = loadUserPlaces(req.username);
    res.json(list);
});

app.post('/api/places', authenticate, (req, res) => {
    const place = req.body;
    if (!place || !place.id) {
        return res.status(400).json({ error: 'Invalid place payload' });
    }
    const list = loadUserPlaces(req.username);
    const idx = list.findIndex(p => p.id === place.id);
    if (idx > -1) {
        list[idx] = place; // update
        logActivity(req.username, 'place-update', `Updated business profile "${place.name}"`, req);
    } else {
        list.push(place); // insert
        logActivity(req.username, 'place-save', `Created new business profile "${place.name}"`, req);
    }
    saveUserPlaces(req.username, list);
    res.json({ message: 'Saved successfully' });
});

app.put('/api/places/:id', authenticate, (req, res) => {
    const { id } = req.params;
    const place = req.body;
    const list = loadUserPlaces(req.username);
    const idx = list.findIndex(p => p.id === id);
    if (idx > -1) {
        list[idx] = { ...list[idx], ...place };
        saveUserPlaces(req.username, list);
        logActivity(req.username, 'place-edit', `Modified profile details for "${place.name || id}"`, req);
        res.json({ message: 'Updated successfully' });
    } else {
        res.status(404).json({ error: 'Place not found' });
    }
});

app.delete('/api/places/:id', authenticate, (req, res) => {
    const { id } = req.params;
    let list = loadUserPlaces(req.username);
    const place = list.find(p => p.id === id);
    list = list.filter(p => p.id !== id);
    saveUserPlaces(req.username, list);
    logActivity(req.username, 'place-delete', `Deleted business profile "${place ? place.name : id}"`, req);
    res.json({ message: 'Deleted successfully' });
});

app.post('/api/places/bulk-delete', authenticate, (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
        return res.status(400).json({ error: 'Invalid ids array' });
    }
    let list = loadUserPlaces(req.username);
    list = list.filter(p => !ids.includes(p.id));
    saveUserPlaces(req.username, list);
    logActivity(req.username, 'places-bulk-delete', `Bulk deleted ${ids.length} entries`, req);
    res.json({ message: 'Bulk deletion successfully completed' });
});

app.post('/api/places/clear', authenticate, (req, res) => {
    saveUserPlaces(req.username, []);
    logActivity(req.username, 'places-clear', 'Wiped entire places database', req);
    res.json({ message: 'Clear database successfully completed' });
});

app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`  MapHarvest Server running on http://localhost:${PORT}`);
    console.log(`================================================================`);
});
