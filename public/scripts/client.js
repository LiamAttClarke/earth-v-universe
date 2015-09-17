'strict';
(function() {
	// Dependencies
	var THREE = require('three');
	var Physijs = require('physijs-browserify')(THREE);
	Physijs.scripts.worker = '/libs/physi-worker.js';
	Physijs.scripts.ammo = '/libs/ammo.js';
	// Networking
	var io = require('socket.io-client');
	var socket = io.connect('http://romjam-liamattclarke.rhcloud.com:8000', {'forceNew':true});
	
	// Settings
	var settings = {
		frameRate: 30,
		fieldOfView: 60,
		cameraOrbitRadius: 5,
		planetRadius: 1
	};
	
	// Globals
	var camera, renderer, currentScene, isHost;
	var scenes = {};
	var deviceData = {};
	var gameState = {
		projectiles: []
	}
	
	// Game Scene Objects
	var planet;
	
	// GUI
	var guiPanels = {
		menu: document.getElementById('menu-panel'),
		waiting: document.getElementById('waiting-panel'),
		game: document.getElementById('game-panel')
	};
	var inputName = document.getElementById('input-name');
	var playBtn = document.getElementById('play-btn');
	
	// Device Orientation
	var applyDeviceOrientation = function() {
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
	
	/*-------------
		PLAYER
	-------------*/
	
	var player;
	var attacker = {
		updateOrientation: function() {
			var quaternion = new THREE.Quaternion();
			return function() {
				var alpha = deviceData.alpha ? THREE.Math.degToRad( deviceData.alpha ) : 0; // Z
				var beta = deviceData.beta ? THREE.Math.degToRad( deviceData.beta ) : 0; // X
				var gamma = deviceData.gamma ? THREE.Math.degToRad( deviceData.gamma ) : 0; // Y
				var orient = window.orientation ? THREE.Math.degToRad( window.orientation ) : 0; // Orientation
				applyDeviceOrientation( quaternion, alpha, beta, gamma, orient );
				var pos = (new THREE.Vector3( 0, 0, settings.cameraOrbitRadius ) ).applyQuaternion( quaternion  );
				camera.position.set(pos.x, pos.y, pos.z);
				applyDeviceOrientation( camera.quaternion, alpha, beta, gamma, orient );
			}
		}()
	};
	var defender = {
		updateOrientation: function() {
			var quaternion = new THREE.Quaternion();
			return function() {
				var alpha = deviceData.alpha ? THREE.Math.degToRad( deviceData.alpha ) : 0; // Z
				var beta = deviceData.beta ? THREE.Math.degToRad( deviceData.beta ) : 0; // X
				var gamma = deviceData.gamma ? THREE.Math.degToRad( deviceData.gamma ) : 0; // Y
				var orient = window.orientation ? THREE.Math.degToRad( window.orientation ) : 0; // Orientation
				applyDeviceOrientation( quaternion, alpha, beta, gamma, orient );
				var pos = (new THREE.Vector3( 0, 0, settings.planetRadius ) ).applyQuaternion( quaternion  );
				camera.position.set(pos.x, pos.y, pos.z);
				applyDeviceOrientation( camera.quaternion, alpha, beta, gamma, orient );
			}
		}()
	};
	
	/*--------------
		INIT APP
	--------------*/
	
	// called before start
	(function initApp() {
		// init Scenes
		scenes.menu = new THREE.Scene();
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
	
	/*--------------------
		INIT MENU SCENE
	---------------------*/
	
	function initMenu() {
		// set GUI
		setActivePanel('menu');
		playBtn.addEventListener('click', findMatch);
		// init menu scene
		currentScene = scenes.menu;
		initSkyBox(scenes.menu);
		player = attacker;
		// begin render vindaloop
		update();
	}
	
	/*---------------
		FIND MATCH
	----------------*/
	
	function findMatch() {
		// set GUI
		setActivePanel('waiting');
		// init game
		socket.emit('find-match');
		socket.on('start-match', function(data) {
			isHost = data.isHost;
			initGame();
		});
	}
	
	/*-------------------
		GAME SCENE
	-------------------*/
	
	function initGame() {
		// set GUI
		setActivePanel('game');
		// Set Scene to Render
		if(isHost) {
			scenes.game = new Physijs.Scene();
		} else {
			scenes.game = new THREE.Scene();
		}
		currentScene = scenes.game;
		// init Skybox
		initSkyBox(scenes.game);
		// init planet
		planet = new THREE.Mesh(
			new THREE.BoxGeometry(1, 1, 1),
			new THREE.MeshNormalMaterial()
		); 
		scenes.game.add( planet );
		if(!isHost) {
			socket.on("simulation-frame", function(data) {
				gameState = data;
			});
		}
		// fire projectile
		window.addEventListener('touchstart', function(event) {
			// add object
		});
	}
	
	/*----------------------
		RENDER VINDALOOP
	----------------------*/

	function update() {
		// player orientation
		player.updateOrientation();
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
	
	// Skybox
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
	
	function setActivePanel(panelName) {
		for (var panel in guiPanels) {
			if (guiPanels.hasOwnProperty(panel)) {
				if(panel === panelName) {
					guiPanels[panel].style.display = 'inline';
					continue;
				}
				guiPanels[panel].style.display = 'none';
			}
		}
	}
	
	// Debugging
	var debugElement = document.getElementById('debug');
	function debug(stringValue) {
		console.log(stringValue);
		debugElement.innerHTML = stringValue;
	}
})();