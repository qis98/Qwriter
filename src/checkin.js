const crypto=require('node:crypto');
const chinaDay=(time=Date.now())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
const accountKey=file=>crypto.createHash('sha256').update(file).digest('hex');
const isComplete=item=>['CLAIMED','ALREADY','CACHED'].includes(item?.status);
const eligibleAccounts=accounts=>accounts.filter(a=>!a.disabled&&a.realm!=='global');
function checkinSummary(state){const items=state?.items||[];if(!items.length)return '等待签到';if(items.some(x=>x.status==='AUTH'))return '登录已失效，请重新登录';if(items.some(x=>x.status==='ERROR'))return '签到未确认，可重新检查';if(items.every(isComplete))return '今日已签到';if(items.every(x=>x.status==='INACTIVE'))return '签到活动未开启';if(items.every(x=>x.status==='SKIPPED'))return '当前账号无签到活动';return '部分账号已处理';}
module.exports={chinaDay,accountKey,isComplete,checkinSummary,eligibleAccounts};
