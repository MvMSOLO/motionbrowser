import type { MotionAction } from "./motion-actions.ts";

export type LabState = {
  index: number;
  count: number;
  commentsOpen: boolean;
  commentScroll: number;
  commentMax: number;
};

export function createLabState(count: number, commentMax = 2000): LabState {
  return { index: 0, count, commentsOpen: false, commentScroll: 0, commentMax };
}

export function reduceLab(state: LabState, action: MotionAction): LabState {
  if (action === "feed-next") return { ...state, index: Math.min(state.count - 1, state.index + 1) };
  if (action === "feed-prev") return { ...state, index: Math.max(0, state.index - 1) };
  if (action === "comments-open") return { ...state, commentsOpen: true };
  if (action === "comments-close") return { ...state, commentsOpen: false };
  if (action === "comments-scroll-down") {
    return { ...state, commentScroll: Math.min(state.commentMax, state.commentScroll + 120) };
  }
  return { ...state, commentScroll: Math.max(0, state.commentScroll - 120) };
}
