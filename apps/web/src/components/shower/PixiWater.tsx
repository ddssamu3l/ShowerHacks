"use client";

import { useEffect, useRef } from "react";
import { createWander } from "./wander";

interface PixiWaterProps {
  active: boolean;
  onMove?: (x: number) => void;
}

export function PixiWater({ active, onMove }: PixiWaterProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  const onMoveRef = useRef(onMove);
  activeRef.current = active;
  onMoveRef.current = onMove;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup = () => {};

    void (async () => {
      const PIXI = await import("pixi.js");
      const { Emitter } = await import("@pixi/particle-emitter");
      if (disposed) return;

      const app = new PIXI.Application({
        width: host.clientWidth,
        height: host.clientHeight,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      const canvas = app.view as HTMLCanvasElement;
      canvas.className = "absolute inset-0 block size-full";
      host.appendChild(canvas);

      const streak = new PIXI.Graphics();
      streak.beginFill(0xffffff);
      streak.drawRoundedRect(0, 0, 16, 3, 1.5);
      streak.endFill();
      const texture = app.renderer.generateTexture(streak);
      streak.destroy();

      const water = new PIXI.Container();
      const rail = new PIXI.Graphics();
      const head = new PIXI.Graphics();
      const drawRail = () => {
        rail.clear();
        rail.beginFill(0xcfd8dc, 0.9);
        rail.drawRoundedRect(12, 12, app.screen.width - 24, 4, 2);
        rail.endFill();
      };
      drawRail();
      head.beginFill(0x9aa9b0);
      head.drawRoundedRect(-3, -38, 6, 28, 3);
      head.endFill();
      head.beginFill(0xe4ebee);
      head.drawEllipse(0, -8, 22, 9);
      head.endFill();
      head.beginFill(0x7f9098);
      head.drawEllipse(0, -4, 16, 4);
      head.endFill();
      app.stage.addChild(water, rail, head);

      const emitter = new Emitter(water, {
        lifetime: { min: 0.55, max: 0.9 },
        frequency: 0.004,
        spawnChance: 1,
        particlesPerWave: 4,
        emitterLifetime: -1,
        maxParticles: 1600,
        pos: { x: 0, y: 0 },
        addAtBack: false,
        behaviors: [
          {
            type: "alpha",
            config: {
              alpha: {
                list: [
                  { value: 0.9, time: 0 },
                  { value: 0.75, time: 0.7 },
                  { value: 0, time: 1 },
                ],
              },
            },
          },
          {
            type: "scale",
            config: {
              scale: {
                list: [
                  { value: 0.7, time: 0 },
                  { value: 1.1, time: 1 },
                ],
              },
              minMult: 0.5,
            },
          },
          {
            type: "color",
            config: {
              color: {
                list: [
                  { value: "ffffff", time: 0 },
                  { value: "bfe4f2", time: 1 },
                ],
              },
            },
          },
          {
            type: "moveAcceleration",
            config: { accel: { x: 0, y: 1300 }, minStart: 300, maxStart: 460, rotate: true },
          },
          { type: "rotationStatic", config: { min: 78, max: 102 } },
          { type: "spawnShape", config: { type: "rect", data: { x: -14, y: 0, w: 28, h: 2 } } },
          { type: "textureSingle", config: { texture } },
        ],
      });

      const wander = createWander();
      let position = 0.5;
      const tick = () => {
        const dt = Math.min(app.ticker.deltaMS / 1000, 1 / 20);
        emitter.emit = activeRef.current;
        if (activeRef.current) position = wander.step(dt);
        const x = position * app.screen.width;
        head.position.set(x, 50);
        emitter.updateOwnerPos(x, 48);
        emitter.update(dt);
        onMoveRef.current?.(position);
      };
      app.ticker.add(tick);

      const observer = new ResizeObserver(() => {
        app.renderer.resize(host.clientWidth, host.clientHeight);
        drawRail();
      });
      observer.observe(host);

      cleanup = () => {
        observer.disconnect();
        app.ticker.remove(tick);
        emitter.destroy();
        texture.destroy(true);
        app.destroy(true, { children: true });
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return <div className="pointer-events-none absolute inset-0 z-[2]" ref={hostRef} />;
}
