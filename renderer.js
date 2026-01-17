/**
 * Lyrics Overlay Renderer
 * Handles UI updates and communication with Python backend
 */

class LyricsOverlay {
  constructor() {
    this.elements = {
      statusIndicator: document.getElementById('statusIndicator'),
      statusText: document.getElementById('statusText'),
      trackName: document.getElementById('trackName'),
      trackArtist: document.getElementById('trackArtist'),
      lyricsContainer: document.getElementById('lyricsContainer'),
      lyricsContent: document.getElementById('lyricsContent'),
      progressFill: document.getElementById('progressFill'),
      progressGlow: document.getElementById('progressGlow'),
      currentTime: document.getElementById('currentTime'),
      totalTime: document.getElementById('totalTime'),
      minimizeBtn: document.getElementById('minimizeBtn'),
      closeBtn: document.getElementById('closeBtn')
    };

    this.currentLineIndex = -1;
    this.lyrics = [];
    this.isSynced = false;
    this.startTime = null;
    this.duration = 0;
    this.progressMs = 0;

    this.init();
  }

  init() {
    // Window controls
    this.elements.minimizeBtn.addEventListener('click', () => {
      window.electronAPI.minimizeWindow();
    });

    this.elements.closeBtn.addEventListener('click', () => {
      window.electronAPI.closeWindow();
    });

    // Listen for lyrics updates from Python backend
    window.electronAPI.onLyricsUpdate((data) => {
      this.handleUpdate(data);
    });

    // Start update loop for synced lyrics
    this.startUpdateLoop();
  }

  handleUpdate(data) {
    switch (data.type) {
      case 'status':
        this.updateStatus(data.status, data.connected);
        break;
      case 'track':
        this.updateTrackInfo(data.track);
        break;
      case 'lyrics':
        this.setLyrics(data.lyrics, data.lyricsType);
        break;
      case 'progress':
        this.updateProgress(data.progressMs, data.durationMs);
        break;
      case 'no_track':
        this.showNoTrack();
        break;
      case 'no_lyrics':
        this.showNoLyrics();
        break;
      case 'error':
        this.showError(data.message);
        break;
    }
  }

  updateStatus(status, connected) {
    this.elements.statusText.textContent = status;
    this.elements.statusIndicator.className = 'pulse-indicator';
    
    if (connected === false) {
      this.elements.statusIndicator.classList.add('disconnected');
    } else if (status.includes('Loading') || status.includes('Fetching')) {
      this.elements.statusIndicator.classList.add('loading');
    }
  }

  updateTrackInfo(track) {
    if (track) {
      this.elements.trackName.textContent = track.name;
      this.elements.trackArtist.textContent = track.artist;
      this.duration = track.durationMs;
      this.elements.totalTime.textContent = this.formatTime(track.durationMs);
      this.updateStatus('Now Playing', true);
    }
  }

  setLyrics(lyrics, type) {
    this.lyrics = lyrics;
    this.isSynced = type === 'synced';
    this.currentLineIndex = -1;
    this.startTime = Date.now() - this.progressMs;

    this.elements.lyricsContent.innerHTML = '';

    if (this.isSynced) {
      // Synced lyrics - array of {time, line}
      this.lyrics.forEach((lyric, index) => {
        const line = document.createElement('div');
        line.className = 'lyric-line';
        line.textContent = lyric.line || lyric;
        line.dataset.index = index;
        this.elements.lyricsContent.appendChild(line);
      });
    } else {
      // Unsynced lyrics - plain text
      const lines = typeof lyrics === 'string' 
        ? lyrics.split('\n').filter(l => l.trim()) 
        : lyrics;
      
      lines.forEach((text, index) => {
        const line = document.createElement('div');
        line.className = 'lyric-line';
        line.textContent = typeof text === 'object' ? text.line : text;
        line.dataset.index = index;
        this.elements.lyricsContent.appendChild(line);
      });
    }

    // Add padding at top and bottom for scroll
    this.addScrollPadding();
  }

  addScrollPadding() {
    const container = this.elements.lyricsContainer;
    const paddingTop = document.createElement('div');
    const paddingBottom = document.createElement('div');
    
    paddingTop.style.height = `${container.clientHeight / 2}px`;
    paddingBottom.style.height = `${container.clientHeight / 2}px`;
    
    this.elements.lyricsContent.insertBefore(paddingTop, this.elements.lyricsContent.firstChild);
    this.elements.lyricsContent.appendChild(paddingBottom);
  }

