# 📍 MapHarvest — Automated Google Maps Data Extractor

**Owner & Developer:** Muhammad Usman Shahid  
**Version:** 2.0.0  
**License:** ISC  
**Default Admin Credentials:** Gmail `usman` (or `usman@gmail.com`) / Password `@oZhQ95X`

MapHarvest is a premium, developer-friendly web application designed to scrape business details from Google Maps **completely automatically and without needing any API key**. It runs a local headless browser session, automates searches, scrolls through listings, extracts business details, saves records directly to server-side JSON databases, and syncs states across devices.

---

## 📐 System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                              │
│                                                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Search & │  │ Paste &  │  │ Manual   │  │  Data    │  │ Export  │ │
│  │ Collect  │  │ Extract  │  │  Entry   │  │  Table   │  │  Panel  │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │
│       │              │             │              │              │      │
│  ┌────┴──────────────┴─────────────┴──────────────┴──────────────┴───┐ │
│  │                    app.js — Client Logic Layer                     │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                            │ │
│  │  │ Auth     │ │ IndexedDB│ │ Toast    │                            │ │
│  │  │ Manager  │ │ Manager  │ │ System   │                            │ │
│  │  └──────────┘ └──────────┘ └──────────┘                            │ │
│  └───────────────────────────┬───────────────────────────────────────┘ │
│                              │ REST API + SSE                          │
└──────────────────────────────┼─────────────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Express Server    │
                    │   (server.js:3000)  │
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
   ┌──────▼──────┐   ┌────────▼────────┐   ┌──────▼──────┐
   │  Auth &     │   │  Puppeteer      │   │  Data       │
   │  Session    │   │  Scraper Engine │   │  Persistence│
   │  Manager    │   │  (Headless)     │   │  Layer      │
   └──────┬──────┘   └────────┬────────┘   └──────┬──────┘
          │                    │                    │
          ▼                    ▼                    ▼
   ┌─────────────┐   ┌────────────────┐   ┌──────────────────┐
   │ users.json  │   │ Google Maps    │   │ data/            │
   │ (user store)│   │ (external)     │   │ ├─ activities.json│
   └─────────────┘   └────────────────┘   │ └─ *_places.json │
                                          └──────────────────┘
```

### Component Breakdown

| Layer | Component | Technology | Responsibility |
|-------|-----------|------------|---------------|
| **Frontend** | UI Shell | HTML5 + CSS3 | Responsive dashboard with glassmorphism, sidebar navigation, animated backgrounds |
| **Frontend** | Client Logic | Vanilla JavaScript (IIFE) | Tab routing, form handling, table rendering, search, sort, bulk operations |
| **Frontend** | Local DB | IndexedDB (`MapHarvestDB`) | Client-side cache for offline-capable place storage |
| **Frontend** | Notifications | Custom Toast System | Animated slide-up toasts with pause-on-hover progress bars |
| **Backend** | HTTP Server | Express.js v4 | Static file serving, REST API routing, SSE streaming |
| **Backend** | Scraper | Puppeteer v22 | Headless Chrome/Edge automation for Google Maps data extraction |
| **Backend** | Auth | `crypto` (PBKDF2) | Token-based session management with salted password hashing |
| **Backend** | Storage | JSON flat files | File-based persistence for users, activities, and per-user place databases |

---

## 🔐 Security Architecture

### Authentication Flow

```
┌──────────┐                          ┌──────────────┐
│  Client  │                          │    Server     │
└────┬─────┘                          └──────┬───────┘
     │                                       │
     │  POST /api/auth/signup                │
     │  {gmail, password, username,          │
     │   securityQuestion, securityAnswer}   │
     │ ────────────────────────────────────►  │
     │                                       │── Generate salt (16 bytes)
     │                                       │── PBKDF2(password, salt, 1000, 64, sha512)
     │                                       │── Hash security answer (case-insensitive)
     │                                       │── Write to users.json
     │  ◄──────────────────── 200 OK         │
     │                                       │
     │  POST /api/auth/login                 │
     │  {gmail, password}                    │
     │ ────────────────────────────────────►  │
     │                                       │── Verify PBKDF2 hash
     │                                       │── Generate 32-byte random token
     │                                       │── Store in activeTokens Map
     │  ◄── {token, username, isAdmin}       │
     │                                       │
     │  GET /api/places                      │
     │  Authorization: Bearer <token>        │
     │ ────────────────────────────────────►  │
     │                                       │── Verify token in activeTokens
     │                                       │── Load <username>_places.json
     │  ◄── [places array]                   │
     │                                       │
     │  POST /api/auth/logout                │
     │ ────────────────────────────────────►  │
     │                                       │── Delete token from activeTokens
     │  ◄──────────────────── 200 OK         │
