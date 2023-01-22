export {
  point,
  label,
  mlabel,
  line,
  vector,
  circle,
  bezier,
  bezier2,
  group,
  text,
  swtch,
  swtchN,
  unfold,
  mirror,
  project,
  sum,
  surface,
  intersect,
  renderSvg,
  IsectLineCircle,
  Shape,
  Line,
  Point,
  defaults,
  setZoom,
  withMathJax,
  circular,
  interpolate,
  slider,
  scalar
};

import { Clipper } from "./clip.js";
import "./d3.min.js";
import "./d3-simple-slider.min.js"
import { vec2, len, norm, add, sub, mul, div, dot, perp } from "./vec2.js";

export * from "./vec2.js";

const debug = true;

window.once = window.once || {}

const defaults = {
  point: { r: 6, opts: [] }, // one of [, "drag", "computed"]
  line: {
    opts: [],
  },
  vector: {
    opts: ["arrow"],
  },
  circle: {
    opts: [],
  },
  surface: {
    opts: [],
  },
  project: {
    opts: ["line"],
  },
  unit: 60,
  arrow: { w: 9, h: 7 },
  text: {},
};

let nextId = 0;

let zoom = 1;
function setZoom(z) {
  zoom = z;
}

class Shape {
  constructor(z = 1) {
    this.complete = true;
    this.id = nextId++;
    this.zIndex = z;
    this.parent = null;
  }

  evaluate() {
    // Make sure to evaluate a possible parent.
    if (this.parent) this.parent.evaluate();
    return this.complete;
  }

  static all(...dependencies) {
    return dependencies.reduce((a, s) => a && s.evaluate(), true);
  }

  // Include the parents flat rep here, because it might not be in the tree
  // already, for example a computing node where only the results are part of
  // the tree.
  flat() {
    let pflat = this.parent ? this.parent.flat() : [];
    return this.complete ? [this, ...pflat] : pflat;
  }
}

function circular(c, r) {
  return (x, y) => add(c, mul(r, norm(sub(vec2(x, y), c))));
}

class Point extends Shape {
  constructor(x, y, ...opts) {
    super();
    this.move(x, y);
    this.r = defaults.point.r;
    this.opts = opts.length == 0 ? defaults.point.opts : opts;
    if (this.opts.includes("drag")) this.zIndex = 1000;
    if (this.opts.includes("computed")) this.zIndex = 1001;
    else this.zIndex = 100;
  }

  move(x, y) {
    if (this.constraint) {
      let p = this.constraint(x, y);
      this.x = p.x;
      this.y = p.y;
    } else {
      this.x = x;
      this.y = y;
    }
  }

  update(element) {
    d3.select(element).attr("transform", `translate(${this.x},${this.y})`);
  }

  svg() {
    let classes = this.opts.concat("point").join(" ");
    let g = d3
      .create("svg:g")
      .attr("id", this.id)
      .attr("transform", `translate(${this.x},${this.y})`);
    let v = d3.create("svg:circle").attr("r", this.r);

    if (this.opts.includes("drag")) {
      g.attr("class", "handle");
      g.append(() => v.node()).attr("class", classes);
      g.append("svg:circle")
        .attr("class", "handle")
        .attr("r", this.r * 2);
    } else if (this.opts.includes("computed")) {
      g.append(() => v.node()).attr("class", classes);
    } else if (this.opts.includes("hidden")) {
      g.attr("class", "handle");
      g.append("svg:circle")
        .attr("class", "handle")
        .attr("r", this.r * 2);
    } else if (this.opts.includes("invisible")) {
    } else {
      g.append(() => v.node()).attr("class", classes);
    }
    return g.node();
  }
}

function point(...args) {
  return new Point(...args);
}

class Scalar extends Shape {
  constructor(x, y, v, ...opts) {
    super();
    this.x = x;
    this.y = y;
    this.v = v;
    this.opts = opts;
  }

  update(element) {
    d3.select(element)
      .attr("x", this.x)
      .attr("y", this.y)
      .text(this.v);
  }

  svg() {
    let classes = this.opts.concat("scalar").join(" ");
    let text = d3.create("svg:text")
      .attr("x", this.x)
      .attr("y", this.y)
      .attr("class", "scalar")
      .text(this.v);
    return text.node();
  }
}

function scalar(...args) {
  return new Scalar(...args);
}

class Text extends Shape {
  constructor(x, y, text, ...opts) {
    super();
    this.x = x;
    this.y = y;
    this.text = text;
    this.opts = opts.length == 0 ? defaults.text.opts : opts;
  }

