import * as T from 'three';
import { CleaningSurface } from './cleaning.js';

export class BossSurface {
  constructor(mesh, targets, cleanTexture) {
    this.mesh=mesh; this.geometry=mesh.geometry;
    this.rest=mesh.geometry.attributes.position.array.slice(); this.normals=mesh.geometry.attributes.normal.array.slice();
    if(targets.length!==this.rest.length*2) throw new Error('Clean surface does not match the dirty boss topology');
    this.targets=targets; this.clean=new CleaningSurface(this.rest,this.normals,mesh.geometry.index.array);
    this.amount=new Float32Array(this.rest.length/3);this.geometry.setAttribute('cleanAmount',new T.BufferAttribute(this.amount,1));
    cleanTexture.flipY=false;cleanTexture.colorSpace=T.SRGBColorSpace;cleanTexture.anisotropy=4;
    mesh.material=mesh.material.clone();mesh.material.onBeforeCompile=shader=>{
      shader.uniforms.cleanMap={value:cleanTexture};
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float cleanAmount; varying float vClean;').replace('#include <begin_vertex>','#include <begin_vertex>\nvClean = cleanAmount;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vClean; uniform sampler2D cleanMap;').replace('#include <map_fragment>', '#ifdef USE_MAP\ndiffuseColor *= mix(texture2D(map, vMapUv), texture2D(cleanMap, vMapUv), smoothstep(0.0, 1.0, vClean));\n#endif').replace('#include <normal_fragment_maps>',T.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * (1.0 - vClean);')).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, texture2D(cleanMap, vMapUv).a, vClean);');
    };
    mesh.material.customProgramCacheKey=()=> 'local-clean-v2-unbranded';
    const collision=new T.BufferGeometry();collision.setAttribute('position',new T.BufferAttribute(new Float32Array(this.rest.length),3));collision.setIndex(this.geometry.index);
    this.collision=new T.Mesh(collision,new T.MeshBasicMaterial({side:T.DoubleSide}));
    this.ray=new T.Raycaster();this.vertex=new T.Vector3();this.triangle=new T.Triangle();this.bary=new T.Vector3();
    this.updateCollision();
  }
  updateCollision() {
    this.mesh.updateWorldMatrix(true,false);this.mesh.skeleton.update();
    const p=this.collision.geometry.attributes.position;
    for(let i=0;i<p.count;i++){this.mesh.getVertexPosition(i,this.vertex).applyMatrix4(this.mesh.matrixWorld);p.setXYZ(i,this.vertex.x,this.vertex.y,this.vertex.z);}
    this.collision.geometry.computeBoundingBox();this.collision.geometry.computeBoundingSphere();
  }
  cast(origin,end) {
    const direction=end.clone().sub(origin);this.ray.set(origin,direction.clone().normalize());this.ray.far=direction.length();return this.ray.intersectObject(this.collision,false)[0];
  }
  attachment(hit) {
    const ids = [hit.face.a, hit.face.b, hit.face.c];
    this.triangle.setFromAttributeAndIndices(this.collision.geometry.attributes.position, ...ids);
    this.triangle.getBarycoord(hit.point, this.bary);
    return { ids, weights: this.bary.toArray() };
  }
  resolveAttachment(attachment, point, normal) {
    const vertices = attachment.ids.map(id => this.mesh.getVertexPosition(id, new T.Vector3()).applyMatrix4(this.mesh.matrixWorld));
    point.set(0, 0, 0);
    vertices.forEach((vertex, i) => point.addScaledVector(vertex, attachment.weights[i]));
    this.triangle.set(...vertices).getNormal(normal);
  }
  paint(hit,radius,rate,dt){
    const face=hit.face,p=this.collision.geometry.attributes.position;
    this.triangle.setFromAttributeAndIndices(p,face.a,face.b,face.c);this.triangle.getBarycoord(hit.point,this.bary);
    const ids=[face.a,face.b,face.c], weights=this.bary.toArray(), point=[0,0,0],normal=[0,0,0];
    ids.forEach((id,j)=>{for(let k=0;k<3;k++){point[k]+=this.rest[id*3+k]*weights[j];normal[k]+=this.normals[id*3+k]*weights[j];}});
    const len=Math.hypot(...normal);for(let k=0;k<3;k++)normal[k]/=len||1;
    const changed=this.clean.paint(point,normal,radius,rate,dt);
    const positions=this.geometry.attributes.position.array,normals=this.geometry.attributes.normal.array;
    for(const g of changed) for(const i of g.vertices){this.amount[i]=g.clean;for(let k=0;k<3;k++){positions[i*3+k]=T.MathUtils.lerp(this.rest[i*3+k],this.targets[i*6+k],g.clean);normals[i*3+k]=T.MathUtils.lerp(this.normals[i*3+k],this.targets[i*6+3+k],g.clean);}}
    if(changed.length){this.geometry.attributes.position.needsUpdate=true;this.geometry.attributes.normal.needsUpdate=true;this.geometry.attributes.cleanAmount.needsUpdate=true;}
    return changed.length;
  }
  reset(){this.clean.reset();this.amount.fill(0);this.geometry.attributes.position.array.set(this.rest);this.geometry.attributes.normal.array.set(this.normals);for(const key of ['position','normal','cleanAmount'])this.geometry.attributes[key].needsUpdate=true;}
}
