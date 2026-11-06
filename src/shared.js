function targetWords(value){const n=value==null||value===''?300:Number(value);if(!Number.isSafeInteger(n)||n<100||n>12000)throw Error('目标字数需在100至12000字之间。');return n;}
function validateId(id){if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw Error('文章编号无效');return id;}
function publicSettings(s){return {appId:s.appId||'',accountName:s.accountName||'',author:s.author||'',hasSecret:!!s.secret,startupError:s.startupError||'',autoSave:s.autoSave!==false,autoCheckin:s.autoCheckin!==false};}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function normalizeArticle(a){if(a?.status==='needs_attention'&&a.error==='正文图片读回不一致，请核对已有草稿。'){const result={...a,status:'saved_unverified',warning:'已有草稿，正文图片待核对。更新公众号配置后可重新核验。'};delete result.error;return result;}return a;}
module.exports={targetWords,validateId,publicSettings,escapeHtml,normalizeArticle};
