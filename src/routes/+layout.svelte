<script lang="ts">
  import { setContext } from 'svelte';
  import { writable } from 'svelte/store';
  import './styles.css';
  let user = writable(null);
  setContext("user", user);
</script>


<div class="container px-10 py-5 mx-auto md-auto">
	<main>
		<slot />
	</main>


	<footer class="text-center px-4 py-2">
		<p>footer</p>
	</footer>
</div>


<style>
	footer a {
		font-weight: bold;
		color: rgb(0, 145, 255);
	}
</style>