  update(element) {
    d3.select(element).attr("x", this.x).attr("y", this.y);
  }

  svg() {
    return d3
      .create("svg:text")
      .attr("class", "text")
      .attr("id", this.id)
      .attr("x", this.x)
      .attr("y", this.y)
      .text(this.text)
      .node();
  }
}

function text(...args) {
  return new Text(...args);
}

function vectorPath(a, b, opts) {
  let d = norm(sub(b, a));
  let p = perp(d);
  let sp = 0.16 * defaults.unit;
  let sd = -0.4 * defaults.unit;
  let w1 = add(b, mul(sp, p), mul(sd, d));
  let w2 = add(b, mul(-sp, p), mul(sd, d));
  if (opts.includes("arrow")) {
    return `M ${a.x}  ${a.y} L  ${b.x} ${b.y} L ${w1.x} ${w1.y} M ${b.x} ${b.y} L ${w2.x} ${w2.y}`;
  } else {
    return `M ${a.x}  ${a.y} L  ${b.x} ${b.y}`;
  }
}

class Line extends Shape {
  constructor(p1, p2, ...opts) {
    super();
    this.p1 = p1;
    this.p2 = p2;
    this.opts = opts.length == 0 ? defaults.line.opts : opts;
    if (this.opts.includes("infinite")) this.zIndex = 0;
    else this.zIndex = 10;
  }

  get dx() {
    return this.p2.x - this.p1.x;
  }

  get dy() {
    return this.p2.y - this.p1.y;
  }

  get length() {
    return Math.sqrt(this.dx * this.dx + this.dy * this.dy);
  }

  evaluate() {
    this.complete = Shape.all(this.p1, this.p2);
    return this.complete;
  }

  flat() {
    return [
      ...this.p1.flat(),
      ...this.p2.flat(),
      ...(this.complete ? [this] : []),
    ];
  }

  update(element) {
    if (this.c) {
      let [n, xp1, xp2] = this.c.clipLine(this.p1, this.p2);
      d3.select(element).attr("d", vectorPath(xp1, xp2, this.opts));
    } else {
      d3.select(element).attr("d", vectorPath(this.p1, this.p2, this.opts));
    }
  }

  svg(w, h) {
    let classes = this.opts.concat("line").join(" ");
    let line = d3.create("svg:path").attr("id", this.id).attr("class", classes);
    if (this.opts.includes("infinite")) {
      this.c = new Clipper({ x: 0, y: 0 }, { x: w, y: h });
      let [n, xp1, xp2] = this.c.clipLine(this.p1, this.p2);
      line.attr("d", vectorPath(xp1, xp2, this.opts));
    } else {
      line.attr("d", vectorPath(this.p1, this.p2, this.opts));
    }
    return line.node();
  }
}

function line(...args) {
  return new Line(...args);
}

class Surface extends Shape {
  constructor(p, w, ...opts) {
    super();
    this.p = p;
    this.w = w;
    this.opts = opts.length == 0 ? defaults.surface.opts : opts;
    this.zIndex = 1;
  }

  update(element) {
    d3.select(element).attr("transform", `translate(${this.p.x},${this.p.y})`);
  }

  svg(w, h) {
    let surface = d3
      .create("svg:g")
      .attr("class", "surface")
      .attr("id", this.id)
      .attr("transform", `translate(${this.p.x},${this.p.y})`);
    surface
      .append("svg:rect")
      .attr("x", -this.w / 2)
      .attr("y", 0)
      .attr("width", this.w)
      .attr("height", this.w / 7);
    surface
      .append("svg:line")
      .attr("x1", -this.w / 2)
      .attr("y1", 0)
      .attr("x2", this.w / 2)
      .attr("y2", 0);

    return surface.node();
  }

  evaluate() {
    return (this.complete = this.p.evaluate());
  }

  flat() {
    return [...this.p.flat(), ...(this.complete ? [this] : [])];
  }
}

function surface(...args) {
  return new Surface(...args);
}

class Vector extends Line {
  constructor(p, nx, ny, ...opts) {
    super(p, point(p.x + nx, p.y + ny, "invisible"));
    this.nx = nx;
    this.ny = ny;
    this.opts = opts.length == 0 ? defaults.vector.opts : opts;
    this.zIndex = 10;
  }

  evaluate() {
    this.p2.x = this.p1.x + this.nx;
    this.p2.y = this.p1.y + this.ny;
    return super.evaluate();
  }

