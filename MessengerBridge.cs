using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;
using System.Text.RegularExpressions;

// Runs only on a user command. No polling, injected client scripts or account tokens.
static class MessengerBridge {
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindow callback,IntPtr arg);
 delegate bool EnumWindow(IntPtr hwnd,IntPtr arg);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd,int command);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] static extern uint SendInput(uint count,INPUT[] inputs,int size);
 [StructLayout(LayoutKind.Sequential)] struct INPUT {public uint type;public UNION data;}
 [StructLayout(LayoutKind.Explicit)] struct UNION {[FieldOffset(0)]public KEY key;[FieldOffset(0)]public MOUSE mouse;}
 [StructLayout(LayoutKind.Sequential)] struct KEY {public ushort vk,scan;public uint flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Sequential)] struct MOUSE {public int x,y;public uint data,flags,time;public UIntPtr extra;}
 class Ref {public AutomationElement element;public string label,service;public IntPtr hwnd;public DateTime at;}
 class Draft {public string token,service,chat,before,after;public IntPtr hwnd;public AutomationElement editor;}
 static Dictionary<string,Ref> refs=new Dictionary<string,Ref>();
 static Dictionary<string,Draft> drafts=new Dictionary<string,Draft>();
 static int serial;
 static string lastCallChat="";static DateTime lastCallAt=DateTime.MinValue;
 static string Arg(Dictionary<string,object> args,string key){return args.ContainsKey(key)?Convert.ToString(args[key]):"";}
 static string Norm(string value){return Regex.Replace(value??"",@"\s+"," ").Trim().ToLowerInvariant();}
 static bool SearchName(string name){return Regex.IsMatch(name??"",@"search|поиск|найти|quick switch|переключ",RegexOptions.IgnoreCase);}
 static void Guard(IntPtr hwnd){if(GetForegroundWindow()!=hwnd)throw new Exception("Активное окно изменилось. Действие остановлено.");}
 static AutomationElement Root(IntPtr hwnd){return AutomationElement.FromHandle(hwnd);}
 static IntPtr Window(string service){
  var windows=new List<IntPtr>();
  EnumWindows((hwnd,arg)=>{if(!IsWindowVisible(hwnd))return true;uint pid;GetWindowThreadProcessId(hwnd,out pid);try{string process=Process.GetProcessById((int)pid).ProcessName;if(String.Equals(process,service=="telegram"?"Telegram":"Discord",StringComparison.OrdinalIgnoreCase)&&!String.IsNullOrWhiteSpace(Root(hwnd).Current.Name))windows.Add(hwnd);}catch{}return true;},IntPtr.Zero);
  if(windows.Count==0)throw new Exception("Сначала открой приложение "+(service=="telegram"?"Telegram Desktop":"Discord")+" и войди в аккаунт.");
  if(windows.Count>1){var active=GetForegroundWindow();if(windows.Contains(active))return active;throw new Exception("Открыто несколько окон мессенджера. Сделай нужное окно активным.");}
  return windows[0];
 }
 static IntPtr Activate(string service){var hwnd=Window(service);if(GetForegroundWindow()!=hwnd){ShowWindow(hwnd,9);SetForegroundWindow(hwnd);Thread.Sleep(180);}Guard(hwnd);return hwnd;}
 static AutomationElementCollection Elements(IntPtr hwnd,ControlType type){return Root(hwnd).FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.ControlTypeProperty,type),new PropertyCondition(AutomationElement.IsOffscreenProperty,false),new PropertyCondition(AutomationElement.IsPasswordProperty,false)));}
 static void SendKey(IntPtr hwnd,ushort code,bool up){Guard(hwnd);var input=new INPUT{type=1,data=new UNION{key=new KEY{vk=code,flags=up?2u:0u}}};if(SendInput(1,new INPUT[]{input},Marshal.SizeOf(typeof(INPUT)))!=1)throw new Exception("Windows заблокировала ввод.");}
 static void Combo(IntPtr hwnd,ushort modifier,ushort key){try{SendKey(hwnd,modifier,false);SendKey(hwnd,key,false);SendKey(hwnd,key,true);}finally{SendKey(hwnd,modifier,true);}}
 static string Value(AutomationElement editor){object pattern;if(editor.TryGetCurrentPattern(ValuePattern.Pattern,out pattern))return ((ValuePattern)pattern).Current.Value;if(editor.TryGetCurrentPattern(TextPattern.Pattern,out pattern))return ((TextPattern)pattern).DocumentRange.GetText(10000).TrimEnd('\r','\n');throw new Exception("Приложение не предоставляет содержимое поля. Включи доступность или используй ручной ввод.");}
 static void SetValue(IntPtr hwnd,AutomationElement editor,string value){
  Guard(hwnd);if(!editor.Current.IsEnabled||editor.Current.IsOffscreen||editor.Current.IsPassword)throw new Exception("Поле ввода недоступно.");
  object pattern;if(editor.TryGetCurrentPattern(ValuePattern.Pattern,out pattern)&&!((ValuePattern)pattern).Current.IsReadOnly){((ValuePattern)pattern).SetValue(value);return;}
  editor.SetFocus();Guard(hwnd);if(!editor.Current.HasKeyboardFocus)throw new Exception("Не удалось сфокусировать поле сообщения.");Combo(hwnd,17,65);
  // Unicode input never interprets text as a shell command or shortcut.
  foreach(char ch in value){Guard(hwnd);if(!editor.Current.HasKeyboardFocus)throw new Exception("Фокус поля изменился. Ввод остановлен.");var down=new INPUT{type=1,data=new UNION{key=new KEY{scan=ch,flags=4}}};var up=new INPUT{type=1,data=new UNION{key=new KEY{scan=ch,flags=6}}};if(SendInput(2,new INPUT[]{down,up},Marshal.SizeOf(typeof(INPUT)))!=2)throw new Exception("Windows заблокировала ввод.");}
  if(value.Length==0){SendKey(hwnd,8,false);SendKey(hwnd,8,true);}
 }
 static AutomationElement Editor(IntPtr hwnd,bool search){
  var found=new List<AutomationElement>();foreach(AutomationElement el in Elements(hwnd,ControlType.Edit)){var info=el.Current;string label=info.Name+" "+info.AutomationId;if(search?SearchName(label):!SearchName(label)&&Regex.IsMatch(label,@"message|сообщени|написать",RegexOptions.IgnoreCase))found.Add(el);}
  if(found.Count!=1)throw new Exception(search?"Не найдено однозначное поле поиска. В Telegram включи доступность в расширенных настройках; в Discord проверь настройки доступности.":"Не найдено однозначное поле сообщения. Открой чат и проверь доступность приложения.");
  return found[0];
 }
 static bool ChatMatches(IntPtr hwnd,string chat){
  string wanted=Norm(chat);if(wanted.Length==0)return false;string title=Norm(Root(hwnd).Current.Name);
  // Require a complete title segment, not a substring of a different contact name.
  foreach(string segment in Regex.Split(title,@"\s+[—–|\-]\s+"))if(Regex.Replace(Norm(segment),@"^\(\d+\)\s*","").TrimStart('#','@')==wanted.TrimStart('#','@'))return true;
  var bounds=Root(hwnd).Current.BoundingRectangle;
  foreach(ControlType type in new ControlType[]{ControlType.Header,ControlType.Text})foreach(AutomationElement el in Elements(hwnd,type)){var info=el.Current;var rect=info.BoundingRectangle;if(Norm(info.Name)==wanted&&!rect.IsEmpty&&rect.Top<bounds.Top+Math.Min(180,bounds.Height*.3)&&rect.Left>bounds.Left+bounds.Width*.24)return true;}
  return false;
 }
 static void Verify(IntPtr hwnd,string chat){Guard(hwnd);if(!ChatMatches(hwnd,chat))throw new Exception("Не удалось подтвердить заголовок выбранного чата. Выбери чат заново; ввод и отправка остановлены.");}
 static object Search(Dictionary<string,object> args){
  string service=Arg(args,"service"),query=Arg(args,"query");var hwnd=Activate(service);refs.Clear();drafts.Clear();
  if(service=="discord"){Combo(hwnd,17,75);Thread.Sleep(180);}var edit=Editor(hwnd,true);SetValue(hwnd,edit,query);Thread.Sleep(650);Guard(hwnd);
  var result=new List<object>();foreach(ControlType type in new ControlType[]{ControlType.ListItem,ControlType.Hyperlink})foreach(AutomationElement el in Elements(hwnd,type)){var info=el.Current;string label=info.Name;if(String.IsNullOrWhiteSpace(label)||Norm(label).IndexOf(Norm(query),StringComparison.Ordinal)<0||label.Length>250)continue;string id="M"+(++serial);refs[id]=new Ref{element=el,label=label,service=service,hwnd=hwnd,at=DateTime.UtcNow};result.Add(new{id=id,name=label,role=info.ControlType.ProgrammaticName});if(result.Count>=30)break;}
  return new{ok=true,candidates=result,result=result.Count==0?"Доступных результатов нет. Возможно, приложение не раскрывает список чатов через Windows.":"Выбери точный чат из результатов. Поиск не открывает первый результат автоматически."};
 }
 static bool CallVisible(IntPtr hwnd){
  var bounds=Root(hwnd).Current.BoundingRectangle;
  foreach(AutomationElement button in Elements(hwnd,ControlType.Button)){
   var info=button.Current;var rect=info.BoundingRectangle;
   if(!rect.IsEmpty&&rect.Left>bounds.Left+bounds.Width*.24&&Regex.IsMatch(info.Name??"",@"^(disconnect|end call|leave call|leave voice call|отключиться|завершить звонок|завершить вызов|покинуть звонок)(\s*\(.*\))?$",RegexOptions.IgnoreCase))return true;
  }
  return false;
 }
 static object Call(Dictionary<string,object> args){
  if(Arg(args,"service")!="discord")throw new Exception("Звонок через приложение поддерживается в Discord.");
  var hwnd=Activate("discord");string chat=Arg(args,"query");if(String.IsNullOrWhiteSpace(chat))chat=Arg(args,"chat");
  if(!ChatMatches(hwnd,chat))throw new Exception("Открытый чат Discord не совпал с контактом. Сначала найди и выбери точный чат; звонок не запускался.");
  Verify(hwnd,chat);
  if(CallVisible(hwnd))return new{ok=true,chat=chat,initiated=true,verificationPending=false,callState="ringing_or_active",result="В выбранном чате Discord уже виден начатый звонок. Повторный звонок не запускаю."};
  if(Norm(lastCallChat)==Norm(chat)&&(DateTime.UtcNow-lastCallAt).TotalSeconds<20)return new{ok=true,chat=chat,initiated=true,verificationPending=true,callState="requested",result="Команда звонка этому контакту уже выполнена. Подтверждение начала пока не получено; повторно не нажимаю."};
  var buttons=new List<AutomationElement>();var bounds=Root(hwnd).Current.BoundingRectangle;
  foreach(AutomationElement button in Elements(hwnd,ControlType.Button)){
   var info=button.Current;var rect=info.BoundingRectangle;
   if(info.IsEnabled&&!rect.IsEmpty&&rect.Left>bounds.Left+bounds.Width*.24&&Regex.IsMatch(info.Name??"",@"^(start voice call|start a voice call|voice call|call|начать голосовой звонок|начать голосовой вызов|голосовой звонок|голосовой вызов|позвонить)(\s*\(.*\))?$",RegexOptions.IgnoreCase))buttons.Add(button);
  }
  if(buttons.Count!=1)throw new Exception("Чат контакта открыт, но однозначная кнопка голосового звонка недоступна. Не буду утверждать, что контакт не найден.");
  object pattern;if(!buttons[0].TryGetCurrentPattern(InvokePattern.Pattern,out pattern))throw new Exception("Кнопка звонка не предоставляет доступного действия Windows.");
  Verify(hwnd,chat);lastCallChat=chat;lastCallAt=DateTime.UtcNow;((InvokePattern)pattern).Invoke();
  // After invoking, never convert delayed UI confirmation into 'contact not found'.
  bool confirmed=false;try{for(int i=0;i<5;i++){Thread.Sleep(180);Guard(hwnd);if(ChatMatches(hwnd,chat)&&CallVisible(hwnd)){confirmed=true;break;}}}catch{}
  return new{ok=true,chat=chat,initiated=true,verificationPending=!confirmed,callState=confirmed?"ringing_or_active":"requested",result=confirmed?"Голосовой звонок контакту «"+chat+"» начат в Discord. Ответ собеседника не проверен.":"Команда голосового звонка контакту «"+chat+"» выполнена. Подтверждение начала ещё не видно; повторно не нажимаю."};
 }
 public static object Run(string action,Dictionary<string,object> args){
  string service=Arg(args,"service");if(service!="telegram"&&service!="discord")throw new Exception("Неизвестный мессенджер.");
  if(action=="messenger_search")return Search(args);
  if(action=="messenger_call")return Call(args);
  if(action=="messenger_select"){
   Ref item;if(!refs.TryGetValue(Arg(args,"id"),out item)||item.service!=service||(DateTime.UtcNow-item.at).TotalSeconds>90)throw new Exception("Результат поиска устарел. Повтори поиск.");
   int identical=0;foreach(var candidate in refs.Values)if(candidate.service==service&&Norm(candidate.label)==Norm(item.label))identical++;
   if(identical>1)throw new Exception("Есть несколько чатов с одинаковым именем. Уточни поиск по имени пользователя или другому уникальному признаку.");
   var hwnd=Activate(service);if(hwnd!=item.hwnd||item.element.Current.Name!=item.label||item.element.Current.IsOffscreen)throw new Exception("Результат поиска изменился.");object pattern;
   if(item.element.TryGetCurrentPattern(SelectionItemPattern.Pattern,out pattern))((SelectionItemPattern)pattern).Select();else if(item.element.TryGetCurrentPattern(InvokePattern.Pattern,out pattern))((InvokePattern)pattern).Invoke();else throw new Exception("Приложение не предоставляет действие выбора этого чата.");
   Thread.Sleep(300);Verify(hwnd,item.label);Editor(hwnd,false);refs.Clear();return new{ok=true,chat=item.label,result="Выбран чат: "+item.label};
  }
  var window=Activate(service);string chat=Arg(args,"chat");Verify(window,chat);
  if(action=="messenger_read"){
   var text=new StringBuilder();var seen=new HashSet<string>();var bounds=Root(window).Current.BoundingRectangle;
   foreach(ControlType type in new ControlType[]{ControlType.List,ControlType.Document})foreach(AutomationElement container in Elements(window,type)){
    var info=container.Current;var rect=info.BoundingRectangle;
    bool namedHistory=Regex.IsMatch(info.Name+" "+info.AutomationId,@"messages|сообщени|history|истори|chatlog",RegexOptions.IgnoreCase);
    bool mainMessageList=type==ControlType.List&&rect.Width>bounds.Width*.4&&rect.Height>bounds.Height*.25;
    if(SearchName(info.Name)||rect.IsEmpty||rect.Left<bounds.Left+bounds.Width*.24||(!namedHistory&&!mainMessageList))continue;
    object pattern;string content="";if(container.TryGetCurrentPattern(TextPattern.Pattern,out pattern)){foreach(var range in ((TextPattern)pattern).GetVisibleRanges())content+=range.GetText(12000)+"\n";}
    else {var children=container.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.IsOffscreenProperty,false));foreach(AutomationElement el in children){string name=el.Current.Name;if(!String.IsNullOrWhiteSpace(name)&&seen.Add(name)){content+=name+"\n";if(content.Length>12000)break;}}}
    if(!String.IsNullOrWhiteSpace(content))text.AppendLine(content);if(text.Length>=12000)break;
   }
   Verify(window,chat);if(text.Length==0)throw new Exception("Приложение не предоставляет доступный текст сообщений выбранного чата. Можно прочитать экран через зрение, но не выдавать догадку за текст.");
   return new{ok=true,chat=chat,text=text.ToString().Substring(0,Math.Min(12000,text.Length)),visibleOnly=true,result="Получены доступные сообщения чата: "+chat};
  }
  var editor=Editor(window,false);
  if(action=="messenger_draft"){
   string before=Value(editor),after=Arg(args,"text");if(after.Length==0||after.Length>4000)throw new Exception("Неверная длина сообщения.");Verify(window,chat);SetValue(window,editor,after);Thread.Sleep(80);Verify(window,chat);if(Value(editor)!=after)throw new Exception("Приложение не подтвердило содержимое черновика. Проверь поле вручную.");
   string token=Guid.NewGuid().ToString("N");drafts.Clear();drafts[token]=new Draft{token=token,service=service,chat=chat,before=before,after=after,hwnd=window,editor=editor};return new{ok=true,chat=chat,undoToken=token,draftText=after,result="Черновик подготовлен в чате «"+chat+"». Сообщение не отправлено."};
  }
  if(action=="messenger_restore"){
   Draft draft;if(!drafts.TryGetValue(Arg(args,"token"),out draft)||draft.service!=service||draft.hwnd!=window||draft.chat!=chat||!Automation.Compare(draft.editor,editor)||Value(editor)!=draft.after)throw new Exception("Черновик или чат уже изменён. Автоматическая отмена остановлена.");
   SetValue(window,editor,draft.before);if(Value(editor)!=draft.before)throw new Exception("Восстановление черновика не подтверждено.");drafts.Clear();return new{ok=true,chat=chat,draftText=draft.before,result="Предыдущий черновик восстановлен."};
  }
  if(action=="messenger_send"){
   string body=Value(editor);if(String.IsNullOrWhiteSpace(body))throw new Exception("Поле сообщения пустое.");
   var buttons=new List<AutomationElement>();foreach(AutomationElement button in Elements(window,ControlType.Button))if(Regex.IsMatch(button.Current.Name??"",@"^(send|send message|отправить|отправить сообщение)(\s*\(.*\))?$",RegexOptions.IgnoreCase))buttons.Add(button);
   if(buttons.Count!=1)throw new Exception("Не найдена однозначная кнопка отправки. Сообщение осталось черновиком.");object pattern;if(!buttons[0].TryGetCurrentPattern(InvokePattern.Pattern,out pattern))throw new Exception("Кнопка не предоставляет безопасный вызов. Отправь подготовленный текст вручную.");
   Verify(window,chat);if(Value(editor)!=body)throw new Exception("Черновик изменился до отправки.");drafts.Clear();((InvokePattern)pattern).Invoke();Thread.Sleep(200);Verify(window,chat);
   if(!String.IsNullOrWhiteSpace(Value(editor)))throw new Exception("Отправка не подтверждена. Не повторяй автоматически: проверь чат вручную.");
   return new{ok=true,chat=chat,draftText="",submitted=true,deliveryConfirmed=false,result="Приложение приняло сообщение в чате «"+chat+"». Доставка получателю не проверена."};
  }
  throw new Exception("Неизвестное действие мессенджера.");
 }
}
