/**
 * @payswap/app — the product link (in-app navigation with honest hrefs).
 *
 * Every product link renders a REAL href (deep-linkable, keyboard- and
 * middle-click-friendly, and assertable by the no-dead-links oracle).
 * When the platform navigation adapter is present, plain left-clicks are
 * intercepted and routed through it (web: history push; desktop: hash
 * routing) so the surface never full-reloads. Modified clicks (cmd/ctrl,
 * middle button, keyboard modifiers) always fall through to the browser.
 */

import type { AnchorHTMLAttributes, MouseEvent } from "react";
import type { PaySwapNavigation } from "./navigation.js";

export interface ProductLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly to: string;
  readonly navigation?: PaySwapNavigation;
}

export function ProductLink({ to, navigation, onClick, ...rest }: ProductLinkProps) {
  return (
    <a
      href={to}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) {
          return;
        }
        // Modified clicks keep the browser's native behavior.
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.altKey ||
          event.ctrlKey ||
          event.shiftKey
        ) {
          return;
        }
        const target = rest.target;
        if (target != null && target !== "_self") {
          return;
        }
        if (navigation != null && to.startsWith("/")) {
          event.preventDefault();
          navigation.navigate(to);
        }
      }}
      {...rest}
    />
  );
}