  svg(...args) {
    this.p2.x = this.p1.x + this.nx;
    this.p2.y = this.p1.y + this.ny;
    return super.svg(...args);
  }
}

function vector(...args) {
  return new Vector(...args);
}

class Circle extends Shape {
  constructor(c, v, ...opts) {
    super();
    this.c = c;
    if (v instanceof Point) {
      this.x = v;
      this.n = vector(this.x, 0, 0, "arrow", "normal");
    } else {
      this.r = v;
    }
    this.radius();
    this.opts = opts.length == 0 ? defaults.circle.opts : opts;
  }

  evaluate() {
    if (this.x) {
      return (this.complete = Shape.all(this.c, this.x));
    } else {
      return (this.complete = this.c.evaluate());
    }
  }

  flat() {
    return [
      ...this.c.flat(),
      ...(this.x ? this.x.flat() : []),
      ...(this.complete ? [this] : []),
    ];
  }

  radius() {
    if (this.x) {
      let dx = this.x.x - this.c.x;
      let dy = this.x.y - this.c.y;
      this.r = Math.sqrt(dx * dx + dy * dy);
      this.n.nx = (dx / this.r) * defaults.unit * 2;
      this.n.ny = (dy / this.r) * defaults.unit * 2;
    }
  }

  update(element) {
    this.radius();
    d3.select(element)
      .attr("cx", this.c.x)
      .attr("cy", this.c.y)
      .attr("r", this.r);
  }

  svg(w, h) {
    let classes = this.opts.concat("circle").join(" ");
    this.radius();
    return d3
      .create("svg:circle")
      .attr("id", this.id)
      .attr("class", classes)
      .attr("cx", this.c.x)
      .attr("cy", this.c.y)
      .attr("r", this.r)
      .node();
  }
}

function circle(...args) {
  return new Circle(...args);
}

class Bezier extends Shape {
  constructor(p1, p2, p3, p4, ...opts) {
    super();
    this.p1 = p1;
    this.p2 = p2;
    this.p3 = p3;
    this.p4 = p4;
    this.opts = opts.length == 0 ? defaults.point.opts : opts;
    this.zIndex = 10;
  }

  evaluate() {
    return (this.complete = Shape.all(this.p1, this.p2, this.p3, this.p4));
  }

  flat() {
    return [
      ...this.p1.flat(),
      ...this.p2.flat(),
      ...this.p3.flat(),
      ...this.p4.flat(),
      ...(this.complete ? [this] : []),
    ];
  }

  update(element) {
    d3.select(element).attr(
      "d",
      `M ${this.p1.x} ${this.p1.y} C ${this.p2.x} ${this.p2.y}, ${this.p3.x} ${this.p3.y}, ${this.p4.x} ${this.p4.y}`
    );
  }

  svg(w, h) {
    let line = d3
      .create("svg:path")
      .attr("id", this.id)
      .attr("class", "bezier")
      .attr(
        "d",
        `M ${this.p1.x} ${this.p1.y} C ${this.p2.x} ${this.p2.y}, ${this.p3.x} ${this.p3.y}, ${this.p4.x} ${this.p4.y}`
      );
    return line.node();
  }
}

function bezier(...args) {
  return new Bezier(...args);
}

class Bezier2 extends Shape {
  constructor(p1, p2, p3, ...opts) {
    super();
    this.p1 = p1;
    this.p2 = p2;
    this.p3 = p3;
    this.opts = opts.length == 0 ? defaults.point.opts : opts;
    this.zIndex = 10;
  }

  evaluate() {
    return (this.complete = Shape.all(this.p1, this.p2, this.p3));
  }

  flat() {
    return [
      ...this.p1.flat(),
      ...this.p2.flat(),
      ...this.p3.flat(),
      ...(this.complete ? [this] : []),
    ];
  }

  update(element) {
    d3.select(element).attr(
      "d",
      `M ${this.p1.x} ${this.p1.y} Q ${this.p2.x} ${this.p2.y}, ${this.p3.x} ${this.p3.y}`
    );
  }

  svg(w, h) {
    let line = d3
      .create("svg:path")
      .attr("id", this.id)
      .attr("class", "bezier")
      .attr(
        "d",
        `M ${this.p1.x} ${this.p1.y} Q ${this.p2.x} ${this.p2.y}, ${this.p3.x} ${this.p3.y}`
      );
    return line.node();
  }
}

function bezier2(...args) {
  return new Bezier2(...args);
}

function flip(f) {
  return (a, b) => f(b, a);
}

