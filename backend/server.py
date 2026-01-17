"""
Python backend server for Lyrics Overlay.
Communicates with Electron frontend via JSON stdout.
"""
import sys
import os
import time
import json
import threading
from dotenv import load_dotenv

# Load environment variables from backend directory
backend_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(backend_dir, '.env')
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    # Try parent directory
    parent_env = os.path.join(os.path.dirname(backend_dir), '.env')
    if os.path.exists(parent_env):
        load_dotenv(parent_env)

# Add backend directory to path for local imports
sys.path.insert(0, backend_dir)

from spotify_client import SpotifyClient
from lyrics_fetcher import LyricsFetcher


def send_message(data):
    """Send JSON message to Electron frontend."""
    print(json.dumps(data), flush=True)


class LyricsBackend:
    def __init__(self):
        self.spotify_client = None
        self.lyrics_fetcher = LyricsFetcher()
        self.current_track_id = None
        self.monitoring = True
        
        # Initialize Spotify client
        try:
            self.spotify_client = SpotifyClient()
            send_message({
                'type': 'status',
                'status': 'Connected to Spotify',
                'connected': True
            })
        except Exception as e:
            send_message({
                'type': 'status',
                'status': f'Spotify connection failed: {str(e)}',
                'connected': False
            })
    
    def start_monitoring(self):
        """Start monitoring Spotify for currently playing track."""
        if not self.spotify_client:
            send_message({
                'type': 'error',
                'message': 'Spotify client not initialized. Check your .env file.'
            })
            return
        
        send_message({
            'type': 'status',
            'status': 'Monitoring Spotify...',
            'connected': True
        })
        
        while self.monitoring:
            try:
                track = self.spotify_client.get_current_track()
                
                if track:
                    track_id = f"{track['name']} - {track['artist']}"
                    
                    # Send progress update
                    send_message({
                        'type': 'progress',
                        'progressMs': track.get('progress_ms', 0),
                        'durationMs': track.get('duration_ms', 0)
                    })
                    
                    # New track detected
                    if track_id != self.current_track_id:
                        self.current_track_id = track_id
                        
                        # Send track info
                        send_message({
                            'type': 'track',
                            'track': {
                                'name': track['name'],
                                'artist': track['artist'],
                                'album': track['album'],
                                'durationMs': track['duration_ms']
                            }
                        })
                        
                        # Fetch lyrics
                        self.fetch_and_send_lyrics(track)
                else:
                    if self.current_track_id:
                        self.current_track_id = None
                        send_message({'type': 'no_track'})
                
                time.sleep(1)
                
            except Exception as e:
                send_message({
                    'type': 'error',
                    'message': str(e)
                })
                time.sleep(5)
    
    def fetch_and_send_lyrics(self, track):
        """Fetch and send lyrics for the current track."""
        send_message({
            'type': 'status',
            'status': f'Fetching lyrics...',
            'connected': True
        })
        
        lyrics_data = self.lyrics_fetcher.fetch_lyrics(
            track['name'],
            track['artist'],
            track['album'],
            track['duration_ms'] / 1000
        )
        
        if lyrics_data:
            send_message({
                'type': 'lyrics',
                'lyrics': lyrics_data['lyrics'],
                'lyricsType': lyrics_data['type']
            })
            send_message({
                'type': 'status',
                'status': f'{lyrics_data["type"].capitalize()} lyrics loaded',
                'connected': True
            })
        else:
            send_message({'type': 'no_lyrics'})
            send_message({
                'type': 'status',
                'status': 'No lyrics found',
                'connected': True
            })


def main():
    # Disable buffering for real-time communication
    sys.stdout.reconfigure(line_buffering=True)
    
    send_message({
        'type': 'status',
        'status': 'Starting...',
        'connected': None
    })
    
    backend = LyricsBackend()
    backend.start_monitoring()


if __name__ == '__main__':
    main()
