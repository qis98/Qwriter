import unittest,tempfile,io,base64
from pathlib import Path
from PIL import Image
from rich_content import png_bytes,store_images,upload_images,paragraphs

class RichContentTests(unittest.TestCase):
    def test_assets_roundtrip_and_upload_only_once(self):
        output=io.BytesIO();Image.new('RGB',(4,4),'blue').save(output,format='PNG')
        data='data:image/png;base64,'+base64.b64encode(output.getvalue()).decode()
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);content=store_images('<p>正文</p><img src="'+data+'">',folder)
            self.assertNotIn('base64',content);self.assertIn('qwriter-asset://',content)
            class Client:
                calls=0
                def call(self,endpoint,asset):self.calls+=1;return {'url':'https://mmbiz.qpic.cn/asset'}
            client=Client();state={}
            result,urls=upload_images(content,folder,client,state,lambda:None)
            upload_images(content,folder,client,state,lambda:None)
            self.assertEqual(client.calls,1);self.assertIn('https://mmbiz.qpic.cn/asset',result);self.assertEqual(paragraphs(content),['正文'])
    def test_missing_assets_and_invalid_images_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError,'丢失'):store_images('<img src="qwriter-asset://'+'a'*64+'.png">',Path(temp))
        with self.assertRaises(Exception):png_bytes('data:image/png;base64,AAA=')
