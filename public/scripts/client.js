'strict';

(function() {
	// Dependencies
	var THREE = require("three");
	var Physijs = require('physijs-browserify')(THREE);
	var io = require("socket.io-client");
	var P2P = require("socket.io-p2p");
	Physijs.scripts.worker = '/libs/physi-worker.js';
	Physijs.scripts.ammo = '/libs/ammo.js';
	
	var scene, camera, renderer;
	var playerQuaternion = new THREE.Quaternion()
	var deviceData = {};
	var settings = {
		frameRate: 30,
		fieldOfView: 60,
		cameraOrbitRadius: 3
	};
	
	// GUI
	var mainmenu = document.getElementById("main-menu");
	var inputName = document.getElementById("input-name");
	var playBtn = document.getElementById("play-btn");
	
	// Networking
	var socket, p2p;
	
	// Scene Objects
	var planet;
	
	// Players
	var player = {
		name: "noname"	
	};
	var opponent = {
		name: "noname"	
	};
	
	playBtn.addEventListener("click", initGame);
	
	window.onload = initApp;
	// called before start
	function initApp() {
		// init Scene
		scene = new Physijs.Scene();
		// init Camera
		camera = new THREE.PerspectiveCamera(settings.fieldOfView, window.innerWidth / window.innerHeight, 0.1, 1000);
		camera.position.z += settings.cameraOrbitRadius;
		// init Renderer
		renderer = new THREE.WebGLRenderer();
		renderer.setSize( window.innerWidth, window.innerHeight ); 
		document.body.appendChild( renderer.domElement );
		
		// window resize event
		window.addEventListener("resize", function() {
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setSize( window.innerWidth, window.innerHeight );
		}, false);
		
		// Device orientation event
		window.addEventListener("deviceorientation", function(event) {
			deviceData = event;
		}, false);
		
		// P2P connection
		socket = io();
		p2p = new P2P(socket, { numClients: 1 });
		
		// initialize main menu
		initMenu();
	}
	
	/*-------------------
		MENU SCENE
	-------------------*/
	
	function initMenu() {
		// init Skybox
		initSkyBox();
		
		// begin render vindaloop
		update();
	}
	
	/*-------------------
		GAME SCENE
	-------------------*/
	
	function initGame() {
		// Planet
		/*planet = new Physijs.SphereMesh(
			new THREE.SphereGeometry(0.5, 24, 24),
			new THREE.MeshNormalMaterial(),
			0
		);*/
		// init planet
		planet = new Physijs.BoxMesh(
			new THREE.BoxGeometry(1, 1, 1),
			new THREE.MeshNormalMaterial(),
			0
		); 
		scene.add( planet );	
	}
	
	/*----------------------
		RENDER VINDALOOP
	----------------------*/

	function update() {
		// player orientation
		updateRotation();
		
		// render / physics frame calls
		scene.simulate();
		renderer.render( scene, camera ); 		
		// limit framerate
		setTimeout( function() {
			requestAnimationFrame( update );
		}, 1000 / settings.frameRate ); 
	}
	
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
	
	function updateRotation() {
		var alpha = deviceData.alpha ? THREE.Math.degToRad( deviceData.alpha ) : 0; // Z
		var beta = deviceData.beta ? THREE.Math.degToRad( deviceData.beta ) : 0; // X
		var gamma = deviceData.gamma ? THREE.Math.degToRad( deviceData.gamma ) : 0; // Y
		var orient = window.orientation ? THREE.Math.degToRad( window.orientation ) : 0; // O
		setObjectRotation( playerQuaternion, alpha, beta, gamma, orient );
		var pos = (new THREE.Vector3( 0, 0, settings.orbitRadius ) ).applyQuaternion( playerQuaternion );
		camera.position.set(pos.x, pos.y, pos.z);
		setObjectRotation( camera.quaternion, alpha, beta, gamma, orient );
	}
	
	function initSkyBox() {
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
	}
	
	// Debugging
	var debugElement = document.getElementById("debug");
	function debug(stringValue) {
		console.log(stringValue);
		debugElement.innerHTML = stringValue;
	}
})();