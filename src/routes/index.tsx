import { createFileRoute } from "@tanstack/react-router";
import { MotionBrowser } from "@/components/motion-browser";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <MotionBrowser />;
}
