using System;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Drawing;
using Microsoft.Win32;

class Installer : Form {
 Label info=new Label(),pathLabel=new Label();
 Button install=new Button(),browse=new Button();
 CheckBox desktop=new CheckBox(),accept=new CheckBox();
 TextBox location=new TextBox(); LinkLabel termsLink=new LinkLabel();
 ProgressBar progress=new ProgressBar(); bool busy,installed;
 static string Root=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","JARVIS");
 const string RegistryPath=@"Software\Microsoft\Windows\CurrentVersion\Uninstall\JARVIS";
 static string Terms(){using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("terms.txt")){if(stream==null)throw new Exception("В установщике отсутствуют условия использования.");using(var reader=new StreamReader(stream,System.Text.Encoding.UTF8))return reader.ReadToEnd();}}
 Installer(){
  Text="Установка JARVIS";ClientSize=new Size(620,420);AutoScaleMode=AutoScaleMode.Dpi;
  FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;StartPosition=FormStartPosition.CenterScreen;
  BackColor=Color.FromArgb(10,19,34);ForeColor=Color.White;Font=new Font("Segoe UI",10);
  try{using(var key=Registry.CurrentUser.OpenSubKey(RegistryPath)){string saved=key==null?null:key.GetValue("InstallLocation") as string;if(!String.IsNullOrWhiteSpace(saved)&&File.Exists(Path.Combine(saved,"jarvis-distribution.json")))Root=saved;}}catch(System.Security.SecurityException){}catch(UnauthorizedAccessException){}
  info.SetBounds(24,20,572,95);info.Text="JARVIS — персональный ассистент\n\nУстановка для текущего пользователя. Node.js отдельно не требуется. При первом запуске укажите собственный ключ Gemini.";
  pathLabel.Text="Папка установки";pathLabel.SetBounds(24,123,550,24);
  location.Text=Root;location.SetBounds(24,151,462,30);
  browse.Text="Обзор…";browse.SetBounds(494,150,102,32);browse.Click+=(s,e)=>{using(var picker=new FolderBrowserDialog()){picker.Description="Выберите папку для JARVIS";picker.SelectedPath=location.Text;picker.ShowNewFolderButton=true;if(picker.ShowDialog(this)==DialogResult.OK)location.Text=picker.SelectedPath;}};
  var profile=new Label();profile.SetBounds(24,193,572,40);profile.Text="Ключи, подключения и история хранятся отдельно: %APPDATA%\\JARVIS. Обновления сохранят эти данные.";
  desktop.Text="Создать ярлык на рабочем столе";desktop.Checked=true;desktop.SetBounds(24,240,550,28);
  termsLink.Text="Условия использования и политика конфиденциальности";termsLink.LinkColor=Color.LightSkyBlue;termsLink.ActiveLinkColor=Color.White;termsLink.SetBounds(24,280,572,28);termsLink.LinkClicked+=(s,e)=>ShowTerms();
  accept.Text="Я принимаю условия использования и политику конфиденциальности";accept.SetBounds(24,312,572,44);accept.Checked=false;accept.CheckedChanged+=(s,e)=>{install.Enabled=accept.Checked;};
  progress.SetBounds(24,373,370,22);progress.Style=ProgressBarStyle.Marquee;progress.Visible=false;
  install.Text="Установить";install.SetBounds(446,367,150,34);install.Enabled=false;
  install.Click+=async(s,e)=>{if(installed){Process.Start(Path.Combine(Root,"JARVIS.exe"));Close();}else await Install();};
  Controls.AddRange(new Control[]{info,pathLabel,location,browse,profile,desktop,termsLink,accept,progress,install});FormClosing+=(s,e)=>{if(busy)e.Cancel=true;};
 }
 void ShowTerms(){using(var view=new Form()){view.Text="JARVIS — условия и конфиденциальность";view.Size=new Size(720,570);view.StartPosition=FormStartPosition.CenterParent;var text=new TextBox{Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Vertical,Dock=DockStyle.Fill,Font=new Font("Segoe UI",10),Text=Terms().Replace("\n","\r\n")};var close=new Button{Text="Закрыть",Dock=DockStyle.Bottom,Height=38};close.Click+=(s,e)=>view.Close();view.Controls.Add(text);view.Controls.Add(close);view.ShowDialog(this);}}
 static string ValidateRoot(string value){
  if(String.IsNullOrWhiteSpace(value)||!Path.IsPathRooted(value)||value.StartsWith(@"\\"))throw new Exception("Выберите локальную папку с полным путём, например D:\\Programs\\JARVIS.");
  string full=Path.GetFullPath(value).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar);
  string drive=Path.GetPathRoot(full).TrimEnd('\\');
  if(String.Equals(full,drive,StringComparison.OrdinalIgnoreCase))throw new Exception("Нельзя устанавливать приложение в корень диска. Выберите отдельную папку JARVIS.");
  foreach(var special in new[]{Environment.SpecialFolder.Windows,Environment.SpecialFolder.System,Environment.SpecialFolder.UserProfile,Environment.SpecialFolder.ApplicationData,Environment.SpecialFolder.LocalApplicationData}){
   string protectedPath=Environment.GetFolderPath(special).TrimEnd('\\');
   if(protectedPath.Length>0&&(String.Equals(full,protectedPath,StringComparison.OrdinalIgnoreCase)||(special==Environment.SpecialFolder.Windows||special==Environment.SpecialFolder.System)&&full.StartsWith(protectedPath+"\\",StringComparison.OrdinalIgnoreCase)))throw new Exception("Выберите отдельную папку приложения вне системных каталогов Windows.");
  }
  return full;
 }
 static void Shortcut(string file,string target){Type type=Type.GetTypeFromProgID("WScript.Shell");object shell=Activator.CreateInstance(type),link=type.InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[]{file});Type t=link.GetType();t.InvokeMember("TargetPath",BindingFlags.SetProperty,null,link,new object[]{target});t.InvokeMember("WorkingDirectory",BindingFlags.SetProperty,null,link,new object[]{Root});t.InvokeMember("IconLocation",BindingFlags.SetProperty,null,link,new object[]{target+",0"});t.InvokeMember("Save",BindingFlags.InvokeMethod,null,link,null);}
 async Task Install(){
  if(!accept.Checked)return;
  try{Root=ValidateRoot(location.Text);Terms();}catch(Exception e){MessageBox.Show(e.Message,"JARVIS",MessageBoxButtons.OK,MessageBoxIcon.Warning);return;}
  busy=true;install.Enabled=desktop.Enabled=location.Enabled=browse.Enabled=accept.Enabled=termsLink.Enabled=false;progress.Visible=true;
  try{bool shortcut=desktop.Checked;await Task.Run(()=>{
   if(Directory.Exists(Root)&&!File.Exists(Path.Combine(Root,"jarvis-distribution.json"))&&Directory.GetFileSystemEntries(Root).Length>0)throw new Exception("В выбранной папке есть другие файлы. Создайте отдельную папку JARVIS.");
   Directory.CreateDirectory(Root);string stage=Path.Combine(Root,".install-"+Guid.NewGuid().ToString());Directory.CreateDirectory(stage);
   try{
    using(Stream stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))using(var zip=new ZipArchive(stream,ZipArchiveMode.Read)){
     string boundary=Path.GetFullPath(stage).TrimEnd('\\')+"\\";
     foreach(var entry in zip.Entries){string name=entry.FullName.Replace('\\','/');if(name.StartsWith("/")||name.Contains(":")||Array.IndexOf(name.Split('/'),"..")>=0)throw new Exception("Invalid archive path");string target=Path.GetFullPath(Path.Combine(stage,name));if(!target.StartsWith(boundary,StringComparison.OrdinalIgnoreCase))throw new Exception("Invalid install path");if(name.EndsWith("/")){Directory.CreateDirectory(target);continue;}Directory.CreateDirectory(Path.GetDirectoryName(target));entry.ExtractToFile(target,false);}
    }
    string version=File.ReadAllText(Path.Combine(stage,"current.txt")).Trim();if(!System.Text.RegularExpressions.Regex.IsMatch(version,@"^\d+\.\d+\.\d+$"))throw new Exception("Invalid application version");
    string pointer=Path.Combine(Root,"current.txt");if(File.Exists(pointer)&&new Version(File.ReadAllText(pointer).Trim()).CompareTo(new Version(version))>=0)throw new Exception("Такая или более новая версия уже установлена. Откройте JARVIS из этой папки.");
    string destination=Path.Combine(Root,"versions",version);if(Directory.Exists(destination))throw new Exception("Папка этой версии уже существует. Используйте обновление в JARVIS.");
    Directory.CreateDirectory(Path.GetDirectoryName(destination));Directory.Move(Path.Combine(stage,"versions",version),destination);
    foreach(string file in Directory.GetFiles(stage)){if(Path.GetFileName(file)=="current.txt")continue;File.Copy(file,Path.Combine(Root,Path.GetFileName(file)),true);}
    string next=Path.Combine(Root,"current.next");File.WriteAllText(next,version);if(File.Exists(pointer))File.Replace(next,pointer,null);else File.Move(next,pointer);
   }finally{try{Directory.Delete(stage,true);}catch{}}
  });
  string launcher=Path.Combine(Root,"JARVIS.exe"),start=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"JARVIS.lnk");Shortcut(start,launcher);if(shortcut)Shortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),"JARVIS.lnk"),launcher);
  using(var key=Registry.CurrentUser.CreateSubKey(RegistryPath)){key.SetValue("DisplayName","JARVIS");key.SetValue("DisplayIcon",launcher);key.SetValue("InstallLocation",Root);key.SetValue("UninstallString","\""+Path.Combine(Root,"Uninstall.exe")+"\"");key.SetValue("DisplayVersion",File.ReadAllText(Path.Combine(Root,"current.txt")).Trim());key.SetValue("NoModify",1);key.SetValue("NoRepair",1);}
  busy=false;progress.Visible=false;info.Text="JARVIS установлен.\n\nПапка: "+Root+"\nУ каждого пользователя свои настройки и подключения.";install.Text="Запустить";install.Enabled=true;installed=true;
  }catch(Exception e){busy=false;progress.Visible=false;desktop.Enabled=location.Enabled=browse.Enabled=accept.Enabled=termsLink.Enabled=true;install.Enabled=accept.Checked;MessageBox.Show("Не удалось установить JARVIS. Если он запущен — выйдите через трей и повторите установку. Выберите папку, в которую у вас есть доступ на запись.\n\n"+e.Message,"JARVIS",MessageBoxButtons.OK,MessageBoxIcon.Error);}
 }
 [STAThread]static int Main(string[] args){Application.EnableVisualStyles();if(Array.IndexOf(args,"--self-test")>=0){using(var form=new Installer()){if(form.install.Enabled||form.accept.Checked||!Terms().Contains("Gemini"))return 1;form.accept.Checked=true;if(!form.install.Enabled)return 2;foreach(string invalid in new[]{@"C:\",@"relative\JARVIS",Environment.GetFolderPath(Environment.SpecialFolder.Windows)}){try{ValidateRoot(invalid);return 3;}catch{}}if(!ValidateRoot(Path.Combine(Path.GetTempPath(),"JARVIS-test")).EndsWith("JARVIS-test"))return 4;}return 0;}Application.Run(new Installer());return 0;}
}
