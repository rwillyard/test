<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { exchangeCode, getCurrentUser } from '$lib/spotify';
	import { accessToken, refreshToken, userId, displayName } from '$lib/stores';

	let error = $state('');

	onMount(async () => {
		const params = new URLSearchParams(window.location.search);
		const code = params.get('code');
		const authError = params.get('error');

		if (authError) {
			error = `Spotify auth error: ${authError}`;
			return;
		}

		if (!code) {
			error = 'No authorization code received';
			return;
		}

		try {
			const tokens = await exchangeCode(code);
			accessToken.set(tokens.access_token);
			refreshToken.set(tokens.refresh_token);

			const user = await getCurrentUser(tokens.access_token);
			userId.set(user.id);
			displayName.set(user.display_name);

			goto('/');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Authentication failed';
		}
	});
</script>

<div>
	{#if error}
		<p>{error}</p>
		<a href="/">Back to home</a>
	{:else}
		<p>Logging in...</p>
	{/if}
</div>
