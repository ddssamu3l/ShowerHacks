"""Blender background: optimize the supplied nozzle and reproject clean boss onto dirty topology."""
import bpy, json, struct, pathlib, numpy as np, math, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT = pathlib.Path(__file__).resolve().parents[1] / 'public/models'

def read_glb(name):
    data=(ROOT/name).read_bytes(); n=struct.unpack_from('<I',data,12)[0]
    j=json.loads(data[20:20+n]); b=data[28+n:]
    def acc(i):
        a=j['accessors'][i]; v=j['bufferViews'][a['bufferView']]
        dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
        size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        return np.ndarray((a['count'],size), dtype=dtype, buffer=b, offset=v.get('byteOffset',0)+a.get('byteOffset',0), strides=(v.get('byteStride',np.dtype(dtype).itemsize*size),np.dtype(dtype).itemsize)).copy()
    p=j['meshes'][0]['primitives'][0]; a=p['attributes']
    indices=np.concatenate([acc(primitive['indices']).reshape(-1,3) for primitive in j['meshes'][0]['primitives']])
    return j,b,acc(a['POSITION']),acc(a['NORMAL']),acc(a['TEXCOORD_0']),indices

def clean_transfer():
    dj,db,dp,dn,du,di=read_glb('boss.glb'); cj,cb,cp,cn,cu,ci=read_glb('boss_clean-unbranded.glb')
    face_material=np.concatenate([np.full(cj['accessors'][p['indices']]['count']//3,p.get('material',0),dtype=np.int32) for p in cj['meshes'][0]['primitives']])
    tree=BVHTree.FromPolygons(cp.tolist(),ci.tolist(),all_triangles=True)
    def nearest(point):
        hit,normal,face,dist=tree.find_nearest(Vector(point))
        inds=ci[face]; tri=cp[inds]; a=tri[1]-tri[0]; b=tri[2]-tri[0]; c=np.asarray(hit)-tri[0]
        aa=a@a; ab=a@b; bb=b@b; ac=a@c; bc=b@c; det=aa*bb-ab*ab
        if abs(det)<1e-16: w=np.array([1.,0.,0.])
        else:
            y=(bb*ac-ab*bc)/det; z=(aa*bc-ab*ac)/det; w=np.array([1-y-z,y,z])
        return np.asarray(hit), (cn[inds]*w[:,None]).sum(axis=0), (cu[inds]*w[:,None]).sum(axis=0), face_material[face]
    targets=np.zeros((len(dp),6),np.float32)
    for i,p in enumerate(dp):
        pos,nor,uv,material=nearest(p); targets[i,:3]=pos; targets[i,3:]=nor/max(np.linalg.norm(nor),1e-9)
    targets.tofile(ROOT/'clean-surface.bin')
    tex=cj['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']; img=cj['images'][cj['textures'][tex]['source']]; v=cj['bufferViews'][img['bufferView']]
    path=pathlib.Path('/tmp/shower-clean-source.jpg'); path.write_bytes(cb[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])
    source=bpy.data.images.load(str(path)); source.colorspace_settings.name='Non-Color'
    pixels=np.array(source.pixels[:],np.float32).reshape(source.size[1],source.size[0],4)
    # Flat PBR garment colors are linear; the texture atlas stores sRGB.
    def to_srgb(value):
        value=np.asarray(value); return np.where(value<=.0031308,value*12.92,1.055*np.maximum(value,0)**(1/2.4)-.055)
    material_colors=[]; material_roughness=[]; material_textured=[]
    for material in cj['materials']:
        pbr=material.get('pbrMetallicRoughness',{}); factor=pbr.get('baseColorFactor',[1,1,1,1])
        material_colors.append(to_srgb(factor[:3])); material_roughness.append(pbr.get('roughnessFactor',.65)); material_textured.append('baseColorTexture' in pbr)
    size=1024; out=np.zeros((size,size,4),np.float32); mask=np.zeros((size,size),bool)
    count=0
    for face in di:
        uv=du[face]*size-.5; lo=np.maximum(np.ceil(uv.min(axis=0)).astype(int),0); hi=np.minimum(np.floor(uv.max(axis=0)).astype(int),size-1)
        if np.any(hi<lo): continue
        xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1)); p=np.stack((xx,yy),axis=-1).reshape(-1,2)
        a=uv[1]-uv[0]; b=uv[2]-uv[0]; c=p-uv[0]; det=a[0]*b[1]-a[1]*b[0]
        if abs(det)<1e-12: continue
        y=(c[:,0]*b[1]-c[:,1]*b[0])/det; z=(a[0]*c[:,1]-a[1]*c[:,0])/det; w=np.stack((1-y-z,y,z),axis=1)
        valid=np.all(w>=-1e-5,axis=1); p=p[valid]; w=w[valid]
        for point,weights in zip(p,w):
            pos,nor,uvclean,material=nearest(weights@dp[face]); x,y=point
            sx=int(np.clip(uvclean[0]*source.size[0],0,source.size[0]-1)); sy=int(np.clip((1-uvclean[1])*source.size[1],0,source.size[1]-1))
            # glTF UV origin top-left; Blender image pixels origin bottom-left.
            out[size-1-y,x,:3]=pixels[sy,sx,:3] if material_textured[material] else material_colors[material]
            out[size-1-y,x,3]=material_roughness[material]; mask[size-1-y,x]=True; count+=1
    for step in range(8):
        total=np.zeros_like(out); hits=np.zeros_like(mask,dtype=np.float32)
        for axis in [0,1]:
            for shift in [-1,1]:
                valid=np.roll(mask,shift,axis); total+=np.roll(out,shift,axis)*valid[:,:,None]; hits+=valid
        fill=(~mask)&(hits>0); out[fill]=total[fill]/hits[fill,None]; mask|=fill
    image=bpy.data.images.new('clean transfer',width=size,height=size,alpha=True); image.colorspace_settings.name='Non-Color'; image.pixels.foreach_set(out.ravel()); image.filepath_raw=str(ROOT/'clean-transfer.png'); image.file_format='PNG'; image.save()
    (ROOT/'clean-transfer.json').write_text(json.dumps({'vertices':len(dp),'textureSize':size,'method':'Nearest clean surface transferred onto dirty topology; xyz + normal xyz float32 per vertex','paintedTexels':count,'source':'boss_clean-unbranded.glb','appearance':'Unbranded native garment materials; original exposed skin and hair','alphaChannel':'clean material roughness'}))
    print('CLEAN TRANSFER DONE',len(dp),count,flush=True)

def nozzle():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath='/Users/dengjingxi/Downloads/garden+hose+nozzle+3d+model.glb')
    obj=next(o for o in bpy.context.scene.objects if o.type=='MESH'); bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=.00006); bpy.ops.object.mode_set(mode='OBJECT')
    mod=obj.modifiers.new('Game resolution','DECIMATE'); mod.ratio=min(1,22000/len(obj.data.polygons)); bpy.ops.object.modifier_apply(modifier=mod.name)
    for image in bpy.data.images:
        if image.size[0]>1024: image.scale(1024,1024)
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'nozzle.glb'),export_format='GLB',use_selection=False,export_animations=False,export_image_format='JPEG',export_jpeg_quality=85)
    print('NOZZLE EXPORTED',len(obj.data.polygons),flush=True)
    scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.samples=16; scene.render.resolution_x=720; scene.render.resolution_y=720; scene.render.resolution_percentage=100
    scene.world.color=(.25,.25,.25)
    bpy.ops.object.camera_add(location=(1.5,-2.7,1.35)); cam=bpy.context.object; cam.rotation_euler=(Vector((0,0,.48))-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.type='ORTHO'; cam.data.ortho_scale=1.3; scene.camera=cam
    for location,energy,size in [((1,-2,3),180,3),((-2,-1,1),100,2)]:
        bpy.ops.object.light_add(type='AREA',location=location); light=bpy.context.object; light.data.energy=energy; light.data.shape='DISK'; light.data.size=size; light.rotation_euler=(Vector((0,0,.5))-light.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath='/tmp/shower-nozzle.png'; bpy.ops.render.render(write_still=True)

if __name__=='__main__':
    if '--clean-only' not in sys.argv: nozzle()
    clean_transfer()
