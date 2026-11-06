const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');

const defaultWorkspace=base=>path.join(base,'Qwriter','workspace');
function contains(parent,child){const rel=path.relative(path.resolve(parent),path.resolve(child));return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
async function manifest(folder){
  const result={};
  async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name),rel=path.relative(folder,file);
    if(rel==='model-runtime')continue;
    if(entry.isSymbolicLink())throw Error('数据目录含有链接，请先将链接替换为实际文件。');
    if(entry.isDirectory())await walk(file);
    else if(entry.isFile())result[rel]=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
  }}
  await walk(folder);return result;
}
async function savePreferences(file,data){await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(data,null,2));await fs.rename(temp,file);}
async function migrateWorkspace(source,destination,preferencesFile){
  source=path.resolve(source);destination=path.resolve(destination);
  if(source.toLowerCase()===destination.toLowerCase())return source;
  if(contains(source,destination)||contains(destination,source))throw Error('新目录不能位于当前数据目录内部，也不能是它的上级目录。');
  // Resolve existing parents to reject junctions that lead back into the source.
  let ancestor=destination;
  while(true){try{const real=await fs.realpath(ancestor);if(contains(source,real)||contains(real,source)&&ancestor===destination)throw Error('所选目录指向当前数据目录或它的内部。');break;}catch(e){if(e.code!=='ENOENT')throw e;const parent=path.dirname(ancestor);if(parent===ancestor)throw e;ancestor=parent;}}
  try{if((await fs.readdir(destination)).length)throw Error('请选择一个空文件夹，避免覆盖其他数据。');}catch(e){if(e.code!=='ENOENT')throw e;}
  await fs.mkdir(path.dirname(destination),{recursive:true});
  const stage=await fs.mkdtemp(path.join(path.dirname(destination),'.qwriter-copy-'));
  await fs.rmdir(stage); // cp requires a new destination; this allocated directory is still empty.
  let committed=false;
  try{
    const before=await manifest(source);
    await fs.cp(source,stage,{recursive:true,force:false,errorOnExist:true,filter:file=>path.relative(source,file).split(path.sep)[0]!=='model-runtime'});
    const after=await manifest(stage),current=await manifest(source);
    const same=(a,b)=>Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>a[k]===b[k]);
    if(!same(before,after)||!same(before,current))throw Error('数据校验未通过，仍使用原目录。请稍后重试。');
    try{await fs.rmdir(destination);}catch(e){if(e.code!=='ENOENT')throw e;}
    await fs.rename(stage,destination);
    let prefs={};try{prefs=JSON.parse(await fs.readFile(preferencesFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    await savePreferences(preferencesFile,{...prefs,dataDir:destination});committed=true;return destination;
  }finally{
    // Only remove the staging folder allocated by mkdtemp, never source/destination.
    if(!committed)await fs.rm(stage,{recursive:true,force:true});
  }
}
module.exports={defaultWorkspace,migrateWorkspace,savePreferences,contains};
