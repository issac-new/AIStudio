const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { join } = require('node:path')
const exec = promisify(execFile)
module.exports = async function clickNative(window, view, selector, root) {
  const point = await view.webContents.executeJavaScript(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2} })()`)
  if (process.env.STUDIO_TEST_NATIVE_MOUSE !== '1') {
    view.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(point.x), y: Math.round(point.y), button: 'left', clickCount: 1 })
    view.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(point.x), y: Math.round(point.y), button: 'left', clickCount: 1 })
    return
  }
  window.show();window.focus()
  await new Promise(resolve => setTimeout(resolve, 100))
  const bounds = view.getBounds()
  const origin = window.getContentBounds()
  if (process.platform === 'darwin') {
    const binary = join(root, 'pointer')
    if (!require('node:fs').existsSync(binary)) await exec('/usr/bin/swiftc', [join(__dirname, 'native-device-pointer.swift'), '-o', binary])
    await exec(binary, [String(origin.x + bounds.x + point.x), String(origin.y + bounds.y + point.y)])
  } else if (process.platform === 'win32') {
    const handle = window.getNativeWindowHandle().readBigUInt64LE().toString()
    // ClientToScreen handles the actual Windows frame offset and monitor DPI.
    const script = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NativeDevicePointer {
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
 [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
 [DllImport("user32.dll")] static extern bool SetThreadDesktop(IntPtr desktop);
 [DllImport("user32.dll")] static extern IntPtr GetThreadDesktop(uint thread);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr obj, int index, System.Text.StringBuilder text, uint length, out uint needed);
 [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
 [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr handle, ref POINT point);
 [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr handle);
 [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr handle);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr handle, IntPtr process);
 [DllImport("user32.dll", EntryPoint="GetWindowThreadProcessId")] static extern uint GetWindowThreadProcessIdOut(IntPtr handle, out uint process);
 [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from, uint to, bool attach);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr handle, System.Text.StringBuilder text, int length);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr handle, int command);
 [DllImport("user32.dll")] static extern bool PostMessage(IntPtr handle, uint message, IntPtr wParam, IntPtr lParam);
 [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr handle, uint flags);
 [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr handle);
 [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
 [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
 [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr handle, uint message, IntPtr wParam, IntPtr lParam);
 public static void Click(long value, double x, double y) {
  var inputDesktop = OpenInputDesktop(0, false, 0x0100 | 0x0080 | 0x0040 | 0x0001);
  uint needed;
  var desktopName = new System.Text.StringBuilder(256);
  GetUserObjectInformation(GetThreadDesktop(GetCurrentThreadId()), 2, desktopName, 512, out needed);
  Console.WriteLine("Pointer desktop=" + desktopName + " inputHandle=" + inputDesktop);
  if (inputDesktop != IntPtr.Zero) {
    var inputName = new System.Text.StringBuilder(256);
    GetUserObjectInformation(inputDesktop, 2, inputName, 512, out needed);
    Console.WriteLine("Input desktop=" + inputName + " switched=" + SetThreadDesktop(inputDesktop));
  }
  SetThreadDpiAwarenessContext(new IntPtr(-4));
  var handle = new IntPtr(value);
  var foreground = GetForegroundWindow();
  var foregroundTitle = new System.Text.StringBuilder(512);GetWindowText(foreground, foregroundTitle, 512);
  // Fresh hosted Windows ARM runners can show an unrelated account welcome
  // window above every app. Close only this known runner popup, never a Studio dialog.
  if (Environment.GetEnvironmentVariable("GITHUB_ACTIONS") == "true" && foregroundTitle.ToString() == "Microsoft account") {
    PostMessage(foreground, 0x10, IntPtr.Zero, IntPtr.Zero);
    System.Threading.Thread.Sleep(500);
    foreground = GetForegroundWindow();
  }
  var shellTitle = new System.Text.StringBuilder(512); GetWindowText(foreground, shellTitle, 512);
  if (Environment.GetEnvironmentVariable("GITHUB_ACTIONS") == "true" && shellTitle.ToString() == "Search") {
    uint shellProcess;
    GetWindowThreadProcessIdOut(foreground, out shellProcess);
    var process = System.Diagnostics.Process.GetProcessById((int)shellProcess);
    Console.WriteLine("Search overlay owner=" + process.ProcessName + " session=" + process.SessionId + " pointerSession=" + System.Diagnostics.Process.GetCurrentProcess().SessionId);
    if (process.ProcessName == "SearchHost" || process.ProcessName == "SearchApp") { process.Kill(); process.WaitForExit(3000); }
    else ShowWindow(foreground, 0);
    System.Threading.Thread.Sleep(300);
    foreground = GetForegroundWindow();
  }
  var current = GetCurrentThreadId();
  var target = GetWindowThreadProcessId(handle, IntPtr.Zero);
  var active = GetWindowThreadProcessId(foreground, IntPtr.Zero);
  bool targetAttached = current != target && AttachThreadInput(current, target, true);
  bool activeAttached = active != 0 && current != active && AttachThreadInput(current, active, true);
  try {
    // A real Alt key transition releases Windows foreground-lock restrictions.
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
    BringWindowToTop(handle); SetForegroundWindow(handle);
  }
  finally {
    if (activeAttached) AttachThreadInput(current, active, false);
    if (targetAttached) AttachThreadInput(current, target, false);
  }
  System.Threading.Thread.Sleep(150);
  // Search can appear only after the initial activation; handle that bounded race.
  for (int attempt = 0; attempt < 3 && GetForegroundWindow() != handle; attempt++) {
    var overlay = GetForegroundWindow();
    var overlayTitle = new System.Text.StringBuilder(512);GetWindowText(overlay, overlayTitle, 512);
    if (Environment.GetEnvironmentVariable("GITHUB_ACTIONS") != "true" || overlayTitle.ToString() != "Search") break;
    uint overlayPid;GetWindowThreadProcessIdOut(overlay, out overlayPid);
    var overlayProcess = System.Diagnostics.Process.GetProcessById((int)overlayPid);
    Console.WriteLine("Late overlay=" + overlayProcess.ProcessName);
    if (overlayProcess.ProcessName != "SearchHost" && overlayProcess.ProcessName != "SearchApp") break;
    overlayProcess.Kill();overlayProcess.WaitForExit(3000);
    System.Threading.Thread.Sleep(300);SetForegroundWindow(handle);System.Threading.Thread.Sleep(150);
  }
  var title = new System.Text.StringBuilder(512);GetWindowText(GetForegroundWindow(), title, 512);
  Console.WriteLine("Foreground diagnostic: expected=" + value + " actual=" + GetForegroundWindow().ToInt64() + " root=" + GetAncestor(handle,2).ToInt64() + " title=" + title);
  if (GetForegroundWindow() != handle && GetForegroundWindow() != GetAncestor(handle,2)) throw new Exception("Native pointer target is not foreground: " + title);
  var point = new POINT();ClientToScreen(handle, ref point);
  double scale = GetDpiForWindow(handle) / 96.0;
  point.X += (int)Math.Round(x * scale);point.Y += (int)Math.Round(y * scale);
  var hit = SendMessage(handle, 0x84, IntPtr.Zero, new IntPtr((point.Y << 16) | (point.X & 0xffff)));
  if (hit.ToInt64() == 2) throw new Exception("Device control is still a draggable caption");
  if (!SetCursorPos(point.X, point.Y)) throw new Exception("SetCursorPos failed");
  Console.WriteLine("Native click: hwnd=" + value + " x=" + point.X + " y=" + point.Y + " dpi=" + GetDpiForWindow(handle) + " hit=" + hit);
  System.Threading.Thread.Sleep(100);
  mouse_event(2,0,0,0,UIntPtr.Zero);
  System.Threading.Thread.Sleep(50);mouse_event(4,0,0,0,UIntPtr.Zero);
 }
}
'@
[NativeDevicePointer]::Click(${handle}, ${bounds.x + point.x}, ${bounds.y + point.y})
`
    const result = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 15000, windowsHide: true }).catch(error => { console.error(error.stdout || ''); throw error })
    console.log(result.stdout)
  } else throw new Error('OS pointer test supports macOS and Windows')
}
