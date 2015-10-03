'strict';
window.onload = function() {
	// Dependencies
	var THREE = require('three');
	var Physijs = require('physijs-browserify')(THREE);
	Physijs.scripts.worker = '/scripts/physi-worker.js';
	Physijs.scripts.ammo = '/scripts/ammo.js';
	// Networking
	//var dgram = require('dgram');
	var io = require('socket.io-client');
	var socket = io.connect('https://romjam-liamattclarke.rhcloud.com:8443', {'forceNew':true});
	//var socket = io(); // local testing
	
	// Settings
	var settings = {
		frameRate: 60,
		fieldOfView: 30,
		defenderOrbitRadius: 8,
		planetRadius: 1,
		asteroidSpawnForce: 1,
		initialScreenHeight: 640
	};
	
	// Globals
	var camera, renderer, currentScene, isHost, tanFOV, initialZoom, asteroidCounter, planet;
	var scenes = {};
	var deviceData = {};
	var inGameAsteroids = {};
	var gameState = {
		asteroids: {}
	}
	
	function AsteroidObject(name, position) {
		this.name = name;
		this.position = position;
	}
	
	function Position(position) {
		this.x = position.x;
		this.y = position.y;
		this.z = position.z;
	}
	
	// Prefab Objects
	var prefabs = {
		asteroid: { geometry: new THREE.SphereGeometry(0.1, 12, 12), material: new THREE.MeshNormalMaterial() }
	};
	
	// GUI
	var guiPanels = {
		load: document.getElementById('load-panel'),
		menu: document.getElementById('menu-panel'),
		wait: document.getElementById('wait-panel'),
		game: document.getElementById('game-panel')
	};
	//var inputName = document.getElementById('name-input');
	var playBtn = document.getElementById('play-btn');
	// Start Button
	playBtn.addEventListener('click', findMatch, false);
	playBtn.addEventListener('touchend', function(event) {
		event.preventDefault();
		findMatch();
	}, false);
	
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
	
	var applyOrientation = function() {
		var quaternion = new THREE.Quaternion();
		return function(playerPosition) {
			var alpha = deviceData.alpha ? THREE.Math.degToRad( deviceData.alpha ) : 0; // Z
			var beta = deviceData.beta ? THREE.Math.degToRad( deviceData.beta ) : 0; // X
			var gamma = deviceData.gamma ? THREE.Math.degToRad( deviceData.gamma ) : 0; // Y
			var orient = window.orientation ? THREE.Math.degToRad( window.orientation ) : 0; // Orientation
			applyDeviceOrientation( quaternion, alpha, beta, gamma, orient );
			var pos = (new THREE.Vector3( 0, 0, playerPosition ) ).applyQuaternion( quaternion  );
			camera.position.set(pos.x, pos.y, pos.z);
			applyDeviceOrientation( camera.quaternion, alpha, beta, gamma, orient );
		}
	}();
	
	/*-------------
		PLAYER
	-------------*/
	
	var player;
	var attacker = {
		updateOrientation: function() {
			applyOrientation(settings.defenderOrbitRadius);
		},
		// fire projectile
		fire: function(screenX, screenY) {
			var asteroid = new Physijs.SphereMesh(
				prefabs.asteroid.geometry,
				prefabs.asteroid.material,
				1
			);
			asteroid.scale.x = asteroid.scale.y = asteroid.scale.z = 0.05;
			var spawnPos = screen2WorldPoint(screenX, screenY);
			scenes.game.add( asteroid );
			asteroid.__dirtyPosition = true;
			asteroid.position.copy( spawnPos );
			var fireDir = spawnPos.sub( camera.position ).normalize();
			asteroid.applyCentralImpulse( fireDir.multiplyScalar( settings.asteroidSpawnForce ) );	
			// create new asteroid object and pass it into gameState.asteroids
			var asteroidName = 'asteroid' + asteroidCounter++;
			inGameAsteroids[ asteroidName ] = asteroid;
			var position = new Position(asteroid.position);
			var asteroidObject = new AsteroidObject(asteroidName, position);
			gameState.asteroids[ asteroidName ] = asteroidObject;
		}
	};
	var defender = {
		updateOrientation: function() {
			applyOrientation(-settings.planetRadius);
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
		// init Camera
		camera = new THREE.PerspectiveCamera(settings.fieldOfView, window.innerWidth / window.innerHeight, 0.1, 1000);
		tanFOV = Math.tan( THREE.Math.degToRad( camera.fov / 2 ) );
		initialZoom = camera.zoom;
		// init Renderer
		renderer = new THREE.WebGLRenderer({antialias:true});
		document.body.appendChild( renderer.domElement );
		// window resize event
		window.addEventListener('resize', onResizeEvent, false);
		onResizeEvent();
		// Device orientation event
		window.addEventListener('deviceorientation', function(event) {
			deviceData = event;
		}, false);
		// initialize main menu
		loadMeshes(initMenu);	

	})();
	
	/*--------------------
		Load Mesh data
	---------------------*/
	function getMaterial(texture) {
		return new THREE.MeshPhongMaterial({
			map: THREE.ImageUtils.loadTexture(texture), 
			side: THREE.DoubleSide,
			colorAmbient: [0.48, 0.48, 0.48],
			colorDiffuse: [0.48, 0.48, 0.48],
			colorSpecular: [0.9, 0.9, 0.9]
		});
	}

	function loadMeshes(callback) {
		var loader = new THREE.JSONLoader(); // init the loader util

		var modelDir = 'assets/models/';
		var textureDir = 'assets/textures/';

		loader.load(modelDir + 'planet.json', function (geometry) {
			planet = new Physijs.BoxMesh(geometry, getMaterial(textureDir + 'planet.jpg'), 0);	

			loader.load(modelDir + 'asteroid.json', function (geometry) {
				prefabs.asteroid.geometry = geometry;
				prefabs.asteroid.material = getMaterial(textureDir + 'asteroid.jpg');
				callback();
			});	
		});
	}

	/*--------------------
		INIT MENU SCENE
	---------------------*/
	
	function initMenu() {
		// set GUI
		setActivePanel('menu');
		// init menu scene
		scenes.menu = new THREE.Scene();
		currentScene = scenes.menu;
		initSkyBox(currentScene);
		initLights(currentScene);
		player = attacker;
		var asteroid = new THREE.Mesh(
			prefabs.asteroid.geometry,
			prefabs.asteroid.material
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
				socket.emit('leave-room');
				currentScene = scenes.menu;
				setActivePanel('menu');
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
		asteroidCounter = 0;
		// set GUI
		setActivePanel('game');
		// init player scene
		if(player === attacker) {
			scenes.game = new Physijs.Scene();
			// init planet
			scenes.game.add( planet );
			// disable default gravity
			scenes.game.setGravity( new THREE.Vector3(0,0,0) );
		} else {
			scenes.game = new THREE.Scene();
			socket.on("simulation-frame", function(data) {
				gameState = data;
			});
		}
		// set current scene
		currentScene = scenes.game;
		// init Skybox
		initSkyBox(currentScene);
		initLights(currentScene);

		// fire projectile
		window.addEventListener('click', function(event) {
			player.fire(event.clientX, event.clientY);
		}, false);
		window.addEventListener('touchstart', function(event) {
			event.preventDefault();
			var touch = event.touches[0];
			player.fire(touch.screenX, touch.screenY);
		}, false);
	}
	
	/*----------------------
		RENDER VINDALOOP
	----------------------*/

	function update() {
		// player orientation
		player.updateOrientation();
		// simulate physics
		if(currentScene === scenes.game) {
			if(isHost) {
				currentScene.simulate();
				// update gameState
				(function() {
					for(var inGameAsteroidName in inGameAsteroids) {
						var gameStateAsteroid = gameState.asteroids[ inGameAsteroidName ];
						var inGameAsteroid = inGameAsteroids[ inGameAsteroidName ];
						gameStateAsteroid.position = new Position( inGameAsteroid.position );
					}
				})();
				// emit gameState
				socket.emit('simulation-frame', gameState);
			} else {
				(function() {
					for(var gameStateAsteroidName in gameState.asteroids) {
						var gameStateAsteroid = gameState.asteroids[ gameStateAsteroidName ];
						var inGameAsteroid = inGameAsteroids[ gameStateAsteroidName ];
						var gameStateAsteroidPos = gameStateAsteroid.position;
						if( inGameAsteroid ) {
							inGameAsteroid.position.set(gameStateAsteroidPos.x, gameStateAsteroidPos.y, gameStateAsteroidPos.z);
						} else {
							var newAsteroid = new THREE.Mesh(
								prefabs.asteroid.geometry,
								prefabs.asteroid.material
							);
							currentScene.add( newAsteroid );
							newAsteroid.name = gameStateAsteroidName;
							newAsteroid.position.set(gameStateAsteroidPos.x, gameStateAsteroidPos.y, gameStateAsteroidPos.z);
							inGameAsteroids[ gameStateAsteroidName ] = newAsteroid;
						}
					}
				})();
			}
		}

		if (planet) planet.rotation.z += Math.PI * 0.01;
		// Render Scene
		renderer.render( currentScene, camera ); 		
		// limit framerate
		setTimeout( function() {
			requestAnimationFrame( update );
		}, 1000 / settings.frameRate );
	}
	
	// Lights
	function initLights(scene) {
		var light = new THREE.AmbientLight(0x404040);
		var light2 = new THREE.DirectionalLight(0xffffff, 0.5);
		scene.add(light);
		scene.add(light2);
	}

	// Skybox
	function initSkyBox(scene) {
		var urlPrefix = 'assets/textures/skybox/';
		var cubeMapFaces = [
			urlPrefix + 'spaceLF.png',
			urlPrefix + 'spaceFT.png',
			urlPrefix + 'spaceUP.png',
			urlPrefix + 'spaceDN.png',
			urlPrefix + 'spaceRT.png',
			urlPrefix + 'spaceBK.png'
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
	
	function onResizeEvent() {
		camera.aspect = window.innerWidth / window.innerHeight;
		renderer.setSize( window.innerWidth, window.innerHeight );
		camera.fov = (36000 / Math.PI) * Math.atan( THREE.Math.degToRad( tanFOV * (window.innerHeight / settings.initialScreenHeight) ) );
		if(window.innerWidth < 544) {
			camera.zoom = lerp(0.0, initialZoom, window.innerWidth / 544);
		} else {
			camera.zoom = initialZoom;
		}
		camera.updateProjectionMatrix();
	}
	
	function screen2WorldPoint(screenX, screenY) {
		var vect = new THREE.Vector3(
			screenX / window.innerWidth * 2 - 1,
			-(screenY / window.innerHeight * 2 - 1),
			0.5
		);
		return vect.unproject( camera );
	}
	
	function lerp(value1, value2, alpha) {
		return value1 + (value2 - value1) * alpha;
	}
	
	// Debugging
	var debugElement = document.getElementById('debug');
	function debug(stringValue) {
		console.log(stringValue);
		debugElement.innerHTML = stringValue;
	}
};