class Switch extends Shape {
  constructor(cond, ...shapes) {
    super();
    this.cond = cond;
    this.shapes = shapes;
    this.callbacks = { on: [], off: [] };
    this.not = false;
  }

  on(which, func) {
    this.callbacks[which].push(func);
    return this;
  }

  evaluate() {
    this.shapes.map((s) => s.evaluate());
    let c = this.not ? !this.cond.evaluate() : this.cond.evaluate();
    if (c) {
      this.callbacks["on"].map((cb) => cb());
    } else {
      this.callbacks["off"].map((cb) => cb());
    }
    return (this.complete = c);
  }

  flat() {
    let parts = this.shapes.reduce((a, s) => [...a, ...s.flat()], []);
    return this.complete ? parts : [];
  }
}

function swtch(...args) {
  return new Switch(...args);
}

class SwitchN extends Switch {
  constructor(...args) {
    super(...args);
    this.not = true;
  }
}

function swtchN(...args) {
  return new SwitchN(...args);
}

class Slider extends Scalar {
  constructor(x, y, min, max, step, width, v) {
    super(x, y);
    this.id = nextId++;
    this.zIndex = 2001;
    this.min = min || 0;
    this.max = max || 1;
    this.step = step || 0.1;
    this.width = width || 200;
    this.v = 0;
  }

  update(element) {
    d3.select(element).attr(
      "transform",
      `translate(${this.x},${this.y})`
    );
  }

  svg(w, h) {
    var slider = d3
      .sliderHorizontal()
      .min(this.min)
      .max(this.max)
      .step(this.step)
      .width(this.width)
      .displayValue(true)
      .on('onchange', (val) => {
        this.v = val;
        var svg = this.element.parentNode;
        while (!svg.updateAll) svg = svg.parentNode;
        svg.updateAll();
      });
    var svg = d3.create("svg:g")
      .attr("id", this.id)
      .attr("class", "slider")
      .attr("transform", `translate(${this.x},${this.y})`);

    this.element = svg.call(slider).node();
    return this.element;
  }
}

function slider(...args) {
  return new Slider(...args);
}

class Unfold extends Point {
  constructor(x, y, ...shapes) {
    super();
    this.id = nextId++;
    this.x = x;
    this.y = y;
    this.shapes = shapes;
    this.upto = 0;
    this.size = 20;
    this.zIndex = 2000;
  }

  click() {
    this.upto = (this.upto + 1) % (this.shapes.length + 1);
  }

  evaluate() {
    Shape.all(...this.shapes.slice(0, this.upto));
    return true;
  }

  flat() {
    let show = this.shapes
      .slice(0, this.upto)
      .reduce((a, s) => [...a, ...s.flat()], []);
    return [this, ...show];
  }

  update(element) {
    d3.select(element).attr(
      "transform",
      `translate(${this.x},${this.y})rotate(90)`
    );
  }

  svg(w, h) {
    let symbol = d3
      .create("svg:path")
      .attr("id", this.id)
      .attr("class", "play handle")
      .attr(
        "d",
        d3
          .symbol()
          .type(d3.symbolTriangle)
          .size(this.size * this.size)
      )
      .attr("transform", `translate(${this.x},${this.y})rotate(90)`);
    return symbol.node();
  }
}

function unfold(...args) {
  return new Unfold(...args);
}

const offsets = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
  ne: { x: 1, y: -1 },
  se: { x: 1, y: 1 },
  sw: { x: 1, y: 1 },
  nw: { x: -1, y: -1 },
};

class Label extends Point {
  constructor(p, text, dir = "ne") {
    super();
    this.id = nextId++;
    this.p = p;
    this.text = text;
    this.dir = dir;
    this.zIndex = 1000;
    this.svgW = 1.5 * this.text.length;
    this.svgH = 1.5;
    this.f = 15;
    this.o = 20;
  }

  evaluate() {
    this.complete = this.p.evaluate();
    this.x = this.p.x;
    this.y = this.p.y;
    return this.complete;
  }

  flat() {
    return [...this.p.flat(), ...(this.complete ? [this] : [])];
  }

  offset() {
    switch (this.dir) {
      case "n":
        return {
          x: -(this.svgW / 2) * this.f,
          y: -this.o,
        };
      case "ne":
        return { x: this.o * 0.81, y: -this.o * 0.81 };
      case "e":
        return { x: this.o, y: +(this.svgH / 2) * this.f };
      case "se":
        return { x: this.o * 0.81, y: (this.o + this.svgH * this.f) * 0.81 };
      case "s":
        return { x: -(this.svgW / 2) * this.f, y: this.o + this.svgH * this.f };
      case "sw":
        return {
          x: (-this.o - this.svgW * this.f) * 0.81,
          y: (this.o + this.svgH * this.f) * 0.81,
        };
      case "w":
        return {
          x: -this.o - this.svgW * this.f,
          y: +(this.svgH / 2) * this.f,
        };
      case "nw":
        return {
          x: (-this.o - this.svgW * this.f) * 0.81,
          y: -this.o * 0.81,
        };
      default:
        return { x: this.o * 0.81, y: -this.o * 0.81 };
    }
  }

