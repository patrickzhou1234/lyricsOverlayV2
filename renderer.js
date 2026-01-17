/**
 * Lyrics Overlay Renderer
 * Handles UI updates and communication with Python backend
 */

// Dynamically import the audioMotion analyzer
let AudioMotionAnalyzer = null;

class LyricsOverlay {
  constructor() {
    this.elements = {
      overlay: document.getElementById('overlay'),
      statusIndicator: document.getElementById('statusIndicator'),
      statusText: document.getElementById('statusText'),
      trackName: document.getElementById('trackName'),
      trackArtist: document.getElementById('trackArtist'),
      albumArt: document.getElementById('albumArt'),
      albumArtPlaceholder: document.getElementById('albumArtPlaceholder'),
      lyricsContainer: document.getElementById('lyricsContainer'),
      lyricsContent: document.getElementById('lyricsContent'),
      progressFill: document.getElementById('progressFill'),
      progressGlow: document.getElementById('progressGlow'),
      currentTime: document.getElementById('currentTime'),
      totalTime: document.getElementById('totalTime'),
      minimizeBtn: document.getElementById('minimizeBtn'),
      closeBtn: document.getElementById('closeBtn'),
      dragBtn: document.getElementById('dragBtn'),
      settingsBtn: document.getElementById('settingsBtn'),
      settingsPanel: document.getElementById('settingsPanel'),
      settingsClose: document.getElementById('settingsClose'),
      opacitySlider: document.getElementById('opacitySlider'),
      opacityValue: document.getElementById('opacityValue'),
      enableVizBtn: document.getElementById('enableVizBtn'),
      visualizerContainer: document.getElementById('visualizerContainer'),
      titleBar: document.getElementById('titleBar'),
      styleBtns: document.querySelectorAll('.style-btn')
    };

    this.currentLineIndex = -1;
    this.lyrics = [];
    this.isSynced = false;
    this.startTime = null;
    this.duration = 0;
    this.progressMs = 0;
    this.audioMotion = null;
    this.audioStream = null;
    this.currentLyricStyle = 'default';
    
    // Drag state
    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

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

    // Settings panel
    this.elements.settingsBtn.addEventListener('click', () => {
      this.toggleSettings();
    });

    this.elements.settingsClose.addEventListener('click', () => {
      this.closeSettings();
    });

    // Opacity slider
    this.elements.opacitySlider.addEventListener('input', (e) => {
      const value = e.target.value;
      this.elements.opacityValue.textContent = `${value}%`;
      document.documentElement.style.setProperty('--overlay-opacity', value / 100);
      window.electronAPI.setOpacity(value / 100);
    });

    // Lyric style buttons
    this.elements.styleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const style = btn.dataset.style;
        this.setLyricStyle(style);
        
        // Update active state
        this.elements.styleBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Visualization button
    this.elements.enableVizBtn.addEventListener('click', () => {
      this.enableVisualization();
    });

    // Click-through handling - enable mouse when hovering interactive areas
    this.setupClickThrough();
    
    // Setup drag handle for window movement
    this.setupDragHandle();

    // Listen for lyrics updates from Python backend
    window.electronAPI.onLyricsUpdate((data) => {
      this.handleUpdate(data);
    });

    // Album art loading
    this.elements.albumArt.addEventListener('load', () => {
      this.elements.albumArt.classList.add('loaded');
    });

    this.elements.albumArt.addEventListener('error', () => {
      this.elements.albumArt.classList.remove('loaded');
    });

    // Start update loop for synced lyrics
    this.startUpdateLoop();
    
    // Auto-enable visualization on startup
    setTimeout(() => {
      this.enableVisualization();
    }, 1000);
  }

  setupClickThrough() {
    // Interactive elements that should enable mouse events
    const interactiveElements = [
      this.elements.titleBar,
      this.elements.settingsPanel,
      this.elements.dragBtn
    ];

    interactiveElements.forEach(el => {
      if (el) {
        el.addEventListener('mouseenter', () => {
          window.electronAPI.setIgnoreMouse(false);
        });
        el.addEventListener('mouseleave', () => {
          // Only re-enable click-through if settings panel is closed and not dragging
          if (!this.elements.settingsPanel.classList.contains('open') && !this.isDragging) {
            window.electronAPI.setIgnoreMouse(true);
          }
        });
      }
    });
  }

