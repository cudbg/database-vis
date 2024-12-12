import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import preprocess from 'svelte-preprocess';



/** @type {import('vite').UserConfig} */
const config = {
	plugins: [sveltekit()],
	preprocess: preprocess(),
	kit: {
		adapter: adapter({
			pages: 'docs',
			assets: 'docs',
		}),
		paths: {
			base: '/desdr-ethiopia-demo'
		},
		appDir: 'internal', // For github pages: https://www.npmjs.com/package/@sveltejs/adapter-static/v/next
	}

};

export default config;