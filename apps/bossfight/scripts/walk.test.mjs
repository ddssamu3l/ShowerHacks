import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { readGlb, skeletonScene, meshFloorProbe, accessorValues } from './glb.mjs';
import { MotionRig } from '../src/motion.js';
import { BOSS_WALK, walkContacts, walkCyclesForDistance, walkLeg } from '../src/boss-walk.js';

test('foot contacts alternate exactly once across frames and loop boundaries', () => {
  assert.deepEqual(walkContacts(.49, .51), [{ side:'Right', cycle:.5 }]);
  assert.deepEqual(walkContacts(.5,.51), []);
  assert.deepEqual(walkContacts(.99,1.01), [{side:'Left',cycle:1}]);
  assert.deepEqual(walkContacts(1,.2), []);
  const atRate = fps => Array.from({length:fps*3},(_,i)=>walkContacts(i/fps,(i+1)/fps)).flat();
  assert.deepEqual(atRate(30),atRate(144));assert.equal(atRate(30).length,6);
});
test('root travel cancels the support foot motion, including changing walking speed', () => {
  for (const speed of [3.3,4.5,5.6]) {
    const advance = walkCyclesForDistance(speed*.01,5.55);
    const a=walkLeg(.1,'Left'),b=walkLeg(.1+advance,'Left');
    assert.ok(Math.abs((b.z-a.z)*5.55+speed*.01)<1e-9);
    assert.equal(a.lift,0);assert.equal(b.lift,0);
  }
});
for (const file of ['boss','boss_clean']) {
  const {json,bin}=await readGlb(new URL(`../public/models/${file}-animated.glb`,import.meta.url));
  test(`${file}: walking arms oppose their legs, elbows bend forward, shoulders remain relaxed`,()=>{
    const {root,height}=skeletonScene(json),rig=new MotionRig(root,height,'boss');
    const p=name=>rig.bones[name].getWorldPosition(new Vector3());
    for(let i=0;i<=120;i++) {
      rig.sample('advance',BOSS_WALK.duration*i/120);
      for(const side of ['Left','Right']) {
        const upper=p(side+'ForeArm').sub(p(side+'Arm')).normalize(),lower=p(side+'Hand').sub(p(side+'ForeArm')).normalize();
        assert.ok(upper.y<-.8,'shoulder should point mostly down');
        assert.ok(upper.angleTo(lower)>.15&&upper.angleTo(lower)<.45,'elbow should stay softly bent');
        assert.ok(upper.clone().cross(lower).x<-.1,'elbow bends forward, never backward');
      }
    }
    for(const [time,forwardSide,backSide]of [[0,'Left','Right'],[BOSS_WALK.duration/2,'Right','Left']]){
      rig.sample('advance',time);
      assert.ok(p(forwardSide+'Foot').z>p(backSide+'Foot').z);
      assert.ok(p(forwardSide+'Hand').z<p(backSide+'Hand').z,'forward leg must pair with backward arm');
    }
  });
  test(`${file}: exported walk stays grounded at every sampled frame`,()=>{
    const {root,nodes}=skeletonScene(json),floor=meshFloorProbe(json,bin,nodes),clip=json.animations.find(a=>a.name==='advance');
    const channels=clip.channels.map(c=>({...c,values:accessorValues(json,bin,clip.samplers[c.sampler].output)}));
    for(let i=0;i<=Math.round(BOSS_WALK.duration*60);i++){
      for(const c of channels)if(c.target.path==='rotation')nodes[c.target.node].quaternion.fromArray(c.values,i*4);else nodes[c.target.node].position.fromArray(c.values,i*3);
      root.updateMatrixWorld(true);assert.ok(Math.abs(floor())<.00001);
    }
  });
}
