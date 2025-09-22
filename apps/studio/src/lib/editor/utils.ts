import { EditorSelection } from "@codemirror/state";

export interface EditorRange {
  id?: string;
  from: { line: number; ch: number };
  to: { line: number; ch: number };
}

export interface EditorMarker extends EditorRange {
  message?: string;
  element?: HTMLElement;
  onClick?: (event: MouseEvent) => void;
  type: "error" | "highlight" | "custom"; // | "warning"
}

export interface LineGutter {
  line: number;
  type: "changed";
}

/** Checks if `target` is within `container` - updated for CodeMirror 6 */
export function isPositionWithin(
  target: { from: { line: number; ch: number }; to: { line: number; ch: number } },
  container: { from: { line: number; ch: number }; to: { line: number; ch: number } }
) {
  // Convert to simple position comparison since CM6 doesn't have cmpPos
  const targetFromPos = target.from.line * 1000000 + target.from.ch;
  const targetToPos = target.to.line * 1000000 + target.to.ch;
  const containerFromPos = container.from.line * 1000000 + container.from.ch;
  const containerToPos = container.to.line * 1000000 + container.to.ch;
  
  return targetFromPos >= containerFromPos && targetToPos <= containerToPos;
}
