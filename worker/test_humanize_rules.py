import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('worker',Path(__file__).with_name('worker.py'))
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
class RewriteValidation(unittest.TestCase):
    def test_numbers_and_quotes_must_be_preserved(self):
        original={'title':'标题','paragraphs':['计划在2026年完成，可能减少10%的开销。他说“尚未验证”。']}
        w.validate_rewrite(original,['计划在2026年完成，可能省下10%的开销。他说“尚未验证”。'])
        with self.assertRaises(ValueError):w.validate_rewrite(original,['2026年已经完成，减少了20%。他说“已经验证”。'])
    def test_html_escapes_and_theme_applies(self):
        a={'paragraphs':['## 章节','<script>test</script>'],'layout':'reading'}
        rendered=w.render(a)
        self.assertNotIn('<script>',rendered);self.assertIn('48px',rendered);self.assertIn('01',rendered)
    def test_model_rewrite_does_not_write_original(self):
        import tempfile,json
        with tempfile.TemporaryDirectory() as folder:
            d=Path(folder);original={'title':'标题','paragraphs':['计划在2026年完成，可能减少10%的开销。他说“尚未验证”。']}
            w.atomic(d/'article.json',original);w.atomic(d/'config.json',{'api_key':'isolated-test'})
            previous=w.json_request
            def fake(url,payload,headers):
                self.assertEqual(payload['messages'][0]['role'],'system');self.assertEqual(payload['messages'][1]['role'],'user')
                return {'choices':[{'message':{'content':json.dumps({'paragraphs':['计划在2026年完成，可能省下10%的开销。他说“尚未验证”。']},ensure_ascii=False)}}]}
            w.json_request=fake
            try:
                result=w.humanize({'gatewayConfig':str(d/'config.json')},d)
                self.assertNotEqual(result['paragraphs'],original['paragraphs']);self.assertEqual(w.load(d/'article.json'),original)
            finally:w.json_request=previous
    def test_structure_inserts_only_headings_and_preserves_mixed_paragraph_body(self):
        import tempfile,json
        with tempfile.TemporaryDirectory() as folder:
            d=Path(folder);original={'title':'标题','paragraphs':['正文原句。\n继续一句。','另一段原句。']};w.atomic(d/'article.json',original);w.atomic(d/'config.json',{'api_key':'isolated-test'})
            previous=w.json_request
            w.json_request=lambda *args,**kwargs:{'choices':[{'message':{'content':json.dumps({'headings':[{'before':0,'level':2,'title':'新标题'}]})}}]}
            try:
                result=w.structure({'gatewayConfig':str(d/'config.json')},d)
                self.assertEqual([p for p in result['paragraphs'] if not p.startswith('## ')],original['paragraphs']);self.assertEqual(w.load(d/'article.json'),original)
            finally:w.json_request=previous
    def test_existing_chapters_preserved_without_model_or_credentials(self):
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            d=Path(folder);original={'title':'标题','paragraphs':['## 旧标题\n正文原句。','另一段原句。']};w.atomic(d/'article.json',original)
            result=w.structure({},d);self.assertEqual(result['paragraphs'],original['paragraphs'])
if __name__=='__main__':unittest.main()
