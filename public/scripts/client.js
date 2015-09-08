var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
var renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight ); 
document.body.appendChild( renderer.domElement );

var deg2Rad = Math.PI / 180;
var rad2Deg = 180 / Math.PI;
var camSettings = {
	orbitRadius: 3,
	position: new THREE.Vector3(),
	rotationZ: 0,
	minLatitude: 5,
	maxLatitude: 175
};
var deviceData = {
	
};
var cube, cube2;

function start() {
	// initialization
	var geometry = new THREE.BoxGeometry(1, 1, 1);
	var material = new THREE.MeshNormalMaterial();
	cube = new THREE.Mesh(geometry, material);
	cube2 = new THREE.Mesh(geometry, material);
	scene.add(cube);
	scene.add(cube2);
	cube2.position.y += 1;
	cube2.scale.set(1, 0.25, 0.25);
	
	render();
}
start();

var debug = document.getElementById("debug");
function render() { 
	requestAnimationFrame( render ); 
	
	// update loop
	camera.position.set( camSettings.position.x, camSettings.position.y, camSettings.position.z);
	camera.lookAt(cube.position);
	//camera.rotation.z = 0; //camSettings.rotationZ;
	
	renderer.render( scene, camera ); 
}

var promise = FULLTILT.getDeviceOrientation({'type': 'world'});
window.addEventListener("deviceorientation", function(event) {
	promise.then(function(deviceOrientation) {
		
		// Use `deviceOrientation' object to interact with device orientation sensors
		var orientation = deviceOrientation.getScreenAdjustedEuler();
		// Latitude
		var lat = orientation.beta;
		if(orientation.beta < 0) {
			if(orientation.beta > -90) {
				lat = camSettings.minLatitude;
			} else {
				lat = camSettings.maxLatitude;
			}
		}
		
		// Longitude
		var alphaRad = orientation.alpha * deg2Rad;
	 	var betaRad = orientation.beta * deg2Rad;
		var gammaRad = orientation.gamma * deg2Rad;
	  	
		//Calculate equation component
		var cA = Math.cos(alphaRad);
		var sA = Math.sin(alphaRad);
		var sB = Math.sin(betaRad);
		var cG = Math.cos(gammaRad);
		var sG = Math.sin(gammaRad);
		
		//Calculate A, B, C rotation components
		var rA = - cA * sG - sA * sB * cG;
		var rB = - sA * sG + cA * sB * cG;
		
		//Calculate compass heading
		var compassHeading = Math.atan(rA / rB);
		
		//Convert from half unit circle to whole unit circle
		if(rB < 0) {
			compassHeading += Math.PI;
		}else if(rA < 0) {
			compassHeading += 2 * Math.PI;
		}
		
		//Convert radians to degrees
		compassHeading *= rad2Deg;
		
		//update latitude
		var lon = compassHeading;
		
		camSettings.position.x = camSettings.orbitRadius * Math.sin(lat * deg2Rad) * Math.cos(lon * deg2Rad);
		camSettings.position.y = camSettings.orbitRadius * Math.cos(lat * deg2Rad);
		camSettings.position.z = camSettings.orbitRadius * Math.sin(lat * deg2Rad) * Math.sin(lon * deg2Rad);
		
	}).catch(function(message) {
		// Device Orientation Events are not supported
		console.log("This Device is not supported.");
	});
});

/*function clamp(value, min, max) {
	if(value < min) {
		value = min;
	} else if(value > max) {
		value = max;
	}
	return value;
}*/