const path=require('node:path');
function profilePath(app,{root=__dirname,smoke=false,distributionRoot=process.env.JARVIS_DISTRIBUTION_ROOT}={}){
 if(smoke)return path.join(root,'runtime','test-profile');
 return app.isPackaged||distributionRoot?path.join(app.getPath('appData'),'JARVIS'):path.join(root,'runtime','desktop-profile');
}
module.exports={profilePath};