  setupDragHandle() {
    const dragBtn = this.elements.dragBtn;
    if (!dragBtn) return;

    dragBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.isDragging = true;
      this.lastMouseX = e.screenX;
      this.lastMouseY = e.screenY;
      window.electronAPI.startDrag();
      dragBtn.classList.add('dragging');
    });

    // Use document-level events to capture mouse even when moving fast
    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      
      const deltaX = e.screenX - this.lastMouseX;
      const deltaY = e.screenY - this.lastMouseY;
      
      if (deltaX !== 0 || deltaY !== 0) {
        window.electronAPI.moveWindow(deltaX, deltaY);
        this.lastMouseX = e.screenX;
        this.lastMouseY = e.screenY;
      }
    });

    document.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        window.electronAPI.endDrag();
        dragBtn.classList.remove('dragging');
        
        // Re-enable click-through if settings panel is closed
        if (!this.elements.settingsPanel.classList.contains('open')) {
          window.electronAPI.setIgnoreMouse(true);
        }
      }
    });
  }

  toggleSettings() {
    const isOpen = this.elements.settingsPanel.classList.toggle('open');
    if (isOpen) {
      window.electronAPI.setIgnoreMouse(false);
    } else {
      window.electronAPI.setIgnoreMouse(true);
    }
  }

  closeSettings() {
    this.elements.settingsPanel.classList.remove('open');
    window.electronAPI.setIgnoreMouse(true);
  }

  setLyricStyle(style) {
    // Remove all lyric style classes
    document.body.classList.remove(
      'lyric-style-default',
      'lyric-style-cyberpunk',
      'lyric-style-ethereal',
      'lyric-style-retro'
    );
    // Add new style class
    document.body.classList.add(`lyric-style-${style}`);
    this.currentLyricStyle = style;
  }

  async enableVisualization() {
    try {
      const isMac = window.electronAPI.platform === 'darwin';
      
      if (isMac) {
        // On macOS, show instructions before prompting
        this.elements.enableVizBtn.textContent = 'Select Spotify Tab...';
      }
      
      console.log('Requesting display media for audio capture...');
      
      // Request screen capture with audio
      // On Windows: Electron's handler provides loopback audio automatically
      // On macOS: User will be prompted to select a browser tab (use Spotify Web Player)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      console.log('Got stream:', stream);
      console.log('Audio tracks:', stream.getAudioTracks().length);
      console.log('Video tracks:', stream.getVideoTracks().length);

      // Stop the video track (we only need audio)
      stream.getVideoTracks().forEach(track => {
        console.log('Stopping video track:', track.label);
        track.stop();
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        console.error('No audio track in stream - audio capture may not be supported');
        if (isMac) {
          this.elements.enableVizBtn.textContent = 'No Audio - Select a Browser Tab';
        } else {
          this.elements.enableVizBtn.textContent = 'No Audio Available';
        }
        return;
      }

      console.log('Audio track:', audioTracks[0].label);
      this.audioStream = stream;
      
      // Initialize audioMotion analyzer
      await this.initializeVisualizer(stream);
      
      this.elements.enableVizBtn.textContent = 'Visualization Active';
      this.elements.enableVizBtn.classList.add('active');
      this.closeSettings();
    } catch (err) {
      console.error('Error enabling visualization:', err);
      const isMac = window.electronAPI.platform === 'darwin';
      if (isMac) {
        // More helpful error message for macOS users
        this.elements.enableVizBtn.textContent = 'Use Spotify Web Player';
        this.elements.enableVizBtn.title = 'Open Spotify in your browser, then click here and select that tab';
      } else {
        this.elements.enableVizBtn.textContent = 'Failed - Try Again';
      }
    }
  }

  async initializeVisualizer(stream) {
    // Dynamically import the analyzer
    if (!AudioMotionAnalyzer) {
      const module = await import('./audioMotion-analyzer.js');
      AudioMotionAnalyzer = module.default;
    }

    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);

    this.audioMotion = new AudioMotionAnalyzer(this.elements.visualizerContainer, {
      source: source,
      audioCtx: audioCtx,
      mode: 10,
      gradient: 'rainbow',
      lineWidth: 2,
      fillAlpha: 0.6,
      showPeaks: false,
      showScaleX: false,
      showScaleY: false,
      overlay: true,
      showBgColor: false,
      connectSpeakers: false,
      smoothing: 0.7
    });

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
      
      // Update album art
      if (track.albumArt) {
        this.elements.albumArt.src = track.albumArt;
      } else {
        this.elements.albumArt.classList.remove('loaded');
        this.elements.albumArt.src = '';
      }
      
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
    
    // Clear album art
    this.elements.albumArt.classList.remove('loaded');
    this.elements.albumArt.src = '';
    
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
