<script lang="ts">
	import { startAuth, getPlaylistTracks, parsePlaylistId, createPlaylist, addTracksToPlaylist } from '$lib/spotify';
	import { getScrobblesForTracks } from '$lib/lastfm';
	import { accessToken, refreshToken, userId, displayName, tracks } from '$lib/stores';
	import type { TrackWithScrobbles } from '$lib/stores';

	let token = $state<string | null>(null);
	let user = $state<string | null>(null);
	let userDisplayName = $state<string | null>(null);

	let playlistInput = $state('');
	let lastfmUsername = $state('');
	let minScrobbles = $state(1);
	let newPlaylistName = $state('');

	let trackList = $state<TrackWithScrobbles[]>([]);
	let loading = $state(false);
	let fetchingScrobbles = $state(false);
	let scrobbleProgress = $state({ done: 0, total: 0 });
	let creating = $state(false);
	let statusMessage = $state('');
	let errorMessage = $state('');

	// Subscribe to stores
	accessToken.subscribe((v) => (token = v));
	userId.subscribe((v) => (user = v));
	displayName.subscribe((v) => (userDisplayName = v));
	tracks.subscribe((v) => (trackList = v));

	function login() {
		startAuth();
	}

	function logout() {
		accessToken.set(null);
		refreshToken.set(null);
		userId.set(null);
		displayName.set(null);
		tracks.set([]);
		statusMessage = '';
		errorMessage = '';
	}

	async function loadPlaylist() {
		errorMessage = '';
		const id = parsePlaylistId(playlistInput);
		if (!id) {
			errorMessage = 'Invalid playlist URL or ID';
			return;
		}
		if (!token) return;

		loading = true;
		try {
			const fetched = await getPlaylistTracks(token, id);
			tracks.set(fetched.map((t) => ({ ...t, scrobbles: null })));
			statusMessage = `Loaded ${fetched.length} tracks`;
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Failed to load playlist';
		} finally {
			loading = false;
		}
	}

	async function fetchScrobbles() {
		if (!lastfmUsername.trim() || trackList.length === 0) return;
		errorMessage = '';
		fetchingScrobbles = true;
		scrobbleProgress = { done: 0, total: trackList.length };

		try {
			const trackInputs = trackList.map((t) => ({
				artist: t.artists[0]?.name ?? '',
				track: t.name
			}));

			const counts = await getScrobblesForTracks(
				trackInputs,
				lastfmUsername.trim(),
				(done, total) => {
					scrobbleProgress = { done, total };
				}
			);

			tracks.update((list) =>
				list.map((t, i) => ({ ...t, scrobbles: counts[i] }))
			);
			statusMessage = 'Scrobble counts loaded';
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Failed to fetch scrobbles';
		} finally {
			fetchingScrobbles = false;
		}
	}

	function filteredTracks(): TrackWithScrobbles[] {
		return trackList.filter((t) => t.scrobbles !== null && t.scrobbles >= minScrobbles);
	}

	async function createFilteredPlaylist() {
		if (!token || !user) return;
		const filtered = filteredTracks();
		if (filtered.length === 0) {
			errorMessage = 'No tracks match the filter';
			return;
		}

		const name = newPlaylistName.trim() || `Filtered (${minScrobbles}+ scrobbles)`;
		errorMessage = '';
		creating = true;

		try {
			const playlistId = await createPlaylist(token, user, name);
			await addTracksToPlaylist(
				token,
				playlistId,
				filtered.map((t) => t.uri)
			);
			statusMessage = `Created playlist "${name}" with ${filtered.length} tracks!`;
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Failed to create playlist';
		} finally {
			creating = false;
		}
	}

	function hasScrobbles(): boolean {
		return trackList.some((t) => t.scrobbles !== null);
	}
</script>

