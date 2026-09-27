import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Quaternion } from 'three';
import { root } from './build.mjs';
import { readGlb, skeletonScene, accessorValues, meshFloorProbe } from './glb.mjs';
import { CLIPS } from '../src/motion.js';

for (const [file, kind] of [['linglong', 'player'], ['boss', 'boss'], ['boss_clean', 'boss']]) {
  const source = await readGlb(path.join(root, 'public/models', (file === 'boss_clean' ? 'boss_clean-unbranded' : file) + '.glb'));
  const animated = await readGlb(path.join(root, 'public/models', file + '-animated.glb'));
  test(`${file}: source geometry, UVs, skins, and materials are preserved`, () => {
    assert.deepEqual(animated.bin.subarray(0, source.bin.length), source.bin);
    for (const key of ['meshes', 'skins', 'materials', 'textures', 'images', 'nodes']) assert.deepEqual(animated.json[key], source.json[key]);
  });
  test(`${file}: every requested clip contains valid 60 fps skeletal tracks`, () => {
    assert.deepEqual(animated.json.animations.map((a) => a.name), CLIPS[kind].map((c) => c.id));
    for (const animation of animated.json.animations) {
      const clip = CLIPS[kind].find((c) => c.id === animation.name);
      assert.equal(animation.channels.length, 66);
      for (const channel of animation.channels) {
        const sampler = animation.samplers[channel.sampler];
        const times = accessorValues(animated.json, animated.bin, sampler.input);
        assert.equal(times.length, Math.round(clip.duration * 60) + 1);
        assert.ok(Math.abs(times.at(-1) - clip.duration) < .00001);
        const values = accessorValues(animated.json, animated.bin, sampler.output);
        assert.ok(values.every(Number.isFinite));
        if (channel.target.path === 'rotation') for (let i = 0; i < values.length; i += 4) {
          assert.ok(Math.abs(Math.hypot(...values.slice(i, i + 4)) - 1) < .0001);
        }
      }
    }
  });
  test(`${file}: looping poses meet and authored strikes contain no joint flips`, () => {
    for (const animation of animated.json.animations) for (const channel of animation.channels) {
      if (channel.target.path !== 'rotation') continue;
      const values = accessorValues(animated.json, animated.bin, animation.samplers[channel.sampler].output);
      const q = new Quaternion(), previous = new Quaternion().fromArray(values);
      for (let i = 4; i < values.length; i += 4) {
        q.fromArray(values, i);
        assert.ok(previous.angleTo(q) < 1.20, `${animation.name}/${animated.json.nodes[channel.target.node].name} flips at sample ${i / 4}`);
        previous.copy(q);
      }
      if (animation.extras.loop) assert.ok(new Quaternion().fromArray(values).angleTo(previous) < .005, `${animation.name} loop seam`);
    }
  });
  if (kind === 'player') test('dodge: exported mesh stays on the floor throughout the roll', () => {
    const { root: scene, nodes } = skeletonScene(animated.json);
    const floor = meshFloorProbe(animated.json, animated.bin, nodes);
    const animation = animated.json.animations.find((a) => a.name === 'dodge');
    const channels = animation.channels.map((channel) => ({ ...channel, values: accessorValues(animated.json, animated.bin, animation.samplers[channel.sampler].output) }));
    for (let frame = 0; frame <= 48; frame++) {
      for (const channel of channels) {
        const target = nodes[channel.target.node];
        if (channel.target.path === 'rotation') target.quaternion.fromArray(channel.values, frame * 4);
        else target.position.fromArray(channel.values, frame * 3);
      }
      scene.updateMatrixWorld(true);
      assert.ok(Math.abs(floor()) < .00001, `Ground contact lost at frame ${frame}`);
    }
  });
  if (kind === 'boss') test(`${file}: dives leave the floor, land, bounce briefly, then settle`, () => {
    const { root: scene, nodes } = skeletonScene(animated.json);
    const floor = meshFloorProbe(animated.json, animated.bin, nodes);
    for (const [name, airborne, land, bounce, settled] of [['jump_slam', 1, 1.45, 1.55, 2.15]]) {
      const animation = animated.json.animations.find((a) => a.name === name);
      const channels = animation.channels.map((channel) => ({ ...channel, values: accessorValues(animated.json, animated.bin, animation.samplers[channel.sampler].output) }));
      function heightAt(time) {
        const frame = Math.round(time * 60);
        for (const channel of channels) {
          const target = nodes[channel.target.node];
          if (channel.target.path === 'rotation') target.quaternion.fromArray(channel.values, frame * 4);
          else target.position.fromArray(channel.values, frame * 3);
        }
        scene.updateMatrixWorld(true); return floor();
      }
      assert.ok(heightAt(airborne) > .08);
      assert.ok(Math.abs(heightAt(land)) < .00001);
      assert.ok(heightAt(bounce) > .005 && heightAt(bounce) < .05);
      assert.ok(Math.abs(heightAt(settled)) < .00001);
    }
  });
}
