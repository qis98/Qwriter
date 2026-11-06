const path=require('node:path');
async function logoutModel(request){
  const data=await request('/ui/data');
  for(const account of data.accounts||[]){
    const file=account.filename;
    if(typeof file!=='string'||!file||path.win32.basename(file)!==file||path.posix.basename(file)!==file)throw Error('模型账号文件无效，未退出。');
    if(!(await request('/ui/action/delete',{filename:file})).success)throw Error('账号退出失败，请重试。');
  }
  if((await request('/ui/data')).accounts?.length)throw Error('部分账号退出失败，请重试。');
  return true;
}
function disconnectedWechat(settings){const next={...settings,pocImported:true};for(const key of ['appId','secret','accountName','author'])delete next[key];return next;}
module.exports={logoutModel,disconnectedWechat};
