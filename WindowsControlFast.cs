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
using System.Windows.Automation;
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
 [DllImport("user32.dll")] static extern bool SetPhysicalCursorPos(int x,int y);
 [DllImport("user32.dll")] static extern bool GetPhysicalCursorPos(out POINT point);
 [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(POINT point,uint flags);
 [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr monitor,ref MONITORINFO info);
 [StructLayout(LayoutKind.Sequential)] struct POINT {public int x,y;}
 [StructLayout(LayoutKind.Sequential)] struct RECT {public int left,top,right,bottom;}
 [StructLayout(LayoutKind.Sequential)] struct MONITORINFO {public int size;public RECT monitor,work;public uint flags;}
 static Rectangle Display(){var info=new MONITORINFO();info.size=Marshal.SizeOf(typeof(MONITORINFO));if(!GetMonitorInfo(MonitorFromPoint(new POINT{x=0,y=0},1),ref info))throw new Exception("Monitor geometry unavailable.");return Rectangle.FromLTRB(info.monitor.left,info.monitor.top,info.monitor.right,info.monitor.bottom);}
 static Point MapPoint(int x,int y,Rectangle b){return new Point(b.Left+(int)Math.Round(x*(b.Width-1)/1000.0),b.Top+(int)Math.Round(y*(b.Height-1)/1000.0));}
 static object Geometry(Rectangle b){return new{left=b.Left,top=b.Top,width=b.Width,height=b.Height};}
 static void CheckDisplay(Dictionary<string,object> args,Rectangle b){if(!args.ContainsKey("_expectedDisplay"))throw new Exception("Screen geometry missing. Request screen_view before clicking.");var expected=(Dictionary<string,object>)args["_expectedDisplay"];if(Num(expected,"left")!=b.Left||Num(expected,"top")!=b.Top||Num(expected,"width")!=b.Width||Num(expected,"height")!=b.Height)throw new Exception("Display configuration changed. Request screen_view again.");}
 [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint count,INPUT[] inputs,int size);
 [StructLayout(LayoutKind.Sequential)] struct INPUT {public uint type;public INPUTUNION data;}
 [StructLayout(LayoutKind.Explicit)] struct INPUTUNION {[FieldOffset(0)] public MOUSEINPUT mouse;[FieldOffset(0)] public KEYBDINPUT key;}
 [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT {public int x,y;public uint data,flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT {public ushort vk,scan;public uint flags,time;public UIntPtr extra;}
 static readonly JavaScriptSerializer json=new JavaScriptSerializer {MaxJsonLength=4000000};
 class ControlRef {public AutomationElement element;public string name;public int type;}
 static int nextControlId=0;
 static readonly Dictionary<string,string> runtimeControls=new Dictionary<string,string>();
 static readonly Dictionary<string,ControlRef> controlRefs=new Dictionary<string,ControlRef>();
 static IntPtr controlsWindow;static DateTime controlsAt;
 static object Controls(Dictionary<string,object> args){
  if(controlRefs.Count>600||controlsWindow!=GetForegroundWindow()){controlRefs.Clear();runtimeControls.Clear();}controlsWindow=GetForegroundWindow();controlsAt=DateTime.UtcNow;
  var root=AutomationElement.FromHandle(controlsWindow);var items=new List<object>();string prefix=Guid.NewGuid().ToString("N").Substring(0,12);
  var kinds=new OrCondition(new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Button),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Hyperlink),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Edit),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.MenuItem),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.TabItem),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.ListItem),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.CheckBox),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.RadioButton),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.ComboBox));
  var matches=root.FindAll(TreeScope.Descendants,new AndCondition(kinds,new PropertyCondition(AutomationElement.IsOffscreenProperty,false),new PropertyCondition(AutomationElement.IsEnabledProperty,true)));
  for(int i=0;i<matches.Count&&items.Count<120;i++){try{var e=matches[i];var info=e.Current;var rect=info.BoundingRectangle;if(rect.IsEmpty||rect.Width<2||rect.Height<2||info.IsPassword)continue;string name=info.Name;if(String.IsNullOrWhiteSpace(name))continue;string query=Str(args,"query");if(query.Length>0&&name.IndexOf(query,StringComparison.OrdinalIgnoreCase)<0)continue;string runtime=String.Join(",",e.GetRuntimeId());string id;if(!runtimeControls.TryGetValue(runtime,out id)||!controlRefs.ContainsKey(id)||controlRefs[id].name!=name||controlRefs[id].type!=info.ControlType.Id){id="T"+(++nextControlId);runtimeControls[runtime]=id;}controlRefs[id]=new ControlRef{element=e,name=name,type=info.ControlType.Id};items.Add(new{id=id,name=name.Substring(0,Math.Min(name.Length,200)),role=info.ControlType.ProgrammaticName,left=rect.Left,top=rect.Top,width=rect.Width,height=rect.Height});}catch(ElementNotAvailableException){}}
  if(GetForegroundWindow()!=controlsWindow){controlRefs.Clear();throw new Exception("Active window changed. Request list_controls again.");}
  controlsAt=DateTime.UtcNow;return new{ok=true,activeHwnd=controlsWindow.ToInt64().ToString(),controls=items,truncated=matches.Count>120,expiresInMs=30000};
 }
 static object ClickControl(Dictionary<string,object> args){
  ControlRef target;if(!controlRefs.TryGetValue(Str(args,"id"),out target)||(DateTime.UtcNow-controlsAt).TotalMilliseconds>30000)throw new Exception("Control reference expired. Request list_controls again.");
  if(controlsWindow!=GetForegroundWindow())throw new Exception("Active window changed. Request list_controls again.");
  var current=target.element.Current;if(current.IsOffscreen||!current.IsEnabled||current.IsPassword||current.Name!=target.name||current.ControlType.Id!=target.type)throw new Exception("Control changed or is unavailable. Request list_controls again.");
  object pattern;string label=target.name;controlRefs.Clear();
  if(target.element.TryGetCurrentPattern(InvokePattern.Pattern,out pattern)){((InvokePattern)pattern).Invoke();return new{ok=true,method="UIAutomation.Invoke",target=label};}
  System.Windows.Point point;if(!target.element.TryGetClickablePoint(out point))throw new Exception("Control has no clickable point. Request screen_view and use visual targeting.");
  // Recheck the element under the point to avoid clicking an overlay or another window.
  var hit=AutomationElement.FromPoint(point);bool inside=false;for(int i=0;hit!=null&&i<20;i++,hit=TreeWalker.ControlViewWalker.GetParent(hit)){if(Automation.Compare(hit,target.element)){inside=true;break;}}
  if(!inside||GetForegroundWindow()!=controlsWindow)throw new Exception("Control is covered or the window changed. Click cancelled.");
  int x=(int)Math.Round(point.X),y=(int)Math.Round(point.Y);if(!SetPhysicalCursorPos(x,y))throw new Exception("Cursor could not be moved.");POINT actual;if(!GetPhysicalCursorPos(out actual)||Math.Abs(actual.x-x)>2||Math.Abs(actual.y-y)>2)throw new Exception("Cursor did not reach target. Click cancelled.");Mouse(2,0);Mouse(4,0);return new{ok=true,method="UIAutomation.ClickablePoint",target=label,physicalX=x,physicalY=y};
 }
 static string Title(IntPtr hwnd){var name=new StringBuilder(600);GetWindowText(hwnd,name,name.Capacity);return name.ToString();}
 static void Send(INPUT input){if(SendInput(1,new INPUT[]{input},Marshal.SizeOf(typeof(INPUT)))!=1)throw new Exception("Windows blocked input. The target application may require administrator privileges.");}
 static void Key(ushort vk,bool up){Send(new INPUT{type=1,data=new INPUTUNION{key=new KEYBDINPUT{vk=vk,flags=up?2u:0u}}});}
 static void Mouse(uint flags,uint data){Send(new INPUT{type=0,data=new INPUTUNION{mouse=new MOUSEINPUT{flags=flags,data=data}}});}
 static string Str(Dictionary<string,object> args,string name){return args.ContainsKey(name)?Convert.ToString(args[name]):"";}
 static int Num(Dictionary<string,object> args,string name){return Convert.ToInt32(args[name]);}
 static void Position(Dictionary<string,object> args){int x=Num(args,"x"),y=Num(args,"y");if(x<0||x>1000||y<0||y>1000)throw new Exception("Coordinates must be 0..1000.");var b=Display();CheckDisplay(args,b);var target=MapPoint(x,y,b);if(!SetPhysicalCursorPos(target.X,target.Y))throw new Exception("Cursor could not be moved.");POINT actual;if(!GetPhysicalCursorPos(out actual)||Math.Abs(actual.x-target.X)>2||Math.Abs(actual.y-target.Y)>2)throw new Exception("Cursor did not reach target. Click was cancelled.");}
 static object ReadScreen(){
  var hwnd=GetForegroundWindow();var root=AutomationElement.FromHandle(hwnd);var entries=new List<object>();var text=new StringBuilder();var seen=new HashSet<string>();
  var kinds=new OrCondition(new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Text),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Document),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Edit));
  var matches=root.FindAll(TreeScope.Descendants,new AndCondition(kinds,new PropertyCondition(AutomationElement.IsOffscreenProperty,false),new PropertyCondition(AutomationElement.IsPasswordProperty,false)));
  for(int i=0;i<matches.Count&&entries.Count<360&&text.Length<12000;i++){try{var el=matches[i];var info=el.Current;var rect=info.BoundingRectangle;if(rect.IsEmpty||rect.Width<2||rect.Height<2||info.IsPassword)continue;string value=info.Name;object pattern;
   if(info.ControlType==ControlType.Document&&el.TryGetCurrentPattern(TextPattern.Pattern,out pattern)){var parts=new StringBuilder();foreach(var range in ((TextPattern)pattern).GetVisibleRanges()){parts.AppendLine(range.GetText(12000-parts.Length));if(parts.Length>=12000)break;}if(parts.Length>0)value=parts.ToString();}
   if(String.IsNullOrWhiteSpace(value)||!seen.Add(value))continue;value=value.Substring(0,Math.Min(value.Length,12000-text.Length));text.AppendLine(value);entries.Add(new{text=value,left=rect.Left,top=rect.Top,width=rect.Width,height=rect.Height,role=info.ControlType.ProgrammaticName});
  }catch(ElementNotAvailableException){}}
  if(hwnd!=GetForegroundWindow())throw new Exception("Active window changed. Request read_screen again.");return new{ok=true,activeHwnd=hwnd.ToInt64().ToString(),title=Title(hwnd),text=text.ToString(),items=entries,truncated=text.Length>=12000||entries.Count>=360,source="Windows UI Automation; visible text only. Canvas and images may not expose text."};
 }
 static object Run(string action,Dictionary<string,object> args){
  try{SetThreadDpiAwarenessContext(new IntPtr(-4));}catch{}
  if(action.StartsWith("messenger_",StringComparison.Ordinal))return MessengerBridge.Run(action,args);
  if(action=="read_screen")return ReadScreen();
  if(action=="list_controls")return Controls(args);
  if(action=="click_control"||action=="click_target")return ClickControl(args);
  if(action=="move_mouse"){if(args.ContainsKey("_expectedForeground")&&Str(args,"_expectedForeground")!=GetForegroundWindow().ToInt64().ToString())throw new Exception("Active window changed. Request screen_view again.");Position(args);return new{ok=true,moved=true};}
  if(action=="prepare_frame"){
   using(var input=new MemoryStream(Convert.FromBase64String(Str(args,"image"))))using(var original=Image.FromStream(input))using(var bitmap=new Bitmap(original))using(var g=Graphics.FromImage(bitmap))using(var output=new MemoryStream())using(var pen=new Pen(Color.FromArgb(65,50,220,230),1))using(var brush=new SolidBrush(Color.FromArgb(220,80,240,245)))using(var backdrop=new SolidBrush(Color.FromArgb(170,0,10,18)))using(var font=new Font("Arial",10,FontStyle.Bold)){
    if(!args.ContainsKey("targets"))for(int step=0;step<=10;step++){int x=(int)Math.Round(step*(bitmap.Width-1)/10.0),y=(int)Math.Round(step*(bitmap.Height-1)/10.0);g.DrawLine(pen,x,0,x,bitmap.Height-1);g.DrawLine(pen,0,y,bitmap.Width-1,y);string label=(step*100).ToString();float lx=Math.Min(x+2,bitmap.Width-34),ly=Math.Min(y+2,bitmap.Height-16);g.FillRectangle(backdrop,lx,0,34,16);g.DrawString(label,font,brush,lx,0);g.FillRectangle(backdrop,0,ly,34,16);g.DrawString(label,font,brush,0,ly);}
    if(args.ContainsKey("cursorX")&&args.ContainsKey("cursorY")){float cx=Num(args,"cursorX")*(bitmap.Width-1)/1000f,cy=Num(args,"cursorY")*(bitmap.Height-1)/1000f;using(var cursorPen=new Pen(Color.Yellow,2)){g.DrawEllipse(cursorPen,cx-7,cy-7,14,14);g.DrawLine(cursorPen,cx-12,cy,cx+12,cy);g.DrawLine(cursorPen,cx,cy-12,cx,cy+12);}}
    if(args.ContainsKey("targets")&&args.ContainsKey("display")){var display=(Dictionary<string,object>)args["display"];double scaleX=bitmap.Width/Convert.ToDouble(display["width"]),scaleY=bitmap.Height/Convert.ToDouble(display["height"]);using(var boxPen=new Pen(Color.FromArgb(230,255,75,80),1.5f))using(var tagBrush=new SolidBrush(Color.FromArgb(240,195,28,51)))using(var white=new SolidBrush(Color.White)){int count=0;foreach(object entry in (System.Collections.IEnumerable)args["targets"]){if(++count>80)break;var target=(Dictionary<string,object>)entry;float x=(float)((Convert.ToDouble(target["left"])-Convert.ToDouble(display["left"]))*scaleX),y=(float)((Convert.ToDouble(target["top"])-Convert.ToDouble(display["top"]))*scaleY),w=(float)(Convert.ToDouble(target["width"])*scaleX),h=(float)(Convert.ToDouble(target["height"])*scaleY);if(x+w<=0||y+h<=0||x>=bitmap.Width||y>=bitmap.Height)continue;x=Math.Max(0,x);y=Math.Max(0,y);w=Math.Min(w,bitmap.Width-x-1);h=Math.Min(h,bitmap.Height-y-1);if(w<2||h<2)continue;g.DrawRectangle(boxPen,x,y,w,h);string id=Convert.ToString(target["id"]);var label=g.MeasureString(id,font);float ly=Math.Max(0,y-17),lx=Math.Min(x,bitmap.Width-label.Width-4);g.FillRectangle(tagBrush,lx,ly,label.Width+4,17);g.DrawString(id,font,white,lx+2,ly);}}}
    var codec=Array.Find(ImageCodecInfo.GetImageEncoders(),c=>c.MimeType=="image/jpeg");using(var pars=new EncoderParameters(1)){pars.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,94L);bitmap.Save(output,codec,pars);}return new{ok=true,image=Convert.ToBase64String(output.ToArray()),width=bitmap.Width,height=bitmap.Height};
   }
  }
  if(action=="system_status"){bool elevated=new System.Security.Principal.WindowsPrincipal(System.Security.Principal.WindowsIdentity.GetCurrent()).IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);return new{ok=true,elevated=elevated,version="0.9",mouse=true,keyboard=true,windows=true};}
  if(action=="foreground_window"){var active=GetForegroundWindow();var b=Display();POINT cursor;bool positioned=GetPhysicalCursorPos(out cursor);return new{ok=true,active=active.ToInt64().ToString(),title=Title(active),display=Geometry(b),cursor=positioned?new{x=cursor.x,y=cursor.y}:null};}
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
   if(Str(args,"button")=="double"){Thread.Sleep(70);Mouse(2,0);Mouse(4,0);}POINT position;GetPhysicalCursorPos(out position);return new{ok=true,physicalX=position.x,physicalY=position.y,normalizedX=Num(args,"x"),normalizedY=Num(args,"y")};
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
 [MTAThread] static void Main(string[] argv){
  Console.InputEncoding=Encoding.UTF8;Console.OutputEncoding=new UTF8Encoding(false);
  if(argv.Length>0&&argv[0]=="--self-test"){var negative=new Rectangle(-1920,-1080,1920,1080);var center=MapPoint(500,500,new Rectangle(0,0,3840,2160));bool mapping=MapPoint(0,0,negative)==new Point(-1920,-1080)&&MapPoint(1000,1000,negative)==new Point(-1,-1)&&center==new Point(1920,1080);Console.WriteLine(json.Serialize(new{ok=mapping,inputSize=Marshal.SizeOf(typeof(INPUT)),expected=IntPtr.Size==8?40:28,mapping=mapping}));return;}
  if(argv.Length>0&&argv[0]=="--server"){
   try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}
   string line;while((line=Console.ReadLine())!=null){string id="";object result;
    try{var request=json.Deserialize<Dictionary<string,object>>(line);id=Convert.ToString(request["id"]);var args=request.ContainsKey("args")?(Dictionary<string,object>)request["args"]:new Dictionary<string,object>();result=Run(Convert.ToString(request["action"]),args);}
    catch(Exception error){result=new{ok=false,error=error.Message};}
    Console.WriteLine(json.Serialize(new{id=id,result=result}));Console.Out.Flush();
   }return;
  }
  try{try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}var request=json.Deserialize<Dictionary<string,object>>(Console.In.ReadToEnd());var args=request.ContainsKey("args")?(Dictionary<string,object>)request["args"]:new Dictionary<string,object>();Console.WriteLine(json.Serialize(Run(Convert.ToString(request["action"]),args)));}
  catch(Exception e){Console.WriteLine(json.Serialize(new{ok=false,error=e.Message}));Environment.ExitCode=1;}
 }
}
