let font;
let fontPath = "HelveticaNeueLTCom-Bd.ttf";
let fontSize = 170;
let word = "magic";
let particles = [];
let isMagic = false;

async function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);

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
      noiseOffset: random(1000), // 1000 so no number is too close - just points on the perlin noise line

      x: cos(angle) * radius,
      y: sin(angle) * 100,
      z: sin(angle) * radius,
    });
  }
}

function draw() {
  background(0);
  fill(255);
  noStroke();

  for (let i = 0; i < particles.length; i++) {
    let p = particles[i];

    // 1. Always advance the 3D circular orbit around (0, 0, 0)
    p.angle += p.speed;
    let orbitX = cos(p.angle) * p.radius;
    let orbitY = sin(p.angle + p.tilt) * p.ySpread;
    let orbitZ = sin(p.angle) * p.radius;

    // 2. Minimal Perlin noise vibration when in "magic" form
    let vibeAmount = 4; // max pixel distance of the vibration
    let time = frameCount * 0.25; // higher = faster buzz, lower = slower hum

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

    // 5. Draw each particle in 3D space
    push();
    translate(p.x, p.y, p.z);
    sphere(2);
    pop();
  }
}

function mousePressed() {
  isMagic = !isMagic;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}