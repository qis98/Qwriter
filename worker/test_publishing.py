import unittest
import tempfile
from publishing import run,fingerprint

class Fake:
    def __init__(self):self.calls=[];self.draft={'news_item':[{'title':'Test','content':'<p>Original</p>','thumb_media_id':'cover'}]}
    def call(self,endpoint,payload):
        self.calls.append((endpoint,payload))
        if endpoint=='draft/get':return self.draft
        if endpoint=='media/uploadnews':return {'media_id':'broadcast-news'}
        return {'publish_id':123,'msg_id':456}

class PublishingTests(unittest.TestCase):
    def test_edit_rechecks_hash_and_preserves_other_articles_and_fields(self):
        class Editable(Fake):
            def call(self,endpoint,payload=None,asset=None):
                if endpoint=='draft/update':
                    self.calls.append((endpoint,payload));self.draft['news_item'][payload['index']]=dict(payload['articles']);return {'errcode':0}
                return super().call(endpoint,payload)
        c=Editable();c.draft['news_item'][0].update(author='作者',content_source_url='https://example.com',need_open_comment=1)
        c.draft['news_item'].append({'title':'另一篇','content':'<p>保持原样</p>','thumb_media_id':'cover2'})
        with tempfile.TemporaryDirectory() as root:
            request={'operation':'edit','root':root,'mediaId':'draft','hash':fingerprint(c.draft),'index':0,'title':'新标题','html':'<p style="font-size:24px">新正文</p>'}
            result=run(request,c)
            self.assertIn('24px',result['draft']['news_item'][0]['content'])
            self.assertEqual(c.draft['news_item'][0]['author'],'作者');self.assertEqual(c.draft['news_item'][0]['need_open_comment'],1)
            self.assertEqual(c.draft['news_item'][1]['title'],'另一篇')
            request['hash']='stale'
            before=len([call for call in c.calls if call[0]=='draft/update'])
            with self.assertRaisesRegex(ValueError,'已被修改'):run(request,c)
            self.assertEqual(len([call for call in c.calls if call[0]=='draft/update']),before)
    def test_changed_draft_never_submits(self):
        c=Fake()
        result=run({'operation':'submit','kind':'publish','mediaId':'draft','hash':'old'},c)
        self.assertEqual(result['outcome'],'blocked')
        self.assertEqual(len(c.calls),1)
    def test_publish_uses_draft_id(self):
        c=Fake();run({'operation':'submit','kind':'publish','mediaId':'draft','hash':fingerprint(c.draft)},c)
        self.assertEqual(c.calls[-1],('freepublish/submit',{'media_id':'draft'}))
    def test_mass_converts_draft_to_news_then_sends_all(self):
        c=Fake();run({'operation':'submit','kind':'mass','mediaId':'draft','hash':fingerprint(c.draft)},c)
        self.assertEqual(c.calls[-1][1]['mpnews']['media_id'],'broadcast-news')
        self.assertEqual(c.calls[-1][1]['filter'],{'is_to_all':True})
    def test_platform_url_changes_do_not_invalidate_editable_content(self):
        c=Fake();before=fingerprint(c.draft);c.draft['news_item'][0]['url']='different';self.assertEqual(before,fingerprint(c.draft))
