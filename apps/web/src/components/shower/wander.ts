export interface Wander {
  step: (dt: number) => number;
}

export function createWander(min = 0.16, max = 0.84): Wander {
  let x = 0.5;
  let target = 0.5;
  let hold = 0;

  return {
    step(dt) {
      hold -= dt;
      if (hold <= 0) {
        target = min + Math.random() * (max - min);
        hold = 0.8 + Math.random() * 1.6;
      }
      x += (target - x) * (1 - Math.exp(-dt * 2.4));
      return x;
    },
  };
}