  update(element) {
    let o = this.offset();
    d3.select(element).attr(
      "transform",
      `translate(${this.p.x + o.x},${this.p.y + o.y})`
    );
  }

  svg(w, h) {
    let o = this.offset();
    let g = d3
      .create("svg:g")
      .attr("class", "label")
      .attr("id", this.id)
      .attr("transform", `translate(${this.p.x + o.x},${this.p.y + o.y})`);
    g.append("svg:text")
      .attr("id", this.id)
      .attr("class", "label")
      .attr("x", 0)
      .attr("y", 0)
      .text(this.text);
    return g.node();
  }
}

function label(...args) {
  return new Label(...args);
}

class MathLabel extends Point {
  constructor(p, text, dir = "ne") {
    super();
    this.id = nextId++;
    this.p = p;
    this.text = text;
    this.dir = dir;
    this.zIndex = 1000;
    try {
      this.label = MathJax.tex2svg(text).querySelector("svg");
      this.svgW = this.label.width.baseVal.valueInSpecifiedUnits;
      this.svgH = this.label.height.baseVal.valueInSpecifiedUnits;
    } catch (e) {
      console.log("geometry.js: tex2svg: failed on:", text);
      this.label = d3.create("text").text(this.text).node();
    }
    this.f = 15;
    this.o = 20;
  }

  evaluate() {
    this.complete = this.p.evaluate();
    this.x = this.p.x;
    this.y = this.p.y;
    return this.complete;
  }

  flat() {
    return [...this.p.flat(), ...(this.complete ? [this] : [])];
  }

  offset() {
    switch (this.dir) {
      case "n":
        return {
          x: -(this.svgW / 2) * this.f,
          y: -this.o - this.svgH * this.f,
        };
      case "ne":
        return { x: this.o * 0.81, y: (-this.o - this.svgH * this.f) * 0.81 };
      case "e":
        return { x: this.o, y: -(this.svgH / 2) * this.f };
      case "se":
        return { x: this.o * 0.81, y: this.o * 0.81 };
      case "s":
        return { x: -(this.svgW / 2) * this.f, y: this.o };
      case "sw":
        return { x: (-this.o - this.svgW * this.f) * 0.81, y: this.o * 0.81 };
      case "w":
        return {
          x: -this.o - this.svgW * this.f,
          y: -(this.svgH / 2) * this.f,
        };
      case "nw":
        return {
          x: (-this.o - this.svgW * this.f) * 0.81,
          y: -this.o - this.svgH * this.f * 0.81,
        };
      default:
        return { x: this.o, y: -this.o - this.svgH * this.f };
    }
  }

  update(element) {
    let o = this.offset();
    d3.select(element).attr(
      "transform",
      `translate(${this.p.x + o.x},${this.p.y + o.y})`
    );
  }

  svg(w, h) {
    let o = this.offset();
    let g = d3
      .create("svg:g")
      .attr("class", "label")
      .attr("id", this.id)
      .attr("transform", `translate(${this.p.x + o.x},${this.p.y + o.y})`);
    if (this.label) g.append(() => this.label);
    return g.node();
  }
}

function mlabel(...args) {
  return new MathLabel(...args);
}

class Group extends Shape {
  constructor(...shapes) {
    super();
    this.shapes = shapes;
  }

  evaluate() {
    this.shapes.map((s) => s.evaluate());
    return true;
  }

  flat() {
    return this.shapes.reduce((a, s) => [...a, ...s.flat()], []);
  }
}

function group(...args) {
  return new Group(...args);
}

class Intersection {
  constructor(a, b) {
    this.id = nextId++;
    this.a = a;
    this.b = b;
    this.isect = intersector(a, b);
  }

  calculate() {
    return this.isect(this.a, this.b);
  }

  evaluate() {
    return (this.complete = Shape.all(this.a, this.b));
  }

  flat() {
    return [...this.a.flat(), ...this.b.flat()];
  }
}

function intersect(...args) {
  return new Intersection(...args);
}