```

### Password Recovery Flow

```
Client                                            Server
  │                                                  │
  │  POST /api/auth/recover-question {gmail}         │
  │ ──────────────────────────────────────────────►   │
  │  ◄─── {securityQuestion}                         │
  │                                                  │
  │  POST /api/auth/reset-password                   │
  │  {gmail, securityAnswer, newPassword}            │
  │ ──────────────────────────────────────────────►   │
  │         │── Hash answer (lowercase + trim)       │
  │         │── Compare with stored answerHash       │
  │         │── Re-salt & re-hash new password       │
  │  ◄─── 200 OK (Password reset)                   │
```

### Security Measures

| Mechanism | Details |
|-----------|---------|
| **Password Hashing** | PBKDF2 with SHA-512, 1000 iterations, 64-byte key, 16-byte random salt |
| **Token Auth** | 32-byte cryptographically random hex tokens via `crypto.randomBytes()` |
| **Session Store** | In-memory `Map<token, username>` — tokens invalidated on logout or server restart |
| **Admin Guard** | `requireAdmin` middleware chains `authenticate` → checks `isAdmin` flag on user record |
| **Data Isolation** | Each user's places stored in separate `data/<username>_places.json` files |
| **Security Q&A** | Answers hashed with separate salt, compared case-insensitively |
| **Input Validation** | Email regex, min-length password (6), min-length username (2), required security fields |

---

## 🔄 Data Flow — Scraping Pipeline

### Scraper Architecture (SSE-based Real-Time Streaming)

```
┌────────────┐   EventSource    ┌───────────┐   Puppeteer    ┌──────────────┐
│   Browser  │◄────(SSE)───────│  Express   │──────────────►│ Google Maps  │
│   Client   │                 │  Server    │               │  (external)  │
└─────┬──────┘                 └─────┬─────┘               └──────────────┘
      │                              │
      │ 1. User enters search query  │
      │ 2. Client opens EventSource  │
      │    GET /api/scrape?query=... │
      │ ───────────────────────────► │
      │                              │ 3. Launch Puppeteer (headless)
      │                              │ 4. Navigate to Google Maps
      │                              │ 5. Wait for feed container
      │ ◄── SSE: "Searching..."      │
      │                              │ 6. Scroll loop:
      │                              │    ├─ Gather <a href="/maps/place/"> URLs
      │ ◄── SSE: "Found N listings"  │    ├─ Scroll feed to bottom
      │                              │    ├─ Wait 5s for lazy-load
      │                              │    ├─ Check "end of list" sentinel
      │                              │    └─ Repeat until limit or end
      │                              │
      │                              │ 7. For each listing URL:
      │                              │    ├─ Navigate to detail page
      │                              │    ├─ Extract: name, category, rating,
      │                              │    │   reviews, phone, address, website,
      │                              │    │   hours, priceLevel, lat/lng
      │                              │    ├─ Auto-save to <user>_places.json
      │ ◄── SSE: {place details}     │    └─ Stream result to client
      │                              │
      │ ◄── SSE: "Completed"         │ 8. Close browser, end stream
      │                              │
      ▼                              ▼
  Renders in live                 Persisted to
  session list                    data/<user>_places.json
  & terminal UI
```

### Extracted Data Schema

Each scraped business record contains:

```json
{
  "id": "auto_k7x3m9f2a",
  "name": "Business Name",
  "category": "Restaurant",
  "rating": 4.5,
  "reviews": 1234,
  "phone": "+1-555-123-4567",
  "address": "123 Main St, City, State",
  "website": "https://example.com",
  "hours": "Monday: 9AM–5PM, Tuesday: 9AM–5PM ...",
  "priceLevel": "$$",
  "latitude": "40.7128",
  "longitude": "-74.0060",
  "email": "",
  "mapsUrl": "https://www.google.com/maps/place/...",
  "notes": "Scraped automatically",
  "createdAt": "2026-07-18T10:00:00.000Z"
}
```

### Browser Fallback Detection

The scraper uses an intelligent multi-path browser detection strategy:

```
1. Default Puppeteer bundled Chromium
   └─ Fails? ──► System browser fallback chain:
                  ├─ /usr/bin/chromium
                  ├─ /usr/bin/chromium-browser
                  ├─ /usr/bin/google-chrome
                  ├─ /usr/bin/google-chrome-stable
                  ├─ C:\Program Files\Google\Chrome\Application\chrome.exe
                  ├─ C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
                  ├─ C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
                  ├─ C:\Program Files\Microsoft\Edge\Application\msedge.exe
                  └─ %USERPROFILE%\AppData\Local\Google\Chrome\Application\chrome.exe
