"""Safe Markdown token renderer; all preview/upload styles are inline.

Raphael Publish's theme/WeChat compatibility approach is adapted to the existing
Python delivery worker. Never execute raw HTML, fetch external assets, or convert
API-bound images to clipboard Base64. The caller supplies uploaded body URLs.
"""
import html
import re
from urllib.parse import urlsplit
from markdown_it import MarkdownIt
from layout_themes import RAPHAEL_STYLES

FONT="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif"

def leaf(text):
    return '<span leaf="">'+html.escape(text)+'</span>'

def wechat_image(src):
    try:
        url=urlsplit(src)
        return url.scheme in ('http','https') and bool(re.fullmatch(r'(?:[a-z0-9-]+\.)*(?:qpic|qlogo)\.cn',url.hostname or '',re.I)) and not url.username and not url.password and not url.port
    except ValueError:
        return False

def theme_styles(layout):
    reading=layout=='reading'
    styles={
        'container':f"max-width:677px;margin:0 auto;padding:18px 12px;background:#ffffff;font-family:{FONT};font-size:15px;color:#414752;line-height:1.9;overflow-wrap:break-word;",
        'p':'margin:0 0 22px;font-size:15px;line-height:1.9;color:#414752;letter-spacing:0.3px;',
        'h1':'font-size:24px;line-height:1.5;color:#27272A;margin:28px 0 18px;',
        'h2':'font-size:18px;line-height:1.6;color:#27272A;margin:26px 0 14px;',
        'h3':'font-size:16px;font-weight:700;color:#27272A;margin:22px 0 12px;line-height:1.5;',
        'h4':'font-size:15px;font-weight:700;color:#27272A;margin:20px 0 12px;line-height:1.5;',
        'strong':'font-weight:700;color:#27272A;', 'em':'font-style:italic;',
        's':'text-decoration:line-through;',
        'blockquote':'margin:22px 0;padding:16px;background:#f4f5f6;color:#52525B;',
        'ul':'margin:18px 0;padding-left:26px;list-style-type:disc;list-style-position:outside;',
        'ol':'margin:18px 0;padding-left:26px;list-style-type:decimal;list-style-position:outside;',
        'li':'margin:8px 0;font-size:15px;line-height:1.9;color:#414752;',
        'table':'width:100%;margin:24px 0;border-collapse:collapse;table-layout:fixed;font-size:14px;',
        'th':'background:#f2f3f5;padding:10px 8px;border:1px solid #dfe3e6;text-align:left;font-size:14px;line-height:1.7;color:#27272A;overflow-wrap:anywhere;',
        'td':'padding:10px 8px;border:1px solid #dfe3e6;font-size:14px;line-height:1.7;color:#414752;overflow-wrap:anywhere;',
        'tr':'border:none;',
        'code':'font-family:Consolas,monospace;background:#f2f3f5;color:#414752;padding:2px 4px;font-size:13px;line-height:1.6;',
        'pre':'margin:24px 0;padding:16px;background:#f2f3f5;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.6;',
        'a':'color:#245765;text-decoration:underline;',
        'hr':'margin:28px 0;border:none;border-top:1px solid #e4e4e7;',
        'img':'display:block;max-width:100%;height:auto;margin:24px auto;',
    }
    if reading:
        styles.update(container=f"max-width:677px;margin:0 auto;padding:0;background:#FFFFFF;font-family:{FONT};font-size:15px;color:#52525B;line-height:1.8;letter-spacing:0.3px;overflow-wrap:break-word;",
                      p='margin:0 10px 22px;font-size:15px;line-height:1.8;text-align:justify;color:#52525B;letter-spacing:0.3px;',
                      h3='font-size:15px;font-weight:800;color:#27272A;margin:28px 10px 14px;padding-left:12px;border-left:3px solid #52525B;line-height:1.4;',
                      blockquote='margin:18px 10px 26px;padding:18px 0;border-top:1px solid #E4E4E7;border-bottom:1px solid #E4E4E7;',
                      ul='margin:18px 10px;padding-left:26px;list-style-type:disc;list-style-position:outside;',
                      ol='margin:18px 10px;padding-left:26px;list-style-type:decimal;list-style-position:outside;')
    if layout in RAPHAEL_STYLES:
        styles.update(RAPHAEL_STYLES[layout])
        # Adapt Western source themes to Chinese mobile reading. Keep table/list
        # structures native (no flex/grid), and distribute inherited text styles.
        styles['container']=re.sub(r'font-family:[^;]+;',f'font-family:{FONT};',styles['container'])
        styles['container']=styles['container'].replace('24px 20px 48px 20px','20px 14px 32px 14px')
        if layout=='media':styles['container']=styles['container'].replace(FONT,"Georgia,'Songti SC','SimSun',serif")
        styles['h2']=styles['h2'].replace('26px','22px')
        styles['h3']=styles['h3'].replace('21px','18px')
        for tag in ('p','li','blockquote'):
            styles[tag]+='font-size:16px;'
        styles['table']+='table-layout:fixed;'
        for tag in ('th','td'):
            styles[tag]+='overflow-wrap:anywhere;font-size:14px;line-height:1.7;'
        styles['ul']+='list-style-type:disc;list-style-position:outside;'
        styles['ol']+='list-style-type:decimal;list-style-position:outside;'
        styles['pre']+='white-space:pre-wrap;overflow-wrap:anywhere;'
        if layout=='wechat':
            for tag in ('strong','a','code'):
                styles[tag]=styles[tag].replace('color: #07c160','color: #087f42')
    return styles

