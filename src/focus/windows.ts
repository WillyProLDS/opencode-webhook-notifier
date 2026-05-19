import { execFileWithTimeout } from "./exec.js";

const POWERSHELL_SCRIPT =
  "$type=Add-Type -Name FocusHelper -Namespace OpenCodeNotifier -MemberDefinition '[DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();' -PassThru; $type::GetForegroundWindow()";

export function getWindowsActiveWindowId(): string | null {
  let windowId = execFileWithTimeout(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", POWERSHELL_SCRIPT],
    1000,
  );
  if (!windowId) {
    windowId = execFileWithTimeout("pwsh", ["-NoProfile", "-NonInteractive", "-Command", POWERSHELL_SCRIPT], 1000);
  }
  return windowId;
}
