import unittest,io,json,time,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('worker_client_fixture',Path(__file__).resolve().parents[1]/'worker/worker.py');w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
class Opener:
    def __init__(self,responses):self.responses=list(responses);self.paths=[]
    def open(self,request,timeout):self.paths.append(request.full_url.split('?')[0]);return io.StringIO(json.dumps(self.responses.pop(0)))
class WeChatClientTests(unittest.TestCase):
    def client(self,responses):
        client=w.WeChat({'appId':'isolated','secret':'isolated','_token':{'value':'cached-fixture','expiresAt':time.time()+3600}});client.opener=Opener(responses);return client
    def test_draft_update_is_allowed_and_valid_cached_token_is_reused(self):
        client=self.client([{'errcode':0}]);client.call('draft/update',{'media_id':'fixture','index':0,'articles':{}})
        self.assertEqual(len(client.opener.paths),1);self.assertTrue(client.opener.paths[0].endswith('/draft/update'))
    def test_expired_remote_token_refreshes_once_before_retrying_rejected_call(self):
        client=self.client([{'errcode':42001},{'access_token':'fresh-fixture','expires_in':7200},{'news_item':[]}]);client.call('draft/get',{'media_id':'fixture'})
        self.assertEqual(len(client.opener.paths),3);self.assertTrue(client.opener.paths[1].endswith('/token'))
