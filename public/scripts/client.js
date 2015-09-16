'strict';
(function() {
	// Dependencies
	var THREE = require('three');
	var Physijs = require('physijs-browserify')(THREE);
	Physijs.scripts.worker = '/libs/physi-worker.js';
	Physijs.scripts.ammo = '/libs/ammo.js';
	var io = require('socket.io-client');
	// Settings
	var settings = {
		frameRate: 30,
		fieldOfView: 60,
		cameraOrbitRadius: 5
	};
	
	var camera, renderer, currentScene, isHost;
	var scenes = {};
	var deviceData = {};
	var gameState = {
		projectiles: {}
	}
	
	// GUI
	var mainMenu = document.getElementById('main-menu');
	var inputName = document.getElementById('input-name');
	var playBtn = document.getElementById('play-btn');
	playBtn.addEventListener('click', findMatch);
	
	// Networking
	var socket = io();
	
	// Game Scene Objects
	var planet;
	
	// Players
	var player = {
		name: 'anonymous',
		quaternion: new THREE.Quaternion()
	};
	var opponent = {
		name: 'anonymous'	
	};
	
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
	(function initApp() {
		// init Scenes
		scenes.menu = new THREE.Scene();
		// game scene initializes everytime a match is started
		currentScene = scenes.menu;
		
		// init Camera
		camera = new THREE.PerspectiveCamera(settings.fieldOfView, window.innerWidth / window.innerHeight, 0.1, 1000);
		// init Renderer
		renderer = new THREE.WebGLRenderer();
		renderer.setSize( window.innerWidth, window.innerHeight ); 
		document.body.appendChild( renderer.domElement );
		
		// window resize event
		window.addEventListener('resize', function() {
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setSize( window.innerWidth, window.innerHeight );
		}, false);
		
		// Device orientation event
		window.addEventListener('deviceorientation', function(event) {
			deviceData = event;
		}, false);
		
		// initialize main menu
		initMenu();
	})();
	
	/*-------------------
		MENU SCENE
	-------------------*/
	
	function initMenu() {
		currentScene = scenes.menu;
		// init Skybox
		initSkyBox(scenes.menu);
		
		// begin render vindaloop
		update();
	}
	
	/*----------------
		FIND MATCH
	----------------*/
	
	function findMatch() {
		mainMenu.style.display = 'none';
		assignPlayerName();
		socket.emit('find-match');
		socket.on('start-match', function() {
			initGame();
		});
	}
	
	/*-------------------
		GAME SCENE
	-------------------*/
	
	function initGame() {
		// Set Scene to Render
		socket.on("init-match", function(data) {
			isHost = data.isHost;
			if(isHost) scenes.game = new Physijs.Scene();
			else scenes.game = new THREE.Scene();
			currentScene = scenes.game;
			// init Skybox
			initSkyBox(scenes.game);
			// Planet
			/*planet = new THREE.BoxMesh(
				new THREE.BoxGeometry(1, 1, 1),
				new THREE.MeshNormalMaterial()
			); */
			// init planet
			planet = new THREE.Mesh(
				new THREE.BoxGeometry(1, 1, 1),
				new THREE.MeshNormalMaterial()
			); 
			scenes.game.add( planet );
			socket.on("simulation-frame", function(data) {
				gameState = data;
			});
		});
	}
	
	/*----------------------
		RENDER VINDALOOP
	----------------------*/

	function update() {
		// player orientation
		updateRotation();
		
		// Render Scene
		if(currentScene === scenes.game && isHost) {
			scenes.game.simulate();
			socket.emit('simulation-frame', gameState);
		}
		renderer.render( currentScene, camera ); 		
		// limit framerate
		setTimeout( function() {
			requestAnimationFrame( update );
		}, 1000 / settings.frameRate );
	}
	
	function updateRotation() {
		var alpha = deviceData.alpha ? THREE.Math.degToRad( deviceData.alpha ) : 0; // Z
		var beta = deviceData.beta ? THREE.Math.degToRad( deviceData.beta ) : 0; // X
		var gamma = deviceData.gamma ? THREE.Math.degToRad( deviceData.gamma ) : 0; // Y
		var orient = window.orientation ? THREE.Math.degToRad( window.orientation ) : 0; // O
		setObjectRotation( player.quaternion, alpha, beta, gamma, orient );
		var pos = (new THREE.Vector3( 0, 0, settings.cameraOrbitRadius ) ).applyQuaternion( player.quaternion  );
		camera.position.set(pos.x, pos.y, pos.z);
		setObjectRotation( camera.quaternion, alpha, beta, gamma, orient );
	}
	
	function initSkyBox(scene) {
		var urlPrefix = 'assets/textures/skybox/space/';
		var cubeMapFaces = [
			urlPrefix + '2.png',
			urlPrefix + '3.png',
			urlPrefix + '1.png',
			urlPrefix + '6.png',
			urlPrefix + '4.png',
			urlPrefix + '5.png'
		];
		var textureCube = THREE.ImageUtils.loadTextureCube(cubeMapFaces);
		var skyShader = THREE.ShaderLib[ 'cube' ];
		skyShader.uniforms[ 'tCube' ].value = textureCube;
		var cubeMapSize = 128;
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
	
	function assignPlayerName() {
		var regex = /^[a-zA-Z0-9]+$/;
		if(regex.test(inputName.value)) player.name = inputName.value.toUpperCase();
		//debug(player.name);
	}
	
	// Debugging
	var debugElement = document.getElementById('debug');
	function debug(stringValue) {
		console.log(stringValue);
		debugElement.innerHTML = stringValue;
	}
})();