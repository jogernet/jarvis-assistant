function showOnStart(win){
 let shown=false;
 const show=()=>{if(shown||win.isDestroyed())return;shown=true;if(win.isMinimized())win.restore();win.show();win.focus();};
 win.once('ready-to-show',show);win.webContents.once('did-finish-load',show);
 return show;
}
module.exports={showOnStart};
