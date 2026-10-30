import { useEffect, useRef, useState } from "react";
import { mountObservatory, type ModelTier, type ObservatoryController, type SceneMode } from "@/motion/observatory";

type Props = {
  profile: ModelTier;
  reducedMotion: boolean;
  force2d: boolean;
  pitch: number;
  roll: number;
  mode: SceneMode;
  pulseToken: number;
  onFps: (fps: number) => void;
};

export function ObservatoryStage({ profile, reducedMotion, force2d, pitch, roll, mode, pulseToken, onFps }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctrlRef = useRef<ObservatoryController | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "flat">(force2d ? "flat" : "loading");
  const [detail, setDetail] = useState("");

  const onFpsRef = useRef(onFps);
  onFpsRef.current = onFps;

  useEffect(() => {
    if (force2d) {
      setPhase("flat");
      setDetail("2D rejim. Brauzer paneli ishlayveradi.");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    setPhase("loading");
    mountObservatory(canvas, {
      profile,
      reducedMotion,
      onFailure: (message) => {
        if (!dead) {
          setPhase("flat");
          setDetail(message);
        }
      },
      onFps: (fps) => onFpsRef.current(fps),
    })
      .then((controller) => {
        if (dead) {
          controller.dispose();
          return;
        }
        ctrlRef.current = controller;
        controller.setReducedMotion(reducedMotion);
        setPhase("ready");
      })
      .catch(() => {
        if (!dead) setPhase("flat");
      });
    return () => {
      dead = true;
      ctrlRef.current?.dispose();
      ctrlRef.current = null;
    };
    // reducedMotion is applied by the effect below; remounting WebGL for it is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [force2d, profile]);

  useEffect(() => {
    ctrlRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    ctrlRef.current?.setOrientation(pitch, roll);
  }, [pitch, roll]);

  useEffect(() => {
    ctrlRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    if (pulseToken > 0) ctrlRef.current?.pulse();
  }, [pulseToken]);

  return (
    <div className={phase === "flat" ? "mb-stage mb-stage-flat" : "mb-stage"} data-webgl={phase === "ready" ? "on" : "off"}>
      <canvas ref={canvasRef} className="mb-canvas" aria-hidden="true" />
      {phase !== "ready" ? (
        <p className="mb-stage-note">{phase === "loading" ? "Observatoriya yuklanmoqda" : detail || "2D rejim"}</p>
      ) : null}
    </div>
  );
}
