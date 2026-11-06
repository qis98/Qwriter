"""Qwriter's local daily check-in adapter. No credential export or notifications."""
import hashlib
import json
from pathlib import Path
from urllib.request import Request, build_opener, ProxyHandler, HTTPRedirectHandler

BASE='https://copilot.tencent.com/v2/billing/meter/'
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None

def account_key(filename): return hashlib.sha256(filename.encode()).hexdigest()

def check_account(request):
    """Only a confirmed active, unchecked account may receive one claim request."""
    def status():
        envelope=request('checkin-activity-status')
        if not isinstance(envelope,dict) or envelope.get('code')!=0 or not isinstance(envelope.get('data'),dict):
            raise ValueError('签到状态不可确认，请稍后重试。')
        return envelope['data']
    def checked(s): return s.get('today_checked_in') is True or type(s.get('today_checked_in')) is int and s['today_checked_in']==1
    def result(s,kind): return {'status':kind,'credit':s.get('today_credit') if isinstance(s.get('today_credit'),(int,float)) else None}
    current=status()
    if checked(current): return result(current,'ALREADY')
    if current.get('active') is False:return {'status':'INACTIVE','credit':None}
    if current.get('active') is not True or current.get('today_checked_in') not in (False,0):
        raise ValueError('签到状态字段不完整，本次未领取。')
    # Never blindly retry a claim; after any response/error, verify status once.
    try: request('daily-checkin')
    except Exception: pass
    verified=status()
    if checked(verified):return result(verified,'CLAIMED')
    raise ValueError('签到结果未确认，稍后可重新检查。')

def run_checkin(task):
    cfg=json.loads(Path(task['gatewayConfig']).read_text(encoding='utf-8'))
    auth_dir=Path(cfg['auth_dir']).resolve()
    proxy=cfg.get('upstream',{}).get('proxy','')
    opener=build_opener(ProxyHandler({'http':proxy,'https':proxy} if proxy else {}),NoRedirect())
    completed=set(task.get('completedKeys',[]));items=[]
    for filename in task.get('accountFiles',[]):
        if not isinstance(filename,str) or Path(filename).name!=filename or '/' in filename or '\\' in filename:raise ValueError('签到账号文件无效。')
        key=account_key(filename)
        if key in completed:items.append({'key':key,'status':'CACHED'});continue
        item={'key':key}
        try:
            file=(auth_dir/filename).resolve()
            if file.parent!=auth_dir:raise ValueError('账号文件不在本机授权目录。')
            stored=json.loads(file.read_text(encoding='utf-8'));auth=stored.get('auth',stored)
            realm=auth.get('realm',stored.get('realm','cn'))
            domain=auth.get('domain',stored.get('domain',''))
            if realm=='global' or 'codebuddy.ai' in domain:item.update(status='SKIPPED');items.append(item);continue
            token=auth.get('accessToken') or auth.get('access_token')
            if not token:raise ValueError('请重新登录 WorkBuddy。')
            headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','X-CodeBuddy-Request':'1','X-Requested-With':'XMLHttpRequest','Origin':'https://www.codebuddy.cn','Referer':'https://www.codebuddy.cn/'}
            device=auth.get('device_token') or stored.get('device_token')
            if device:headers['X-Device-Token']=device
            def request(endpoint):
                req=Request(BASE+endpoint,data=b'{}',headers=headers,method='POST')
                with opener.open(req,timeout=20) as response:return json.load(response)
            item.update(check_account(request))
        except Exception as error:
            code=getattr(error,'code',None)
            item.update(status='AUTH' if code in (401,403) else 'ERROR',credit=None)
        items.append(item)
    return {'items':items}
