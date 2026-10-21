using System;using System.IO;using System.Windows.Forms;using Microsoft.Win32;
class Uninstaller{
 [STAThread]static void Main(){string root=AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\'),self=Application.ExecutablePath;try{if(!File.Exists(Path.Combine(root,"jarvis-distribution.json")))throw new Exception("Папка JARVIS не найдена.");if(MessageBox.Show("Удалить JARVIS?\n\nЛичные настройки и подключения сохранятся.","JARVIS",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;
 foreach(string file in Directory.GetFiles(root))if(!String.Equals(file,self,StringComparison.OrdinalIgnoreCase))File.Delete(file);
 foreach(string directory in Directory.GetDirectories(root))Directory.Delete(directory,true);
 foreach(string shortcut in new[]{Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),"JARVIS.lnk"),Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"JARVIS.lnk")})if(File.Exists(shortcut))File.Delete(shortcut);
 Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\JARVIS",false);MessageBox.Show("JARVIS удалён. Личные настройки сохранены.","JARVIS");
 }catch(Exception e){MessageBox.Show("Выйдите из JARVIS через трей и повторите удаление.\n\n"+e.Message,"JARVIS",MessageBoxButtons.OK,MessageBoxIcon.Error);}}
}
