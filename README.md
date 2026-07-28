# Rhythia DB (Bulk Downloader & Library Sync)

**Rhythia DB** (Bulk Downloader) is a fast, 100% client-side web tool designed for Rhythia rhythm game players to download and synchronize their entire song library directly in the browser—with zero server data storage.

![Rhythia DB Interface](https://i.ibb.co/9kXNFg1Q/Screenshot-2026-07-28-141313.png)

## 🌟 Key Features

- **⚡ Direct API Synchronization**:
  - Automatically syncs all 9,300+ map entries directly from `production.rhythia.com` on startup.
  - Live statistics breakdown for Ranked, Unranked, and Qualified beatmaps.

- **📁 Unlimited "Download ALL Maps" Modes**:
  - **Direct Folder Sync (Recommended)**: Uses the modern browser **File System Access API** (`showDirectoryPicker`) to write `.rhm`, `.sspm`, and `.ssmp` map files directly to a folder on your computer as they download. This bypasses memory buffers completely, allowing you to download Rhythia's entire 9,300+ map library (~45-50 GB) without memory crashes!
  - **Auto-Splitting Sequential ZIPs (Fallback)**: Automatically splits large downloads into sequential ZIP archives (200 maps per file) for browsers without direct folder access.

- **📦 Flexible Batch Downloader**:
  - Download maps in configurable chunk sizes (50, 100, 200, 500 maps).
  - Filter by map type (Ranked Only, Unranked Only, Qualified, or All Maps).
  - Live download speed counters (MB/s) and interactive console logging.

- **🔍 100% Private Library Sync & Checker**:
  - Drag-and-drop your existing maps `.zip` archive.
  - Reads and analyzes ZIP directory listings in memory (100% private, no data uploaded).
  - **Comprehensive Format Matching**: Supports packed `.rhm`, `.sspm`, `.ssmp` files and unzipped map folders containing `map`, `map.txt`, or `map.json` files.
  - Deep inspection matches maps by **LegacyId**, **Title**, and **Difficulty**.
  - Displays missing maps with single-click downloads or a bulk **"Download All Missing"** action.

- **🎨 Minimalist Monochromatic Theme**:
  - Sleek Vercel/GitHub style black & gray interface.
  - Custom dark-mode modal dialogs and non-blocking toast notifications.
  - Custom dark scrollbars and responsive layout.

---

## 🛠️ Technology Stack

- **Framework / Bundler**: [Vite](https://vitejs.dev/)
- **Logic & Language**: Vanilla JavaScript (ES6+ Modules)
- **Styling**: Vanilla CSS (CSS Variables, Flexbox, Grid)
- **ZIP Compression & Inspection**: [JSZip](https://stuk.github.io/jszip/)
- **Icons**: [FontAwesome 6](https://fontawesome.com/)
- **Typography**: [Outfit](https://fonts.google.com/specimen/Outfit) & [Fira Code](https://fonts.google.com/specimen/Fira+Code)

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+ recommended)
- `npm` or `yarn`

### Installation & Running

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Varomine/Rhythia-DB
   cd Rhythia-DB
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start local development server**:
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:5173/`.

4. **Build for production**:
   ```bash
   npm run build
   ```
   The production-ready output will be generated in the `dist/` directory.

---

## 🔒 Privacy & CORS Policy

- **Zero Data Storage**: All operations (ZIP parsing, file comparison, and bulk downloading) happen **100% client-side** inside your browser. No files, logs, or user data are sent to any external server.
- **Direct Fetching**: Map metadata and assets are retrieved directly from `production.rhythia.com` and `static.rhythia.com` via CORS-enabled public endpoints.

---

## 📄 License

Distributed under the MIT License. See [`LICENSE`](https://github.com/Varomine/Rhythia-DB?tab=MIT-1-ov-file) for more information.
