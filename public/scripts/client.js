// Debugging
var debug = document.getElementById("debug");

Physijs.scripts.worker = 'physijs_worker.js';
//Physijs.scripts.ammo = '/js/ammo.js';

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
	var latitude = deviceRotation.beta * deg2Rad; // radians
	if(deviceRotation.beta < 0) {
		if(deviceRotation.beta > -90) {
			latitude = camSettings.minLatitude;
		} else {
			latitude = camSettings.maxLatitude;
		}
	}
	
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
	var rotationAlpha = - cosAlpha * sinGamma - sinAlpha * sinBeta * cosGamma;
	var rotationBeta = - sinAlpha * sinGamma + cosAlpha * sinBeta * cosGamma;
	
	//Calculate compass heading
	var compassHeading = Math.atan(rotationAlpha / rotationBeta);
	
	//Convert from half unit circle to whole unit circle
	if(rotationBeta < 0) {
		compassHeading += Math.PI;
	}else if(rotationAlpha < 0) {
		compassHeading += 2 * Math.PI;
	}
	
	var longitude = compassHeading; // Radians
	
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