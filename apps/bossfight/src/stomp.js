// Shared by the skeletal clip, warning, hit volume and rock eruption.
export const STOMP = Object.freeze({
  duration: 2.6, trackUntil: .65, impact: 1.08, waveEnd: 1.58,
  radius: 10, halfAngle: .62, bandWidth: 1.8,
  stepForward: .18, stepOut: -.008,
});
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const x = clamp(value); return x * x * (3 - 2 * x); };

export function stompPose(time) {
  const brace = smooth(time / .22) * (1 - smooth((time - .22) / .30));
  const lift = smooth((time - .18) / .50);
  const strike = clamp((time - .86) / (STOMP.impact - .86)) ** 3;
  const compression = smooth((time - 1.015) / .14) * (1 - smooth((time - 1.20) / .42));
  const recover = smooth((time - 1.72) / .88);
  return { brace, lift, strike, compression, recover,
    chamber: lift * (1 - strike), planted: strike * (1 - recover),
    returnLift: Math.sin(Math.PI * recover) ** 2,
  };
}

export function stompFront(time) {
  return 1 + clamp((time - STOMP.impact) / (STOMP.waveEnd - STOMP.impact)) * (STOMP.radius - 1);
}
export function stompArrival(radius) {
  return STOMP.impact + clamp((radius - 1) / (STOMP.radius - 1)) * (STOMP.waveEnd - STOMP.impact);
}
export function stompContact(restFoot, height) {
  return [restFoot[0] + STOMP.stepOut * height, 0, restFoot[2] + STOMP.stepForward * height];
}