class Calculated {
  constructor(...dependencies) {
    this.dependencies = dependencies;
    for (let shape of this.dependencies) {
      shape.complete = false;
    }
  }

  calculate(complete) {
    if (complete) {
      // Set all possible results to incomplete
    }
    // Set all actual results to complete
  }

  evaluate() {
    this.complete = Shape.all(...this.dependencies);
    this.calculate(this.complete);
    return this.complete;
  }

  flat() {
    // Really only return the dependencies. The result are flattened from the
    // outside.
    return this.dependencies.reduce((a, s) => [...a, ...s.flat()], []);
  }
}

class IsectLineCircle extends Calculated {
  constructor(line, circ) {
    super(line, circ);
    this.line = line;
    this.circ = circ;
    this.p1 = point(0, 0, "computed");
    this.p1.parent = this;
    this.n1 = vector(
      point(0, 0, "invisible"),
      0,
      0,
      "computed",
      "arrow",
      "normal"
    );
    this.n1.parent = this;
    this.p2 = point(0, 0, "computed");
    this.p2.parent = this;
    this.n2 = vector(
      point(0, 0, "invisible"),
      0,
      0,
      "computed",
      "arrow",
      "normal"
    );
    this.n2.parent = this;
  }

  calculate(complete) {
    let x = this.line.p1.x - this.circ.c.x;
    let y = this.line.p1.y - this.circ.c.y;
    let dx = this.line.p1.x - this.line.p2.x;
    let dy = this.line.p1.y - this.line.p2.y;
    let a = dx * dx + dy * dy;
    let b = 2 * (x * dx + y * dy);
    let c = x * x + y * y - this.circ.r * this.circ.r;
    let d = b * b - 4 * a * c;

    this.p1.complete = false;
    this.n1.complete = false;
    this.p2.complete = false;
    this.n2.complete = false;

    if (complete && d >= 0) {
      let sqrt = Math.sqrt(d);
      let t1 = (-b - sqrt) / (2 * a);
      let t2 = (-b + sqrt) / (2 * a);

      // if (0 <= Math.abs(t1) && Math.abs(t1) <= 1) {
      let p1x = this.line.p1.x + t1 * dx;
      let p1y = this.line.p1.y + t1 * dy;
      let n1x = ((p1x - this.circ.c.x) / this.circ.r) * defaults.unit;
      let n1y = ((p1y - this.circ.c.y) / this.circ.r) * defaults.unit;
      this.p1.complete = true;
      this.p1.move(p1x, p1y);
      this.n1.complete = true;
      this.n1.p1.move(p1x, p1y);
      this.n1.nx = n1x;
      this.n1.ny = n1y;
      // }

      // if (0 <= Math.abs(t2) && Math.abs(t2) <= 1) {
      let p2x = this.line.p1.x + t2 * dx;
      let p2y = this.line.p1.y + t2 * dy;
      let n2x = ((p2x - this.circ.c.x) / this.circ.r) * defaults.unit;
      let n2y = ((p2y - this.circ.c.y) / this.circ.r) * defaults.unit;
      this.p2.complete = true;
      this.p2.move(p2x, p2y);
      this.n2.complete = true;
      this.n2.p1.move(p2x, p2y);
      this.n2.nx = n2x;
      this.n2.ny = n2y;
      // }
    }
  }
}

class Interpolate extends Point {
  constructor(f, ...args) {
    super(0, 0, "computed")
    this.f = f;
    this.args = args;
  }

  evaluate() {
    this.complete = Shape.all(...this.args);
    let r = this.f(...this.args);
    this.x = r.x;
    this.y = r.y;
    return this.complete;
  }

  flat() {
    return [
      ...this.args,
      ...(this.complete ? [this] : [])
    ];
  }

}

function interpolate(...args) {
  return new Interpolate(...args);
}

class Mirror extends Point {
  constructor(center, point, ...opts) {
    super(0, 0, "computed", ...opts);
    this.center = center;
    this.point = point;
  }

  evaluate() {
    this.complete = Shape.all(this.center, this.point);
    this.x = 2 * this.center.x - this.point.x;
    this.y = 2 * this.center.y - this.point.y;
    return this.complete;
  }

  flat() {
    return [
      ...this.point.flat(),
      ...this.center.flat(),
      ...(this.complete ? [this] : []),
    ];
  }
}

function mirror(...args) {
  return new Mirror(...args);
}

class Sum extends Line {
  constructor(base, line, ...opts) {
    super(base, point(0, 0, "computed", ...opts), ...opts);
    this.line = line;
  }

