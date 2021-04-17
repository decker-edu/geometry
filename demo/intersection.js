import * as g from "../geometry.js";

let caption = anchor.parentNode.querySelector("figcaption");
if (caption) caption.style.visibility = "hidden";

function flashCaption(vis) {
  if (caption) caption.style.visibility = vis;
}

let center = g.point(300, 300, "drag");
let intersection = new g.IsectLineCircle(
  g.line(g.point(60, 60, "drag"), g.point(540, 60, "drag")),
  g.circle(center, 200)
);

let math = String.raw`L_r = A\otimes \frac{L}{|\mathbf{p}-\mathbf{x}|^2}((\widehat{\mathbf{p}-\mathbf{x}})\cdot\mathbf{n})`;
let swtch = g
  .swtch(
    intersection.p1,
    g.mlabel(g.point(580, 300, "invisible"), math, "ne", true)
  )
  .on("on", () => flashCaption("visible"))
  .on("off", () => flashCaption("hidden"));

let root = g.group(
  intersection.p2,
  intersection.n2,
  intersection.p1,
  g.line(center, intersection.p1, "emph"),
  swtch
);

g.renderSvg(anchor, 1200, 600, root);
