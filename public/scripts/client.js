'strict';
(function() {
	// Dependencies
	var THREE = require('three');
	var Physijs = require('physijs-browserify')(THREE);
	Physijs.scripts.worker = '/scripts/physi-worker.js';
	Physijs.scripts.ammo = '/scripts/ammo.js';
	// Networking
	var io = require('socket.io-client');
	var socket = io.connect('https://romjam-liamattclarke.rhcloud.com:8443', {'forceNew':true});
	//var socket = io(); // local testing
	
	// Settings
	var settings = {
		frameRate: 30,
		fieldOfView: 60,
		cameraOrbitRadius: 5,
		planetRadius: 1,
		asteroidSpawnForce: 10
	};
	
	// Globals
	var camera, renderer, currentScene, isHost;
	var scenes = {};
	var deviceData = {};
	var gameState = {
		asteroids: []
	}
	
	// Prefab Objects
	var asteroidObject = {
		geometry: new THREE.SphereGeometry(0.1, 12, 12),
		material: new THREE.MeshNormalMaterial()
	};
	
	// Game Scene Objects
	var planet = new Physijs.BoxMesh(
		new THREE.BoxGeometry(1, 1, 1),
		new THREE.MeshNormalMaterial(),
		0
	);	
			
	// GUI
	var guiPanels = {
		load: document.getElementById('load-panel'),
		menu: document.getElementById('menu-panel'),
		wait: document.getElementById('wait-panel'),
		game: document.getElementById('game-panel')
	};
	var inputName = document.getElementById('input-name');
	var playBtn = document.getElementById('play-btn');
	playBtn.addEventListener('touchstart', function(event) {
		event.preventDefault();
		findMatch();
	});
	
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
		}(),
		initScene: function() {
			scenes.game = new Physijs.Scene();
			// init planet
			scenes.game.add( planet );
			socket.on("simulation-frame", function(data) {
				gameState = data;
			});
		},
		// fire projectile
		fire: function(event) {
			var touch = event.touches[0];
			var spawnPos = screen2WorldPoint(touch.screenX, touch.screenY);
			var asteroid = new Physijs.SphereMesh(
				asteroidObject.geometry,
				asteroidObject.material,
				1
			);
			scenes.game.add( asteroid );
			asteroid.__dirtyPosition = true;
			asteroid.position.copy( spawnPos );
			var dir = spawnPos.sub( camera.position ).normalized();
			asteroid.applyCentralImpulse( dir * settings.asteroidSpawnForce );
		}
	};
	var defender = {
		updateOrientation: function() {
			var alpha = deviceData.alpha ? THREE.Math.degToRad( deviceData.alpha ) : 0; // Z
			var beta = deviceData.beta ? THREE.Math.degToRad( deviceData.beta ) : 0; // X
			var gamma = deviceData.gamma ? THREE.Math.degToRad( deviceData.gamma ) : 0; // Y
			var orient = window.orientation ? THREE.Math.degToRad( window.orientation ) : 0; // Orientation
			applyDeviceOrientation( camera.quaternion, alpha, beta, gamma, orient );
		},
		initScene: function() {
			scenes.game = new THREE.Scene();
		},
		fire: function() {
			// fire projectile
		}
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
		renderer = new THREE.WebGLRenderer({antialias:true});
		renderer.setSize( window.innerWidth, window.innerHeight ); 
		document.body.appendChild( renderer.domElement );
		// window resize event
		window.addEventListener('resize', function() {
			camera.aspect = window.innerWidth / window.innerHeight;
			renderer.setSize( window.innerWidth, window.innerHeight );
			if(currentScene === scenes.menu) {
				updateLogoPos();
				updateZoom();
			}
			camera.updateProjectionMatrix();
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
		// update logo position / camera zoom
		updateLogoPos();
		updateZoom();
		camera.updateProjectionMatrix();
		// init menu scene
		currentScene = scenes.menu;
		initSkyBox(scenes.menu);
		player = attacker;
		var asteroid = new THREE.Mesh(
			new THREE.BoxGeometry(1,1,1),
			asteroidObject.material
		);
		currentScene.add( asteroid );
		// begin render vindaloop
		update();
	}
	
	/*---------------
		FIND MATCH
	----------------*/
	
	function findMatch() {
		// set GUI
		setActivePanel('wait');
		// init game
		socket.emit('find-match');
		// start match
		socket.on('start-match', function(data) {
			socket.on('player-disconnected', function() {
				setActivePanel('wait');
			});
			isHost = data.isHost;
			if(isHost) player = attacker;
			else player = defender;
			initGame();
		});
	}
	
	/*-------------------
		INIT GAME SCENE
	-------------------*/
	
	function initGame() {
		// set GUI
		setActivePanel('game');
		// init player scene
		player.initScene();
		// set current scene
		currentScene = scenes.game;
		// init Skybox
		initSkyBox(currentScene);
		// fire projectile
		window.addEventListener('touchstart', function(event) {
			event.preventDefault();
			player.fire(event);
		}, false);
	}
	
	/*----------------------
		RENDER VINDALOOP
	----------------------*/

	function update() {
		// player orientation
		player.updateOrientation();
		// Render Scene
		if(currentScene === scenes.game && isHost) {
			currentScene.simulate();
			socket.emit('simulation-frame', gameState);
		} else if(currentScene === scenes.menu) {
			camera.position.add( (new THREE.Vector3(0.15, 0, 0)).applyQuaternion( camera.quaternion ) );
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
	
	// centre logo
	function updateLogoPos() {
		var logo = document.getElementById('logo');
		logo.style.marginTop = (window.innerHeight / 2) - (logo.clientHeight / 2) + 'px';
	}
	
	function updateZoom() {
		camera.zoom = window.innerWidth / 500;
	}
	
	function screen2WorldPoint(screenX, screenY) {
		var vect = new THREE.Vector3(
			screenX / window.innerWidth * 2 - 1,
			-(screenY / window.innerHeight * 2 - 1),
			0.5
		);
		return vect.unproject( camera );
	}
	
	// Debugging
	var debugElement = document.getElementById('debug');
	function debug(stringValue) {
		console.log(stringValue);
		debugElement.innerHTML = stringValue;
	}
})();