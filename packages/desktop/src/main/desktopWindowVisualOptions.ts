/*
 * @payswap/desktop — the per-platform window visual options (P12-B).
 *
 * PURE SEAM (no electron import): the window-chrome contract must be
 * unit-testable without spinning Electron. `createBrowserWindow`
 * (desktopWindowChrome.ts) consumes this verbatim; behavior for
 * darwin/win32 is byte-identical to the pre-P12-B composition.
 *
 * THE LINUX LAW (Issue #2 Lane B): the v1.2.0 product shipped a
 * frameless + transparent Linux window (`frame: false, transparent:
 * true, hasShadow: false`) whose renderer-drawn window controls only
 * mounted on the ZCode substrate's advanced-workspace surface — the
 * PaySwap product surfaces rendered NO controls at all, and the
 * transparency also strips native edge/corner resize in most Linux
 * window managers. The custom Linux frame never proved the usability
 * benefit that could justify it, so Linux now uses the NATIVE frame:
 * the WM provides close/minimize/maximize/restore, edge+corner resize,
 * titlebar drag and the Alt-menu conventions.
 */

export const MACOS_TRAFFIC_LIGHT_BASE_POSITION = { x: 22, y: 23 } as const;

export type DesktopWindowVisualOptions = {
  readonly backgroundColor: string;
  readonly frame?: boolean;
  readonly transparent?: boolean;
  readonly hasShadow?: boolean;
  readonly titleBarStyle?: "hidden";
  readonly trafficLightPosition?: { readonly x: number; readonly y: number };
  readonly vibrancy?: "under-window";
  readonly visualEffectState?: "active";
  readonly backgroundMaterial?: "acrylic";
};

/** The per-platform visual options for the main BrowserWindow (pure). */
export function resolveDesktopWindowVisualOptions(
  platform: NodeJS.Platform,
): DesktopWindowVisualOptions {
  if (platform === "darwin") {
    return {
      backgroundColor: "#00000000",
      titleBarStyle: "hidden",
      trafficLightPosition: MACOS_TRAFFIC_LIGHT_BASE_POSITION,
      vibrancy: "under-window",
      visualEffectState: "active",
    };
  }

  if (platform === "win32") {
    return {
      backgroundColor: "#00000000",
      // Windows 窗口操作由 renderer 绘制，禁用原生标题栏，避免出现两套按钮。
      frame: false,
      backgroundMaterial: "acrylic",
    };
  }

  // Linux（P12-B）：原生窗口框架。WM 提供关闭/最小化/最大化/还原、
  // 边缘+四角 resize、标题栏拖拽与 Alt 菜单约定。不再使用透明
  // frameless 实验（v1.2.0 的实际打包应用上：PaySwap 产品面没有任何
  // 窗口控件，透明窗口在多数 WM 上也没有原生 resize 边缘）。
  return {
    frame: true,
  };
}
