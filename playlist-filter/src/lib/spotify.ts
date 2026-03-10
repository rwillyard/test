const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

const SCOPES = [
	'playlist-read-private',
	'playlist-modify-public',
	'playlist-modify-private'
].join(' ');

function getClientId(): string {
	return import.meta.env.VITE_SPOTIFY_CLIENT_ID;
}

function getRedirectUri(): string {
	return `${window.location.origin}/auth/callback`;
}

// PKCE helpers
function generateRandomString(length: number): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	const values = crypto.getRandomValues(new Uint8Array(length));
	return Array.from(values, (v) => chars[v % chars.length]).join('');
}

async function sha256(plain: string): Promise<ArrayBuffer> {
	const encoder = new TextEncoder();
	return crypto.subtle.digest('SHA-256', encoder.encode(plain));
}

function base64UrlEncode(buffer: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(buffer)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

export async function startAuth(): Promise<void> {
	const verifier = generateRandomString(64);
	const challenge = base64UrlEncode(await sha256(verifier));

	sessionStorage.setItem('code_verifier', verifier);

	const params = new URLSearchParams({
		client_id: getClientId(),
		response_type: 'code',
		redirect_uri: getRedirectUri(),
		scope: SCOPES,
		code_challenge_method: 'S256',
		code_challenge: challenge
	});

	window.location.href = `${SPOTIFY_AUTH_URL}?${params}`;
}

export async function exchangeCode(code: string): Promise<{
	access_token: string;
	refresh_token: string;
	expires_in: number;
}> {
	const verifier = sessionStorage.getItem('code_verifier');
	if (!verifier) throw new Error('No code verifier found');

	const res = await fetch(SPOTIFY_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: getClientId(),
			grant_type: 'authorization_code',
			code,
			redirect_uri: getRedirectUri(),
			code_verifier: verifier
		})
	});

	if (!res.ok) {
		const err = await res.json();
		throw new Error(err.error_description || 'Token exchange failed');
	}

	sessionStorage.removeItem('code_verifier');
	return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{
	access_token: string;
	refresh_token: string;
	expires_in: number;
}> {
	const res = await fetch(SPOTIFY_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: getClientId(),
			grant_type: 'refresh_token',
			refresh_token: refreshToken
		})
	});

	if (!res.ok) throw new Error('Token refresh failed');
	return res.json();
}

export async function getCurrentUser(token: string): Promise<{ id: string; display_name: string }> {
	const res = await fetch(`${SPOTIFY_API_BASE}/me`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!res.ok) throw new Error('Failed to fetch user profile');
	return res.json();
}

export interface SpotifyTrack {
	id: string;
	name: string;
	artists: { name: string }[];
	album: { name: string };
	uri: string;
}

export async function getPlaylistTracks(
	token: string,
	playlistId: string
): Promise<SpotifyTrack[]> {
	const tracks: SpotifyTrack[] = [];
	let url: string | null =
		`${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks?limit=50`;

	while (url) {
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${token}` }
		});
		if (!res.ok) throw new Error('Failed to fetch playlist tracks');

		const data = await res.json();
		for (const item of data.items) {
			if (item.track && item.track.id) {
				tracks.push({
					id: item.track.id,
					name: item.track.name,
					artists: item.track.artists,
					album: item.track.album,
					uri: item.track.uri
				});
			}
		}
		url = data.next;
	}

	return tracks;
}

export function parsePlaylistId(input: string): string | null {
	// Handle full URLs like https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
	const urlMatch = input.match(/playlist\/([a-zA-Z0-9]+)/);
	if (urlMatch) return urlMatch[1];

	// Handle spotify URIs like spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
	const uriMatch = input.match(/spotify:playlist:([a-zA-Z0-9]+)/);
	if (uriMatch) return uriMatch[1];

	// Handle plain ID
	if (/^[a-zA-Z0-9]+$/.test(input.trim())) return input.trim();

	return null;
}

export async function createPlaylist(
	token: string,
	userId: string,
	name: string
): Promise<string> {
	const res = await fetch(`${SPOTIFY_API_BASE}/users/${userId}/playlists`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ name, public: false })
	});

	if (!res.ok) throw new Error('Failed to create playlist');
	const data = await res.json();
	return data.id;
}

export async function addTracksToPlaylist(
	token: string,
	playlistId: string,
	uris: string[]
): Promise<void> {
	// Spotify allows max 100 tracks per request
	for (let i = 0; i < uris.length; i += 100) {
		const batch = uris.slice(i, i + 100);
		const res = await fetch(`${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ uris: batch })
		});
		if (!res.ok) throw new Error('Failed to add tracks to playlist');
	}
}
