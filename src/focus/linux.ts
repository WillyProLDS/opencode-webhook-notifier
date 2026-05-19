import { execWithTimeout } from "./exec.js";

interface SwayTreeNode {
  focused?: boolean;
  id?: number;
  nodes?: SwayTreeNode[];
  floating_nodes?: SwayTreeNode[];
}

function findFocusedWindowId(node: SwayTreeNode): string | null {
  if (node.focused === true && typeof node.id === "number") {
    return String(node.id);
  }

  if (Array.isArray(node.nodes)) {
    for (const child of node.nodes) {
      const id = findFocusedWindowId(child);
      if (id !== null) return id;
    }
  }

  if (Array.isArray(node.floating_nodes)) {
    for (const child of node.floating_nodes) {
      const id = findFocusedWindowId(child);
      if (id !== null) return id;
    }
  }

  return null;
}

function getHyprlandActiveWindowId(): string | null {
  const output = execWithTimeout("hyprctl activewindow -j");
  if (!output) return null;
  try {
    const data = JSON.parse(output) as { address?: unknown };
    return typeof data?.address === "string" ? data.address : null;
  } catch {
    return null;
  }
}

function getSwayActiveWindowId(): string | null {
  const output = execWithTimeout("swaymsg -t get_tree", 1000);
  if (!output) return null;
  try {
    const tree = JSON.parse(output) as SwayTreeNode;
    return findFocusedWindowId(tree);
  } catch {
    return null;
  }
}

function getNiriActiveWindowId(): string | null {
  const output = execWithTimeout("niri msg --json focused-window", 1000);
  if (!output) return null;
  try {
    const data = JSON.parse(output) as { id?: unknown };
    return typeof data?.id === "number" ? String(data.id) : null;
  } catch {
    return null;
  }
}

export function getLinuxWaylandActiveWindowId(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.HYPRLAND_INSTANCE_SIGNATURE) return getHyprlandActiveWindowId();
  if (env.NIRI_SOCKET) return getNiriActiveWindowId();
  if (env.SWAYSOCK) return getSwayActiveWindowId();
  if (env.KDE_SESSION_VERSION) return execWithTimeout("kdotool getactivewindow");
  return null;
}

export function getLinuxActiveWindowId(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.WAYLAND_DISPLAY) return getLinuxWaylandActiveWindowId(env);
  if (env.DISPLAY) return execWithTimeout("xdotool getactivewindow");
  return null;
}
