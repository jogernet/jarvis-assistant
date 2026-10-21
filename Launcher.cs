using System;
using System.IO;
using System.Diagnostics;
using System.Windows.Forms;
class JarvisLauncher {
 [STAThread] static void Main() {
  try {
   string root=AppDomain.CurrentDomain.BaseDirectory;
   string script=Path.Combine(root,"Launch-Desktop.ps1");
   ProcessStartInfo start=new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -File \""+script+"\"");
   start.WorkingDirectory=root;start.UseShellExecute=false;start.CreateNoWindow=true;
   start.RedirectStandardError=true;
   using(Process p=Process.Start(start)){string error=p.StandardError.ReadToEnd();p.WaitForExit();if(p.ExitCode!=0)MessageBox.Show(error,"JARVIS",MessageBoxButtons.OK,MessageBoxIcon.Error);}
  } catch(Exception e) {MessageBox.Show(e.Message,"JARVIS",MessageBoxButtons.OK,MessageBoxIcon.Error);}
 }
}
