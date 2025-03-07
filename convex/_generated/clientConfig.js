/* eslint-disable */
/**
 * Generated production client configuration.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * Generated by convex@0.6.0.
 * To regenerate, run `npx convex codegen`.
 * @module
 */

/**
 * NOCOMMIT
 *
 * We recommend not committing this config into your main branch, because it
 * references your production deployment. Instead:
 * 1. Run `npx convex codegen` to generate your dev config and check
 *    that in.
 * 2. When you want to deploy, run `npx convex deploy` first. This will
 *    generate your production config. Then run your bundler.
 */

/**
 * The PRODUCTION Convex client configuration.
 *
 * This configuration connects your client to your production Convex deployment.
 *
 * To generate the dev version, run `npx convex dev` or `npx convex codegen`.
 *
 * Usage:
 *
 * ```ts
 * import clientConfig from "../convex/_generated/clientConfig";
 *
 * const convex = new ConvexReactClient(clientConfig);
 * ```
 */
const clientConfig = {
  address: "https://rightful-anteater-150.convex.cloud",
};
export default clientConfig;