```

### Page Optimization

The scraper intercepts and blocks the following resource types to maximize speed:

| Blocked Resources | Blocked Domains |
|-------------------|-----------------|
| Images, Fonts, Media | `google-analytics`, `analytics.js` |
| — | `doubleclick`, `googleadservices` |

---

## ✨ Features

### 🚀 Search & Collect (Automated Scraping)
- Enter a search term → headless Puppeteer scrolls Google Maps, collects listing URLs, visits each detail page, and extracts 14 fields per business.
- Set a numeric limit or scrape **all available** results.
- Live terminal log and progress bar with real-time SSE streaming.
- Auto-saves each record to the server-side JSON database as it's scraped.

### 📋 Paste & Extract
- Paste raw text (copied from Google Maps or any source) into a textarea.
- Regex-based parser extracts structured business details from unstructured text.
- Preview cards shown before committing to the database.

### ✏️ Manual Entry
- Add business records manually via a structured form.
- Full field support: name, category, rating, reviews, phone, address, website, hours, price level, coordinates, email, notes.

### 📊 Data Table
- Sortable, searchable, responsive data grid.
- Checkbox bulk select with bulk delete and clear all operations.
- Inline edit modal for updating individual records.
- Auto-transforms into vertical card layout on mobile (`≤ 768px`).

### 📥 Export
- Export data to **CSV**, **Excel**, **JSON**, and **TXT** formats.
- Filenames automatically match the active search query keyword.
- Server-side CSV generation via `POST /api/download` for reliable downloads.


### 👑 Admin Control Panel
- Accessible only by admin user (`usman@gmail.com`).
- Real-time system stats: registered users count, tracked activities count, system status.
- **Registered Users** registry table (username, email, creation date, role).
- **User Activities** log grid: action type, query details, client IP, browser type, device type (Mobile/Tablet/Desktop), timestamp.
- Activity log auto-caps at 1000 entries (FIFO rotation).

### ☁️ Multi-User Authentication & Database Sync
- Secure signup and login with PBKDF2 hashing.
- Password recovery via case-insensitive security questions.
- Per-user isolated databases (`data/<username>_places.json`).
- Client-side IndexedDB syncs with server-side JSON for persistence across devices.

### 🌓 Dual-Theme Support
- Default **Light Theme** with soft gradients and glassmorphism.
- Toggle to **Dark Theme** via sidebar button.
- CSS custom properties enable seamless theme switching.

### 🔔 Notification Toast System
- Springy slide-up entry animations.
- Color-coded progress bars: emerald (success), rose (error), amber (warning), cyan (info).
- **Pause-on-Hover**: hovering pauses the countdown timer and progress bar.

---

## 🗂️ REST API Reference

### Authentication Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/signup` | — | Register a new user account |
| `POST` | `/api/auth/login` | — | Authenticate and receive a session token |
| `GET` | `/api/auth/me` | Bearer Token | Get current user's display name |
| `POST` | `/api/auth/logout` | Bearer Token | Invalidate the current session token |
| `POST` | `/api/auth/recover-question` | — | Retrieve the security question for an email |
| `POST` | `/api/auth/reset-password` | — | Reset password using security answer verification |

### Scraper Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/scrape?query=...&limit=...` | Bearer Token | Launch headless scraper with SSE progress stream |

### Places (Per-User Database) Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/places` | Bearer Token | Retrieve all places for the authenticated user |
| `POST` | `/api/places` | Bearer Token | Create or update a place record |
| `PUT` | `/api/places/:id` | Bearer Token | Partially update a specific place by ID |
| `DELETE` | `/api/places/:id` | Bearer Token | Delete a specific place by ID |
| `POST` | `/api/places/bulk-delete` | Bearer Token | Delete multiple places by ID array |
| `POST` | `/api/places/clear` | Bearer Token | Wipe all places for the authenticated user |

### Admin Endpoints (Admin Only)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/admin/stats` | Admin Token | Get total users, total activities, and system status |
| `GET` | `/api/admin/users` | Admin Token | List all registered users (sanitized, no hashes) |
| `GET` | `/api/admin/activities` | Admin Token | Get all activity logs (sorted newest first) |

### Export Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/download` | Bearer Token | Generate and download CSV file server-side |

---

## 📂 Project Structure

```
google map/
├── server.js              # Express backend — Auth, Puppeteer scraper, REST API, SSE streaming
├── app.js                 # Client-side logic — IIFE module: auth, IndexedDB, scraper UI,
│                          #   table rendering, export, toast system
├── index.html             # Single-page dashboard — sidebar nav, tab panels, modals,
│                          #   auth forms, admin panel, animated backgrounds
├── styles.css             # Design system — CSS variables, Light/Dark themes, glassmorphism,
│                          #   responsive breakpoints, toast animations, mobile card layouts
├── package.json           # Node.js manifest — scripts, dependencies, engine requirements
├── users.json             # User account store — hashed credentials, security Q&A, roles
├── data/
│   ├── activities.json    # Activity audit log — timestamped actions with IP, browser, device
│   └── <user>_places.json # Per-user scraped business databases (one file per user)
├── Dockerfile             # Production Alpine container configuration
├── render.yaml            # Render.com deployment blueprint
├── requirements.txt       # Detailed browser library and server dependency requirements
└── .gitignore             # Git exclusion rules
```

