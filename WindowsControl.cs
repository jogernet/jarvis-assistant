using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
class WindowsControl {
 [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindow callback,IntPtr param);
 delegate bool EnumWindow(IntPtr hwnd,IntPtr param);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd,StringBuilder value,int max);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd,int command);
 [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint count,INPUT[] inputs,int size);
 [StructLayout(LayoutKind.Sequential)] struct INPUT {public uint type;public INPUTUNION data;}
 [StructLayout(LayoutKind.Explicit)] struct INPUTUNION {[FieldOffset(0)] public MOUSEINPUT mouse;[FieldOffset(0)] public KEYBDINPUT key;}
 [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT {public int x,y;public uint data,flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT {public ushort vk,scan;public uint flags,time;public UIntPtr extra;}
 static readonly JavaScriptSerializer json=new JavaScriptSerializer {MaxJsonLength=4000000};
 static string Title(IntPtr hwnd){var name=new StringBuilder(600);GetWindowText(hwnd,name,name.Capacity);return name.ToString();}
 static void Send(INPUT input){if(SendInput(1,new INPUT[]{input},Marshal.SizeOf(typeof(INPUT)))!=1)throw new Exception("Windows blocked input. The target application may require administrator privileges.");}
 static void Key(ushort vk,bool up){Send(new INPUT{type=1,data=new INPUTUNION{key=new KEYBDINPUT{vk=vk,flags=up?2u:0u}}});}
 static void Mouse(uint flags,uint data){Send(new INPUT{type=0,data=new INPUTUNION{mouse=new MOUSEINPUT{flags=flags,data=data}}});}
 static string Str(Dictionary<string,object> args,string name){return args.ContainsKey(name)?Convert.ToString(args[name]):"";}
 static int Num(Dictionary<string,object> args,string name){return Convert.ToInt32(args[name]);}
 static void Position(Dictionary<string,object> args){int x=Num(args,"x"),y=Num(args,"y");if(x<0||x>1000||y<0||y>1000)throw new Exception("Coordinates must be 0..1000.");var b=Screen.PrimaryScreen.Bounds;if(!SetCursorPos(b.Left+(int)Math.Round(x*(b.Width-1)/1000.0),b.Top+(int)Math.Round(y*(b.Height-1)/1000.0)))throw new Exception("Cursor could not be moved.");}
 static object Run(string action,Dictionary<string,object> args){
  if(action=="system_status"){bool elevated=new System.Security.Principal.WindowsPrincipal(System.Security.Principal.WindowsIdentity.GetCurrent()).IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);return new{ok=true,elevated=elevated,version="0.5",mouse=true,keyboard=true,windows=true};}
  if(action=="screen_view"){
   var bounds=Screen.PrimaryScreen.Bounds;int w=Math.Min(1440,bounds.Width),h=(int)Math.Round(bounds.Height*w/(double)bounds.Width);
   using(var raw=new Bitmap(bounds.Width,bounds.Height))using(var g=Graphics.FromImage(raw)){
    g.CopyFromScreen(bounds.Left,bounds.Top,0,0,bounds.Size);
    using(var scaled=new Bitmap(raw,new Size(w,h)))using(var output=new MemoryStream()){
     var codec=Array.Find(ImageCodecInfo.GetImageEncoders(),c=>c.MimeType=="image/jpeg");var pars=new EncoderParameters(1);pars.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,75L);scaled.Save(output,codec,pars);
     return new {ok=true,image=Convert.ToBase64String(output.ToArray()),width=w,height=h,screenWidth=bounds.Width,screenHeight=bounds.Height,activeWindow=Title(GetForegroundWindow()),activeHwnd=GetForegroundWindow().ToInt64().ToString(),coordinates="x and y are normalized to 0..1000 over this entire image"};
    }
   }
  }
  if(action=="list_windows"){
   var windows=new List<object>();EnumWindows((handle,param)=>{string title=Title(handle);if(IsWindowVisible(handle)&&title.Length>0)windows.Add(new{hwnd=handle.ToInt64().ToString(),title=title});return true;},IntPtr.Zero);return new{ok=true,windows=windows,active=GetForegroundWindow().ToInt64().ToString()};
  }
  if(action=="focus_window"){
   var handle=new IntPtr(long.Parse(Str(args,"hwnd")));if(!IsWindow(handle)||!IsWindowVisible(handle))throw new Exception("Window no longer exists.");ShowWindow(handle,9);SetForegroundWindow(handle);Thread.Sleep(200);if(GetForegroundWindow()!=handle)throw new Exception("Windows did not activate the requested window. Ask the user to switch to it.");return new{ok=true,title=Title(handle)};
  }
  if(args.ContainsKey("_expectedForeground") && Str(args,"_expectedForeground")!=GetForegroundWindow().ToInt64().ToString())throw new Exception("Active window changed. Take a new screenshot before acting.");
  if(action=="click_screen"){
   Position(args);bool right=Str(args,"button")=="right";Mouse(right?8u:2u,0);Mouse(right?16u:4u,0);
   if(Str(args,"button")=="double"){Thread.Sleep(70);Mouse(2,0);Mouse(4,0);}return new{ok=true};
  }
  if(action=="scroll_screen"){Position(args);int amount=Num(args,"amount");if(amount==0||Math.Abs(amount)>8)throw new Exception("Scroll amount must be -8..8 and nonzero.");Mouse(0x800,unchecked((uint)(amount*120)));return new{ok=true};}
  if(action=="type_text"){
   string text=Str(args,"text");if(text.Length>6000)throw new Exception("Text is too long.");
   foreach(char ch in text){Send(new INPUT{type=1,data=new INPUTUNION{key=new KEYBDINPUT{scan=ch,flags=4}}});Send(new INPUT{type=1,data=new INPUTUNION{key=new KEYBDINPUT{scan=ch,flags=6}}});}return new{ok=true};
  }
  if(action=="press_key"){
   var keys=new Dictionary<string,ushort>{{"CTRL",17},{"ALT",18},{"SHIFT",16},{"WIN",91},{"ENTER",13},{"ESC",27},{"TAB",9},{"BACKSPACE",8},{"DELETE",46},{"SPACE",32},{"LEFT",37},{"UP",38},{"RIGHT",39},{"DOWN",40},{"HOME",36},{"END",35},{"PAGEUP",33},{"PAGEDOWN",34},{"F5",116},{"F11",122}};
   string[] names=Str(args,"key").ToUpperInvariant().Split('+');if(names.Length>4)throw new Exception("Invalid key combination.");var codes=new List<ushort>();
   foreach(string name in names){ushort code;if(keys.TryGetValue(name,out code))codes.Add(code);else if(name.Length==1&&((name[0]>='A'&&name[0]<='Z')||(name[0]>='0'&&name[0]<='9')))codes.Add(name[0]);else throw new Exception("Unsupported key.");}
   int down=0;try{foreach(ushort code in codes){Key(code,false);down++;}}finally{for(int i=down-1;i>=0;i--)Key(codes[i],true);}return new{ok=true};
  }
  throw new Exception("Unknown Windows action.");
 }
 [STAThread] static void Main(string[] argv){
  Console.InputEncoding=Encoding.UTF8;Console.OutputEncoding=new UTF8Encoding(false);
  if(argv.Length>0&&argv[0]=="--self-test"){Console.WriteLine(json.Serialize(new{ok=true,inputSize=Marshal.SizeOf(typeof(INPUT)),expected=IntPtr.Size==8?40:28}));return;}
  try{try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}var request=json.Deserialize<Dictionary<string,object>>(Console.In.ReadToEnd());var args=request.ContainsKey("args")?(Dictionary<string,object>)request["args"]:new Dictionary<string,object>();Console.WriteLine(json.Serialize(Run(Convert.ToString(request["action"]),args)));}
  catch(Exception e){Console.WriteLine(json.Serialize(new{ok=false,error=e.Message}));Environment.ExitCode=1;}
 }
}
