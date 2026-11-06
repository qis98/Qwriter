"""Bounded section generation for long articles using the existing local gateway."""
import json,math,re

def target_words(value):
    if value is None or value=='':return 300
    if isinstance(value,bool) or not re.fullmatch(r'\d+',str(value)) or not 100<=int(value)<=12000:
        raise ValueError('目标字数需在100至12000字之间。')
    return int(value)

def add_usage(total,usage):
    for key,value in (usage or {}).items():
        if isinstance(value,(int,float)) and not isinstance(value,bool):total[key]=total.get(key,0)+value
        elif isinstance(value,dict):add_usage(total.setdefault(key,{}),value)

def compose_long(request,cfg,article,directory,call,save,write,emit,make_cover=None):
    words=target_words(request['spec'].get('words'));count=math.ceil(words/1500);usage={};model=None
    def ask(prompt,budget,name):
        nonlocal model
        result=call(request.get('gatewayBase','http://127.0.0.1:17865')+'/v1/chat/completions',
            {'model':'cn:deepseek-v4.1-flash','stream':False,'max_tokens':budget,'thinking':{'type':'disabled'},'messages':[{'role':'user','content':prompt}]},
            {'Authorization':'Bearer '+cfg['api_key'],'Content-Type':'application/json'})
        choice=result['choices'][0];text=choice.get('message',{}).get('content','').strip()
        write(directory/name,{'content':text,'finishReason':choice.get('finish_reason'),'usage':result.get('usage')})
        add_usage(usage,result.get('usage'));article['usage']=dict(usage);model=result.get('model')
        if choice.get('finish_reason')=='length':raise ValueError('本节输出被截断，已有章节已保留，请检查后继续编辑。')
        cleaned=re.sub(r'^```(?:json)?\s*|\s*```$','',text)
        try:return json.loads(cleaned)
        except ValueError:raise ValueError('本节返回格式不完整，已有章节已保留。') from None
    emit('progress',stage='text',message='正在规划长文章章节…')
    plan=ask(f'为普通公众号文章规划提纲，主题：{article["topic"]}，目标约{words}个汉字，语气{article["tone"]}。'
        f'按完整论述规划恰好{count}个章节，不重复论点；不要虚构事实、统计、新闻、亲历或来源。'
        '只返回JSON：title、digest（50字内）、imagePrompt（英文主题插画，无文字）、chapters（章节标题字符串数组，不写编号）。',2500,'model-output-plan.json')
    chapters=plan.get('chapters')
    if not isinstance(chapters,list) or len(chapters)!=count or any(not isinstance(c,str) or not 1<=len(c.strip())<=60 for c in chapters):
        raise ValueError('长文提纲格式不完整，请重新生成；任务记录已保留。')
    article.update(title=str(plan.get('title') or article['topic'])[:64],digest=str(plan.get('digest') or '')[:120],paragraphs=[],usage=usage,imagePrompt=str(plan.get('imagePrompt') or 'Editorial illustration, no text, no logos.'))
    if make_cover:make_cover(directory,article['title'])
    save(directory,article)
    for index,chapter in enumerate(chapters):
        size=words//count+(1 if index<words%count else 0)
        emit('progress',stage='text',message=f'正在撰写第 {index+1} / {count} 节…')
        previous='\n'.join(article['paragraphs'][-2:])[-700:]
        data=ask(f'撰写普通公众号文章《{article["title"]}》的第{index+1}节，章节标题：{chapter}。本节约{size}个汉字，语气{article["tone"]}。'
            f'全文提纲：{json.dumps(chapters,ensure_ascii=False)}。前文末段：{previous}。'
            '本节只展开自己的论点，不重复前文，不提前写后续章节，不重复文章总开头。自然衔接，段落简洁。'
            '不编造统计、新闻、亲历、专业事实或已查证来源；不作医疗法律金融指导。'
            '只返回JSON对象：paragraphs（正文字符串数组），不要在正文重复章节标题。',max(1800,size*3),f'model-output-section-{index+1:02d}.json')
        paragraphs=data.get('paragraphs')
        if not isinstance(paragraphs,list) or not paragraphs or any(not isinstance(p,str) for p in paragraphs):raise ValueError('章节内容无效，已有正文已保留。')
        parts=[re.sub(r'^#{1,6}[^\n]*\n?','',part).strip() for p in paragraphs for part in re.split(r'\n\s*\n',p)]
        parts=[p for p in parts if p]
        if not parts or len(''.join(parts))>16000:raise ValueError('章节长度异常，已有正文已保留。')
        article['paragraphs'].extend(['## '+chapter.strip(),*parts]);save(directory,article)
    return {'title':article['title'],'digest':article['digest'],'paragraphs':article['paragraphs'],'imagePrompt':str(plan.get('imagePrompt') or 'Editorial illustration, no text, no logos.')},{'usage':usage,'model':model}
