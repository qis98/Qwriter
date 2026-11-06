"""Explicit publishing commands; no automatic retries of public mutations."""
import hashlib
import json
import uuid
from pathlib import Path


def fingerprint(data):
    # Ignore platform-generated URLs/timestamps; bind every editable field.
    fields=('title','author','digest','content','content_source_url','thumb_media_id','show_cover_pic','need_open_comment','only_fans_can_comment')
    items=[{k:a.get(k) for k in fields} for a in data.get('news_item',[])]
    if not items: raise ValueError('草稿为空或已被删除，请重新同步。')
    return hashlib.sha256(json.dumps(items,sort_keys=True,ensure_ascii=False).encode()).hexdigest()


def _run(request,client):
    action=request['operation']
    if action=='list':
        offset=request.get('offset',0)
        if type(offset) is not int or offset<0: raise ValueError('分页参数无效')
        return client.call('draft/batchget',{'offset':offset,'count':20,'no_content':0})
    if action=='inspect':
        data=client.call('draft/get',{'media_id':request['mediaId']})
        return {'draft':data,'hash':fingerprint(data)}
    if action=='edit':
        data=client.call('draft/get',{'media_id':request['mediaId']})
        if fingerprint(data)!=request['hash']:raise ValueError('草稿已被修改，请关闭编辑器并重新同步。')
        index=request['index']
        if type(index) is not int or not 0<=index<len(data.get('news_item',[])):raise ValueError('图文序号无效。')
        from rich_content import store_images,upload_images,png_bytes,paragraphs
        folder=Path(request['root'])/'private'/'draft-edits'/str(uuid.uuid4());folder.mkdir(parents=True)
        content=store_images(request['html'],folder)
        content,urls=upload_images(content,folder,client,{},lambda:None)
        fields=('title','author','digest','content','content_source_url','thumb_media_id','show_cover_pic','need_open_comment','only_fans_can_comment')
        article={key:value for key,value in data['news_item'][index].items() if key in fields}
        article.update(title=request['title'],content=content)
        if request.get('cover'):
            (folder/'cover.png').write_bytes(png_bytes(request['cover']))
            article['thumb_media_id']=client.call('material/add_material',asset=folder/'cover.png')['media_id']
        if fingerprint(client.call('draft/get',{'media_id':request['mediaId']}))!=request['hash']:
            raise ValueError('上传图片期间草稿已变化，请重新同步后再编辑。')
        try:
            client.call('draft/update',{'media_id':request['mediaId'],'index':index,'articles':article})
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError('草稿保存未确认，请重新同步核对后再编辑；不会自动重试。') from exc
        try:readback=client.call('draft/get',{'media_id':request['mediaId']})
        except Exception as exc:raise ValueError('草稿已提交，读回未确认。请重新同步核对，不要直接重试。') from exc
        from image_identity import image_present
        saved=readback.get('news_item',[])
        if index>=len(saved) or saved[index].get('title')!=article['title'] or saved[index].get('thumb_media_id')!=article.get('thumb_media_id') or ''.join(paragraphs(saved[index].get('content',''))).split()!= ''.join(paragraphs(content)).split() or not all(image_present(url,saved[index].get('content','')) for url in urls):
            raise ValueError('草稿已提交，读回存在差异，请重新同步核对，不要直接重试。')
        return {'draft':readback,'hash':fingerprint(readback)}
    if action=='status':
        if request['kind']=='publish': return client.call('freepublish/get',{'publish_id':int(request['remoteId'])})
        if request['kind']=='mass': return client.call('message/mass/get',{'msg_id':int(request['remoteId'])})
        raise ValueError('任务类型无效')
    if action!='submit' or request.get('kind') not in ('publish','mass'): raise ValueError('发布操作无效')
    data=client.call('draft/get',{'media_id':request['mediaId']})
    if fingerprint(data)!=request.get('hash'): raise ValueError('草稿内容已变化，请重新查看并确认。')
    if request['kind']=='publish': return submit(client,'freepublish/submit',{'media_id':request['mediaId']})
    # Draft IDs and broadcast-news IDs are separate namespaces. Convert a snapshot.
    fields=('title','author','digest','content','content_source_url','thumb_media_id','show_cover_pic')
    articles=[{k:a[k] for k in fields if k in a} for a in data['news_item']]
    uploaded=client.call('media/uploadnews',{'articles':articles})
    if not uploaded.get('media_id'): raise ValueError('群发素材转换未返回编号，未提交群发。')
    return submit(client,'message/mass/sendall',{'filter':{'is_to_all':True},'mpnews':{'media_id':uploaded['media_id']},'msgtype':'mpnews','send_ignore_reprint':0})


def submit(client,endpoint,payload):
    try:
        result=client.call(endpoint,payload)
        for key in ('publish_id','msg_id'):
            if key in result:result[key]=str(result[key])
        return result
    except ValueError as exc:
        return {'outcome':'rejected','message':str(exc)}
    except Exception:
        return {'outcome':'uncertain','message':'微信提交结果未确认，请在后台核对，禁止直接重发。'}


def run(request,client):
    if request['operation']!='submit':return _run(request,client)
    try:return _run(request,client)
    except ValueError as exc:return {'outcome':'blocked','message':str(exc)}
    except Exception:return {'outcome':'blocked','message':'提交前检查或素材转换未完成，未调用发布或群发接口。'}
