import adapter from '@sveltejs/adapter-static';
import preprocess from 'svelte-preprocess';

// Help with the configs for these came from: https://github.com/duckdb-wasm-examples/sveltekit-typescript

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://github.com/sveltejs/svelte-preprocess
	// for more information about preprocessors
	preprocess: [
		preprocess({
		  postcss: true,
		}),
	  ],
	kit: {
		adapter: adapter({
			pages: 'docs',
			assets: 'docs',
		}),
		paths: {
			base: ''
		},
		prerender: {
			entries: ['/examples/[slug]']
		},
		appDir: 'internal', // For github pages: https://www.npmjs.com/package/@sveltejs/adapter-static/v/next
	}
};

export default config;