<main>
	<h1>Playlist Scrobble Filter</h1>

	{#if !token}
		<section class="auth">
			<p>Connect your Spotify account to get started.</p>
			<button onclick={login}>Login with Spotify</button>
		</section>
	{:else}
		<section class="user-info">
			<span>Logged in as <strong>{userDisplayName}</strong></span>
			<button onclick={logout} class="small">Logout</button>
		</section>

		<!-- Step 1: Load playlist -->
		<section>
			<h2>1. Load a Playlist</h2>
			<div class="input-row">
				<input
					type="text"
					bind:value={playlistInput}
					placeholder="Paste Spotify playlist URL or ID"
				/>
				<button onclick={loadPlaylist} disabled={loading || !playlistInput.trim()}>
					{loading ? 'Loading...' : 'Load'}
				</button>
			</div>
		</section>

		<!-- Step 2: Fetch scrobbles -->
		{#if trackList.length > 0}
			<section>
				<h2>2. Fetch Scrobble Counts</h2>
				<div class="input-row">
					<input
						type="text"
						bind:value={lastfmUsername}
						placeholder="Your Last.fm username"
					/>
					<button
						onclick={fetchScrobbles}
						disabled={fetchingScrobbles || !lastfmUsername.trim()}
					>
						{fetchingScrobbles
							? `${scrobbleProgress.done}/${scrobbleProgress.total}`
							: 'Fetch Scrobbles'}
					</button>
				</div>
			</section>
		{/if}

		<!-- Step 3: Filter and create -->
		{#if hasScrobbles()}
			<section>
				<h2>3. Filter & Create Playlist</h2>
				<div class="input-row">
					<label>
						Min scrobbles:
						<input type="number" bind:value={minScrobbles} min="0" style="width: 80px" />
					</label>
					<span class="count">{filteredTracks().length} of {trackList.length} tracks</span>
				</div>
				<div class="input-row">
					<input
						type="text"
						bind:value={newPlaylistName}
						placeholder="New playlist name (optional)"
					/>
					<button onclick={createFilteredPlaylist} disabled={creating || filteredTracks().length === 0}>
						{creating ? 'Creating...' : 'Create Playlist'}
					</button>
				</div>
			</section>
		{/if}

		<!-- Track list -->
		{#if trackList.length > 0}
			<section>
				<h2>Tracks</h2>
				<table>
					<thead>
						<tr>
							<th>#</th>
							<th>Track</th>
							<th>Artist</th>
							<th>Scrobbles</th>
						</tr>
					</thead>
					<tbody>
						{#each trackList as track, i}
							{@const included = track.scrobbles !== null && track.scrobbles >= minScrobbles}
							<tr class:excluded={track.scrobbles !== null && !included}>
								<td>{i + 1}</td>
								<td>{track.name}</td>
								<td>{track.artists.map((a) => a.name).join(', ')}</td>
								<td class="scrobble-count">
									{track.scrobbles !== null ? track.scrobbles : '—'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{/if}

		{#if statusMessage}
			<p class="status">{statusMessage}</p>
		{/if}
		{#if errorMessage}
			<p class="error">{errorMessage}</p>
		{/if}
	{/if}
</main>

<style>
	:global(body) {
		margin: 0;
		background: #121212;
		color: #e0e0e0;
		font-family: system-ui, -apple-system, sans-serif;
	}

	main {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem 1rem;
	}

	h1 {
		color: #1db954;
		margin-bottom: 1.5rem;
	}

	h2 {
		font-size: 1.1rem;
		color: #b3b3b3;
		margin-bottom: 0.5rem;
	}

	section {
		margin-bottom: 1.5rem;
	}

	.auth {
		text-align: center;
		margin-top: 3rem;
	}

	.user-info {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.input-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	input[type='text'],
	input[type='number'] {
		background: #282828;
		border: 1px solid #444;
		color: #e0e0e0;
		padding: 0.5rem 0.75rem;
		border-radius: 4px;
		font-size: 0.9rem;
	}

	input[type='text'] {
		flex: 1;
	}

	button {
		background: #1db954;
		color: #000;
		border: none;
		padding: 0.5rem 1.25rem;
		border-radius: 4px;
		font-weight: 600;
		cursor: pointer;
		font-size: 0.9rem;
	}

	button:hover:not(:disabled) {
		background: #1ed760;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	button.small {
		background: transparent;
		color: #b3b3b3;
		border: 1px solid #444;
		padding: 0.25rem 0.75rem;
		font-size: 0.8rem;
	}

	.count {
		color: #b3b3b3;
		font-size: 0.9rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	th {
		text-align: left;
		padding: 0.5rem;
		border-bottom: 1px solid #333;
		color: #b3b3b3;
		font-weight: normal;
	}

	td {
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid #1e1e1e;
	}

	tr.excluded {
		opacity: 0.35;
	}

	.scrobble-count {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.status {
		color: #1db954;
	}

	.error {
		color: #e33;
	}
</style>
