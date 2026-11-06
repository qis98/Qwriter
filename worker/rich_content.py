"""Local rich text assets and API upload preparation. No remote downloads."""
import base64,hashlib,html,io,re
from html.parser import HTMLParser
from pathlib import Path
from PIL import Image

ASSET=re.compile(r'qwriter-asset://([a-f0-9]{64}\.png)')
DATA=re.compile(r'data:image/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)')

def png_bytes(value):
    match=DATA.fullmatch(value or '')
    if not match:raise ValueError('图片格式无效，请选择 PNG、JPG 或 WebP。')
    raw=base64.b64decode(match[1],validate=True)
    if len(raw)>8*1024*1024:raise ValueError('单张图片不能超过8MB。')
    with Image.open(io.BytesIO(raw)) as image:
        if image.width*image.height>24_000_000:raise ValueError('图片尺寸过大，请压缩后重试。')
        image.load();output=io.BytesIO();image.convert('RGB').save(output,format='PNG')
    result=output.getvalue()
    if len(result)>8*1024*1024:raise ValueError('转换后的图片超过8MB，请压缩后重试。')
    return result

def store_images(content,directory):
    folder=directory/'inline';folder.mkdir(exist_ok=True)
    def replace(match):
        raw=png_bytes(match[0]);name=hashlib.sha256(raw).hexdigest()+'.png'
        (folder/name).write_bytes(raw);return 'qwriter-asset://'+name
    content=re.sub(r'(?<=src=")'+DATA.pattern,replace,content)
    for name in ASSET.findall(content):
        if not (folder/name).is_file():raise ValueError('正文图片已丢失，请重新添加后保存。')
    return content

class Text(HTMLParser):
    def __init__(self):super().__init__(convert_charrefs=True);self.parts=[]
    def handle_data(self,data):self.parts.append(data)
    def handle_endtag(self,tag):
        if tag in ('p','div','section','h1','h2','h3','li','tr','blockquote'):self.parts.append('\n')

def paragraphs(content):
    parser=Text();parser.feed(content)
    return [s.strip() for s in ''.join(parser.parts).splitlines() if s.strip()]

def upload_images(content,directory,client,state,checkpoint):
    urls=[];cache=state.setdefault('richImages',{})
    def replace(match):
        name=match[1]
        if name not in cache:
            cache[name]=client.call('media/uploadimg',asset=directory/'inline'/name)['url'];checkpoint()
        urls.append(cache[name]);return html.escape(cache[name],quote=True)
    return ASSET.sub(replace,content),urls
