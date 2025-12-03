const canvas = document.getElementById('mainScreen');

//Create scene with THREE
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 10, 0); 
camera.lookAt(0, 0, 0);
//Make the renderer
const renderer = new THREE.WebGLRenderer({ canvas: canvas });
renderer.setSize(window.innerWidth, window.innerHeight);

//Create cones, they will be used to react to the melody of the song
const geometry = new THREE.ConeGeometry( 2, 2, 3);
const material = new THREE.MeshBasicMaterial( { color: 0x00ff00, wireframe: true, } );
const cone1 = new THREE.Mesh(geometry, material );
scene.add(cone1);

const cone2 = new THREE.Mesh(geometry, material );
scene.add(cone2)

const cone3 = new THREE.Mesh(geometry, material );
scene.add(cone3)

const cone4 = new THREE.Mesh(geometry, material );
scene.add(cone4)

var up1 = true;
var up2 = true;
var up3 = true;
var up4 = true;

//var rotationSpeed = song bpm or something;
//int melody - some variable that is increased by when the melody is going

//particle cloud around the center
const PARTICLE_COUNT = 2000;
const RING_RADIUS = 5; 
const RING_THICKNESS = 4; 

const particleData = []; 

function createParticleRing(scene) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3); // 3 numbers (x, y, z) per particle

    //loop make each particle
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        
        // random pos in ring
        const angle = Math.random() * Math.PI * 2;
        const radius = RING_RADIUS + (Math.random() * RING_THICKNESS);

        
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = 0; // Flat on the floor

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        
        particleData.push({
            angle: angle,           
            baseRadius: radius, 
            driftSpeed: Math.random() * 2 + 0.5 
        });
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    //material
    const material = new THREE.PointsMaterial({
        color: 0x00ff00, 
        size: 0.15,
        transparent: true,
        opacity: 0.8
    });
    const particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);

    return particleSystem;
}
const partCloud = createParticleRing(scene);
function updateParticleRing(particleSystem, beatIntensity) {
    const positions = particleSystem.geometry.attributes.position.array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const data = particleData[i];
        const currentRadius = data.baseRadius + (beatIntensity * 5 * data.driftSpeed);

        const x = Math.cos(data.angle) * currentRadius;
        const z = Math.sin(data.angle) * currentRadius;

        positions[i * 3] = x;
        positions[i * 3 + 2] = z;
    }
    particleSystem.geometry.attributes.position.needsUpdate = true;
}

var bass = 0;

//animate everything
function animate() {
  requestAnimationFrame(animate); 
  cone1.rotation.x += 0.01; //* rotationSpeed for all rotates
  cone1.rotation.y += 0.01;
  cone2.rotation.x -= 0.01;
  cone2.rotation.y -= 0.01;
  cone3.rotation.x += 0.0051;
  cone3.rotation.y += 0.0051;
  cone4.rotation.x -= 0.02;
  cone4.rotation.y += 0.01;

  //Cone sizing, change based on the melody
  if(up1){
	  cone1.scale.y+=0.05;
	  if(cone1.scale.y>=3) //*melody
	  {
		  up1 = false;
	  }
  }
  else{
	  cone1.scale.y-=0.05;
	  if(cone1.scale.y<=1){
		  up1 = true;
	  }
  }

  if(up2){
	  cone2.scale.y+=0.03;
	  if(cone2.scale.y>=4) //*melody
	  {
		  up2 = false;
	  }
  }
  else{
	  cone2.scale.y-=0.03;
	  if(cone2.scale.y<=0.2){
		  up2 = true;
	  }
  }

  if(up3){
	  cone3.scale.z+=0.03;
	  if(cone3.scale.z>=4) //*melody
	  {
		  up3 = false;
	  }
  }
  else{
	  cone3.scale.z-=0.03;
	  if(cone3.scale.z<=-2){
		  up3 = true;
	  }
  }

  if(up4){
	  bass+=0.01
	  if(bass>=0.9)
	  {
		  up4 = false;
	  }
  }
  else{
	  bass -= 0.1;
	  if(bass<=0.1){
		  up4 = true;
	  }
  }

  updateParticleRing(partCloud, bass)

  renderer.render(scene, camera);
}

animate();