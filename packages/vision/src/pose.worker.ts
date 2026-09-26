import { FilesetResolver, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { WorkerInput, WorkerOutput } from "./worker-protocol";

// Bundled as a classic worker: the WASM loader needs importScripts().
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<WorkerInput>) => void;
  postMessage: (message: WorkerOutput) => void;
};
let model: PoseLandmarker | undefined;
let handModel: HandLandmarker | undefined;
const delegates: { pose: "GPU" | "CPU"; hands?: "GPU" | "CPU" } = { pose: "CPU" };
scope.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const files = await FilesetResolver.forVisionTasks(`${data.assetBase}/wasm`);
      const options = {
        runningMode: "VIDEO" as const, numPoses: 1,
        minPoseDetectionConfidence: 0.45, minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.5, outputSegmentationMasks: false,
        canvas: new OffscreenCanvas(1, 1),
      };
      try {
        model = await PoseLandmarker.createFromOptions(files, { ...options, baseOptions: { modelAssetPath: `${data.assetBase}/pose_landmarker_full.task`, delegate: "GPU" } });
        delegates.pose = "GPU";
      } catch (error) {
        console.warn("[vision] pose GPU delegate failed, using CPU:", error instanceof Error ? error.message : error);
        model = await PoseLandmarker.createFromOptions(files, { ...options, canvas: new OffscreenCanvas(1, 1), baseOptions: { modelAssetPath: `${data.assetBase}/pose_landmarker_full.task`, delegate: "CPU" } });
      }
      if (data.trackHands) {
        const handOptions = { runningMode: "VIDEO" as const, numHands: 2, minHandDetectionConfidence: .4, minHandPresenceConfidence: .4, minTrackingConfidence: .5 };
        try {
          handModel = await HandLandmarker.createFromOptions(files, { ...handOptions, canvas: new OffscreenCanvas(1, 1), baseOptions: { modelAssetPath: `${data.assetBase}/hand_landmarker.task`, delegate: "GPU" } });
          delegates.hands = "GPU";
        } catch (error) {
          console.warn("[vision] hand GPU delegate failed, using CPU:", error instanceof Error ? error.message : error);
          handModel = await HandLandmarker.createFromOptions(files, { ...handOptions, canvas: new OffscreenCanvas(1, 1), baseOptions: { modelAssetPath: `${data.assetBase}/hand_landmarker.task`, delegate: "CPU" } });
          delegates.hands = "CPU";
        }
      }
      console.info("[vision] delegates", delegates);
      scope.postMessage({ type: "ready", delegates });
    } else {
      try {
        if (!model) throw new Error("Pose tracker is not initialized.");
        const started = performance.now();
        const result = model.detectForVideo(data.image, data.capturedAtMs);
        const hands = handModel?.detectForVideo(data.image, data.capturedAtMs);
        scope.postMessage({ type: "result", capturedAtMs: data.capturedAtMs, landmarks: result.landmarks[0] ?? [], hands: hands?.landmarks.map((landmarks, i) => ({ landmarks, handedness: hands.handedness[i]?.[0]?.categoryName.toLowerCase() === "left" ? "left" : "right", handednessScore: hands.handedness[i]?.[0]?.score ?? 0 })) ?? [], inferenceMs: performance.now() - started });
      } finally { data.image.close(); }
    }
  } catch (error) {
    scope.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
