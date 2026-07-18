# 📍 MapHarvest — Automated Google Maps Data Extractor

**Owner & Developer:** Muhammad Usman Shahid
**Default Admin Credentials:** Gmail `usman` (or `usman@gmail.com`) / Password `@oZhQ95X`

MapHarvest is a premium, developer-friendly web application designed to scrape business details from Google Maps **completely automatically and without needing any API key**. It runs a local headless browser session, automates searches, scrolls through listings, extracts business details, saves records directly to server-side JSON databases, and syncs states across devices.

---

## ✨ Features

- **🚀 100% Automated Scraping**: Just input a search term and watch MapHarvest scroll, collect, and extract details automatically.
- **☁️ Multi-User Authentication & DB Sync**:
  - Secure Gmail-based Signup and Login with salted PBKDF2 hashing.
  - Password recovery using case-insensitive security questions.
  - Automatic real-time syncing of client-side IndexedDB databases with local server-side files (stored in `data/<username>_places.json`).
  - Total database isolation: users can only view, edit, or delete their own data.
- **👑 Admin Control Panel**:
  - Log in with Admin Usman credentials (`usman@gmail.com` / `@oZhQ95X`).
  - View real-time system stats (registered users, tracked actions, and node statuses).
  - Inspect the **Registered Users registry table**.
  - Monitor the **User Activities log grid** displaying active action types, query details, client IP addresses, browser types, and device configurations (Mobile/Tablet/Desktop).
- **🌓 Dual-Theme Support**: Toggle between Dark Mode and a beautifully polished **Default Light Theme** layout using the sidebar button.
- **📱 Responsive Mobile Cards**: Data tables automatically transform into touch-friendly vertical card lists on screen widths `<= 768px` for premium mobile usability.
- **🔔 Animated Notification Toasts**:
  - Springy slide-up entry animations.
  - Colorful remaining lifetime linear progress bars (emerald for success, rose for error, amber for warning, cyan for info).
  - **Pause-on-Hover**: Hovering your mouse over the toast stops the timer and halts the progress bar, resuming automatically on mouse exit.
- **📥 Smart Export Filename Downloads**: Downloads generated CSV, Excel, JSON, and TXT files directly matching the name of your active search query keyword.

---

## 🛠️ Requirements

- **Node.js**: Version 18.0.0 or higher.
- **Local Browser**: Google Chrome or Microsoft Edge installed (the scraper will automatically detect your system installation to bypass network download blocks).

> [!NOTE]
> For a full list of system, Linux/Unix dependencies, hardware, and environment requirements, please see the [requirements.txt](file:///d:/google%20map/requirements.txt) file in the root folder.

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

## 📂 Project Structure

- `server.js` — Express backend and Puppeteer browser crawler. Seeds the admin account, protects admin endpoints via middleware, logs activities, and hosts place sync routes.
- `app.js` — Client-side logic: manages logins/signups, IndexedDB local database transactions, search query filename downloads, hover notification timeouts, and responsive table morphing.
- `index.html` — Responsive dashboard interface, sidebar toggle buttons, authentication modal cards, and admin stats layouts.
- `styles.css` — CSS variables supporting default Light Theme, override Dark Theme, notification progress bars, and mobile card rules.
- `package.json` — Node script declarations and dependency list.
- `requirements.txt` — Detailed list of browser libraries and server requirements.
- `Dockerfile` — Production Alpine container configuration.
- `render.yaml` — Blueprint infrastructure blueprint for Render.com.