  updateProgress(progressMs, durationMs) {
    this.progressMs = progressMs;
    this.duration = durationMs || this.duration;
    this.startTime = Date.now() - progressMs;

    // Update progress bar
    const percentage = this.duration > 0 ? (progressMs / this.duration) * 100 : 0;
    this.elements.progressFill.style.width = `${percentage}%`;
    this.elements.progressGlow.style.width = `${percentage}%`;
    this.elements.currentTime.textContent = this.formatTime(progressMs);

    // Update unsynced lyrics scroll
    if (!this.isSynced && this.lyrics.length > 0) {
      this.scrollUnsyncedLyrics(progressMs);
    }
  }

  startUpdateLoop() {
    const update = () => {
      if (this.isSynced && this.startTime && this.lyrics.length > 0) {
        this.updateSyncedLyrics();
      }
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }

  updateSyncedLyrics() {
    const elapsed = Date.now() - this.startTime;
    
    let newIndex = -1;
    for (let i = 0; i < this.lyrics.length; i++) {
      const lyricTime = this.lyrics[i].time || 0;
      if (elapsed >= lyricTime) {
        newIndex = i;
      } else {
        break;
      }
    }

    if (newIndex !== this.currentLineIndex) {
      this.highlightLine(newIndex);
      this.currentLineIndex = newIndex;
    }
  }

  scrollUnsyncedLyrics(progressMs) {
    const container = this.elements.lyricsContainer;
    const scrollableHeight = container.scrollHeight - container.clientHeight;
    
    if (scrollableHeight > 0 && this.duration > 0) {
      // Add initial delay before scrolling starts
      const delayMs = 5000;
      if (progressMs < delayMs) {
        container.scrollTop = 0;
        return;
      }
      
      const effectiveProgress = progressMs - delayMs;
      const effectiveDuration = this.duration - delayMs;
      const fraction = Math.max(0, Math.min(1, effectiveProgress / effectiveDuration));
      container.scrollTop = scrollableHeight * fraction;
    }
  }

  highlightLine(index) {
    const lines = this.elements.lyricsContent.querySelectorAll('.lyric-line');
    
    lines.forEach((line, i) => {
      const lineIndex = parseInt(line.dataset.index);
      if (isNaN(lineIndex)) return; // Skip padding elements
      
      line.classList.remove('active', 'upcoming', 'passed');
      
      if (lineIndex === index) {
        line.classList.add('active');
        // Scroll to center the active line
        this.scrollToLine(line);
      } else if (lineIndex > index) {
        line.classList.add('upcoming');
      } else {
        line.classList.add('passed');
      }
    });
  }

  scrollToLine(element) {
    const container = this.elements.lyricsContainer;
    const containerHeight = container.clientHeight;
    const elementTop = element.offsetTop;
    const elementHeight = element.clientHeight;
    
    const targetScroll = elementTop - (containerHeight / 2) + (elementHeight / 2);
    
    container.scrollTo({
      top: targetScroll,
      behavior: 'smooth'
    });
  }

  showNoTrack() {
    this.elements.trackName.textContent = 'No track playing';
    this.elements.trackArtist.textContent = 'Play something on Spotify';
    this.updateStatus('Waiting for Spotify', false);
    this.elements.progressFill.style.width = '0%';
    this.elements.progressGlow.style.width = '0%';
    this.elements.currentTime.textContent = '0:00';
    this.elements.totalTime.textContent = '0:00';
    
    this.elements.lyricsContent.innerHTML = `
      <div class="lyric-line placeholder">
        <span class="waiting-animation">♪</span> 
        Waiting for music 
        <span class="waiting-animation">♪</span>
      </div>
    `;
  }

  showNoLyrics() {
    this.elements.lyricsContent.innerHTML = `
      <div class="no-lyrics">
        <div class="no-lyrics-icon">🎵</div>
        <div class="no-lyrics-text">No lyrics found for this track</div>
      </div>
    `;
  }

  showError(message) {
    this.updateStatus('Error', false);
    this.elements.lyricsContent.innerHTML = `
      <div class="error-message">
        <div class="error-icon">⚠️</div>
        <div>${message}</div>
      </div>
    `;
  }

  formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new LyricsOverlay();
});
