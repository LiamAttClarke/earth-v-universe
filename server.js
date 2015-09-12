var express = require("express");
var app = express();
var server = require("http").createServer(app);
var io = require("socket.io")(server);
var p2p = require('socket.io-p2p-server').Server;
io.use(p2p);
var port = 1337;

//set static folder for application
app.use(express.static("public"));

// serve application
app.get("/", function(request, response) {
	response.sendFile(__dirname + "/index.html");
});

// open port 1337 for communication
server.listen(1337, function() {
	console.log("Listening on port %s", port);
});

function Room(id) {
	this.id = id;
	this.players = [id];
}
var rooms = [];

// new connection event
io.sockets.on("connection", function(socket) {
	console.log(socket.id + " - connected");
	var room = joinOrCreateRoom(socket.id);
	socket.join(room.id);
	
	// connection lost event
	socket.on( "disconnect", function() {
		console.log(socket.id + " - disconnected");
		leaveRoom(socket, room);
	});
});

// searches for open rooms to join or creates new room
function joinOrCreateRoom(clientId) {
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
	socket.leave(room.id);
	room.players.splice(room.players.indexOf(socket.id), 1);
	if(room.players.length === 0) {
		rooms.splice(rooms.indexOf(room), 1);
	}
}