def render(article,body_image=None):
    layout=article.get('layout','simple');styles=theme_styles(layout)
    parser=MarkdownIt('commonmark',{'html':False,'breaks':True}).enable(['table','strikethrough'])
    tokens=parser.parse('\n\n'.join(str(p) for p in article.get('paragraphs',[])))
    number=0;body_count=0;inserted=False;quote_depth=0
    # Explicit local image placement wins over the normal after-second-paragraph
    # placement. External Markdown images are not silently fetched or uploaded.
    explicit=any(c.type=='image' and c.attrGet('src') in ('body.png','qwriter-local://body')
                 for t in tokens for c in (t.children or [])) and bool(body_image)
    def tag(name,extra=''):
        style=styles.get(name,'')
        if name in ('p','li','h1','h2','h3','h4','h5','h6','th','td','blockquote'):
            family=re.search(r'font-family:([^;]+)',styles['container'])
            if family:style+='font-family:'+family[1]+';'
        return '<'+name+' style="'+html.escape(style,quote=True)+'"'+extra+'>'
    def picture(src,alt='AI生成的主题插画'):
        return tag('img',' src="'+html.escape(src,quote=True)+'" alt="'+html.escape(alt,quote=True)+'"')
    def inline(children):
        nonlocal inserted
        out=[];links=[]
        for token in children:
            kind=token.type
            if kind=='text':
                for part in re.split(r'(\+\+[^+\n]+\+\+|==[^=\n]+==)',token.content):
                    if part.startswith('++') and part.endswith('++'):
                        out.append('<span style="border-bottom:2px solid currentColor;font-weight:600;">'+leaf(part[2:-2])+'</span>')
                    elif part.startswith('==') and part.endswith('=='):
                        out.append('<span style="background-color:#fff0b3;color:#292a2b;">'+leaf(part[2:-2])+'</span>')
                    else:out.append(leaf(part))
            elif kind in ('softbreak','hardbreak'):out.append('<br />')
            elif kind=='code_inline':out.append(tag('code')+leaf(token.content)+'</code>')
            elif kind=='image':
                src=token.attrGet('src') or '';alt=token.content or '正文图片'
                if src in ('body.png','qwriter-local://body') and body_image:
                    out.append(picture(body_image,alt));inserted=True
                elif re.fullmatch(r'qwriter-asset://[a-f0-9]{64}\.png',src):out.append(picture(src,alt))
                else:
                    if wechat_image(src):
                        out.append(picture(src,alt))
                    else:out.append(leaf('!['+alt+']('+src+')'))
            elif kind=='link_open':
                href=token.attrGet('href') or ''
                safe=urlsplit(href).scheme in ('https','http')
                out.append(tag('a',' href="'+html.escape(href,quote=True)+'"') if safe else '<span>')
                links.append(safe)
            elif kind=='link_close':
                # markdown-it validates protocols; normalize close to the matching
                # opener rather than introducing raw user-controlled tag names.
                out.append('</a>' if links and links.pop() else '</span>')
            elif kind.endswith('_open') and token.tag in ('strong','em','s'):out.append(tag(token.tag))
            elif kind.endswith('_close') and token.tag in ('strong','em','s'):out.append('</'+token.tag+'>')
            else:out.append(leaf(token.content))
        return ''.join(out)
    pieces=[];index=0;list_depth=0
    while index<len(tokens):
        token=tokens[index];kind=token.type
        if kind=='heading_open':
            level=int(token.tag[1]);children=tokens[index+1].children or []
            if layout=='reading' and level==2:
                number+=1
                if children and children[0].type=='text':children[0].content=re.sub(r'^(?:0[1-9][.、\s]+|\d{1,2}[.、]\s+)','',children[0].content)
                pieces.append('<section style="margin-top:'+('16px' if number==1 else '48px')+';margin-bottom:26px;padding:0 10px;"><section style="padding-bottom:20px;border-bottom:1px solid #E4E4E7;"><p style="font-size:48px;font-weight:900;color:#E4E4E7;margin:0;line-height:1;letter-spacing:-2px;">'+leaf(f'{number:02d}')+'</p><section style="margin-top:-8px;"><h3 style="font-size:20px;font-weight:800;color:#27272A;margin:0;letter-spacing:0.5px;line-height:1.4;">'+inline(children)+'</h3></section></section></section>')
            else:pieces.append(tag(token.tag)+inline(children)+'</'+token.tag+'>')
            index+=3;continue
        if kind=='inline':pieces.append(inline(token.children or []))
        elif kind in ('fence','code_block'):
            pieces.append(tag('pre')+'<code style="font-family:Consolas,monospace;font-size:13px;line-height:1.6;white-space:pre-wrap;">'+leaf(token.content.rstrip('\n'))+'</code></pre>')
        elif kind=='hr':pieces.append(tag('hr'))
        elif token.nesting==1:
            if kind=='blockquote_open':quote_depth+=1
            if kind in ('bullet_list_open','ordered_list_open'):list_depth+=1
            if not token.hidden:
                # Flatten p inside list items to span (WeChat compatibility).
                name='span' if kind=='paragraph_open' and list_depth else token.tag
                if kind=='ordered_list_open':pieces.append(tag('ol',' start="'+str(int(token.attrGet('start') or 1))+'"'))
                elif kind=='paragraph_open' and list_depth:pieces.append('<span style="'+html.escape(styles['p']+'display:block;margin:8px 0;',quote=True)+'">')
                elif kind=='paragraph_open' and quote_depth and layout=='reading':pieces.append('<p style="font-size:18px;font-weight:700;color:#27272A;margin:0;line-height:1.7;">')
                elif token.tag in ('th','td') and token.attrGet('style') in ('text-align:left','text-align:center','text-align:right'):
                    pieces.append(tag(name).replace('style="','style="'+token.attrGet('style')+';'))
                else:pieces.append(tag(name))
                token.meta['rendered_tag']=name
        elif token.nesting==-1:
            if not token.hidden:
                opener=next((t for t in reversed(tokens[:index]) if t.nesting==1 and t.level==token.level and t.tag==token.tag),None)
                pieces.append('</'+(opener.meta.get('rendered_tag',token.tag) if opener else token.tag)+'>')
            if kind=='blockquote_close':quote_depth-=1
            if kind in ('bullet_list_close','ordered_list_close'):list_depth-=1
            if token.level==0 and kind in ('paragraph_close','blockquote_close'):
                body_count+=1
                if body_image and not explicit and not inserted and body_count==2:pieces.append(picture(body_image));inserted=True
        index+=1
    if body_image and not inserted:pieces.append(picture(body_image))
    return '<section style="'+html.escape(styles['container'],quote=True)+'">'+''.join(pieces)+'</section>'
