// Debugging
var debug = document.getElementById("debug");

Physijs.scripts.worker = 'physijs_worker.js';
Physijs.scripts.ammo = 'ammo.js';

var scene, camera, renderer;
var frameRate = 30;
var fieldOfView = 60;

var deg2Rad = Math.PI / 180;
var rad2Deg = 180 / Math.PI;
var camSettings = {
	orbitRadius: 3,
	position: new THREE.Vector3(),
	rotationZ: 0,
	minLatitude: 5,
	maxLatitude: 175
};

// Scene Objects
var planet;

window.onload = initialize;
// called before start
function initialize() {
	scene = new Physijs.Scene();
	camera = new THREE.PerspectiveCamera(fieldOfView, window.innerWidth / window.innerHeight, 0.1, 1000);
	renderer = new THREE.WebGLRenderer();
	renderer.setSize( window.innerWidth, window.innerHeight ); 
	document.body.appendChild( renderer.domElement );
	start();
}

// start of game
function start() {
	/*planet = new Physijs.SphereMesh(
		new THREE.SphereGeometry(0.5, 24, 24),
		new THREE.MeshNormalMaterial(),
		0
	);*/
	planet = new Physijs.BoxMesh(
		new THREE.BoxGeometry(1, 1, 1),
		new THREE.MeshNormalMaterial(),
		0
	);
	scene.add( planet );
	
	// begin render loop
	update();
}

// Main Render Loop
function update() {
	// player orientation
	camera.position.set( camSettings.position.x, camSettings.position.y, camSettings.position.z);
	camera.lookAt(planet.position);
	
	// render / physics frame calls
	scene.simulate();
	renderer.render( scene, camera ); 
	// limit framerate
	setTimeout( function() {
        requestAnimationFrame( update );
    }, 1000 / frameRate ); 
}

// Device Orientation
var promise = FULLTILT.getDeviceOrientation({'type': 'world'});
window.addEventListener("deviceorientation", function(event) {
	promise.then(function(deviceOrientation) {
		// Use `deviceOrientation' object to interact with device orientation sensors
		var deviceRotation = deviceOrientation.getScreenAdjustedEuler();
		var newCamPos = calculatePlayerVector(deviceRotation, camSettings.orbitRadius);
		camSettings.position.set(newCamPos.x, newCamPos.y, newCamPos.z);
		
	}).catch(function(message) {
		// Device Orientation Events are not supported
		console.log("This Device is not supported.");
	});
});

// Player vector based on device orientation
function calculatePlayerVector(deviceRotation, radius) {
	// LATITUDE
	var latitude = deviceRotation.beta;
	/*if(latitude < 0) {
		if(latitude > -90) {
			latitude = camSettings.minLatitude;
		} else {
			latitude = camSettings.maxLatitude;
		}
	}*/
	if(latitude < 0) {
		latitude = 180 + (180 - Math.abs(latitude));
	}
	latitude *= deg2Rad; // latitude in radians
	
	// LONGITUDE
	var alphaRad = deviceRotation.alpha * deg2Rad;
	var betaRad = deviceRotation.beta * deg2Rad;
	var gammaRad = deviceRotation.gamma * deg2Rad;
	
	// Calculate equation component
	var cosAlpha = Math.cos(alphaRad);
	var sinAlpha = Math.sin(alphaRad);
	var sinBeta = Math.sin(betaRad);
	var cosGamma = Math.cos(gammaRad);
	var sinGamma = Math.sin(gammaRad);
	
	// Calculate A, B, C rotation components
	var rotationA = - cosAlpha * sinGamma - sinAlpha * sinBeta * cosGamma;
	var rotationB = - sinAlpha * sinGamma + cosAlpha * sinBeta * cosGamma;
	
	//Calculate compass heading
	var compassHeading = Math.atan(rotationA / rotationB);
	
	//Convert from half unit circle to whole unit circle
	if(rotationB < 0) {
		compassHeading += Math.PI;
	}else if(rotationA < 0) {
		compassHeading += 2 * Math.PI;
	}
	
	var longitude = compassHeading; // longitude in radians
	
	// adjust control of camera rotation based on alpha(Z) rotation
	latitude = lerp(latitude, longitude, Math.abs(Math.sin(orientation.alpha * deg2Rad)));
	longitude = lerp(longitude, latitude, Math.abs(Math.cos(orientation.alpha * deg2Rad)));
	
	debug.innerHTML = "lon: " + Math.round(longitude * rad2Deg) + ", lat: " + Math.round(latitude * rad2Deg);
	
	// final player vector
	var x = radius * Math.sin(latitude) * Math.cos(longitude);
	var y = radius * Math.cos(latitude);
	var z = radius * Math.sin(latitude) * Math.sin(longitude);
	
	return new THREE.Vector3(x, y, z);
}

/*function clamp(value, min, max) {
	if(value < min) {
		value = min;
	} else if(value > max) {
		value = max;
	}
	return value;
}*/

function lerp(value1, value2, alpha) {
	return value1 + (value2 - value1) * alpha;
}