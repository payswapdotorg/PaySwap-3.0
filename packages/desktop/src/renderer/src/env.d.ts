/**
 * @zcode/desktop renderer — ambient module declarations (P9-A).
 *
 * The renderer is bundled by Vite, which resolves `.css` side-effect
 * imports natively; TypeScript needs the ambient declaration to match.
 * (Same pattern as packages/web and packages/payswap-app env.d.ts.)
 */

declare module "*.css";
