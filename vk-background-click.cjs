// Click only an element located by the VK library bridge, without raising its window.
async function backgroundClick(contents,target,{hoverOnly=false}={}){
 if(!target||![target.x,target.y].every(Number.isFinite)||target.x<0||target.y<0)throw Error('Некорректная позиция кнопки VK.');
 const transport=contents.debugger;if(!transport)return false;
 // Do not take over an existing DevTools/debugger session.
 if(transport.isAttached())return false;
 transport.attach('1.3');
 try{
  const {x,y}=target;
  await transport.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:'none',buttons:0});
  if(hoverOnly)return true;
  await transport.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
  await transport.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});
  return true;
 }finally{if(transport.isAttached())transport.detach();}
}
module.exports={backgroundClick};
