'strict';

(function() {
	// Dependencies
	var THREE = require("three");
	var Physijs = require("physijs");
	var THREE = require("three");
	var THREE = require("three");
	var THREE = require("three");
	
	var scene, camera, renderer;
	var frameRate = 30;
	var camSettings = {
		fieldOfView: 60,
		orbitRadius: 3,
		cameraQuaternion: new THREE.Quaternion()
	};
	var deviceData = {};
	
	// Scene Objects
	var planet;
	
	var setObjectRotation = function() {
		var axisZ = new THREE.Vector3( 0, 0, 1 );
		var euler = new THREE.Euler();
		var q0 = new THREE.Quaternion();
		var root2Over2 = Math.sqrt( 0.5 );
		var q1 = new THREE.Quaternion( -root2Over2, 0, 0, root2Over2 ); // - PI/2 around the x-axis
		return function(quaternion, alpha, beta, gamma, orientation) {
			euler.set( beta, alpha, -gamma, 'YXZ' );                       		  // 'ZXY' for the device, but 'YXZ' for us
			quaternion.setFromEuler( euler );                               	  // orient the device
			quaternion.multiply( q1 );                                      	  // camera looks out the back of the device, not the top
			quaternion.multiply( q0.setFromAxisAngle( axisZ, -orientation ) );    // adjust for screen orientation
		};
	}();
	
	// called before start
	function initialize() {
		Physijs.scripts.worker = 'physijs_worker.js';
		Physijs.scripts.ammo = 'ammo.js';
		scene = new Physijs.Scene();
		camera = new THREE.PerspectiveCamera(camSettings.fieldOfView, window.innerWidth / window.innerHeight, 0.1, 1000);
		renderer = new THREE.WebGLRenderer();
		renderer.setSize( window.innerWidth, window.innerHeight ); 
		document.body.appendChild( renderer.domElement );
		
		window.addEventListener("resize", function() {
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setSize( window.innerWidth, window.innerHeight );
		}, false);
		
		// Device orientation
		window.addEventListener("deviceorientation", function(event) {
			deviceData = event;
		}, false);
		
		// P2P connection
		var socket = io();
		var p2p = new P2P(socket, { numClients: 2 });
		p2p.on('peer-msg', function (data) {
			console.log(data);
		});
		
		start();
	} window.onload = initialize;
	
	// start of game
	function start() {
		// Skybox
		(function() {
			var urlPrefix = "assets/textures/skybox/test/";
			var cubeMapFaces = [
				urlPrefix + "2.png",
				urlPrefix + "3.png",
				urlPrefix + "1.png",
				urlPrefix + "6.png",
				urlPrefix + "4.png",
				urlPrefix + "5.png"
			];
			var textureCube = THREE.ImageUtils.loadTextureCube(cubeMapFaces);
			var skyShader = THREE.ShaderLib[ "cube" ];
			skyShader.uniforms[ "tCube" ].value = textureCube;
			var cubeMapSize = 256;
			var skyBox = new THREE.Mesh(
				new THREE.BoxGeometry(cubeMapSize, cubeMapSize, cubeMapSize),
				new THREE.ShaderMaterial({
					vertexShader: skyShader.vertexShader,
					fragmentShader: skyShader.fragmentShader,
					uniforms: skyShader.uniforms,
					depthWrite: false,
					side: THREE.BackSide
				})
			);
			scene.add( skyBox );
		})();
		
		// Planet
		camera.position.z += camSettings.orbitRadius;
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
		var alpha = deviceData.alpha ? THREE.Math.degToRad( deviceData.alpha ) : 0; // Z
		var beta = deviceData.beta ? THREE.Math.degToRad( deviceData.beta ) : 0; // X
		var gamma = deviceData.gamma ? THREE.Math.degToRad( deviceData.gamma ) : 0; // Y
		var orient = window.orientation ? THREE.Math.degToRad( window.orientation ) : 0; // O
		var quaternion = new THREE.Quaternion();
		setObjectRotation( quaternion, alpha, beta, gamma, orient );
		var pos = (new THREE.Vector3( 0, 0, camSettings.orbitRadius ) ).applyQuaternion( quaternion );
		camera.position.set(pos.x, pos.y, pos.z);
		setObjectRotation( camera.quaternion, alpha, beta, gamma, orient );
		
		// render / physics frame calls
		scene.simulate();
		renderer.render( scene, camera ); 
		// limit framerate
		setTimeout( function() {
			requestAnimationFrame( update );
		}, 1000 / frameRate ); 
	}
	
	// Debugging
	var debugElement = document.getElementById("debug");
	function debug(stringValue) {
		console.log(stringValue);
		debugElement.innerHTML = stringValue;
	}
})();