// vite.config.ts
import { sveltekit } from "file:///Users/txy/Desktop/db3/src/xform/node_modules/@sveltejs/kit/src/exports/vite/index.js";
import adapter from "file:///Users/txy/Desktop/db3/src/xform/node_modules/@sveltejs/adapter-static/index.js";
import preprocess from "file:///Users/txy/Desktop/db3/src/xform/node_modules/svelte-preprocess/dist/index.js";
var config = {
  plugins: [sveltekit()],
  preprocess: preprocess(),
  kit: {
    adapter: adapter({
      pages: "docs",
      assets: "docs"
    }),
    paths: {
      base: "/desdr-ethiopia-demo"
    },
    appDir: "internal"
    // For github pages: https://www.npmjs.com/package/@sveltejs/adapter-static/v/next
  }
};
var vite_config_default = config;
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvdHh5L0Rlc2t0b3AvZGIzL3NyYy94Zm9ybVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL3R4eS9EZXNrdG9wL2RiMy9zcmMveGZvcm0vdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL3R4eS9EZXNrdG9wL2RiMy9zcmMveGZvcm0vdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBzdmVsdGVraXQgfSBmcm9tICdAc3ZlbHRlanMva2l0L3ZpdGUnO1xuaW1wb3J0IGFkYXB0ZXIgZnJvbSAnQHN2ZWx0ZWpzL2FkYXB0ZXItc3RhdGljJztcbmltcG9ydCBwcmVwcm9jZXNzIGZyb20gJ3N2ZWx0ZS1wcmVwcm9jZXNzJztcblxuXG5cbi8qKiBAdHlwZSB7aW1wb3J0KCd2aXRlJykuVXNlckNvbmZpZ30gKi9cbmNvbnN0IGNvbmZpZyA9IHtcblx0cGx1Z2luczogW3N2ZWx0ZWtpdCgpXSxcblx0cHJlcHJvY2VzczogcHJlcHJvY2VzcygpLFxuXHRraXQ6IHtcblx0XHRhZGFwdGVyOiBhZGFwdGVyKHtcblx0XHRcdHBhZ2VzOiAnZG9jcycsXG5cdFx0XHRhc3NldHM6ICdkb2NzJyxcblx0XHR9KSxcblx0XHRwYXRoczoge1xuXHRcdFx0YmFzZTogJy9kZXNkci1ldGhpb3BpYS1kZW1vJ1xuXHRcdH0sXG5cdFx0YXBwRGlyOiAnaW50ZXJuYWwnLCAvLyBGb3IgZ2l0aHViIHBhZ2VzOiBodHRwczovL3d3dy5ucG1qcy5jb20vcGFja2FnZS9Ac3ZlbHRlanMvYWRhcHRlci1zdGF0aWMvdi9uZXh0XG5cdH1cblxufTtcblxuZXhwb3J0IGRlZmF1bHQgY29uZmlnOyJdLAogICJtYXBwaW5ncyI6ICI7QUFBa1IsU0FBUyxpQkFBaUI7QUFDNVMsT0FBTyxhQUFhO0FBQ3BCLE9BQU8sZ0JBQWdCO0FBS3ZCLElBQU0sU0FBUztBQUFBLEVBQ2QsU0FBUyxDQUFDLFVBQVUsQ0FBQztBQUFBLEVBQ3JCLFlBQVksV0FBVztBQUFBLEVBQ3ZCLEtBQUs7QUFBQSxJQUNKLFNBQVMsUUFBUTtBQUFBLE1BQ2hCLE9BQU87QUFBQSxNQUNQLFFBQVE7QUFBQSxJQUNULENBQUM7QUFBQSxJQUNELE9BQU87QUFBQSxNQUNOLE1BQU07QUFBQSxJQUNQO0FBQUEsSUFDQSxRQUFRO0FBQUE7QUFBQSxFQUNUO0FBRUQ7QUFFQSxJQUFPLHNCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
