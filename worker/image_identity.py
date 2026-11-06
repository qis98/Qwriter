"""Compare WeChat image references without treating every URL rewrite as data loss."""
import html,re
from html.parser import HTMLParser
from urllib.parse import urlsplit

class Images(HTMLParser):
    def __init__(self):super().__init__(convert_charrefs=True);self.urls=[]
    def handle_starttag(self,tag,attrs):
        if tag.lower()!='img':return
        values=dict(attrs)
        for key in ('src','data-src'):
            if values.get(key):self.urls.append(html.unescape(values[key]))

def image_urls(content):
    parser=Images();parser.feed(content);return parser.urls

def image_identity(url):
    parts=urlsplit(html.unescape(url));host=(parts.hostname or '').lower();path=parts.path
    if host in ('mmbiz.qpic.cn','mmbiz.qlogo.cn') and re.fullmatch(r'/(?:sz_)?mmbiz_(?:png|jpg|jpeg|gif|webp)/[^/]+/\d+/?',path):
        # The opaque asset identifier stays intact; only known CDN rendition width varies.
        return ('wechat-image',path.rstrip('/').rsplit('/',1)[0])
    return (host,path,parts.query)

def image_present(expected,content):return image_identity(expected) in [image_identity(u) for u in image_urls(content)]