  evaluate() {
    this.complete = super.evaluate();
    this.p2.x = this.p1.x + this.line.dx;
    this.p2.y = this.p1.y + this.line.dy;
    return this.complete;
  }

  flat() {
    return super.flat();
  }
}

function sum(...args) {
  return new Sum(...args);
}

class Project extends Point {
  constructor(base, tip, point, ...opts) {
    super(0, 0, "computed");
    this.base = base;
    this.tip = tip;
    this.point = point;
    this.opts = opts.length == 0 ? defaults.point.opts : opts;
  }

  evaluate() {
    this.complete = Shape.all(this.base, this.tip, this.point);
    let tdx = this.tip.x - this.base.x;
    let tdy = this.tip.y - this.base.y;
    let tdl = Math.sqrt(tdx * tdx + tdy * tdy);
    let pdx = this.point.x - this.base.x;
    let pdy = this.point.y - this.base.y;
    let tdxn = tdx / tdl;
    let tdyn = tdy / tdl;
    let pd = pdx * tdxn + pdy * tdyn;
    this.x = this.base.x + pd * tdxn;
    this.y = this.base.y + pd * tdyn;
    return this.complete;
  }

  flat() {
    return [
      ...this.base.flat(),
      ...this.tip.flat(),
      ...this.point.flat(),
      ...(this.complete ? [this] : []),
    ];
  }
}

function project(...args) {
  return new Project(...args);
}

class XYcross extends Group {
  constructor(p, w, h, ...opts) {
    let u2 = defaults.unit / 2;
    let dx = 0;
    let dy = 0;
    if (opts.includes("center")) {
      dx = w / 2;
      dy = h / 2;
    }
    let x = vector(
      point(p.x - dx - u2, p.y, "invisible"),
      w + 2 * u2,
      0,
      "xaxis",
      "arrow",
      ...opts
    );
    let y = vector(
      point(p.x, p.y + dy + u2, "invisible"),
      0,
      -h - 2 * u2,
      "yaxis",
      "arrow",
      ...opts
    );
    super(p, x, y);
  }
}

export function xycross(...args) {
  return new XYcross(...args);
}

class Lobe extends Shape {
  constructor(normal, wi, n, l, f, ...opts) {
    super();
    this.normal = normal;
    this.wi = wi;
    this.n = n;
    this.l = l;
    this.f = f;
    this.opts = opts;
  }

  evaluate() {
    return (this.complete = Shape.all(this.normal, this.wi));
  }

  flat() {
    return [
      ...this.normal.flat(),
      ...this.wi.flat(),
      ...(this.complete ? [this] : []),
    ];
  }

  update(element) {
    let classes = this.opts.concat("lobe").join(" ");
    let data = this.lobeData();
    d3.select(element)
      .attr("transform", `translate(${this.normal.p1.x},${this.normal.p1.y})`)
      .selectChildren()
      .data(data, (d) => d.id)
      .join(
        (enter) =>
          enter.append((d) =>
            d3
              .create("svg:path")
              .attr("class", classes)
              .attr("d", d.path)
              .style("stroke-width", d.width)
              .node()
          ),
        (update) => {
          update.style("stroke-width", (d) => d.width).attr("d", (d) => d.path);
        },
        (exit) => exit.remove()
      );
  }

  lobeData() {
    let data = [];
    for (let a = 0; a <= Math.PI; a += Math.PI / this.n) {
      let nn = norm(sub(this.normal.p2, this.normal.p1));
      let w = sub(this.wi, this.normal.p1);
      let wl = len(w);
      let pn = norm(perp(nn));
      let ap = norm(add(mul(Math.cos(a), pn), mul(Math.sin(a), nn)));
      let fa = this.f(a, ap, w, nn);
      if (fa > 0) {
        let p = mul(fa * this.l, ap);
        data.push({
          id: a,
          path: vectorPath(vec2(0, 0), p, this.opts),
          width: `calc(var(--stroke-width) * 1.5 * ${fa})`,
        });
      }
    }
    return data;
  }

  svg(w, h) {
    let classes = this.opts.concat("lobe").join(" ");
    let fan = d3
      .create("svg:g")
      .attr("id", this.id)
      .attr("class", classes)
      .attr("transform", `translate(${this.normal.p1.x},${this.normal.p1.y})`);
    this.update(fan.node());
    return fan.node();
  }
}

export function lobe(...args) {
  return new Lobe(...args);
}

