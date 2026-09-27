import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function makeArena(scene, renderer) {
  const pmrem = new T.PMREMGenerator(renderer), room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04); scene.environment = environment.texture; scene.environmentIntensity = .5;
  room.dispose(); pmrem.dispose();
  scene.background = new T.Color(0x2a4546); scene.fog = new T.FogExp2(0x355757, .022);
  scene.add(new T.HemisphereLight(0xd7ece7, 0x40534b, 1.3));
  const sun = new T.DirectionalLight(0xeaf8d7, 2.8); sun.position.set(-8, 20, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left:-21,right:21,top:21,bottom:-21,near:1,far:60 }); sun.shadow.bias=-.0002; sun.shadow.normalBias=.03; scene.add(sun);
  const rim = new T.DirectionalLight(0x88ceda, 1.5); rim.position.set(8, 10, -15); scene.add(rim);
  const mat = (color, roughness=.4, metalness=0) => new T.MeshStandardMaterial({color,roughness,metalness});
  const ceramic = mat(0xb3c8bd,.25,.12), grout=mat(0x526d67,.8), chrome=mat(0xaac7c7,.2,.95), dark=mat(0x263c3d,.35,.7);
  function box(w,h,d,x,y,z,material) { const m=new T.Mesh(new T.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.receiveShadow=true;m.castShadow=true;scene.add(m);return m; }
  box(38,.4,38,0,-.24,0,grout);
  const floor = new T.InstancedMesh(new T.BoxGeometry(2.96,.1,2.96),ceramic,144); const dummy = new T.Object3D(); let i=0;
  for(let x=-16.5;x<=16.5;x+=3) for(let z=-16.5;z<=16.5;z+=3) { dummy.position.set(x,-.025,z);dummy.updateMatrix();floor.setMatrixAt(i,dummy.matrix);floor.setColorAt(i++,new T.Color().setHSL(.40,.12,.65+Math.random()*.06)); }
  floor.receiveShadow=true;scene.add(floor);
  box(38,27,.4,0,13.5,-18.3,grout);box(.4,27,38,-18.3,13.5,0,grout);
  const walls=new T.InstancedMesh(new T.BoxGeometry(2.96,2.96,.1),ceramic,216);i=0;
  for(let row=0;row<9;row++) for(let col=0;col<12;col++) for(let side=0;side<2;side++) { dummy.position.set(side?-18:col*3-16.5,row*3+1.5,side?col*3-16.5:-18);dummy.rotation.y=side?Math.PI/2:0;dummy.updateMatrix();walls.setMatrixAt(i,dummy.matrix);walls.setColorAt(i++,new T.Color().setHSL(.42,.12,.64+Math.random()*.07)); }
  walls.receiveShadow=true;scene.add(walls);
  // Raised shower threshold and thin glass frame establish the tiny scale.
  box(38,.6,.6,0,.2,18,ceramic);box(.6,.6,38,18,.2,0,ceramic);
  box(.16,27,.16,18,13.5,-18,chrome);box(.16,27,.16,18,13.5,18,chrome);
  box(.16,.16,36,18,27,0,chrome);
  const glass=new T.Mesh(new T.PlaneGeometry(36,27),new T.MeshPhysicalMaterial({color:0xbbdddd,transparent:true,opacity:.07,roughness:.05,side:T.DoubleSide,depthWrite:false}));glass.rotation.y=Math.PI/2;glass.position.set(18,13.5,0);scene.add(glass);
  function tube(points,r,material){const m=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),40,r,12,false),material);m.castShadow=true;scene.add(m);return m;}
  tube([[5,5,-17.7],[5,20,-17.7],[5,23,-17],[5,24,-14],[5,23.8,-11]],.22,chrome);
  const head=new T.Mesh(new T.CylinderGeometry(2.8,2.8,.35,64),chrome);head.position.set(5,23.6,-11);scene.add(head);
  const face=new T.Mesh(new T.CylinderGeometry(2.6,2.6,.05,64),dark);face.position.set(5,23.38,-11);scene.add(face);
  for(let j=0;j<55;j++){const a=j*2.3999,r=2.45*Math.sqrt(j/55);const hole=new T.Mesh(new T.SphereGeometry(.065,6,4),ceramic);hole.position.set(5+Math.cos(a)*r,23.33,-11+Math.sin(a)*r);scene.add(hole);}
  const tap=new T.Mesh(new T.CylinderGeometry(1.3,1.3,.6,48),chrome);tap.rotation.x=Math.PI/2;tap.position.set(5,6,-17.5);scene.add(tap);box(.35,2.6,.4,5,6,-16.9,chrome);
  // Drain: oversized circular plate with dark slits.
  const drain=new T.Mesh(new T.CylinderGeometry(2.5,2.5,.065,64),chrome);drain.position.set(-8,.045,7);drain.receiveShadow=true;scene.add(drain);
  for(let x=-1.6;x<=1.6;x+=.4){const length=Math.sqrt(4-x*x)*2;box(.12,.01,length,-8+x,.083,7,dark);}
  const soap=box(5,1.6,3.3,-12,.8,-11,mat(0xc6cfa4,.55));soap.rotation.y=.25;
  const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=256;const ctx=labelCanvas.getContext('2d');ctx.fillStyle='#c6cfa4';ctx.fillRect(0,0,512,256);ctx.fillStyle='#728461';ctx.font='bold 94px serif';ctx.textAlign='center';ctx.fillText('SOAP',256,150);
  const soapLabel=new T.Mesh(new T.PlaneGeometry(4,2),new T.MeshStandardMaterial({map:new T.CanvasTexture(labelCanvas),roughness:.7}));soapLabel.rotation.x=-Math.PI/2;soapLabel.rotation.z=-.25;soapLabel.position.set(-12,1.61,-11);scene.add(soapLabel);
  // A loose garden hose snakes back to the fixture. The last section follows the player.
  tube([[5,.16,-17],[7,.16,-14],[13,.16,-10],[14,.16,0],[12,.16,11],[6,.16,13],[1,.16,10]],.095,mat(0x405a35,.8));
  const puddleMat=new T.MeshPhysicalMaterial({color:0x9ebeb7,roughness:.06,metalness:.3,transparent:true,opacity:.20,depthWrite:false});
  for(const [x,z,r] of [[4,4,3],[-3,-6,4],[10,8,2.4],[-12,2,2]]){const puddle=new T.Mesh(new T.CircleGeometry(r,48),puddleMat);puddle.rotation.x=-Math.PI/2;puddle.scale.y=.55;puddle.position.set(x,.032,z);scene.add(puddle);}
  const dots=new Float32Array(200*3);for(let k=0;k<dots.length;k+=3){dots[k]=(Math.random()-.5)*36;dots[k+1]=Math.random()*17;dots[k+2]=(Math.random()-.5)*36;}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(dots,3));const mist=new T.Points(geo,new T.PointsMaterial({color:0xdcf2e7,size:.04,transparent:true,opacity:.3,depthWrite:false}));scene.add(mist);
  return {update(time){mist.rotation.y=time*.005;},dispose(){environment.dispose();}};
}
