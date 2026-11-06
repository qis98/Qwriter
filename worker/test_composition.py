import unittest,tempfile,json
from pathlib import Path
from composition import target_words,compose_long

class CompositionTests(unittest.TestCase):
    def test_hidden_target_limit_and_empty_default(self):
        self.assertEqual(target_words(''),300);self.assertEqual(target_words(12000),12000)
        for value in (12001,99,300.5,True,'abc'):
            with self.assertRaises(ValueError):target_words(value)
    def test_long_articles_use_bounded_calls_and_checkpoint_each_section(self):
        calls=[];saved=[];events=[]
        def call(url,body,headers):
            calls.append(body)
            result={'title':'长文','digest':'摘要','chapters':['章节'+str(i) for i in range(8)]} if len(calls)==1 else {'paragraphs':['正文内容。'*30]}
            return {'choices':[{'message':{'content':json.dumps(result,ensure_ascii=False)},'finish_reason':'stop'}],'usage':{'credit':1,'total_tokens':100},'model':'fixture'}
        with tempfile.TemporaryDirectory() as temp:
            article={'topic':'思考','tone':'自然','paragraphs':[]}
            result,meta=compose_long({'spec':{'words':12000}},{'api_key':'isolated'},article,Path(temp),call,lambda _,a:saved.append(len(a['paragraphs'])),lambda p,v:p.write_text(json.dumps(v)),lambda *a,**k:events.append(k))
            self.assertEqual(len(calls),9);self.assertLessEqual(max(c['max_tokens'] for c in calls),4500)
            self.assertEqual(meta['usage']['credit'],9);self.assertEqual(sum(p.startswith('## ') for p in result['paragraphs']),8)
            self.assertEqual(len(saved),9);self.assertIn('第 8 / 8',events[-1]['message'])
    def test_truncated_later_section_keeps_completed_text_without_retrying(self):
        calls=[];saved=[]
        def call(*args):
            calls.append(1);data={'title':'长文','chapters':['第一章','第二章']} if len(calls)==1 else {'paragraphs':['已有正文。'*20]}
            return {'choices':[{'message':{'content':json.dumps(data,ensure_ascii=False)},'finish_reason':'length' if len(calls)==3 else 'stop'}]}
        with tempfile.TemporaryDirectory() as temp:
            article={'topic':'思考','tone':'自然','paragraphs':[]}
            with self.assertRaisesRegex(ValueError,'截断'):
                compose_long({'spec':{'words':3000}},{'api_key':'fixture'},article,Path(temp),call,lambda _,a:saved.append(list(a['paragraphs'])),lambda *a:None,lambda *a,**k:None)
            self.assertEqual(len(calls),3);self.assertEqual(saved[-1][0],'## 第一章');self.assertEqual(len(saved[-1]),2)
