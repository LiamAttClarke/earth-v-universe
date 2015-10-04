exports.vertexShader = 
'   varying vec2 vUv;' +
'   varying vec3 e;' +
'   varying vec3 n;' +
'	void main() {' +
'   	vUv = uv;' +
'		e = normalize( vec3( modelViewMatrix * vec4( position, 1.0 ) ) );' +
'		n = normalize( normalMatrix * normal );' +
'    	gl_Position =   projectionMatrix * ' +
'                    modelViewMatrix * ' +
'                    vec4(position,1.0);' +
'	}';

exports.fragmentShaderTransparent = 
	'uniform sampler2D texture1;' +
	'uniform vec2 res;' +
    'varying vec2 vUv;' +
    'varying vec3 e;' +
    'varying vec3 n;' +

    'void main() {' +
    'vec3 r = reflect( e, n );' +
    'float m = 2. * sqrt( pow( r.x, 2. ) + pow( r.y, 2. ) + pow( r.z + 1., 2. ) );' +
    'vec2 vN = r.xy / m + .5;' +
    'vec3 base = texture2D( texture1, vN ).rgb;' +
    'gl_FragColor = vec4(1.0, 1.0, 0.0, 0.0);' +
    '}';

exports.fragmentShaderSolid = 
	'uniform sampler2D texture1;' +
	'uniform sampler2D texture2;' +
    'varying vec2 vUv;' +
    'varying vec3 e;' +
    'varying vec3 n;' +
    'void main() {' +
    'vec3 r = normalize(reflect( e, n ));' +
    'float m = 2. * sqrt( pow( r.x, 2. ) + pow( r.y, 2. ) + pow( r.z + 1., 2. ) );' +
    'vec2 vN = r.xy / m + .5;' +
    'vec3 base = texture2D( texture1, vN ).rgb;' +
    'vec3 color = texture2D( texture2, vUv ).rgb;' +
    'gl_FragColor = vec4( base * color, 1.0 );' +
    '}';

