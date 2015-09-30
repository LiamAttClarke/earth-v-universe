var HOST = process.env.OPENSHIFT_INTERNAL_IP || process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1';
var PORT = process.env.OPENSHIFT_INTERNAL_PORT || process.env.OPENSHIFT_NODEJS_PORT || 1337;
// TCP/IP
var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);

// open TCP port for communication
server.listen(PORT, HOST, function() {
	console.log('TCP Server Listening on ' + HOST + ':' + PORT);
});

// UDP/IP
/*var dgram = require('dgram');
var UDPServer = dgram.createSocket('udp4');

UDPServer.on('listening', function () {
    var address = UDPServer.address();
    console.log('UDP Server listening on ' + address.address + ":" + address.port);
});
UDPServer.on('message', function (message, remote) {
    console.log(remote.address + ':' + remote.port +' - ' + message);

});
UDPServer.bind(PORT, HOST);*/

//set static folder for application
app.use(express.static('public'));

// serve application
app.get("/", function(request, response) {
	response.sendFile(__dirname + '/index.html');
});

var rooms = [];
var roomCounter = 0;
function Room(id) {
	this.name = 'room' + roomCounter++;
	this.players = [id];
}

// new connection event
io.sockets.on('connection', function(socket) {
	var room;
	// user requests matchmaking
	socket.on('find-match', function() {
		console.log(socket.id + ' - started match');
		room = findOrCreateRoom(socket.id);
		socket.join(room.name);
		console.log(socket.id + ' - ' + room.name + ", Room Count: " + roomCounter);
		// set host of match
		if(room.players.length === 2) {
			// start match
			if(room.players[0] === socket.id) {
				socket.emit('start-match', { isHost: true });
				socket.broadcast.to(room.name).emit('start-match', { isHost: false });
			} else {
				socket.emit('start-match', { isHost: false });
				socket.broadcast.to(room.name).emit('start-match', { isHost: true });
			}
		}
		// emit simulation frames to all non-host players in room
		socket.on('simulation-frame', function(data) {
			socket.broadcast.to(room.name).emit('simulation-frame', data);
		});
		// connection lost event
		socket.on('disconnect', function() {
			console.log(socket.id + ' - connection lost');
			// leave room
			leaveRoom( socket, room );
		});
		// player leaves room
		socket.on('leave-room', function() {
			console.log(socket.id + ' - left room');
			// leave room
			leaveRoom( socket, room );
		});
	});
});

// searches for open rooms to join or creates new room
function findOrCreateRoom(clientId) {
	var firstAvailableRoom = rooms.filter(function(room) { return room.players.length === 1; })[0];
	if(!firstAvailableRoom) {
		var newRoom = new Room(clientId);
		rooms.push( newRoom );
		return newRoom;
	}
	firstAvailableRoom.players.push( clientId );
	return firstAvailableRoom;
}

// remove socket from room then remove room if empty
function leaveRoom(socket, room) {
	if(!room) return;
	io.sockets.to(room.name).emit('player-disconnected'); // not working : <
	socket.leave(room.name);
	room.players.splice(room.players.indexOf(socket.id), 1);
	// remove last room if empty
	if(rooms.length > 0) {
		if(rooms[rooms.length - 1].players.length === 0) {
			rooms.pop();
			roomCounter--;
		}
	}
}