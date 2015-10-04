'strict';
window.onload = function() {
	// Dependencies
	var THREE = require('three');
	var Physijs = require('physijs-browserify')(THREE);
	var Howl = require('howler').Howl;
	var AtmosphereShader = require('./atmosphere');

	Physijs.scripts.worker = '/scripts/physi-worker.js';
	Physijs.scripts.ammo = '/scripts/ammo.js';
	// Networking
	//var dgram = require('dgram');
	var io = require('socket.io-client');
	var socket = io.connect('https://romjam-liamattclarke.rhcloud.com:8443', {'forceNew':true});
	//var socket = io(); // local testing
	
	document.ontouchmove = function(event){
		event.preventDefault();
	};

	// Settings
	var settings = {
		frameRate: 60,
		fieldOfView: 30,
		asteroidSpawnForce: 2,
		initialScreenHeight: 640,
		planetMass: 1000000000,
		asteroidMass: 100,
		radarArrowRadius: window.innerWidth / 3
	};
	
	// Globals
	var camera, renderer, currentScene, isHost, tanFOV, initialZoom, asteroidCounter, planet, atmosphere, musicTracks, asteroidSFX, collisionSFX;
	var GRAVITY_CONTSTANT = 0.000000000001;
	var scenes = {};
	var deviceData = {};
	var inGameAsteroids = {};
	var radarArrows = {};
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
		asteroid: {}
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
	var radar = document.getElementById('radar');
	var radarArrowSrc = "assets/gui/radar-arrow.png";
	var silhouette = document.getElementById('silhouette');
		
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
		mass: 100,
		updateOrientation: function() {
			applyOrientation(12);
		},
		// fire projectile
		fire: function(screenX, screenY) {
			var asteroid = new Physijs.SphereMesh(
				prefabs.asteroid.geometry,
				prefabs.asteroid.material,
				1
			);
			var spawnPos = screen2WorldPoint(screenX, screenY);
			var fireDir = ((new THREE.Vector3()).copy(spawnPos)).sub( camera.position ).normalize();
			spawnPos.add(fireDir.multiplyScalar( 1 ));
			scenes.game.add( asteroid );
			asteroid.__dirtyPosition = true;
			asteroid.position.copy( spawnPos );
			asteroid.applyCentralImpulse( fireDir.multiplyScalar( settings.asteroidSpawnForce ) );	
			// create new asteroid object and pass it into gameState.asteroids
			var asteroidName = 'asteroid' + asteroidCounter++;
			asteroid.name = asteroidName;
			inGameAsteroids[ asteroidName ] = asteroid;
			var position = new Position(asteroid.position);
			var asteroidObject = new AsteroidObject(asteroidName, position);
			gameState.asteroids[ asteroidName ] = asteroidObject;
			asteroidSFX[ Math.floor( Math.random() * asteroidSFX.length ) ].play();
		}
	};
	var defender = {
		health: 100,
		updateOrientation: function() {
			applyOrientation(-1);
		},
		fire: function(screenX, screenY) {
			screenX = (screenX / window.innerWidth) * 2 - 1;
			screenY = (screenY / window.innerWidth) * 2 + 1;
			var raycaster = new THREE.Raycaster();
			raycaster.setFromCamera(new THREE.Vector2(screenX, screenY), camera);
			for(var asteroidName in inGameAsteroids) {
				var target = ( raycaster.intersectObject( inGameAsteroids[ asteroidName ] ) )[0];
				if(target) {
					socket.emit('laser-fired', target.name);
					return;
				}
			}
		}
	};
	var lobbyPlayer = {
		updateOrientation: function() {
			applyOrientation(8);
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
		// Audio
		var audioSrcPrefix = '../assets/audio/';
		musicTracks = {
			title: new Howl({urls: [audioSrcPrefix + 'title.ogg'], loop: true}),
			game: new Howl({urls: [audioSrcPrefix + 'game.ogg'], loop: true})
		};
		asteroidSFX = [
			new Howl({urls: [audioSrcPrefix + 'sfx_asteroid1.ogg']}),
			new Howl({urls: [audioSrcPrefix + 'sfx_asteroid2.ogg']}),
			new Howl({urls: [audioSrcPrefix + 'sfx_asteroid3.ogg']})
		];
		collisionSFX = [
			new Howl({urls: [audioSrcPrefix + 'sfx_collision1.ogg']}),
			new Howl({urls: [audioSrcPrefix + 'sfx_collision2.ogg']}),
			new Howl({urls: [audioSrcPrefix + 'sfx_collision3.ogg']})
		];
	
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
	function getMaterial(textureDiffuse, textureBump) {

		var params = {
			map: THREE.ImageUtils.loadTexture(textureDiffuse), 
			side: THREE.DoubleSide,
			colorAmbient: [0.48, 0.48, 0.48],
			colorDiffuse: [0.48, 0.48, 0.48],
			colorSpecular: [0.9, 0.9, 0.9],
			shading: THREE.FlatShading 
		};

		if (textureBump) {
			//params.bumpMap = THREE.ImageUtils.loadTexture(textureBump);
		}
		return new THREE.MeshLambertMaterial(params);
	}

	function loadMeshes(callback) {
		var loader = new THREE.JSONLoader(); // init the loader util
		var modelDir = 'assets/models/';
		var textureDir = 'assets/textures/';

		loader.load(modelDir + 'planet.json', function (geometry) {

			var sphereMat = new THREE.ShaderMaterial({
			uniforms: {
				texture1: { type: 't', 
					value: THREE.ImageUtils.loadTexture( 'assets/textures/13.jpg' ) 
				},
				texture2: { type: 't', 
					value: THREE.ImageUtils.loadTexture( textureDir + 'planet.jpg' ) }
				},		
				side: THREE.FrontSide,		
				shading: THREE.SmoothShading,
				transparent: true,
				vertexShader: AtmosphereShader.vertexShader,
				fragmentShader: AtmosphereShader.fragmentShaderSolid
			});
			sphereMat.uniforms.texture1.value.wrapS = 
			sphereMat.uniforms.texture1.value.wrapT = 
			THREE.ClampToEdgeWrapping;

			sphereMat.uniforms.texture2.value.wrapS = 
			sphereMat.uniforms.texture2.value.wrapT = 
			THREE.ClampToEdgeWrapping;

			planet = new Physijs.SphereMesh(geometry, getMaterial(textureDir + 'planet.jpg'), 0);
			planet.addEventListener('collision', function(obj) { // collision returns colliding object
				destroyAsteroid( obj );
				pulseSilhouette( 300 );
				defender.health--;
				console.log('health:', defender.health);
				collisionSFX[ Math.floor( Math.random() * collisionSFX.length ) ].play();
			});	

			loader.load(modelDir + 'asteroid.json', function (geometry) {
				prefabs.asteroid.geometry = geometry;
				prefabs.asteroid.material = getMaterial(textureDir + 'asteroid_diffuse.jpg', textureDir + 'asteroid_bump.jpg');
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
		player = lobbyPlayer;
		var asteroid = new THREE.Mesh(
			prefabs.asteroid.geometry,
			prefabs.asteroid.material
		);
		var scale = 11.5;
		asteroid.scale.set(scale, scale, scale);
		currentScene.add( asteroid );
		
		musicTracks.game.stop();
		musicTracks.title.play();
		
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
		musicTracks.title.stop();
		musicTracks.game.play();
		asteroidCounter = 0;
		// set GUI
		setActivePanel('game');
		// init player scene
		if(player === attacker) {
			document.title = "ROM JAM 2015 - Attacker";
			silhouette.style.display = 'none';
			radar.style.display = 'none';
			scenes.game = new Physijs.Scene();
			scenes.game.setFixedTimeStep();
			// init planet
			scenes.game.add( planet );

			var sphereGeom = new THREE.IcosahedronGeometry(1.3, 4);
			// var sphereMat = new THREE.ShaderMaterial({
			// 	map: THREE.ImageUtils.loadTexture('assets/textures/clouds.png'),
			// 	side: THREE.DoubleSide,
			// 	transparent: true,
			// 	opacity: 1.0
			// });

			var sphereMat = new THREE.ShaderMaterial({

				uniforms: {
					res: {type: 'v2', value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
					texture1: { type: 't', value: THREE.ImageUtils.loadTexture( 'assets/textures/clouds.png' ) }
				},
				transparent: true,
				side: THREE.FrontSide,
				shading: THREE.SmoothShading,
				vertexShader: AtmosphereShader.vertexShader,
				fragmentShader: AtmosphereShader.fragmentShaderTransparent
			});

			//sphereMat = new THREE.MeshNormalMaterial();
			atmosphere = new THREE.Mesh(sphereGeom, sphereMat);

			scenes.game.add(atmosphere);
			// disable default gravity
			scenes.game.setGravity( new THREE.Vector3(0,0,0) );
			socket.on('laser-fired', function(target) {
				destroyAsteroid( inGameAsteroids[ target ] )
			});
		} else {
			document.title = "ROM JAM 2015 - Defender";
			silhouette.style.display = 'block';
			radar.style.display = 'inline';
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
			player.mass--;
			console.log('mass', player.mass);		
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
				(function() {
					for(var inGameAsteroidName in inGameAsteroids) {
						// update gameState
						var gameStateAsteroid = gameState.asteroids[ inGameAsteroidName ];
						var inGameAsteroid = inGameAsteroids[ inGameAsteroidName ];
						gameStateAsteroid.position = new Position( inGameAsteroid.position );
						// Apply gravity
						var asteroid = inGameAsteroids[ inGameAsteroidName ];
						var asteroidPos = ( ( new THREE.Vector3(0, 0, 0) ).sub( asteroid.position ) ).normalize();
						var asteroidDist = asteroidPos.length();
						var forceOfGrav = (GRAVITY_CONTSTANT * settings.asteroidMass * settings.planetMass) / (asteroidDist * asteroidDist);
						asteroid.applyCentralForce( ((asteroidPos.normalize()).multiplyScalar( forceOfGrav )) );
						asteroid.setDamping(0.2, 0);
					}
				})();
				
				// emit gameState
				currentScene.simulate();
				socket.emit('simulation-frame', gameState);
			} else {
				// Update asteroid position / gui indicator
				(function() {
					for(var gameStateAsteroidName in gameState.asteroids) {
						var gameStateAsteroid = gameState.asteroids[ gameStateAsteroidName ];
						var inGameAsteroid = inGameAsteroids[ gameStateAsteroidName ];
						if(gameStateAsteroid === null) {
							scenes.game.remove( inGameAsteroids[ gameStateAsteroidName ] );
							
							if (radarArrows[ gameStateAsteroidName ]) 
								radar.removeChild( radarArrows[ gameStateAsteroidName ] );

							delete inGameAsteroids[ gameStateAsteroidName ];
							delete gameState.asteroids[ gameStateAsteroidName ];
							delete radarArrows[ gameStateAsteroidName ];
							continue;
						}
						var gameStateAsteroidPos = gameStateAsteroid.position;
						if( inGameAsteroid ) {
							var inGameAstPos = inGameAsteroid.position.set(gameStateAsteroidPos.x, gameStateAsteroidPos.y, gameStateAsteroidPos.z);
							var arrow = radarArrows[ gameStateAsteroidName ];
							if( arrow ) {
								// update GUI arrows
								// asteroid position
								var asteroidPos = new THREE.Vector4(inGameAstPos.x, inGameAstPos.y, inGameAstPos.z, 1)
								var cameraVPMatrix = (new THREE.Matrix4()).copy( camera.projectionMatrix );
								cameraVPMatrix.multiply( camera.matrixWorldInverse );
								asteroidPos.applyMatrix4( cameraVPMatrix );
								var asteroidPosZ = asteroidPos.z; // z > 0 = in front
								asteroidPos.divideScalar( asteroidPos.w ); // perspective divide
								// asteroid direction
								var arrowDir = new THREE.Vector2(asteroidPos.x, asteroidPos.y);
								arrowDir.normalize();
								//debug(arrowDir.x + ", " + arrowDir.y);
								if( ((asteroidPos.x >= -1 && asteroidPos.x <= 1) || (asteroidPos.y >= -1 && asteroidPos.y <= 1)) && asteroidPosZ > 0) {
									arrow.style.display = 'none';
								} else {
									arrow.style.display = 'inline';
									setArrowOrient(arrow, arrowDir);
								}
							} else {
								createArrow( gameStateAsteroidName );
							}
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

		if (planet && atmosphere) {
			planet.__dirtyRotation = true;
			var step = 0.005;
			planet.rotation.z += step;
			planet.rotation.x += step;

			atmosphere.rotation.z += step;
			atmosphere.rotation.y += step;
		}
		// Render Scene
		renderer.render( currentScene, camera ); 		
		// limit framerate
		setTimeout( function() {
			requestAnimationFrame( update );
		}, 1000 / settings.frameRate );
	}
	
	function destroyAsteroid(asteroid) {
		currentScene.remove( asteroid );
		delete inGameAsteroids[ asteroid.name ];
		if (gameState.asteroids[ asteroid.name ] !== undefined) {
			console.log(asteroid.name);			
			gameState.asteroids[ asteroid.name ] = null;
		}
	}
	
	// damage effect pulse
	function pulseSilhouette(duration) {
		silhouette.style.boxShadow = 'inset 0 0 16px 2px #ff0000';
		setTimeout(function() {
			silhouette.style.boxShadow = 'none';
		}, duration);
	}
	
	// Lights
	function initLights(scene) {
		var light = new THREE.AmbientLight(0x404040);
		var light2 = new THREE.DirectionalLight(0xffffff, 0.5);
		scene.add(light);
		scene.add(light2);
	}

	// update radar arrow position
	function setArrowOrient( arrowElem, direction ) {
		arrowElem.style.top = (window.innerHeight / 2) - Math.ceil(settings.radarArrowRadius * direction.y) + 'px';
		arrowElem.style.left = (window.innerWidth / 2) + Math.ceil(settings.radarArrowRadius * direction.x) + 'px';
		var rotation = THREE.Math.radToDeg( Math.atan(direction.y / direction.x) );
		if(direction.x > 0) {
			rotation = 90 - rotation;
		} else {
			rotation = 270 - rotation;
		}
		arrowElem.style.transform = 'rotate(' + rotation + 'deg)';
	}
	
	function createArrow(arrowName) {
		var newArrow = document.createElement('img');
		newArrow.setAttribute('src', radarArrowSrc);
		newArrow.setAttribute('width', '32px');
		newArrow.setAttribute('height', '16px');
		newArrow.classList.add('radar-arrow');
		radarArrows[ arrowName ] = newArrow;
		radar.appendChild( newArrow );
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