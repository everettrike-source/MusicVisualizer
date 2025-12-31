import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
const canvas = document.getElementById('mainScreen');



//Create scene with THREE
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 10, 0); 
camera.lookAt(0, 0, 0);

//Center and style the spotify login button
document.getElementById("login-button").style.position = 'absolute';
document.getElementById("login-button").style.zIndex = '1';
document.getElementById("login-button").style.top = '45%';
document.getElementById("login-button").style.left = '43%';   
document.getElementById("login-button").style.opacity = '0.8'; 
document.getElementById("login-button").style.border = 'none';
document.getElementById("login-button").style.padding = '10px 20px';
document.getElementById("login-button").style.fontSize = '24px';
document.getElementById("login-button").style.backgroundColor = '#31493aff'; 
document.getElementById("login-button").style.color = 'white'; 
document.getElementById("login-button").style.fontFamily = 'monospace';

//Make the renderer
const renderer = new THREE.WebGLRenderer({ canvas: canvas });
renderer.setSize(window.innerWidth, window.innerHeight);

//Shaders
const composer = new EffectComposer( renderer );
const pixelPass = new RenderPixelatedPass( 3, scene, camera );
composer.addPass(pixelPass);

//Check if the user has loged into spotify
let isMusicPlaying = false;
window.addEventListener('spotifyStateChange', (event) => {
    //Update local variable based on the broadcast data
    isMusicPlaying = event.detail.isPlaying;
});


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
const PARTICLE_COUNT = 5000;
const RING_RADIUS = 5; 
const RING_THICKNESS = 2; 

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
        const y = 0;

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
        size: 0.001,
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
    //Only animate if music is playing
  if(isMusicPlaying){
  cone1.rotation.x += 0.01; //* rotationSpeed for all rotates
  cone1.rotation.y += 0.01;
  cone2.rotation.x -= 0.01;
  cone2.rotation.y -= 0.01;
  cone3.rotation.x += 0.0051;
  cone3.rotation.y += 0.0051;
  cone4.rotation.x -= 0.02;
  cone4.rotation.y += 0.01;

  //Cone sizing, change based on the melody
  /*
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
    */

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
  }
  composer.render();
}

animate();