/**
 * @payswap/app — ambient module declarations for the product package.
 *
 * The shell composes the design layer's stylesheet entry plus the
 * product's own page styles as side-effect imports (mirrors the
 * @zcode/ui substrate pattern: consumers bring the tokens first, the
 * component styles second). Vite resolves both at build time; these
 * declarations keep the TypeScript program honest about them.
 */
declare module "*.css";
declare module "@zcode/ui/payswap-styles.css";
declare module "@zcode/ui/payswap-tokens.css";
