import unittest
from article_layout import render,blocks
class ArticleLayoutTests(unittest.TestCase):
    def modern(self,paragraphs,layout='reading',image=None):
        return render({'layout':layout,'layoutRevision':3,'paragraphs':paragraphs},image)
    def test_five_themes_render_semantics_and_escape_markup(self):
        content=['## 第一章','正文含**强调**与++关键词++、==高亮==和`代码`。','> 一段引用','- 条目甲\n- 条目乙','3. 第三项\n4. 第四项','| 项目 | 内容 |\n| --- | --- |\n| 甲 | 乙 |','```html\n<script>alert(1)</script>\n```','---']
        outputs=[]
        for theme in ('simple','reading','wechat','claude','media'):
            output=self.modern(content,theme);outputs.append(output)
            for marker in ('<strong','<blockquote','<ul','<ol','start="3"','<table','<th','<td','<pre','<code','<hr'):
                self.assertIn(marker,output,theme)
            self.assertNotIn('<script>',output);self.assertNotIn('display:flex',output)
            self.assertNotIn('<style',output);self.assertNotIn('++',output)
        self.assertEqual(len(set(outputs)),5)
    def test_explicit_local_image_position_and_single_auto_image(self):
        output=self.modern(['正文前','![位置](body.png)','正文后'],image='https://mmbiz.qpic.cn/a')
        self.assertEqual(output.count('<img '),1)
        self.assertLess(output.index('正文前'),output.index('<img '));self.assertLess(output.index('<img '),output.index('正文后'))
        self.assertEqual(self.modern(['一段'],image='qwriter-local://body').count('<img '),1)
        from rich_content import paragraphs
        self.assertEqual(paragraphs(output),['正文前','正文后'])
    def test_external_images_and_html_are_not_executed_or_fetched(self):
        output=self.modern(['<img src="file:///secret" onerror="alert(1)">','![外链](https://example.org/private)','[链接](javascript:alert(1))'])
        self.assertNotIn('<img ',output);self.assertNotIn('href="javascript:',output)
        self.assertNotIn('<script',output);self.assertIn('&lt;img',output)
    def test_new_engine_numbering_and_heading_values(self):
        output=self.modern(['## 01 开始','正文','## 10 个观察','### 子标题','## 3.14 的意义'])
        self.assertIn('>01</span>',output);self.assertIn('>03</span>',output)
        self.assertIn('10 个观察',output);self.assertIn('3.14 的意义',output)
    def test_old_drafts_keep_their_render_version_until_theme_selection(self):
        old={'layout':'reading','layoutRevision':2,'paragraphs':['- 条目甲\n- 条目乙']}
        self.assertNotIn('<ul',render(old));self.assertIn('<ul',render({**old,'layoutRevision':3}))
    def test_chapters_subheads_and_keyword_markup(self):
        article={'layout':'reading','paragraphs':['导语','## 01 第一章','正文++关键短语++。','### 细节','第二段。','## 第二章','结束。']}
        result=render(article)
        self.assertIn('48px',result);self.assertIn('>01</span>',result);self.assertIn('>02</span>',result);self.assertIn('border-left:3px',result)
        self.assertNotIn('##',result);self.assertNotIn('++',result)
    def test_simple_and_graphite_are_structurally_different(self):
        a={'paragraphs':['## 小标题','正文。']}
        self.assertNotIn('>01</span>',render({**a,'layout':'simple'}));self.assertIn('>01</span>',render({**a,'layout':'reading'}))
    def test_mixed_heading_and_body_not_lost(self):
        self.assertEqual(blocks(['## 标题\n正文\n继续']),[('h2','标题'),('p','正文\n继续')])
    def test_numeric_information_in_heading_is_preserved(self):
        result=render({'layout':'reading','paragraphs':['## 10 个观察','正文','## 3.14 的意义','正文']})
        self.assertIn('10 个观察',result);self.assertIn('3.14 的意义',result)
if __name__=='__main__':unittest.main()
