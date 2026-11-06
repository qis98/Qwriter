(async()=>{
  setView('compose');await openArticle('smoke-edit');
  const body='## 从一个问题开始\n\n正文含**重点**、++关键词++和==高亮==。\n\n> 为每天的思考留一点空间。\n\n### 回到生活\n\n- 记录具体观察\n- 区分事实与判断\n\n| 项目 | 说明 |\n| --- | --- |\n| 记录 | 先留下想法 |\n\n```text\n安全显示代码示例\n```';
  state.article=await call('save-article',{id:'smoke-edit',title:'排版引擎验证',body});
  const original=state.article.paragraphs.join('\n\n'),results=[];
  for(const layout of ['simple','reading','wechat','claude','media']){
    state.article=await call('save-layout','smoke-edit',layout);renderArticle();await window.pendingBodyPreview;
    const root=$('previewBody'),stored=await call('article','smoke-edit');
    results.push(stored.layout===layout&&stored.layoutRevision===3&&stored.paragraphs.join('\n\n')===original&&$('layoutSelect').value===layout&&!!root.querySelector('table th')&&!!root.querySelector('ul li')&&!!root.querySelector('pre code')&&!!root.querySelector('strong')&&!root.textContent.includes('++'));
  }
  return {allThemes:results.length===5&&results.every(Boolean),options:[...$('layoutSelect').options].filter(x=>x.value!=='manual').length===5,bodyUnchanged:state.article.paragraphs.join('\n\n')===original};
})()
