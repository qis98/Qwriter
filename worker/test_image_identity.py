import unittest
from image_identity import image_present
class ImageIdentityTests(unittest.TestCase):
    def test_known_wechat_rendition_rewrite(self):
        self.assertTrue(image_present('http://mmbiz.qpic.cn/mmbiz_png/assetABC/0?wx_fmt=png','<IMG data-src="https://mmbiz.qlogo.cn/mmbiz_png/assetABC/640?wx_fmt=png&amp;from=app" src="data:image/png;base64,x">'))
        self.assertTrue(image_present('https://mmbiz.qpic.cn/sz_mmbiz_png/assetABC/0?wx_fmt=png','<img src="https://mmbiz.qpic.cn/sz_mmbiz_png/assetABC/1080?wx_fmt=png">'))
    def test_different_asset_or_untrusted_host_is_not_same(self):
        expected='https://mmbiz.qpic.cn/mmbiz_png/assetABC/0'
        for url in ['https://mmbiz.qpic.cn/mmbiz_png/other/640','https://evil.example/mmbiz_png/assetABC/0']:
            self.assertFalse(image_present(expected,'<img src="'+url+'">'))
    def test_missing_image_is_not_verified(self):self.assertFalse(image_present('https://mmbiz.qpic.cn/mmbiz_png/a/0','<p>正文</p>'))
if __name__=='__main__':unittest.main()