// Makes array elements unique by id as a key by way of built-in object
// attribute hashing.
function unique(array) {
  let u = Object.values(
    array.reduce((a, e) => {
      a[e.id] = e;
      return a;
    }, {})
  ).sort((a, b) => a - b);
  return u;
}

function flatten(root) {
  root.evaluate();
  let shapes = unique(root.flat()).sort((a, b) => a.zIndex - b.zIndex);
  return shapes;
}

function clip(max, v) {
  return Math.min(Math.max(0, v), max);
}

function update(svg, width, height, root) {
  // Updates all elements that are direct children and have an id
  // attribute.
  svg
    .selectChildren("*[id]")
    .data(flatten(root), (d) => d.id)
    .join(
      (enter) =>
        enter.append((d) => {
          return d.svg(width, height);
        }),
      // Funny thing is, this needs to use the anonymous function
      // syntax to work. Lambdas do not seem to bind 'this'.
      (update) =>
        update.each(function(d) {
          d.update(this);
        }),
      (exit) => exit.remove()
    );
}

function revealZoom() {
  let slides = document.querySelector(".reveal .slides");
  if (slides) {
    let slideZoom = slides && slides.style && slides.style.zoom || 1;
    setZoom(slideZoom);
  }
}

function withMathJax(action) {
  
  // Retry until MathJax is loaded
  if (
    !window.MathJax ||
    !window.MathJax.startup ||
    !window.MathJax.startup.promise
  ) {
    setTimeout(() => withMathJax(action), 100);
    if (debug) console.log("geometry.js: waiting for MathJax ...");
  } else {
    if (debug) console.log("geometry.js: MathJax is loaded.");
    // Delay rendering (of the math labels) until MathJax startup is really
    // finished
    MathJax.startup.promise.then(action()).catch((err) => {
      if (debug)
        console.log("geometry.js: withMathJax: action failed: " + err.message);
    });
    // Also, set zoom if we are running under Reveal.js
    revealZoom();
  }
}

function renderSvg(element, width, height, root) {
  let svg = d3
    .select(element)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("class", "geometry")
    .on("mousemove", function(e) {
      // if (debug)   console.log("event", e.offsetX, e.offsetY); // log the mouse x,y position
      // if (debug)   console.log("event", e.clientX, e.clientY); // log the mouse x,y position
      // if (debug)   console.log("client", this.clientWidth, this.clientHeight);
      // if (debug)   console.log("client", this.clientLeft, this.clientTop);
      // if (debug)   console.log("bounding", this.getBoundingClientRect());
      // if (debug)   console.log("viewbox", this.viewBox.baseVal.width, this.viewBox.baseVal.height);
    });

  let clientToBoxX, clientToBoxY;
  let svgElement = svg.node();

  /*Update function for this SVG thing. Must be called for any event that changes something.*/

  svgElement.updateAll = () => {
    svg
      .selectChildren("*[id]")
      .data(flatten(root), (d) => d.id)
      .join(
        (enter) =>
          enter.append((d) => {
            return d.svg(width, height);
          }),
        // Funny thing is, this needs to use the anonymous function
        // syntax to work. Lambdas do not seem to bind 'this'.
        (update) =>
          update.each(function(d) {
            d.update(this);
          }),
        (exit) => exit.remove()
      );
  };

  let drag = d3
    .drag()
    .on("start", function(event) {
      clientToBoxX = svgElement.viewBox.baseVal.width / svgElement.clientWidth;
      clientToBoxY =
        svgElement.viewBox.baseVal.height / svgElement.clientHeight;
    })
    .on("drag", function(event) {
      let clientX = event.sourceEvent.offsetX / zoom;
      let clientY = event.sourceEvent.offsetY / zoom;
      let x = clip(svgElement.clientWidth, clientX) * clientToBoxX;
      let y = clip(svgElement.clientHeight, clientY) * clientToBoxY;
      event.subject.move(x, y);

      svgElement.updateAll(svg, width, height, root);
    });

  svgElement.updateAll(svg, width, height, root);

  svg.selectChildren("*[id].handle").call(drag);
  svg.selectChildren("*[id].play").on("click", clicked);

  function clicked(event, d) {
    if (event.defaultPrevented) return; // dragged
    d.click();
    svgElement.updateAll(svg, width, height, root);
  }
}

// Lastly, inject the CSS
let base = new URL(import.meta.url);
if (debug) console.log("geometry.js: loaded. (base: " + base + ")");
let link = document.createElement("link");
link.href = new URL("geometry.css", base);
link.rel = "stylesheet";
document.head.appendChild(link);
if (debug) console.log("geometry.js: injecting: " + link.href);
