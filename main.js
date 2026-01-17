const { app, BrowserWindow, ipcMain, desktopCapturer, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let pythonProcess = null;
let currentOpacity = 0.92;

function createWindow() {
  // Get screen dimensions
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // Create the overlay window
  mainWindow = new BrowserWindow({
    width: 900,
    height: 320,
    x: Math.floor((screenWidth - 900) / 2),
    y: screenHeight - 360,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Set up display media request handler for screen/audio capture
  // On Windows, we can use loopback audio to capture system audio automatically
  // On macOS, we skip this so the user can pick a browser tab (for Spotify Web Player)
  if (process.platform === 'win32') {
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
        // Use the primary screen with loopback audio
        callback({ video: sources[0], audio: 'loopback' });
      });
    });
  }

  mainWindow.loadFile('index.html');
  
  // Enable click-through by default with mouse event forwarding
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (pythonProcess) {
      pythonProcess.kill();
    }
  });
}

function startPythonBackend() {
  const isPackaged = app.isPackaged;
  let pythonPath;
  let scriptPath;
  let args;

  if (isPackaged) {
    // In production, we use the bundled executable
    const executableName = process.platform === 'win32' ? 'lyrics-backend.exe' : 'lyrics-backend';
    pythonPath = path.join(process.resourcesPath, executableName);
    args = [];
    console.log('Production: Using bundled backend at', pythonPath);
  } else {
    // In development, we use the python interpreter and the script
    // On macOS/Linux, it's often 'python3', on Windows it's usually 'python'
    pythonPath = process.platform === 'win32' ? 'python' : 'python3';
    scriptPath = path.join(__dirname, 'backend', 'server.py');
    args = [scriptPath];
    console.log(`Development: Using ${pythonPath} script at`, scriptPath);
  }
  
  pythonProcess = spawn(pythonPath, args, {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Buffer for incomplete JSON messages
  let buffer = '';
  
  pythonProcess.stdout.on('data', (data) => {
    buffer += data.toString();
    
    // Split by newlines and process each complete line
    const lines = buffer.split('\n');
    // Keep the last potentially incomplete line in the buffer
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      console.log('Python:', trimmed);
      
      try {
        const parsed = JSON.parse(trimmed);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('lyrics-update', parsed);
        }
      } catch (e) {
        // Not JSON, just log it
        console.log('Parse error for:', trimmed.substring(0, 100));
      }
    }
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error('Python Error:', data.toString());
  });

  pythonProcess.on('close', (code) => {
    console.log(`Python process exited with code ${code}`);
  });
}

app.whenReady().then(() => {
  createWindow();
  startPythonBackend();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// Window dragging handlers
let dragStartPos = null;

ipcMain.on('window-start-drag', () => {
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition();
    dragStartPos = { x, y };
  }
});

ipcMain.on('window-move', (event, deltaX, deltaY) => {
  if (mainWindow && dragStartPos) {
    const [currentX, currentY] = mainWindow.getPosition();
    mainWindow.setPosition(currentX + deltaX, currentY + deltaY);
  }
});

ipcMain.on('window-end-drag', () => {
  dragStartPos = null;
});

// Toggle click-through for specific interactive areas
ipcMain.on('set-ignore-mouse', (event, ignore) => {
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

// Set overlay opacity
ipcMain.on('set-opacity', (event, opacity) => {
  currentOpacity = opacity;
  if (mainWindow) {
    mainWindow.webContents.send('opacity-changed', opacity);
  }
});

// Get desktop sources for audio capture
ipcMain.handle('get-desktop-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({ 
      types: ['screen'],
      fetchWindowIcons: false 
    });
    return sources.map(source => ({
      id: source.id,
      name: source.name
    }));
  } catch (e) {
    console.error('Error getting desktop sources:', e);
    return [];
  }
});
