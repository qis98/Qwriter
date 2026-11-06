(async()=>{
  await call('save-settings',{appId:'wx0000000000000000',secret:'isolated-smoke-test-secret',accountName:'隔离测试'});
  setView('publishing');await syncCloudDrafts();
  if(document.querySelectorAll('.cloud-draft').length!==1)throw Error('草稿列表未渲染');
  await inspectCloudDraft('review-draft');
  if($('publishForm').hidden||!publicationReview?.token)throw Error('发送确认未就绪');
  if($('publishConfirm').checked)throw Error('发送确认不能默认勾选');
  $('publishWhen').value='later';$('publishWhen').onchange();
  if($('publishTime').hidden||!$('publishTime').required)throw Error('定时输入未显示');
  $('publishKind').value='mass';$('publishKind').onchange();
  if(!$('publishSubmit').textContent.includes('全部粉丝'))throw Error('群发目标不明确');
  let blocked=false;try{await call('publish-commit',{token:publicationReview.token,kind:'mass',confirmed:true});}catch{blocked=true;}
  if(!blocked)throw Error('隔离测试意外允许真实发送');
  setView('compose');return {draftList:true,review:true,consentDefaultOff:true,schedule:true,massTarget:true,externalMutationBlocked:true};
})()
