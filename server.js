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

// Helper function to format SSE messages
function sendEvent(res, status, message, data = null) {
    res.write(`data: ${JSON.stringify({ status, message, data })}\n\n`);
}

// Scrape endpoint (Streams progress updates using Server-Sent Events)
app.get('/api/scrape', async (req, res) => {
    const query = req.query.query;
    let limit = parseInt(req.query.limit);
    const scrapeAll = isNaN(limit) || limit <= 0;
    if (scrapeAll) {
        limit = 1000; // Scrape all results if limit is 0 or unset
    }

    if (!query) {
        res.status(400).json({ error: 'Query parameter is required' });
        return;
    }

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
        while (placeUrls.size < limit && scrollAttempts < 150) {
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
            await new Promise(r => setTimeout(r, 10000));

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
                await new Promise(r => setTimeout(r, 2000)); // wait for details to settle

                const placeDetails = await extractDetails(page, url);
                if (placeDetails && placeDetails.name) {
                    sendEvent(res, 'place', `Scraped: ${placeDetails.name}`, placeDetails);
                } else {
                    sendEvent(res, 'warning', `Could not extract details for listing at index ${i + 1}`);
                }
            } catch (err) {
                sendEvent(res, 'warning', `Error loading listing ${i + 1}: ${err.message}`);
            }

            // Small delay to be polite
            await new Promise(r => setTimeout(r, 1500));
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

// Download endpoint to bypass browser popup/download blocker for automated streams
app.post('/api/download', (req, res) => {
    const query = req.body.query;
    let dataList = [];
    try {
        dataList = JSON.parse(req.body.data);
    } catch (e) {
        res.status(400).send('Invalid data list format');
        return;
    }

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

app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`  MapHarvest Server running on http://localhost:${PORT}`);
    console.log(`================================================================`);
});
