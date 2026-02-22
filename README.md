# Dione OS – Field Notes Edition

> A structured but flexible field journal PWA. Local-first. Offline-capable. Minimal.

---

## Philosophy

**Dione OS** lives between Apple Notes (speed) and Notion (light structure). It feels like a Field Notes notebook — analog warmth, intentional simplicity, zero friction.

- **Local-first** – All data lives in IndexedDB on your device
- **Offline-capable** – Full functionality without a network connection
- **Mobile-first** – Designed for 390px, usable on tablets
- **Zero dependencies** – Pure HTML, CSS, and Vanilla JS (except Inter font via Google Fonts)

---

## File Structure

```
dione-os/
├── index.html          # App shell + all views
├── styles.css          # Complete design system (CSS custom properties, no Tailwind)
├── app.js              # Modular vanilla JS application
├── db.js               # IndexedDB abstraction layer (DioneDB)
├── manifest.json       # PWA manifest
├── service-worker.js   # Offline caching (cache-first strategy)
├── icons/
│   ├── icon-192.png    # PWA icon (192×192)
│   └── icon-512.png    # PWA icon (512×512)
└── README.md           # This file
```

---

## Quick Start

### Option A: Local (simplest)

Serve via any static file server. Example with Python:

```bash
cd dione-os
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

> ⚠️ Service workers require either `localhost` or HTTPS. Direct `file://` opening will work for the app but not PWA install.

### Option B: Deploy to Netlify (recommended for install)

```bash
# Drag-and-drop the dione-os/ folder to netlify.com/drop
# Or use the CLI:
npm install -g netlify-cli
netlify deploy --dir=dione-os --prod
```

### Option C: Deploy to Vercel

```bash
npm install -g vercel
cd dione-os
vercel --prod
```

---

## Installing as a PWA

Once deployed to HTTPS:

**iOS (Safari):** Share → Add to Home Screen  
**Android (Chrome):** Menu → Add to Home Screen / Install App  
**Desktop (Chrome/Edge):** Address bar install icon → Install

---

## Data Model

Each entry stored in IndexedDB:

```js
{
  id: string,           // unique id (timestamp-random)
  mode: 'daily' | 'project' | 'thinking',
  projectId: string | null,
  captureType: string,  // 'idea' | 'expense' | 'coffee' | 'quote' | 'reminder' | 'blank'
  title: string,
  body: string,
  mood: 'great' | 'good' | 'okay' | 'off' | 'bad' | null,
  rating: 'great' | 'good' | 'okay' | 'off' | 'bad' | null,
  tags: string[],
  attachments: string[], // base64 data URLs
  sleepHours: number | null,
  coffeeCount: number | null,
  pinned: boolean,
  starred: boolean,
  createdAt: number,    // Unix timestamp ms
  updatedAt: number,
}
```

Projects:

```js
{
  id: string,
  name: string,
  icon: string,         // emoji
  description: string,
  createdAt: number,
  updatedAt: number,
}
```

---

## Backup & Restore

- **Export** – Top bar download icon → saves `dione-os-backup-YYYY-MM-DD.json`
- **Import** – Top bar upload icon → select a `.json` backup file → entries are merged (upserted by id)

---

## Design System

| Token | Value |
|---|---|
| Paper | `#F5F2ED` |
| Card | `#FFFFFF` |
| Ink | `#2F2F2F` |
| Secondary | `#8C8175` |
| Accent | `#6B4F3A` |
| Font | Inter 300/400/500/600 |
| Base grid | 8px |
| Border radius | 6–20px |

---

## Browser Support

- Chrome 80+
- Safari 14+
- Firefox 79+
- Edge 80+

Requires: IndexedDB, CSS custom properties, Service Workers, ES6+.

---

## License

MIT – use freely, build upon it, make it yours.
