const {test}=require('node:test');const assert=require('node:assert/strict');
const {cleanRichHtml,imageSource}=require('../src/rich-content');
test('returning to theme layout preserves headings and inline image markers',()=>{
  const {richToMarkdown}=require('../src/rich-content');const marker='qwriter-asset://'+'a'.repeat(64)+'.png';
  const markdown=richToMarkdown('<h2>标题</h2><p style="font-size:24px">正文</p><img src="'+marker+'">');
  assert.match(markdown,/## 标题/);assert.ok(markdown.includes(marker));assert.doesNotMatch(markdown,/font-size/);
});
test('rich editing preserves font sizes and table structure while rejecting active markup',()=>{
  const result=cleanRichHtml('<p style="font-size:24px;color:#333;position:fixed;background-image:url(https://evil.test)"><strong>正文</strong><img src="file:///a" onerror="a()"></p><script>a()</script><table><tr><td>表格</td></tr></table>');
  assert.match(result,/font-size:24px/);assert.match(result,/<strong>正文/);assert.match(result,/<td>表格/);
  assert.doesNotMatch(result,/script|onerror|position|url\(|file:/);
});
test('rich image sources only accept bounded local markers and approved image domains',()=>{
  assert.equal(imageSource('https://mmbiz.qpic.cn/image'),true);assert.equal(imageSource('https://mmbiz.qpic.cn.evil.test/image'),false);
  assert.equal(imageSource('qwriter-asset://'+'a'.repeat(64)+'.png'),true);assert.equal(imageSource('qwriter-asset://../../secret'),false);
  assert.equal(imageSource('data:image/svg+xml;base64,AAA'),false);
  assert.match(cleanRichHtml('<img src="https://mmbiz.qpic.cn/image">'),/height:auto/);
});
