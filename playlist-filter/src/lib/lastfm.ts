const LASTFM_API_BASE = 'https://ws.audioscrobbler.com/2.0/';

function getApiKey(): string {
	return import.meta.env.VITE_LASTFM_API_KEY;
}

export async function getTrackScrobbles(
	artist: string,
	track: string,
	username: string
): Promise<number> {
	const params = new URLSearchParams({
		method: 'track.getInfo',
		api_key: getApiKey(),
		artist,
		track,
		username,
		format: 'json',
		autocorrect: '1'
	});

	const res = await fetch(`${LASTFM_API_BASE}?${params}`);
	if (!res.ok) throw new Error(`Last.fm API error: ${res.status}`);

	const data = await res.json();

	if (data.error) {
		// Track not found — return 0 scrobbles
		return 0;
	}

	return parseInt(data.track?.userplaycount ?? '0', 10);
}

// Fetch scrobbles for multiple tracks with rate limiting (200ms between requests)
export async function getScrobblesForTracks(
	tracks: { artist: string; track: string }[],
	username: string,
	onProgress?: (completed: number, total: number) => void
): Promise<number[]> {
	const results: number[] = [];

	for (let i = 0; i < tracks.length; i++) {
		const { artist, track } = tracks[i];
		try {
			const count = await getTrackScrobbles(artist, track, username);
			results.push(count);
		} catch {
			results.push(0);
		}

		onProgress?.(i + 1, tracks.length);

		// Rate limit: 5 req/sec max, use 200ms delay to stay safe
		if (i < tracks.length - 1) {
			await new Promise((r) => setTimeout(r, 200));
		}
	}

	return results;
}
