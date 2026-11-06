"""WeChat-safe body rendering, shared by local preview and draft delivery.

Graphite components adapted from the user's gzh-design theme used in share计划.
"""
import html,re

LAYOUTS=('simple','reading','wechat','claude','media')
FONT="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif"

def leaf(text):return '<span leaf="">'+html.escape(text)+'</span>'

def inline(text):
    parts=[]
    for piece in re.split(r'(\*\*[^*\n]+\*\*|\+\+[^+\n]+\+\+)',text):
        if piece.startswith('**') and piece.endswith('**'):
            parts.append('<strong style="color:#27272A;">'+leaf(piece[2:-2])+'</strong>')
        elif piece.startswith('++') and piece.endswith('++'):
            parts.append('<span style="border-bottom:2px solid #52525B;font-weight:600;color:#27272A;">'+leaf(piece[2:-2])+'</span>')
        else:parts.append('<br>'.join(leaf(line) for line in piece.split('\n')))
    return ''.join(parts)

def blocks(paragraphs):
    result=[]
    for paragraph in paragraphs:
        pending=[]
        def flush():
            if pending:result.append(('p','\n'.join(pending)));pending.clear()
        for line in str(paragraph).splitlines():
            match=re.match(r'^\s*(#{2,3})\s+(.+?)\s*$',line)
            if match:
                flush();result.append(('h2' if len(match[1])==2 else 'h3',match[2]));continue
            if line.startswith('> '):flush();result.append(('quote',line[2:]));continue
            pending.append(line)
        flush()
    return result

def legacy_render(article,body_image=None):
    reading=article.get('layout')=='reading';pieces=[];number=0
    content=blocks(article.get('paragraphs',[]));body_positions=[i for i,(kind,_) in enumerate(content) if kind in ('p','quote')]
    image_after=body_positions[min(1,len(body_positions)-1)] if body_positions else len(content)-1
    for index,(kind,text) in enumerate(content):
        if kind=='h2':
            number+=1;title=re.sub(r'^(?:0[1-9][.、\s]+|\d{1,2}[.、]\s+)','',text)
            if reading:
                pieces.append('<section style="margin-top:'+('16px' if number==1 else '48px')+';margin-bottom:26px;padding:0 10px;"><section style="position:relative;padding-bottom:20px;border-bottom:1px solid #E4E4E7;"><p style="font-size:48px;font-weight:900;color:#E4E4E7;margin:0;line-height:1;letter-spacing:-2px;">'+leaf(f'{number:02d}')+'</p><section style="margin-top:-8px;"><h3 style="font-size:20px;font-weight:800;color:#27272A;margin:0;letter-spacing:0.5px;line-height:1.4;">'+inline(title)+'</h3></section></section></section>')
            else:pieces.append('<h3 style="font-size:18px;line-height:1.6;color:#27272A;margin:26px 0 14px;">'+inline(title)+'</h3>')
        elif kind=='h3':
            style='font-size:15px;font-weight:800;color:#27272A;margin:28px 10px 14px;padding-left:12px;border-left:3px solid #52525B;line-height:1.4;' if reading else 'font-size:16px;font-weight:700;color:#27272A;margin:22px 0 12px;line-height:1.5;'
            pieces.append('<p style="'+style+'">'+inline(text)+'</p>')
        elif kind=='quote' and reading:
            pieces.append('<section style="margin:18px 10px 26px;padding:18px 0;border-top:1px solid #E4E4E7;border-bottom:1px solid #E4E4E7;"><p style="font-size:18px;font-weight:700;color:#27272A;margin:0;line-height:1.7;">'+inline(text)+'</p></section>')
        else:
            style='margin:0 10px 22px;font-size:15px;line-height:1.8;text-align:justify;color:#52525B;letter-spacing:0.3px;' if reading else 'margin:0 0 22px;font-size:15px;line-height:1.9;text-align:justify;color:#414752;letter-spacing:0.3px;'
            pieces.append('<p style="'+style+'">'+inline(text)+'</p>')
        if body_image and index==image_after:pieces.append('<section style="margin:24px 10px;"><img src="'+html.escape(body_image,quote=True)+'" style="max-width:100%;height:auto;display:block;margin:0 auto;" alt="AI生成的主题插画" /></section>')
    if body_image and not content:pieces.append('<section><img src="'+html.escape(body_image,quote=True)+'" style="max-width:100%;height:auto;" /></section>')
    root="max-width:677px;margin:0 auto;background:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;color:#52525B;line-height:1.8;letter-spacing:0.3px;overflow-x:hidden;" if reading else 'padding:18px 12px;background:#ffffff;'
    return '<section style="'+root+'">'+''.join(pieces)+'</section>'


def render(article,body_image=None):
    if article.get('layoutRevision',2)<3 and article.get('layout','simple') in ('simple','reading'):
        return legacy_render(article,body_image)
    from markdown_layout import render as render_markdown
    return render_markdown(article,body_image)
