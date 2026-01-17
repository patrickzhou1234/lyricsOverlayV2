"""
Lyrics fetcher that uses LRCLIB for synced lyrics and Genius for unsynced lyrics.
"""
import os
import re
import requests
import lyricsgenius

class LyricsFetcher:
    def __init__(self):
        self.genius_token = os.getenv('GENIUS_ACCESS_TOKEN')
        self.genius = None
        self.lrc_api_url = "https://lrclib.net/api/get"

        if self.genius_token:
            try:
                self.genius = lyricsgenius.Genius(self.genius_token)
            except Exception as e:
                print(f"Warning: Could not initialize Genius client: {e}")

    def get_lyrics_lrc(self, track_name, artist_name, album_name, duration):
        """Get synced lyrics from LRCLIB."""
        try:
            params = {
                'track_name': track_name,
                'artist_name': artist_name,
                'album_name': album_name,
                'duration': duration
            }
            response = requests.get(self.lrc_api_url, params=params)
            response.raise_for_status()
            data = response.json()

            if data and data.get('syncedLyrics'):
                return {
                    'type': 'synced',
                    'lyrics': self.parse_lrc(data['syncedLyrics'])
                }
            elif data and data.get('plainLyrics'):
                return {
                    'type': 'unsynced',
                    'lyrics': data['plainLyrics']
                }
            return None
        except requests.exceptions.RequestException as e:
            print(f"Error fetching LRCLIB lyrics: {e}")
            return None

    def parse_lrc(self, lrc_text):
        """Parse LRC format lyrics into a list of dictionaries."""
        lyrics = []
        for line in lrc_text.splitlines():
            match = re.match(r'\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)', line)
            if match:
                minutes, seconds, milliseconds, text = match.groups()
                time_ms = int(minutes) * 60000 + int(seconds) * 1000 + int(milliseconds)
                lyrics.append({'time': time_ms, 'line': text.strip()})
        return lyrics

    def get_lyrics_genius(self, track_name, artist_name):
        """Get unsynced lyrics from Genius."""
        if not self.genius:
            return None

        try:
            song = self.genius.search_song(track_name, artist_name)
            if song:
                return {
                    'type': 'unsynced',
                    'lyrics': song.lyrics
                }
            return None
        except Exception as e:
            print(f"Error fetching Genius lyrics: {e}")
            return None

    def fetch_lyrics(self, track_name, artist_name, album_name, duration):
        """Fetch lyrics, preferring synced from LRCLIB."""
        # Try LRCLIB first
        lrc_result = self.get_lyrics_lrc(track_name, artist_name, album_name, duration)
        if lrc_result:
            print("Lyrics found on LRCLIB")
            return lrc_result

        # Fallback to Genius
        print("No synced lyrics found on LRCLIB, falling back to Genius")
        genius_result = self.get_lyrics_genius(track_name, artist_name)
        if genius_result:
            print("Lyrics found on Genius")
            return genius_result
            
        return None

