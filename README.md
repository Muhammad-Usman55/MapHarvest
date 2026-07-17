# 📍 MapHarvest — Automated Google Maps Data Extractor

**Owner & Developer:** Muhammad Usman Shahid

MapHarvest is a premium, local-first, developer-friendly web application designed to scrape business details from Google Maps **completely automatically and without needing any API key**.

It launches a local headless browser session, automates the search query, scrolls to gather listings, visits each business profile, extracts key details, and saves them in local storage.

---

## ✨ Features

- **🚀 100% Automated Extraction**: No manual copying or browser extensions. Just input a query and watch the scraper do the work.
- **💻 Live Scraper Terminal**: A monospace visual console built directly into the web dashboard that streams live updates (using Server-Sent Events) of exactly what the browser is doing.
- **📊 Premium Analytics Dashboard**: View metrics like total scraped entries, average rating, and counts of businesses with available phone numbers or websites.
- **📋 Interactive Data Management**: Sort, filter, search, manually add, edit, or bulk delete records inside a beautiful dark-themed data table.
- **📂 Flexible Export Formats**: Export your cumulative records to CSV, JSON, TXT, or copy directly to your clipboard.

---

## 🛠️ Requirements

- **Node.js**: Version 18.0.0 or higher.
- **Local Browser**: Google Chrome or Microsoft Edge installed (the scraper will automatically detect your system installation to bypass network download blocks).

> [!NOTE]
> For a full list of system, Linux/Unix dependencies, hardware, and environment requirements, please see the [requirements.txt](file:///d:/google%20map/requirements.txt) file in the root folder.

---

## 🚀 How to Run the Project

Follow these simple steps to run MapHarvest on your local computer:

### Step 1: Open the Project Folder
Open your terminal (Command Prompt, PowerShell, or Git Bash) and navigate to the project directory:
```bash
cd "d:\google map"
```

### Step 2: Install Dependencies
Install the required packages (`express`, `cors`, and `puppeteer`):
```bash
npm install
```
*(Note: If you run into network timeout warnings, don't worry! MapHarvest automatically searches your system for Google Chrome or Microsoft Edge as a fallback).*

### Step 3: Start the MapHarvest Server
Launch the backend crawler and static server:
```bash
npm start
```
*(or run `node server.js`)*

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

## 🔍 How to Scrape Data

1. Open the dashboard at `http://localhost:3000`.
2. Enter your keyword (e.g., `coffee shop in Paris` or `dental clinic`) in the search bar.
3. Click **Auto Scrape**.
4. Watch the **Live Terminal** print logs in real-time.

---

## 📁 Project Structure

- `server.js` — Express backend and Puppeteer browser automation crawler.
- `app.js` — Client-side EventSource SSE listeners, rendering, sorting, and LocalStorage persistence.
- `index.html` — Glassmorphism dark-theme layout dashboard interface.
- `styles.css` — Modern UI stylesheet, custom terminal pane, custom loader bar, and responsive grids.
- `package.json` — Declares Node dependencies and startup scripts.
- `requirements.txt` — Detailed listing of system, browser, OS libraries, and software environment requirements.
