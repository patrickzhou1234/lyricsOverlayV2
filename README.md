# 🎵 Lyrics Overlay

A beautiful, modern lyrics overlay for Spotify built with Electron.js and Python.

![Lyrics Overlay Preview](preview.png)

## ✨ Features

- **Real-time lyrics sync** - Lyrics scroll automatically with your music
- **Synced & unsynced lyrics** - Supports both time-synced (if available) and plain lyrics
- **Beautiful dark UI** - Premium glassmorphism design with smooth animations
- **Always on top** - Overlay stays visible over other windows
- **Draggable & resizable** - Position it anywhere on your screen
- **Spotify integration** - Automatically detects what you're playing

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18 or higher)
- **Python** (v3.8 or higher)
- **Spotify Developer Account** - For API credentials

### Installation

1. **Clone the repository**
   ```bash
   cd lyricsOverlay2
   ```

2. **Install Node.js dependencies**
   ```bash
   npm install
   ```

3. **Install Python dependencies**
   ```bash
   cd backend
   pip install -r requirements.txt
   cd ..
   ```

4. **Set up your credentials**
   - Copy `.env.example` to `.env` in the `backend` folder
   - Add your Spotify API credentials (get them from [Spotify Developer Dashboard](https://developer.spotify.com/dashboard))
   - Optionally add your Genius API token for unsynced lyrics fallback

   ```bash
   cp .env.example backend/.env
   ```

5. **Run the app**
   ```bash
   npm start
   ```

## 🔧 Configuration

Create a `.env` file in the `backend` folder with:

```
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
GENIUS_ACCESS_TOKEN=your_genius_token (optional)
```

### Getting Spotify Credentials

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add `http://127.0.0.1:8888/callback` as a Redirect URI
4. Copy your Client ID and Client Secret

## 🎨 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Arrow Up | Increase scroll speed (unsynced) |
| Arrow Down | Decrease scroll speed (unsynced) |
| Arrow Left | Offset lyrics backward |
| Arrow Right | Offset lyrics forward |

## 📁 Project Structure

```
lyricsOverlay2/
├── main.js          # Electron main process
├── preload.js       # Secure IPC bridge
├── index.html       # Main UI
├── styles.css       # Premium dark theme
├── renderer.js      # Frontend logic
├── package.json
└── backend/
    ├── server.py        # Python backend
    ├── spotify_client.py
    ├── lyrics_fetcher.py
    └── requirements.txt
```

## 🛠 Tech Stack

- **Frontend**: Electron.js, HTML, CSS, JavaScript
- **Backend**: Python, Spotipy, LyricsGenius
- **APIs**: Spotify Web API, LRCLIB (for synced lyrics), Genius (for unsynced lyrics)

## 📝 License

MIT License - feel free to use and modify!

---

Made with ❤️ for music lovers
