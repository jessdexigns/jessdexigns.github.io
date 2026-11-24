let font;
let fontPath = "HelveticaNeueLTCom-Bd.ttf";
let fontSize = 170;
let word = "magic";
let particles = [];
let isMagic = false;
let hueSlider;
let isReady = false;

async function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  colorMode(HSB, 360, 100, 100);

  // Inject CSS for the custom transparent slider with a 2px white outline
  let customCSS = `
    #ui-container {
      position: absolute;
      top: 20px;
      left: 24px;
      z-index: 10;
      display: flex;
      flex-direction: column;
      gap: 8px;
      user-select: none;
    }
    #hue-slider {
      -webkit-appearance: none;
      appearance: none;
      width: 140px;
      height: 14px;
      margin: 0;
      background: transparent;
      border: 2px solid #ffffff;
      border-radius: 999px;
      outline: none;
      cursor: pointer;
    }
    #hue-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      background: transparent;
      border: 2px solid #ffffff;
      border-radius: 50%;
      cursor: pointer;
    }
    #hue-slider::-moz-range-thumb {
      width: 14px;
      height: 14px;
      background: transparent;
      border: 2px solid #ffffff;
      border-radius: 50%;
      cursor: pointer;
    }
  `;
  createElement("style", customCSS);

  // Wrapper container for the top-left UI section
  let uiContainer = createDiv();
  uiContainer.id("ui-container");

  // "colour" label positioned above the slider
  let label = createDiv("colour");
  label.parent(uiContainer);
  label.style("color", "#ffffff");
  label.style("font-family", "Helvetica Neue, Helvetica, Arial, sans-serif");
  label.style("font-size", "14px");
  label.style("letter-spacing", "0.04em");

  // Hue slider (0 to 360 degrees) directly beneath the label
  hueSlider = createSlider(0, 360, 200, 1);
  hueSlider.id("hue-slider");
  hueSlider.parent(uiContainer);

  // Load font asynchronously (p5.js 2.0 standard)
  font = await loadFont(fontPath);
  textFont(font);
  textSize(fontSize);

  let bounds = font.textBounds(word, 0, 0);

  let points = font.textToPoints(word, -bounds.w / 2, bounds.h / 2, {
    sampleFactor: 0.1,
  });

  for (let i = 0; i < points.length; i++) {
    let radius = random(220, 420);
    let angle = random(TWO_PI);

    particles.push({
      homeX: points[i].x,
      homeY: points[i].y,
      homeZ: 0,

      radius: radius,
      angle: angle,
      speed: random(0.001, 0.004) * -1,
      ySpread: random(-180, 280),
      tilt: random(TWO_PI),
      noiseOffset: random(1000),
      spinOffset: random(TWO_PI),

      x: cos(angle) * radius,
      y: sin(angle) * 100,
      z: sin(angle) * radius,
    });
  }

  isReady = true;
}

function draw() {
  background(0);

  if (!isReady) return;

  noStroke();

  let lightX = mouseX - width / 2;
  let lightY = mouseY - height / 2;
  let currentHue = hueSlider.value();

  if (isMagic) {
    // Low ambient light restores dramatic contrast for the mouse pointLight
    ambientLight(0, 0, 10);
    pointLight(0, 0, 100, lightX, lightY, 160);
  } else {
    // Floating orbit lighting
    ambientLight(0, 0, 35);
    pointLight(0, 0, 100, lightX, lightY, 550);
  }

  for (let i = 0; i < particles.length; i++) {
    let p = particles[i];

    // 1. Always advance the 3D circular orbit around (0, 0, 0)
    p.angle += p.speed;
    let orbitX = cos(p.angle) * p.radius;
    let orbitY = sin(p.angle + p.tilt) * p.ySpread;
    let orbitZ = sin(p.angle) * p.radius;

    // 2. Minimal Perlin noise vibration when in "magic" form
    let vibeAmount = 4;
    let time = frameCount * 0.25;

    let vibeX = (noise(p.noiseOffset, time) - 0.5) * 2 * vibeAmount;
    let vibeY = (noise(p.noiseOffset + 100, time) - 0.5) * 2 * vibeAmount;
    let vibeZ = (noise(p.noiseOffset + 200, time) - 0.5) * 2 * vibeAmount;

    // 3. Choose target: vibrating "magic" letter point OR 3D orbit position
    let targetX = isMagic ? p.homeX + vibeX : orbitX;
    let targetY = isMagic ? p.homeY + vibeY : orbitY;
    let targetZ = isMagic ? p.homeZ + vibeZ : orbitZ;

    // 4. Smoothly glide toward the target like a magnet
    p.x = lerp(p.x, targetX, 0.08);
    p.y = lerp(p.y, targetY, 0.08);
    p.z = lerp(p.z, targetZ, 0.08);

    // 5. Pastel colour + cursor spotlight response
    if (!isMagic) {
      let d = dist(lightX, lightY, p.x, p.y);
      let t = constrain(1 - d / 180, 0, 1);
      let softFalloff = t * t * (3 - 2 * t);
      let brightness = lerp(50, 100, softFalloff);

      fill(currentHue, 35, brightness);
      emissiveMaterial(currentHue, 30, softFalloff * 65);
    } else {
      let d = dist(lightX, lightY, p.x, p.y);
      let t = constrain(1 - d / 220, 0, 1);
      let softFalloff = t * t * (3 - 2 * t);
      let brightness = lerp(50, 100, softFalloff);

      fill(currentHue, 35, brightness);
      emissiveMaterial(currentHue, 30, brightness * 0.16);
    }

    // 6. Draw each 3D star in space
    push();
    translate(p.x, p.y, p.z);

    if (!isMagic) {
      rotateX(frameCount * 0.02 + p.spinOffset);
      rotateY(frameCount * 0.03 + p.spinOffset);
    } else {
      rotateZ(sin(frameCount * 0.03 + p.spinOffset) * 0.2);
    }

    drawStar3D(5, 2.2, 2.2);
    pop();
  }
}

function drawStar3D(outerR, innerR, depth) {
  let numPoints = 5;
  let totalVertices = numPoints * 2;
  let ring = [];

  for (let i = 0; i < totalVertices; i++) {
    let r = i % 2 === 0 ? outerR : innerR;
    let a = (i * TWO_PI) / totalVertices - HALF_PI;
    ring.push({ x: cos(a) * r, y: sin(a) * r });
  }

  beginShape(TRIANGLES);
  for (let i = 0; i < totalVertices; i++) {
    let curr = ring[i];
    let next = ring[(i + 1) % totalVertices];

    vertex(0, 0, depth);
    vertex(curr.x, curr.y, 0);
    vertex(next.x, next.y, 0);

    vertex(0, 0, -depth);
    vertex(next.x, next.y, 0);
    vertex(curr.x, curr.y, 0);
  }
  endShape();
}

function mousePressed(event) {
  if (!isReady) return;
  if (event && event.target && event.target.closest("#ui-container")) {
    return;
  }
  isMagic = !isMagic;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}