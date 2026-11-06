import importlib.util
import tempfile
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('worker',Path(__file__).resolve().parents[1]/'worker'/'worker.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)


class Fake:
    adds=0
    failure=None
    payload=None
    rewrite=None
    def __init__(self,credentials): pass
    def call(self,endpoint,payload=None,asset=None):
        if endpoint=='material/add_material': return {'media_id':'cover-1'}
        if endpoint=='media/uploadimg': return {'url':'http://mmbiz.qpic.cn/mmbiz_png/assetABC/0?wx_fmt=png'}
        if endpoint=='draft/add':
            Fake.adds+=1; Fake.payload=payload
            if Fake.failure=='timeout': raise TimeoutError()
            if Fake.failure=='missing': return {}
            if Fake.failure=='denied': raise w.WeChatReject('微信接口错误48001')
            return {'media_id':'draft-1'}
        if endpoint=='draft/get':
            item=dict(Fake.payload['articles'][0])
            if Fake.rewrite=='rendition':item['content']=item['content'].replace('http://mmbiz.qpic.cn/mmbiz_png/assetABC/0?wx_fmt=png','https://mmbiz.qlogo.cn/mmbiz_png/assetABC/640?wx_fmt=png&amp;from=app')
            if Fake.rewrite=='other':item['content']=item['content'].replace('assetABC','anotherAsset')
            return {'news_item':[item]}
        raise AssertionError(endpoint)


class Delivery(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.directory=Path(self.temp.name)
        w.atomic(self.directory/'article.json',{'id':'test','title':'测试','paragraphs':['正文测试'],'digest':'摘要','aiImages':{}})
        (self.directory/'cover.png').write_bytes(b'cover')
        self.original=w.WeChat;w.WeChat=Fake;Fake.adds=0;Fake.failure=None;Fake.rewrite=None
        self.request={'wechat':{'appId':'test-account','author':'作者'}}
    def tearDown(self): w.WeChat=self.original;self.temp.cleanup()
    def test_repeat_save_reuses_media_id(self):
        w.send(self.request,self.directory);w.send(self.request,self.directory)
        self.assertEqual(Fake.adds,1)
    def test_default_theme_preserves_old_receipt_and_new_theme_creates_new_version(self):
        w.send(self.request,self.directory)
        a=w.load(self.directory/'article.json');a['layout']='simple';w.atomic(self.directory/'article.json',a)
        w.send(self.request,self.directory);self.assertEqual(Fake.adds,1)
        a['layout']='reading';w.atomic(self.directory/'article.json',a)
        w.send(self.request,self.directory);self.assertEqual(Fake.adds,2)
    def test_timeout_blocks_blind_retry(self):
        Fake.failure='timeout'
        with self.assertRaises(TimeoutError): w.send(self.request,self.directory)
        with self.assertRaisesRegex(ValueError,'结果不确定'): w.send(self.request,self.directory)
        self.assertEqual(Fake.adds,1)
    def test_missing_id_blocks_blind_retry(self):
        Fake.failure='missing'
        with self.assertRaises(ValueError): w.send(self.request,self.directory)
        with self.assertRaisesRegex(ValueError,'结果不确定'): w.send(self.request,self.directory)
        self.assertEqual(Fake.adds,1)
    def test_definitive_rejection_can_be_retried_after_fix(self):
        Fake.failure='denied'
        with self.assertRaises(w.WeChatReject): w.send(self.request,self.directory)
        Fake.failure=None;w.send(self.request,self.directory)
        self.assertEqual(Fake.adds,2)
    def test_generated_html_cannot_execute_model_markup(self):
        self.assertNotIn('<script>',w.render({'paragraphs':['<script>alert(1)</script>']}))
    def test_all_new_themes_upload_exact_preview_html_and_reuse_receipts(self):
        (self.directory/'body.png').write_bytes(b'body')
        paragraphs=['## 章节','正文**重点**。','> 引用','- 第一项\n- 第二项','| 甲 | 乙 |\n| --- | --- |\n| 一 | 二 |']
        for theme in ('simple','reading','wechat','claude','media'):
            article=w.load(self.directory/'article.json')
            article.update(layout=theme,layoutRevision=3,paragraphs=paragraphs)
            w.atomic(self.directory/'article.json',article)
            preview=w.render(article,'qwriter-local://body')
            w.send(self.request,self.directory)
            expected=preview.replace('qwriter-local://body','http://mmbiz.qpic.cn/mmbiz_png/assetABC/0?wx_fmt=png')
            self.assertEqual(Fake.payload['articles'][0]['content'],expected)
            adds=Fake.adds;w.send(self.request,self.directory);self.assertEqual(Fake.adds,adds)
    def test_rich_edits_upload_images_and_keep_manual_sizes_after_readback(self):
        import io,base64
        from PIL import Image
        from rich_content import store_images
        data=io.BytesIO();Image.new('RGB',(5,5),'blue').save(data,format='PNG')
        source='data:image/png;base64,'+base64.b64encode(data.getvalue()).decode()
        content=store_images('<p style="font-size:24px">手动排版</p><img style="width:50%" src="'+source+'">',self.directory)
        article=w.load(self.directory/'article.json');article['richHtml']=content;article['paragraphs']=['手动排版'];w.atomic(self.directory/'article.json',article)
        result=w.send(self.request,self.directory)
        self.assertEqual(result['article']['status'],'saved')
        self.assertIn('font-size:24px',Fake.payload['articles'][0]['content']);self.assertNotIn('qwriter-asset:',Fake.payload['articles'][0]['content'])
        self.assertIn('http://mmbiz.qpic.cn/',Fake.payload['articles'][0]['content'])
        before=Fake.adds;w.send(self.request,self.directory);self.assertEqual(Fake.adds,before)
    def test_one_paragraph_image_is_included_and_cdn_width_rewrite_is_verified(self):
        (self.directory/'body.png').write_bytes(b'body');Fake.rewrite='rendition'
        result=w.send(self.request,self.directory)
        self.assertEqual(result['article']['status'],'saved');self.assertIn('<img ',Fake.payload['articles'][0]['content'])
        w.send(self.request,self.directory);self.assertEqual(Fake.adds,1)
    def test_unknown_image_does_not_claim_verification_or_duplicate_draft(self):
        (self.directory/'body.png').write_bytes(b'body');Fake.rewrite='other'
        result=w.send(self.request,self.directory)
        self.assertEqual(result['article']['status'],'saved_unverified');self.assertIn('核对',result['article']['warning'])
        Fake.rewrite=None;result=w.send(self.request,self.directory)
        self.assertEqual(result['article']['status'],'saved');self.assertEqual(Fake.adds,1)


if __name__=='__main__': unittest.main()