### File Responsibilities

| File | Lines | Size | Role |
|------|-------|------|------|
| `server.js` | ~1023 | 39 KB | Express server, PBKDF2 auth, Puppeteer scraper engine, SSE streaming, admin middleware, file-based persistence, CSV download generation |
| `app.js` | ~1720 | 72 KB | Client IIFE: IndexedDB manager, tab navigation, search & scrape UI with live terminal, data table with sort/filter/bulk ops, export to 4 formats, notification toasts |
| `index.html` | ~880 | 56 KB | 6 tab panels (Search & Collect, Paste & Extract, Manual Entry, Data Table, Export, Admin), authentication modals (Login/Signup/Recover), edit modal, sidebar with theme toggle |
| `styles.css` | ~1340 | 52 KB | CSS custom properties (40+ tokens), Light/Dark theme overrides, animated background glows, glassmorphism cards, responsive mobile card transforms, scrollbar styling, toast animations |

---

## 🛠️ Requirements

- **Node.js**: Version 18.0.0 or higher.
- **Local Browser**: Google Chrome or Microsoft Edge installed (the scraper will automatically detect your system installation to bypass network download blocks).

> [!NOTE]
> For a full list of system, Linux/Unix dependencies, hardware, and environment requirements, please see the [requirements.txt](requirements.txt) file in the root folder.

---

## 🚀 How to Run the Project

Follow these simple steps to run MapHarvest on your local computer:

### Step 1: Navigate to the Project Folder
Open your terminal and enter the project folder directory:
```bash
cd "d:\google map"
```

### Step 2: Install Dependencies
Install all required Node modules (`express`, `cors`, and `puppeteer`):
```bash
npm install
```

### Step 3: Start the MapHarvest Server
Launch the backend server:
```bash
npm start
```
You will see the confirmation message:
```text
================================================================
  MapHarvest Server running on http://localhost:3000
================================================================
```

### Step 4: Open the Web UI
Open your web browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🐳 Docker Deployment

Build and run the Docker container:
```bash
docker build -t mapharvest .
docker run -p 3000:3000 mapharvest
```

### Render.com

The project includes a `render.yaml` blueprint for one-click deployment to [Render.com](https://render.com). Puppeteer will use the `PUPPETEER_EXECUTABLE_PATH` environment variable when set.

---

## 🧩 Technology Stack

| Category | Technology | Version |
|----------|-----------|---------|
| **Runtime** | Node.js | ≥ 18.0.0 |
| **Framework** | Express.js | 4.19.x |
| **Scraper** | Puppeteer | 22.12.x |
| **CORS** | cors | 2.8.x |
| **Cryptography** | Node.js `crypto` (built-in) | — |
| **Client Storage** | IndexedDB | Browser native |
| **Typography** | Inter + JetBrains Mono | Google Fonts |
| **Styling** | Vanilla CSS with Custom Properties | — |
| **Containerization** | Docker (Alpine) | — |

---

## 📊 Activity Logging Schema

Every user action is logged with the following structure:

```json
{
  "gmail": "user@gmail.com",
  "action": "scrape | login | signup | place-save | place-edit | place-delete | download | ...",
  "details": "Human-readable action description",
  "ip": "Client IP address (supports X-Forwarded-For)",
  "device": "Desktop (Chrome) | Mobile (Safari) | Tablet (Firefox)",
  "userAgent": "Full User-Agent string",
  "timestamp": "2026-07-18T10:00:00.000Z"
}
```

**Action Types Tracked:**

| Action | Trigger |
|--------|---------|
| `signup` | New user registration |
| `login` | Successful authentication |
| `recover-request` | Security question retrieval |
| `reset-fail` | Failed password reset attempt |
| `password-reset` | Successful password reset |
| `scrape` | Scraper launched for a query |
| `place-save` | New business record created |
| `place-update` | Existing business record modified |
| `place-edit` | Business profile details edited |
| `place-delete` | Single business record deleted |
| `places-bulk-delete` | Multiple records deleted at once |
| `places-clear` | Entire user database wiped |
| `download` | CSV export downloaded |

---

## 📱 Responsive Design Breakpoints

| Breakpoint | Behavior |
|------------|----------|
| `> 768px` | Full desktop layout with sidebar, data tables, multi-column grids |
| `≤ 768px` | Sidebar collapses to hamburger menu, data tables transform to vertical touch-friendly card lists |

---

## 📄 License

ISC License — © Muhammad Usman Shahid
