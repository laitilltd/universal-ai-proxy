using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using Microsoft.Win32;

namespace UniversalAIProxy
{
    static class Program
    {
        private static string port = "3000";
        private static string serverUrl;
        private static string scriptDir;
        private static Process nodeProcess;
        private static NotifyIcon notifyIcon;
        private static ToolStripMenuItem menuAutoStart;
        private const string RegPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string RegName = "UniversalAIProxy";

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            scriptDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');

            // Determine PORT from .env if present
            string envPath = Path.Combine(scriptDir, ".env");
            if (File.Exists(envPath))
            {
                try
                {
                    string[] lines = File.ReadAllLines(envPath);
                    foreach (string line in lines)
                    {
                        Match match = Regex.Match(line, @"^\s*PORT\s*=\s*[""']?(\d+)[""']?");
                        if (match.Success)
                        {
                            port = match.Groups[1].Value;
                            break;
                        }
                    }
                }
                catch { }
            }

            serverUrl = "http://localhost:" + port + "/";

            // Start node server.js if not running
            EnsureNodeServerRunning();

            // Setup System Tray Icon
            notifyIcon = new NotifyIcon();
            string icoPath = Path.Combine(scriptDir, "app.ico");
            if (File.Exists(icoPath))
            {
                try { notifyIcon.Icon = new Icon(icoPath); } catch { notifyIcon.Icon = SystemIcons.Application; }
            }
            else
            {
                notifyIcon.Icon = SystemIcons.Application;
            }

            notifyIcon.Text = "Universal AI Proxy (" + port + ")";
            notifyIcon.Visible = true;

            // Context Menu
            ContextMenuStrip menu = new ContextMenuStrip();

            ToolStripMenuItem menuOpenChat = new ToolStripMenuItem("Open Chat");
            menuOpenChat.Font = new Font(menuOpenChat.Font, FontStyle.Bold);
            menuOpenChat.Click += (s, e) => OpenUrl(serverUrl);
            menu.Items.Add(menuOpenChat);

            menuAutoStart = new ToolStripMenuItem("Auto Start Enable");
            UpdateAutoStartMenuText();
            menuAutoStart.Click += ToggleAutoStart;
            menu.Items.Add(menuAutoStart);

            menu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem menuContact = new ToolStripMenuItem("Developers Contact");
            menuContact.Click += (s, e) => OpenUrl("http://mahediazad.com");
            menu.Items.Add(menuContact);

            menu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem menuQuit = new ToolStripMenuItem("Quit");
            menuQuit.Click += (s, e) => QuitApp();
            menu.Items.Add(menuQuit);

            notifyIcon.ContextMenuStrip = menu;
            notifyIcon.DoubleClick += (s, e) => OpenUrl(serverUrl);

            // Startup Information Popup Dialog
            string popupText = "Universal AI Proxy server is running!\n\n" +
                               "URL: " + serverUrl + "\n\n" +
                               "System Tray: A tray icon (UAI) has been added to your taskbar.\n" +
                               "Right-click the icon anytime to open chat, toggle auto-start, or quit.\n\n" +
                               "Would you like to open the Chat UI in your browser now?";

            DialogResult dr = MessageBox.Show(popupText, "Universal AI Proxy - Server Running", MessageBoxButtons.YesNo, MessageBoxIcon.Information);
            if (dr == DialogResult.Yes)
            {
                OpenUrl(serverUrl);
            }

            Application.Run();
        }

        private static void EnsureNodeServerRunning()
        {
            try
            {
                Process[] procs = Process.GetProcessesByName("node");
                bool isRunning = false;
                foreach (Process p in procs)
                {
                    try
                    {
                        string cmd = GetCommandLine(p);
                        if (cmd != null && Regex.IsMatch(cmd, @"(?i)(^|[\s\\/])server\.js(\s|""|$)"))
                        {
                            isRunning = true;
                            nodeProcess = p;
                            break;
                        }
                    }
                    catch { }
                }

                if (!isRunning)
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = "node";
                    psi.Arguments = "server.js";
                    psi.WorkingDirectory = scriptDir;
                    psi.UseShellExecute = false;
                    psi.CreateNoWindow = true;
                    psi.EnvironmentVariables["PORT"] = port;

                    nodeProcess = Process.Start(psi);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to start Node server.js:\n" + ex.Message, "Universal AI Proxy Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static string GetCommandLine(Process process)
        {
            try
            {
                using (var searcher = new System.Management.ManagementObjectSearcher("SELECT CommandLine FROM Win32_Process WHERE ProcessId = " + process.Id))
                using (var objects = searcher.Get())
                {
                    foreach (var obj in objects)
                    {
                        object val = obj["CommandLine"];
                        return val != null ? val.ToString() : null;
                    }
                }
            }
            catch { }
            return null;
        }

        private static void OpenUrl(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to open URL:\n" + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void UpdateAutoStartMenuText()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RegPath, false))
                {
                    if (key != null && key.GetValue(RegName) != null)
                    {
                        menuAutoStart.Text = "Auto Start Enabled";
                        menuAutoStart.Checked = true;
                        return;
                    }
                }
            }
            catch { }
            menuAutoStart.Text = "Auto Start Enable";
            menuAutoStart.Checked = false;
        }

        private static void ToggleAutoStart(object sender, EventArgs e)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RegPath, true))
                {
                    if (key != null)
                    {
                        if (key.GetValue(RegName) != null)
                        {
                            key.DeleteValue(RegName, false);
                            notifyIcon.ShowBalloonTip(3000, "Universal AI Proxy", "Auto Start on Windows boot disabled.", ToolTipIcon.Info);
                        }
                        else
                        {
                            string exePath = Application.ExecutablePath;
                            key.SetValue(RegName, "\"" + exePath + "\"");
                            notifyIcon.ShowBalloonTip(3000, "Universal AI Proxy", "Auto Start on Windows boot enabled!", ToolTipIcon.Info);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to update Auto Start setting:\n" + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            UpdateAutoStartMenuText();
        }

        private static void QuitApp()
        {
            try
            {
                if (notifyIcon != null)
                {
                    notifyIcon.Visible = false;
                    notifyIcon.Dispose();
                }

                if (nodeProcess != null && !nodeProcess.HasExited)
                {
                    try { nodeProcess.Kill(); } catch { }
                }

                Process[] procs = Process.GetProcessesByName("node");
                foreach (Process p in procs)
                {
                    try
                    {
                        string cmd = GetCommandLine(p);
                        if (cmd != null && Regex.IsMatch(cmd, @"(?i)(^|[\s\\/])server\.js(\s|""|$)"))
                        {
                            p.Kill();
                        }
                    }
                    catch { }
                }
            }
            catch { }

            Application.Exit();
        }
    }
}
