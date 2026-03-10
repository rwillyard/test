import { writable } from 'svelte/store';
import type { SpotifyTrack } from './spotify';

export const accessToken = writable<string | null>(null);
export const refreshToken = writable<string | null>(null);
export const userId = writable<string | null>(null);
export const displayName = writable<string | null>(null);

export interface TrackWithScrobbles extends SpotifyTrack {
	scrobbles: number | null; // null = not yet fetched
}

export const tracks = writable<TrackWithScrobbles[]>([]);
